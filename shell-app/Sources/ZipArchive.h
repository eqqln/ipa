//
//  ZipArchive.h
//  基于系统 libz 的轻量 ZIP 解压/压缩工具（零外部依赖）
//
#import <Foundation/Foundation.h>

@interface ZipArchive : NSObject

/**
 * 解压 ZIP 到指定目录，保留内部相对路径（如 Payload/xxx.app/...）
 */
+ (BOOL)unzipAtPath:(NSString *)zipPath
        toDirectory:(NSString *)destDir
              error:(NSError **)error;

/**
 * 将目录内容压缩为 ZIP（deflate），压缩包内路径相对于 srcDir
 */
+ (BOOL)zipDirectory:(NSString *)srcDir
              toPath:(NSString *)zipPath
               error:(NSError **)error;

@end
