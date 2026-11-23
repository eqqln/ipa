//
//  SignService.h
//  自动签名服务：把加壳后的 IPA 交给分发侧静默重签，返回可直接安装的地址
//  客户全程无感——不接触证书、不手动导入签名工具
//
//  两种工作模式：
//   1) 服务端签名 API（推荐）：POST IPA 到分发签名服务，返回带签名的安装地址
//   2) 本地已签名分发：若壳 IPA 采用企业签/超级签且服务端已登记设备，
//      生成 IPA 后直接返回统一的 itms-services 安装链接
//
#import <Foundation/Foundation.h>

@interface SignService : NSObject

/**
 * 自动签名并生成可安装链接
 * @param ipaPath        加壳后成品 IPA 路径
 * @param signEndpoint   分发签名服务地址（后台配置，可为空=走本地安装链接模式）
 * @param installBase    分发平台安装页基础地址（itms-services 的 manifest 所在）
 * @param completion     回调：installURL（可直接点开安装），err
 */
+ (void)autoSignIPA:(NSString *)ipaPath
       signEndpoint:(NSString *)signEndpoint
       installBase:(NSString *)installBase
        completion:(void (^)(NSString *installURL, NSString *err))completion;

@end
