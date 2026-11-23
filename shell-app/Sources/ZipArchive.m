//
//  ZipArchive.m
//  基于系统 libz 的轻量 ZIP 解压/压缩工具（零外部依赖）
//  支持 store(0) 与 deflate(8)，32 位 ZIP（IPA 通用格式）
//

#import "ZipArchive.h"
#import <zlib.h>

#pragma mark - 小端读写辅助
static inline uint16_t rd16(const uint8_t *p) {
    return (uint16_t)(p[0] | ((uint16_t)p[1] << 8));
}
static inline uint32_t rd32(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static inline void wr16(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)((v >> 8) & 0xff);
}
static inline void wr32(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)((v >> 8) & 0xff);
    p[2] = (uint8_t)((v >> 16) & 0xff);
    p[3] = (uint8_t)((v >> 24) & 0xff);
}

static NSError *zipErr(NSString *msg) {
    return [NSError errorWithDomain:@"ZipArchive"
                              code:-1
                          userInfo:@{NSLocalizedDescriptionKey: msg}];
}

@implementation ZipArchive

#pragma mark - 解压
+ (BOOL)unzipAtPath:(NSString *)zipPath
        toDirectory:(NSString *)destDir
              error:(NSError **)error {
    NSData *data = [NSData dataWithContentsOfFile:zipPath];
    if (!data) {
        if (error) *error = zipErr(@"无法读取 IPA 文件");
        return NO;
    }
    const uint8_t *bytes = data.bytes;
    NSUInteger len = data.length;
    if (len < 22) {
        if (error) *error = zipErr(@"IPA 文件过小或格式错误");
        return NO;
    }

    // 从尾部倒查 EOCD（End of Central Directory）签名 0x06054b50
    NSUInteger eocd = NSNotFound;
    NSUInteger i = len - 22;
    while (1) {
        if (rd32(bytes + i) == 0x06054b50) { eocd = i; break; }
        if (i == 0) break;
        i--;
    }
    if (eocd == NSNotFound) {
        if (error) *error = zipErr(@"未找到 ZIP 结束目录，文件可能已损坏");
        return NO;
    }

    uint16_t totalEntries = rd16(bytes + eocd + 10);
    uint32_t cdOffset     = rd32(bytes + eocd + 16);

    // ZIP64 检测：本实现面向常规 IPA，遇到 ZIP64 明确报错
    if (cdOffset == 0xFFFFFFFF || totalEntries == 0xFFFF) {
        if (error) *error = zipErr(@"不支持 ZIP64 格式的 IPA");
        return NO;
    }
    if ((NSUInteger)cdOffset + 46 > len) {
        if (error) *error = zipErr(@"中央目录偏移越界");
        return NO;
    }

    NSFileManager *fm = [NSFileManager defaultManager];
    [fm createDirectoryAtPath:destDir withIntermediateDirectories:YES attributes:nil error:nil];

    NSUInteger p = cdOffset;
    for (uint32_t idx = 0; idx < totalEntries; idx++) {
        if (p + 46 > len || rd32(bytes + p) != 0x02014b50) break;

        uint16_t method     = rd16(bytes + p + 10);
        uint32_t csize      = rd32(bytes + p + 20);
        uint32_t usize      = rd32(bytes + p + 24);
        uint16_t nameLen    = rd16(bytes + p + 28);
        uint16_t extraLen   = rd16(bytes + p + 30);
        uint16_t commentLen = rd16(bytes + p + 32);
        uint32_t localOff   = rd32(bytes + p + 42);

        NSString *name = [[NSString alloc] initWithBytes:bytes + p + 46
                                                  length:nameLen
                                                encoding:NSUTF8StringEncoding];
        NSUInteger entryAdvance = 46 + nameLen + extraLen + commentLen;

        // 目录条目跳过
        if ([name hasSuffix:@"/"]) {
            NSString *dirPath = [destDir stringByAppendingPathComponent:name];
            [fm createDirectoryAtPath:dirPath withIntermediateDirectories:YES attributes:nil error:nil];
            p += entryAdvance;
            continue;
        }

        if ((NSUInteger)localOff + 30 > len || rd32(bytes + localOff) != 0x04034b50) {
            if (error) *error = zipErr(@"本地文件头签名错误");
            return NO;
        }
        uint16_t lhNameLen  = rd16(bytes + localOff + 26);
        uint16_t lhExtraLen = rd16(bytes + localOff + 28);
        NSUInteger dataOff  = (NSUInteger)localOff + 30 + lhNameLen + lhExtraLen;
        if (dataOff + csize > len) {
            if (error) *error = zipErr(@"压缩数据越界");
            return NO;
        }
        const uint8_t *comp = bytes + dataOff;

        NSMutableData *outData = nil;
        if (method == 0) {
            outData = [NSMutableData dataWithBytes:comp length:csize];
        } else if (method == 8) {
            outData = [NSMutableData dataWithLength:usize];
            z_stream strm;
            memset(&strm, 0, sizeof(strm));
            if (inflateInit2(&strm, -15) != Z_OK) {
                if (error) *error = zipErr(@"inflate 初始化失败");
                return NO;
            }
            strm.next_in   = (Bytef *)comp;
            strm.avail_in  = (uInt)csize;
            strm.next_out  = (Bytef *)outData.mutableBytes;
            strm.avail_out = (uInt)usize;
            int r = inflate(&strm, Z_FINISH);
            inflateEnd(&strm);
            if (r != Z_STREAM_END) {
                if (error) *error = zipErr([NSString stringWithFormat:@"解压失败(%@)，code=%d", name, r]);
                return NO;
            }
        } else {
            if (error) *error = zipErr([NSString stringWithFormat:@"不支持的压缩方法 %d", method]);
            return NO;
        }

        NSString *dest = [destDir stringByAppendingPathComponent:name];
        [fm createDirectoryAtPath:dest.stringByDeletingLastPathComponent
      withIntermediateDirectories:YES attributes:nil error:nil];
        if (![outData writeToFile:dest atomically:YES]) {
            if (error) *error = zipErr([NSString stringWithFormat:@"写出文件失败: %@", name]);
            return NO;
        }
        p += entryAdvance;
    }
    return YES;
}

#pragma mark - 压缩
+ (BOOL)zipDirectory:(NSString *)srcDir
              toPath:(NSString *)zipPath
               error:(NSError **)error {
    NSMutableData *out = [NSMutableData data];
    NSMutableArray *entries = [NSMutableArray array];

    NSFileManager *fm = [NSFileManager defaultManager];
    NSArray *subpaths = [fm subpathsOfDirectoryAtPath:srcDir error:nil];
    if (!subpaths) {
        if (error) *error = zipErr(@"读取源目录失败");
        return NO;
    }

    for (NSString *rel in subpaths) {
        NSString *full = [srcDir stringByAppendingPathComponent:rel];
        BOOL isDir = NO;
        if (![fm fileExistsAtPath:full isDirectory:&isDir] || isDir) continue;

        NSData *fileData = [NSData dataWithContentsOfFile:full];
        if (!fileData) continue;

        NSData *nameData = [rel dataUsingEncoding:NSUTF8StringEncoding];
        uLongf bound = compressBound((uLong)fileData.length);
        NSMutableData *comp = [NSMutableData dataWithLength:bound];

        z_stream strm;
        memset(&strm, 0, sizeof(strm));
        if (deflateInit2(&strm, Z_DEFAULT_COMPRESSION, Z_DEFLATED, -15, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
            if (error) *error = zipErr(@"deflate 初始化失败");
            return NO;
        }
        strm.next_in   = (Bytef *)fileData.bytes;
        strm.avail_in  = (uInt)fileData.length;
        strm.next_out  = (Bytef *)comp.mutableBytes;
        strm.avail_out = (uInt)bound;
        deflate(&strm, Z_FINISH);
        NSUInteger csize = strm.total_out;
        deflateEnd(&strm);
        [comp setLength:csize];

        uLong crc = crc32(0, fileData.bytes, (uInt)fileData.length);
        NSUInteger offset = out.length;

        // 本地文件头（30 字节）
        uint8_t lh[30]; memset(lh, 0, sizeof(lh));
        wr32(lh,      0x04034b50);
        wr16(lh + 4,  20);
        wr16(lh + 6,  0x0800);          // UTF-8 文件名标志位
        wr16(lh + 8,  8);               // deflate
        wr32(lh + 14, (uint32_t)crc);
        wr32(lh + 18, (uint32_t)csize);
        wr32(lh + 22, (uint32_t)fileData.length);
        wr16(lh + 26, (uint16_t)nameData.length);
        wr16(lh + 28, 0);
        [out appendBytes:lh length:sizeof(lh)];
        [out appendData:nameData];
        [out appendData:comp];

        [entries addObject:@{ @"name": rel,
                              @"offset": @(offset),
                              @"csize": @(csize),
                              @"usize": @(fileData.length),
                              @"crc": @(crc) }];
    }

    NSUInteger cdStart = out.length;
    for (NSDictionary *e in entries) {
        NSData *nameData = [e[@"name"] dataUsingEncoding:NSUTF8StringEncoding];
        uint8_t ch[46]; memset(ch, 0, sizeof(ch));
        wr32(ch,      0x02014b50);
        wr16(ch + 4,  20);
        wr16(ch + 6,  20);
        wr16(ch + 8,  0x0800);
        wr16(ch + 10, 8);
        wr32(ch + 16, (uint32_t)[e[@"crc"] unsignedLongValue]);
        wr32(ch + 20, (uint32_t)[e[@"csize"] unsignedIntegerValue]);
        wr32(ch + 24, (uint32_t)[e[@"usize"] unsignedIntegerValue]);
        wr16(ch + 28, (uint16_t)nameData.length);
        wr32(ch + 42, (uint32_t)[e[@"offset"] unsignedIntegerValue]);
        [out appendBytes:ch length:sizeof(ch)];
        [out appendData:nameData];
    }
    NSUInteger cdSize = out.length - cdStart;

    uint8_t eocd[22]; memset(eocd, 0, sizeof(eocd));
    wr32(eocd,      0x06054b50);
    wr16(eocd + 8,  (uint16_t)entries.count);
    wr16(eocd + 10, (uint16_t)entries.count);
    wr32(eocd + 12, (uint32_t)cdSize);
    wr32(eocd + 16, (uint32_t)cdStart);
    [out appendBytes:eocd length:sizeof(eocd)];

    return [out writeToFile:zipPath atomically:YES];
}

@end
