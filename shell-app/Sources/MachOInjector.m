//
//  MachOInjector.m
//  移植自 ipa-injector/inject.py 的 Mach-O 注入逻辑，改为 Objective-C 实现
//  原理：移除 LC_CODE_SIGNATURE 释放空间，在 load commands 末尾追加
//        LC_LOAD_DYLIB(@executable_path/Frameworks/<dylib>)，并改写
//        header 的 ncmds / sizeofcmds。签名交给后续全能签重签。
//

#import "MachOInjector.h"

#pragma mark - Mach-O 常量
static const uint32_t kMH_MAGIC      = 0xFEEDFACE;
static const uint32_t kMH_MAGIC_64   = 0xFEEDFACF;
static const uint32_t kLC_SEGMENT    = 0x1;
static const uint32_t kLC_SEGMENT_64 = 0x19;
static const uint32_t kLC_LOAD_DYLIB = 0xC;
static const uint32_t kLC_CODE_SIGN  = 0x1D;
static const uint32_t kFAT_MAGIC     = 0xCAFEBABE;

static NSError *mErr(NSString *msg) {
    return [NSError errorWithDomain:@"MachOInjector"
                              code:-1
                          userInfo:@{NSLocalizedDescriptionKey: msg}];
}

#pragma mark - 按端序读整数
static inline uint32_t rdU32(const uint8_t *p, BOOL little) {
    if (little) {
        return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
               ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
    }
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}
static inline void wrU32(uint8_t *p, uint32_t v, BOOL little) {
    if (little) {
        p[0] = (uint8_t)(v & 0xff);
        p[1] = (uint8_t)((v >> 8) & 0xff);
        p[2] = (uint8_t)((v >> 16) & 0xff);
        p[3] = (uint8_t)((v >> 24) & 0xff);
    } else {
        p[0] = (uint8_t)((v >> 24) & 0xff);
        p[1] = (uint8_t)((v >> 16) & 0xff);
        p[2] = (uint8_t)((v >> 8) & 0xff);
        p[3] = (uint8_t)(v & 0xff);
    }
}

@implementation MachOInjector

#pragma mark - 构建 LC_LOAD_DYLIB 命令
+ (NSData *)buildDylibCommandForName:(NSString *)name little:(BOOL)little {
    NSString *installPath = [@"@executable_path/Frameworks/" stringByAppendingString:name];
    NSMutableData *pathData = [[installPath stringByAppendingString:@"\0"]
                               dataUsingEncoding:NSUTF8StringEncoding].mutableCopy;
    NSUInteger pad = (8 - pathData.length % 8) % 8;
    if (pad > 0) {
        static const uint8_t zeros[8] = {0};
        [pathData appendBytes:zeros length:pad];
    }
    uint32_t cmdsize = 24 + (uint32_t)pathData.length;

    NSMutableData *cmd = [NSMutableData dataWithCapacity:cmdsize];
    uint8_t hdr[24];
    wrU32(hdr + 0,  kLC_LOAD_DYLIB, little);  // cmd
    wrU32(hdr + 4,  cmdsize,        little);  // cmdsize
    wrU32(hdr + 8,  24,             little);  // name offset
    wrU32(hdr + 12, 0,              little);  // timestamp
    wrU32(hdr + 16, 0x10000,        little);  // current version
    wrU32(hdr + 20, 0x10000,        little);  // compatibility version
    [cmd appendBytes:hdr length:24];
    [cmd appendData:pathData];
    return cmd;
}

#pragma mark - 单个 Thin Mach-O 切片注入
+ (BOOL)injectThinMachO:(NSMutableData *)data
              dylibName:(NSString *)dylibName
                  error:(NSError **)error {
    if (data.length < 28) {
        if (error) *error = mErr(@"Mach-O 文件过小");
        return NO;
    }
    const uint8_t *base = data.bytes;
    uint32_t magicLE = rdU32(base, YES);

    BOOL bits64, little;
    BOOL swapped;
    switch (magicLE) {
        case 0xFEEDFACF: bits64 = YES; little = YES; swapped = NO; break; // little 64
        case 0xCFFAEDFE: bits64 = YES; little = NO;  swapped = YES; break; // big 64
        case 0xFEEDFACE: bits64 = NO;  little = YES; swapped = NO; break; // little 32
        case 0xCEFAEDFE: bits64 = NO;  little = NO;  swapped = YES; break; // big 32
        default:
            if (error) *error = mErr([NSString stringWithFormat:@"无法识别的 Mach-O magic: 0x%X", magicLE]);
            return NO;
    }
    (void)kMH_MAGIC; (void)kMH_MAGIC_64; (void)swapped;

    NSUInteger headerSize = bits64 ? 32 : 28;
    uint32_t ncmds     = rdU32(base + 16, little);
    uint32_t sizeofcmds = rdU32(base + 20, little);
    (void)sizeofcmds;

    // 解析所有 load command
    NSMutableArray *cmds = [NSMutableArray array];   // 元素: @{cmd, data}
    NSUInteger minSectionOff = 0;
    NSUInteger off = headerSize;

    for (uint32_t i = 0; i < ncmds; i++) {
        if (off + 8 > data.length) {
            if (error) *error = mErr(@"Load command 越界");
            return NO;
        }
        uint32_t cmd     = rdU32(base + off, little);
        uint32_t cmdsize = rdU32(base + off + 4, little);
        if (cmdsize < 8 || off + cmdsize > data.length) {
            if (error) *error = mErr([NSString stringWithFormat:@"非法 cmdsize: %u", cmdsize]);
            return NO;
        }
        NSData *raw = [NSData dataWithBytes:base + off length:cmdsize];
        [cmds addObject:@{ @"cmd": @(cmd), @"data": raw }];

        // 收集 section 的 file offset，判断 load command 可扩展空间上限
        if (cmd == kLC_SEGMENT_64 || cmd == kLC_SEGMENT) {
            uint32_t nsects;
            NSUInteger sectBase, stride, offInSect;
            if (cmd == kLC_SEGMENT_64) {
                nsects    = rdU32(base + off + 64, little);
                sectBase  = off + 72;
                stride    = 80;
                offInSect = 48;
            } else {
                nsects    = rdU32(base + off + 48, little);
                sectBase  = off + 56;
                stride    = 68;
                offInSect = 40;
            }
            for (uint32_t s = 0; s < nsects; s++) {
                NSUInteger so = sectBase + s * stride;
                if (so + offInSect + 4 > off + cmdsize) break;
                uint32_t secOff = rdU32(base + so + offInSect, little);
                if (secOff != 0 && (minSectionOff == 0 || secOff < minSectionOff)) {
                    minSectionOff = secOff;
                }
            }
        }
        off += cmdsize;
    }

    // 已存在同名 dylib 命令则跳过
    NSData *dylibBytes = [dylibName dataUsingEncoding:NSUTF8StringEncoding];
    for (NSDictionary *entry in cmds) {
        if ([entry[@"cmd"] unsignedIntValue] == kLC_LOAD_DYLIB) {
            NSData *raw = entry[@"data"];
            NSRange found = [raw rangeOfData:dylibBytes options:0 range:NSMakeRange(0, raw.length)];
            if (found.location != NSNotFound) {
                return YES; // 幂等
            }
        }
    }

    // 移除代码签名命令（全能签重签会重建），释放空间
    NSMutableData *newCmds = [NSMutableData data];
    NSUInteger newNcmds = 0;
    for (NSDictionary *entry in cmds) {
        uint32_t cmd = [entry[@"cmd"] unsignedIntValue];
        if (cmd == kLC_CODE_SIGN) continue;
        [newCmds appendData:entry[@"data"]];
        newNcmds++;
    }
    NSData *dylibCmd = [self buildDylibCommandForName:dylibName little:little];
    [newCmds appendData:dylibCmd];
    newNcmds++;

    NSUInteger limit = minSectionOff ? minSectionOff : data.length;
    if (headerSize + newCmds.length > limit) {
        if (error) *error = mErr([NSString stringWithFormat:
            @"Load command 空间不足（需要 %lu 字节，可用 %lu 字节）",
            (unsigned long)newCmds.length, (unsigned long)(limit - headerSize)]);
        return NO;
    }

    uint8_t *out = data.mutableBytes;
    wrU32(out + 16, (uint32_t)newNcmds,    little);
    wrU32(out + 20, (uint32_t)newCmds.length, little);
    [data replaceBytesInRange:NSMakeRange(headerSize, newCmds.length)
                    withBytes:newCmds.bytes];
    return YES;
}

#pragma mark - 入口：自动识别 FAT / Thin
+ (BOOL)injectDylibNamed:(NSString *)dylibName
           intoMachOAtPath:(NSString *)path
                     error:(NSError **)error {
    NSMutableData *data = [NSMutableData dataWithContentsOfFile:path];
    if (!data) {
        if (error) *error = mErr(@"无法读取主可执行文件");
        return NO;
    }
    if (data.length < 8) {
        if (error) *error = mErr(@"Mach-O 文件过小");
        return NO;
    }

    uint8_t *base = data.mutableBytes;
    uint32_t magicBE = rdU32(base, NO);   // 大端读头部

    if (magicBE == kFAT_MAGIC) {
        // FAT 大端（绝大多数）
        uint32_t nfat = rdU32(base + 4, NO);
        if (8 + nfat * 20 > data.length) {
            if (error) *error = mErr(@"FAT 架构表越界");
            return NO;
        }
        for (uint32_t i = 0; i < nfat; i++) {
            NSUInteger ao = 8 + i * 20;
            uint32_t sliceOff  = rdU32(base + ao + 8, NO);
            uint32_t sliceSize = rdU32(base + ao + 12, NO);
            if ((NSUInteger)sliceOff + sliceSize > data.length) {
                if (error) *error = mErr(@"FAT 切片越界");
                return NO;
            }
            NSMutableData *slice = [NSMutableData dataWithBytes:base + sliceOff length:sliceSize];
            if (![self injectThinMachO:slice dylibName:dylibName error:error]) return NO;
            if (slice.length > sliceSize) {
                if (error) *error = mErr(@"切片注入后体积超出原空间");
                return NO;
            }
            [data replaceBytesInRange:NSMakeRange(sliceOff, slice.length) withBytes:slice.bytes];
        }
        return [data writeToFile:path atomically:YES];
    }

    // 小端 FAT（极少见）
    uint32_t magicLE = rdU32(base, YES);
    if (magicLE == kFAT_MAGIC) {
        uint32_t nfat = rdU32(base + 4, YES);
        for (uint32_t i = 0; i < nfat; i++) {
            NSUInteger ao = 8 + i * 20;
            uint32_t sliceOff  = rdU32(base + ao + 8, YES);
            uint32_t sliceSize = rdU32(base + ao + 12, YES);
            if ((NSUInteger)sliceOff + sliceSize > data.length) {
                if (error) *error = mErr(@"FAT 切片越界");
                return NO;
            }
            NSMutableData *slice = [NSMutableData dataWithBytes:base + sliceOff length:sliceSize];
            if (![self injectThinMachO:slice dylibName:dylibName error:error]) return NO;
            [data replaceBytesInRange:NSMakeRange(sliceOff, slice.length) withBytes:slice.bytes];
        }
        return [data writeToFile:path atomically:YES];
    }

    // Thin
    if (![self injectThinMachO:data dylibName:dylibName error:error]) return NO;
    return [data writeToFile:path atomically:YES];
}

@end
