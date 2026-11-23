//
//  ServerAPI.h
//  连接网站后台：登录鉴权 + 拉取应用列表（AppKey/AppSecret）
//  走 /api/admin 路由，与现有 server 完全一致
//
#import <Foundation/Foundation.h>

@interface ServerAPI : NSObject

/**
 * 管理员登录，成功回调 cookie（用于后续请求鉴权）
 */
+ (void)loginToServer:(NSString *)server
             username:(NSString *)username
             password:(NSString *)password
           completion:(void (^)(BOOL ok, NSString *cookie, NSString *msg))completion;

/**
 * 拉取应用列表，返回字典数组（每个含 id/name/app_key/app_secret）
 */
+ (void)fetchAppsFromServer:(NSString *)server
                     cookie:(NSString *)cookie
                 completion:(void (^)(BOOL ok, NSArray *apps, NSString *msg))completion;

@end
