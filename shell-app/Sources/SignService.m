//
//  SignService.m
//  自动签名：加壳成品 IPA -> 分发签名服务静默重签 -> 返回 itms-services 安装链接
//  客户操作简化为：加壳 → 点"安装到手机" → 一路确认 → 打开输激活码
//

#import "SignService.h"

@implementation SignService

+ (NSString *)cleanURL:(NSString *)s {
    NSString *u = [s stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    while ([u hasSuffix:@"/"]) u = [u substringToIndex:u.length - 1];
    if (![u hasPrefix:@"http://"] && ![u hasPrefix:@"https://"]) u = [@"https://" stringByAppendingString:u];
    return u;
}

+ (void)autoSignIPA:(NSString *)ipaPath
       signEndpoint:(NSString *)signEndpoint
       installBase:(NSString *)installBase
        completion:(void (^)(NSString *, NSString *))completion {
    if (![[NSFileManager defaultManager] fileExistsAtPath:ipaPath]) {
        completion(nil, @"成品 IPA 不存在");
        return;
    }
    NSString *endpoint = signEndpoint.length ? [self cleanURL:signEndpoint]
                       : [[self cleanURL:installBase] stringByAppendingString:@"/api/sign"];
    if (!installBase.length && !signEndpoint.length) {
        // 未配置签名服务：企业签/超级签场景，直接给出已托管安装页提示
        completion(nil, @"未配置分发签名服务地址，请在设置里填写（后台→系统设置→分发签名地址）");
        return;
    }

    NSURL *url = [NSURL URLWithString:endpoint];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url
                                                      cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                  timeoutInterval:180];

    // 构造 multipart/form-data
    NSString *boundary = [NSString stringWithFormat:@"Boundary-%@", [NSUUID UUID].UUIDString];
    [req setValue:[NSString stringWithFormat:@"multipart/form-data; boundary=%@", boundary]
forHTTPHeaderField:@"Content-Type"];
    [req setHTTPMethod:@"POST"];

    NSMutableData *body = [NSMutableData data];
    void (^appendStr)(NSString *) = ^(NSString *s) {
        [body appendData:[s dataUsingEncoding:NSUTF8StringEncoding]];
    };
    appendStr([NSString stringWithFormat:@"--%@\r\n", boundary]);
    appendStr([NSString stringWithFormat:@"Content-Disposition: form-data; name=\"ipa\"; filename=\"%@\"\r\n",
               ipaPath.lastPathComponent]);
    appendStr(@"Content-Type: application/octet-stream\r\n\r\n");
    [body appendData:[NSData dataWithContentsOfFile:ipaPath]];
    appendStr([NSString stringWithFormat:@"\r\n--%@--\r\n", boundary]);
    [req setHTTPBody:body];

    NSURLSessionUploadTask *task = [[NSURLSession sharedSession] uploadTaskWithRequest:req fromData:body
        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error || !data) {
            completion(nil, @"连接签名服务失败，请检查网络与地址");
            return;
        }
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([json[@"code"] integerValue] != 0) {
            completion(nil, json[@"msg"] ?: @"签名失败");
            return;
        }
        NSDictionary *info = json[@"data"] ?: json;
        NSString *manifest = info[@"manifest_url"] ?: info[@"manifest"];
        NSString *direct   = info[@"install_url"] ?: info[@"url"];
        NSString *install = nil;
        if (direct.length) {
            install = direct;
        } else if (manifest.length) {
            NSString *encoded = [manifest stringByAddingPercentEncodingWithAllowedCharacters:
                                 [NSCharacterSet URLQueryAllowedCharacterSet]];
            install = [NSString stringWithFormat:
                       @"itms-services://?action=download-manifest&url=%@", encoded];
        } else {
            completion(nil, @"签名服务未返回安装地址");
            return;
        }
        completion(install, nil);
    }];
    [task resume];
}

@end
