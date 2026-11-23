//
//  Config.h
//  授权壳 App 全局常量
//
#ifndef Config_h
#define Config_h

#import <Foundation/Foundation.h>

// 内置验证插件文件名（GitHub Actions 编译时拷入 Resources）
static NSString * const kPluginDylibName = @"VerifyPlugin.dylib";

// 注入目标 App 内的配置文件名（验证 dylib 启动时会读取它）
static NSString * const kVerifyConfigName = @"IPAVerifyConfig.plist";

// 本地保存的后台配置键
static NSString * const kStoredServerKey   = @"shell.server";
static NSString * const kStoredUserKey     = @"shell.user";
static NSString * const kStoredPassKey     = @"shell.pass";
static NSString * const kStoredCookieKey   = @"shell.cookie";
static NSString * const kStoredAppKeyKey   = @"shell.appkey";
static NSString * const kStoredSecretKey   = @"shell.secret";
// 分发签名服务地址（客户加壳后自动重签，无需手动导证书）
static NSString * const kStoredSignEndpointKey = @"shell.signEndpoint";
static NSString * const kStoredInstallBaseKey  = @"shell.installBase";

// ============================================================
//  配置加密：把 ServerURL / AppKey / AppSecret 以密文写入 plist，
//  解包只能看到 e:BASE64 密文，明文网址不再裸露。
//  壳 App 写入、验证 dylib 读取，两端算法与密钥必须一致。
// ============================================================
#import <string.h>
static NSString * const kCfgSecret = @"SK-verify-2026!x9#Kq";
static inline NSString * cfgEncrypt(NSString *plain) {
    if (!plain) return @"";
    NSData *d = [plain dataUsingEncoding:NSUTF8StringEncoding];
    NSMutableData *out = [NSMutableData dataWithLength:d.length];
    const unsigned char *src = (const unsigned char *)d.bytes;
    unsigned char *dst = (unsigned char *)out.mutableBytes;
    const char *k = [kCfgSecret UTF8String];
    size_t kl = strlen(k);
    for (NSUInteger i = 0; i < d.length; i++) dst[i] = src[i] ^ (unsigned char)k[i % kl];
    return [out base64EncodedStringWithOptions:0];
}
static inline NSString * cfgDecrypt(NSString *cipher) {
    if (!cipher) return @"";
    NSData *d = [[NSData alloc] initWithBase64EncodedString:cipher options:0];
    if (!d) return @"";
    NSMutableData *out = [NSMutableData dataWithLength:d.length];
    const unsigned char *src = (const unsigned char *)d.bytes;
    unsigned char *dst = (unsigned char *)out.mutableBytes;
    const char *k = [kCfgSecret UTF8String];
    size_t kl = strlen(k);
    for (NSUInteger i = 0; i < d.length; i++) dst[i] = src[i] ^ (unsigned char)k[i % kl];
    return [[NSString alloc] initWithData:out encoding:NSUTF8StringEncoding] ?: @"";
}
// 读取配置值：e: 前缀解密，否则按明文（兼容旧配置）
static inline NSString * cfgRead(NSDictionary *cfg, NSString *key) {
    id v = cfg[key];
    if (![v isKindOfClass:[NSString class]]) return @"";
    NSString *s = (NSString *)v;
    if ([s hasPrefix:@"e:"]) return cfgDecrypt([s substringFromIndex:2]);
    return s;
}

#endif /* Config_h */
