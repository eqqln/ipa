//
//  ServerAPI.m
//  连接网站后台，与 server/routes/admin.js 的 /api/admin 路由对接
//

#import "ServerAPI.h"

static NSString *cleanServer(NSString *server) {
    NSString *s = [server stringByTrimmingCharactersInSet:
                   [NSCharacterSet whitespaceAndNewlineCharacterSet]];
    while ([s hasSuffix:@"/"]) s = [s substringToIndex:s.length - 1];
    if (![s hasPrefix:@"http://"] && ![s hasPrefix:@"https://"]) {
        s = [@"http://" stringByAppendingString:s];
    }
    return s;
}

@implementation ServerAPI

+ (void)loginToServer:(NSString *)server
             username:(NSString *)username
             password:(NSString *)password
           completion:(void (^)(BOOL, NSString *, NSString *))completion {
    NSString *url = [cleanServer(server) stringByAppendingString:@"/api/admin/login"];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]
                                                      cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                  timeoutInterval:15];
    req.HTTPMethod = @"POST";
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    req.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{ @"username": username ?: @"",
                                                             @"password": password ?: @"" }
                                                   options:0 error:nil];

    [[NSURLSession sharedSession] dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error || !data) {
            completion(NO, nil, @"无法连接服务器，请检查地址与网络");
            return;
        }
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([json[@"code"] integerValue] != 0) {
            completion(NO, nil, json[@"msg"] ?: @"登录失败");
            return;
        }
        // 从 Set-Cookie 提取会话（取第一个键值对）
        NSString *setCookie = [((NSHTTPURLResponse *)response).allHeaderFields objectForKey:@"Set-Cookie"];
        NSString *cookie = [[setCookie componentsSeparatedByString:@";"] firstObject] ?: @"";
        completion(YES, cookie, @"登录成功");
    }] resume];
}

+ (void)fetchAppsFromServer:(NSString *)server
                     cookie:(NSString *)cookie
                 completion:(void (^)(BOOL, NSArray *, NSString *))completion {
    NSString *url = [cleanServer(server) stringByAppendingString:@"/api/admin/apps"];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]
                                                      cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                  timeoutInterval:15];
    if (cookie.length) [req setValue:cookie forHTTPHeaderField:@"Cookie"];

    [[NSURLSession sharedSession] dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error || !data) {
            completion(NO, nil, @"获取应用列表失败");
            return;
        }
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([json[@"code"] integerValue] != 0) {
            completion(NO, nil, json[@"msg"] ?: @"获取应用列表失败");
            return;
        }
        completion(YES, json[@"data"] ?: @[], nil);
    }] resume];
}

@end
