//
//  IPAInjector.m
//  编排整个"套授权插件"流程，全部在 App 沙盒内本地完成，无需越狱
//

#import "IPAInjector.h"
#import "ZipArchive.h"
#import "MachOInjector.h"
#import "Config.h"

static NSError *iErr(NSString *msg) {
    return [NSError errorWithDomain:@"IPAInjector"
                              code:-1
                          userInfo:@{NSLocalizedDescriptionKey: msg}];
}

@implementation IPAInjector

+ (NSString *)findAppBundleInDirectory:(NSString *)workdir error:(NSError **)error {
    NSString *payload = [workdir stringByAppendingPathComponent:@"Payload"];
    BOOL isDir = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:payload isDirectory:&isDir] || !isDir) {
        if (error) *error = iErr(@"IPA 内缺少 Payload 目录");
        return nil;
    }
    NSArray *items = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:payload error:nil];
    for (NSString *item in items) {
        if ([item hasSuffix:@".app"]) {
            return [payload stringByAppendingPathComponent:item];
        }
    }
    if (error) *error = iErr(@"Payload 内未找到 .app 目录");
    return nil;
}

+ (NSString *)injectIPAAtPath:(NSString *)ipaPath
                      appKey:(NSString *)appKey
                      secret:(NSString *)secret
                      server:(NSString *)server
                      output:(NSString *)output
                    progress:(void (^)(NSString *))progress
                       error:(NSError **)error {
    void (^say)(NSString *) = ^(NSString *s) { if (progress) progress(s); };

    if (![[NSFileManager defaultManager] fileExistsAtPath:ipaPath]) {
        if (error) *error = iErr(@"原始 IPA 不存在");
        return nil;
    }

    NSString *workdir = [NSTemporaryDirectory()
        stringByAppendingPathComponent:[@"inject_" stringByAppendingString:[NSUUID UUID].UUIDString]];
    [[NSFileManager defaultManager] createDirectoryAtPath:workdir
                              withIntermediateDirectories:YES attributes:nil error:nil];

    @try {
        say(@"① 解压 IPA…");
        if (![ZipArchive unzipAtPath:ipaPath toDirectory:workdir error:error]) return nil;

        say(@"② 定位 App 主程序…");
        NSString *appBundle = [self findAppBundleInDirectory:workdir error:error];
        if (!appBundle) return nil;

        NSDictionary *info = [NSDictionary dictionaryWithContentsOfFile:
            [appBundle stringByAppendingPathComponent:@"Info.plist"]];
        NSString *exeName = info[@"CFBundleExecutable"];
        if (!exeName) {
            if (error) *error = iErr(@"Info.plist 缺少 CFBundleExecutable");
            return nil;
        }
        NSString *exePath = [appBundle stringByAppendingPathComponent:exeName];
        if (![[NSFileManager defaultManager] fileExistsAtPath:exePath]) {
            if (error) *error = iErr(@"主可执行文件不存在");
            return nil;
        }

        say(@"③ 植入验证插件 dylib…");
        NSString *fwDir = [appBundle stringByAppendingPathComponent:@"Frameworks"];
        [[NSFileManager defaultManager] createDirectoryAtPath:fwDir
                                  withIntermediateDirectories:YES attributes:nil error:nil];
        // 多重兜底查找内置插件（企业重签可能剔除 Frameworks 下的 .dylib）
        NSString *bundle = [[NSBundle mainBundle] bundlePath];
        NSArray *candidates = @[
            [bundle stringByAppendingPathComponent:@"VerifyPlugin.dat"],                 // 根目录 .dat（防剔除，首选）
            [bundle stringByAppendingPathComponent:@"Frameworks/VerifyPlugin.dylib"],    // 标准位置
            [bundle stringByAppendingPathComponent:@"VerifyPlugin.dylib"],               // 根目录 .dylib
        ];
        NSString *srcDylib = nil;
        for (NSString *c in candidates) {
            if ([[NSFileManager defaultManager] fileExistsAtPath:c]) { srcDylib = c; break; }
        }
        // 最后兜底：从后台服务器下载（service 地址来自 ViewController 传入的 server）
        if (!srcDylib && server.length > 0) {
            say(@"本地未找到插件，尝试从服务器下载…");
            NSString *base = [server stringByTrimmingCharactersInSet:
                              [NSCharacterSet characterSetWithCharactersInString:@"/"]];
            NSString *dlUrl = [NSString stringWithFormat:@"%@/api/plugin/dylib", base];
            NSData *remote = [NSData dataWithContentsOfURL:[NSURL URLWithString:dlUrl]];
            if (remote.length > 10000) {
                NSString *tmp = [NSTemporaryDirectory() stringByAppendingPathComponent:@"VerifyPlugin.dat"];
                if ([remote writeToFile:tmp atomically:YES]) srcDylib = tmp;
            }
        }
        if (!srcDylib) {
            if (error) *error = iErr(@"壳 App 内未找到内置 VerifyPlugin.dylib（本地与服务器均无）");
            return nil;
        }
        NSString *dstDylib = [fwDir stringByAppendingPathComponent:kPluginDylibName];
        [[NSFileManager defaultManager] removeItemAtPath:dstDylib error:nil];
        if (![[NSFileManager defaultManager] copyItemAtPath:srcDylib toPath:dstDylib error:nil]) {
            if (error) *error = iErr(@"复制插件 dylib 失败");
            return nil;
        }
        // 保留一份 .dat 到目标 App 根目录，防止目标 IPA 后续被重签时再次剔除
        NSString *dstDat = [appBundle stringByAppendingPathComponent:@"VerifyPlugin.dat"];
        [[NSFileManager defaultManager] copyItemAtPath:srcDylib toPath:dstDat error:nil];

        say(@"④ 改写 Mach-O 加载命令…");
        if (![MachOInjector injectDylibNamed:kPluginDylibName intoMachOAtPath:exePath error:error]) {
            return nil;
        }

        say(@"⑤ 写入内置授权配置（加密）…");
        NSString *cleanServer = [server stringByTrimmingCharactersInSet:
                                 [NSCharacterSet characterSetWithCharactersInString:@"/"]] ?: @"";
        // 加密存储：解包只能看到 e:BASE64 密文，网址不再明文裸露
        // LinkCode 是一整串加密代码，把 server|appKey|secret|version 打包加密，dylib 运行时解密还原
        NSString *linkPlain = [NSString stringWithFormat:@"%@|%@|%@|1.0.0", cleanServer, appKey ?: @"", secret ?: @""];
        NSDictionary *cfg = @{
            @"LinkCode":      [@"e:" stringByAppendingString:cfgEncrypt(linkPlain)],
            @"AppKey":        [@"e:" stringByAppendingString:cfgEncrypt(appKey ?: @"")],
            @"AppSecret":     [@"e:" stringByAppendingString:cfgEncrypt(secret ?: @"")],
            @"ServerURL":     [@"e:" stringByAppendingString:cfgEncrypt(cleanServer)],
            @"PluginVersion": @"1.0.0",
            @"Enc":           @YES
        };
        NSString *cfgPath = [appBundle stringByAppendingPathComponent:kVerifyConfigName];
        if (![cfg writeToFile:cfgPath atomically:YES]) {
            if (error) *error = iErr(@"写入授权配置失败");
            return nil;
        }

        say(@"⑥ 重新打包成品 IPA…");
        [[NSFileManager defaultManager] removeItemAtPath:output error:nil];
        NSString *outDir = [output stringByDeletingLastPathComponent];
        [[NSFileManager defaultManager] createDirectoryAtPath:outDir
                                  withIntermediateDirectories:YES attributes:nil error:nil];
        if (![ZipArchive zipDirectory:workdir toPath:output error:error]) return nil;

        say(@"✅ 完成，可导出到文件");
        return output;
    }
    @finally {
        [[NSFileManager defaultManager] removeItemAtPath:workdir error:nil];
    }
}

@end
