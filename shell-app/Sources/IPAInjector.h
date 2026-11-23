//
//  IPAInjector.h
//  注入流程编排：解压 IPA -> 复制插件 -> 注入 Mach-O -> 写配置 -> 重打包
//
#import <Foundation/Foundation.h>

@interface IPAInjector : NSObject

/**
 * 对目标 IPA 套用授权插件
 * @param ipaPath   用户选择的原始 IPA 路径
 * @param appKey    后台应用 AppKey
 * @param secret    后台应用 AppSecret
 * @param server    验证服务器地址
 * @param output    输出成品 IPA 路径
 * @param progress  进度回调（主线程展示）
 * @param error     错误
 * @return 成品 IPA 路径，失败返回 nil
 */
+ (NSString *)injectIPAAtPath:(NSString *)ipaPath
                      appKey:(NSString *)appKey
                      secret:(NSString *)secret
                      server:(NSString *)server
                      output:(NSString *)output
                    progress:(void (^)(NSString *step))progress
                       error:(NSError **)error;

@end
