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

#endif /* Config_h */
