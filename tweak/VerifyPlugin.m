//
//  VerifyPlugin.m
//  iOS 网络验证 / 卡密激活 / 远程公告 插件（注入 dylib）
//
//  编译：Theos（见 Makefile）。编译出的 dylib 交给 ipa-injector/inject.py 注入。
//  配置：插件从 App Bundle 内的 IPAVerifyConfig.plist 读取 AppKey/AppSecret/ServerURL，
//        这些值由 inject.py 在生成 IPA 时自动写入，无需硬编码。
//
//  流程：dylib 加载 -> 读取本地缓存激活码 -> 请求 /api/verify -> 成功放行 + 展示公告 + 启动心跳
//        失败 -> 弹窗提示并重新输入激活码 -> 连续失败 3 次退出 App
//

#import <UIKit/UIKit.h>
#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonHMAC.h>
#import <sys/sysctl.h>
#import <stdlib.h>

static NSString *const kCardKey   = @"__ipa_verify_card_v1";
static NSString *const kUdidKey   = @"__ipa_verify_udid_v1";
static NSString *const kAnnKey    = @"__ipa_verify_ann_seen_v1";
static NSString *const kConfigRes = @"IPAVerifyConfig";

@interface VerifyPlugin : NSObject
@property (nonatomic, strong) NSTimer *heartbeatTimer;
@property (nonatomic, assign) int failCount;
+ (instancetype)shared;
@end

@implementation VerifyPlugin

+ (instancetype)shared {
    static VerifyPlugin *inst = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ inst = [[VerifyPlugin alloc] init]; });
    return inst;
}

// dylib 被加载时自动触发
+ (void)load {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        [[VerifyPlugin shared] start];
    });
}

#pragma mark - 基础工具

- (NSDictionary *)config {
    NSString *path = [[NSBundle mainBundle] pathForResource:kConfigRes ofType:@"plist"];
    if (!path) return nil;
    return [NSDictionary dictionaryWithContentsOfFile:path];
}

- (NSString *)udid {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    NSString *u = [ud stringForKey:kUdidKey];
    if (!u || u.length == 0) {
        u = [NSUUID UUID].UUIDString;
        [ud setObject:u forKey:kUdidKey];
        [ud synchronize];
    }
    return u;
}

- (NSString *)hmacSha256:(NSString *)data key:(NSString *)key {
    const char *cKey = [key UTF8String];
    const char *cData = [data UTF8String];
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CCHmac(kCCHmacAlgSHA256, cKey, strlen(cKey), cData, strlen(cData), digest);
    NSMutableString *out = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
        [out appendFormat:@"%02x", digest[i]];
    }
    return out;
}

- (UIViewController *)topViewController {
    UIViewController *vc = nil;
    if (@available(iOS 13.0, *)) {
        for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
            if (scene.activationState == UISceneActivationStateForegroundActive &&
                [scene isKindOfClass:[UIWindowScene class]]) {
                UIWindow *keyWindow = ((UIWindowScene *)scene).keyWindow;
                vc = keyWindow.rootViewController;
                break;
            }
        }
    }
    if (!vc) vc = [UIApplication sharedApplication].keyWindow.rootViewController;
    while (vc.presentedViewController) vc = vc.presentedViewController;
    return vc;
}

- (void)showAlertTitle:(NSString *)title
               message:(NSString *)message
           inputCard:(BOOL)input
           handler:(void (^)(NSString * _Nullable card))handler {
    UIViewController *host = [self topViewController];
    if (!host) { dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1.0 * NSEC_PER_SEC),
                                dispatch_get_main_queue(), ^{
        [self showAlertTitle:title message:message inputCard:input handler:handler];
    }); return; }

    UIAlertController *ac = [UIAlertController alertControllerWithTitle:title
                                                                message:message
                                                         preferredStyle:UIAlertControllerStyleAlert];
    if (input) {
        [ac addTextFieldWithConfigurationHandler:^(UITextField *tf) {
            tf.placeholder = @"请输入激活码";
            tf.autocapitalizationType = UITextAutocapitalizationTypeAllCharacters;
            tf.clearButtonMode = UITextFieldViewModeWhileEditing;
        }];
        UIAlertAction *ok = [UIAlertAction actionWithTitle:@"激活"
                                                     style:UIAlertActionStyleDefault
                                                   handler:^(UIAlertAction *a) {
            NSString *card = ac.textFields.firstObject.text;
            handler(card);
        }];
        [ac addAction:ok];
    } else {
        [ac addAction:[UIAlertAction actionWithTitle:@"知道了"
                                               style:UIAlertActionStyleDefault
                                             handler:^(UIAlertAction *a) { handler(nil); }]];
    }
    dispatch_async(dispatch_get_main_queue(), ^{
        [host presentViewController:ac animated:YES completion:nil];
    });
}

#pragma mark - 启动 / 验证

- (void)start {
    NSDictionary *cfg = [self config];
    if (!cfg || !cfg[@"AppKey"] || !cfg[@"ServerURL"]) {
        [self showAlertTitle:@"验证配置缺失"
                     message:@"插件内置配置未找到，请重新安装正版插件。"
                     inputCard:NO handler:^(NSString *c) { exit(0); }];
        return;
    }
    NSString *cached = [[NSUserDefaults standardUserDefaults] stringForKey:kCardKey];
    if (cached && cached.length > 0) {
        [self verifyCard:cached];
    } else {
        [self askForCard:@"欢迎使用，请输入激活码以继续"];
    }
}

- (void)askForCard:(NSString *)message {
    __weak typeof(self) weakSelf = self;
    [self showAlertTitle:@"软件激活" message:message inputCard:YES handler:^(NSString *card) {
        NSString *clean = [[card stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] uppercaseString];
        if (clean.length < 8) {
            [weakSelf askForCard:@"激活码格式不正确，请重新输入"];
            return;
        }
        [[NSUserDefaults standardUserDefaults] setObject:clean forKey:kCardKey];
        [[NSUserDefaults standardUserDefaults] synchronize];
        [weakSelf verifyCard:clean];
    }];
}

- (void)verifyCard:(NSString *)card {
    NSDictionary *cfg = [self config];
    NSString *appKey  = cfg[@"AppKey"];
    NSString *secret  = cfg[@"AppSecret"] ?: @"";
    NSString *server  = [cfg[@"ServerURL"] stringByAppendingString:@"/api/verify"];
    NSString *udid    = [self udid];
    long ts = (long)[[NSDate date] timeIntervalSince1970];
    NSString *nonce = [NSUUID UUID].UUIDString;
    NSString *raw = [NSString stringWithFormat:@"%@|%@|%@|%ld|%@", appKey, card, udid, ts, nonce];
    NSString *sign = [self hmacSha256:raw key:secret];

    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:server]
                                                      cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                  timeoutInterval:15];
    req.HTTPMethod = @"POST";
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [req setValue:appKey forHTTPHeaderField:@"X-App-Key"];
    [req setValue:@(ts).stringValue forHTTPHeaderField:@"X-Timestamp"];
    [req setValue:nonce forHTTPHeaderField:@"X-Nonce"];
    [req setValue:sign forHTTPHeaderField:@"X-Sign"];

    NSDictionary *body = @{ @"card": card, @"udid": udid,
                            @"bundle_id": [[NSBundle mainBundle] bundleIdentifier] ?: @"",
                            @"model": [self deviceModel] };
    req.HTTPBody = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];

    __weak typeof(self) weakSelf = self;
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:req
        completionHandler:^(NSData *data, NSURLResponse *resp, NSError *error) {
        if (error || !data) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [weakSelf showAlertTitle:@"网络错误"
                                 message:@"无法连接验证服务器，请检查网络后重试。"
                                 inputCard:NO handler:^(NSString *c) { [weakSelf verifyCard:card]; }];
            });
            return;
        }
        NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        NSInteger code = [json[@"code"] integerValue];
        NSDictionary *info = json[@"data"];
        if (code == 0 && [info[@"valid"] boolValue]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                weakSelf.failCount = 0;
                [weakSelf startHeartbeat];
                [weakSelf showAnnouncement:info[@"announcement"]];
            });
        } else {
            NSString *msg = json[@"msg"] ?: @"验证失败";
            dispatch_async(dispatch_get_main_queue(), ^{
                weakSelf.failCount++;
                [[NSUserDefaults standardUserDefaults] removeObjectForKey:kCardKey];
                [[NSUserDefaults standardUserDefaults] synchronize];
                if (weakSelf.failCount >= 3) {
                    [weakSelf showAlertTitle:@"验证失败" message:@"连续验证失败，软件即将退出。"
                                   inputCard:NO handler:^(NSString *c) { exit(0); }];
                } else {
                    [weakSelf askForCard:[NSString stringWithFormat:@"%@，请重新输入激活码", msg]];
                }
            });
        }
    }];
    [task resume];
}

- (NSString *)deviceModel {
    size_t size = 0;
    sysctlbyname("hw.model", NULL, &size, NULL, 0);
    char *model = malloc(size);
    sysctlbyname("hw.model", model, &size, NULL, 0);
    NSString *s = [NSString stringWithUTF8String:model] ?: @"unknown";
    free(model);
    return s;
}

#pragma mark - 心跳 & 公告

- (void)startHeartbeat {
    if (self.heartbeatTimer) return;
    self.heartbeatTimer = [NSTimer scheduledTimerWithTimeInterval:60
                                                          repeats:YES
                                                            block:^(NSTimer *t) {
        [self heartbeat];
    }];
}

- (void)heartbeat {
    NSDictionary *cfg = [self config];
    NSString *card = [[NSUserDefaults standardUserDefaults] stringForKey:kCardKey] ?: @"";
    NSString *udid = [self udid];
    long ts = (long)[[NSDate date] timeIntervalSince1970];
    NSString *nonce = [NSUUID UUID].UUIDString;
    NSString *raw = [NSString stringWithFormat:@"%@|%@|%@|%ld|%@", cfg[@"AppKey"], card, udid, ts, nonce];
    NSString *sign = [self hmacSha256:raw key:cfg[@"AppSecret"] ?: @""];

    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:
        [NSURL URLWithString:[cfg[@"ServerURL"] stringByAppendingString:@"/api/heartbeat"]]];
    req.HTTPMethod = @"POST";
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    [req setValue:cfg[@"AppKey"] forHTTPHeaderField:@"X-App-Key"];
    [req setValue:@(ts).stringValue forHTTPHeaderField:@"X-Timestamp"];
    [req setValue:nonce forHTTPHeaderField:@"X-Nonce"];
    [req setValue:sign forHTTPHeaderField:@"X-Sign"];
    req.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{@"card": card, @"udid": udid} options:0 error:nil];
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *d, NSURLResponse *r, NSError *e) {
        if (!e && d) {
            NSDictionary *j = [NSJSONSerialization JSONObjectWithData:d options:0 error:nil];
            if ([j[@"code"] integerValue] == 0) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self showAnnouncement:j[@"data"][@"announcement"]];
                });
            }
        }
    }];
    [task resume];
}

- (void)showAnnouncement:(NSDictionary *)ann {
    if (!ann || ![ann isKindOfClass:[NSDictionary class]]) return;
    id updated = ann[@"updated_at"];
    NSString *seen = [[NSUserDefaults standardUserDefaults] stringForKey:kAnnKey];
    NSString *cur = [NSString stringWithFormat:@"%@", updated ?: @"0"];
    if (seen && [seen isEqualToString:cur]) return; // 同一条公告只弹一次
    [[NSUserDefaults standardUserDefaults] setObject:cur forKey:kAnnKey];
    [[NSUserDefaults standardUserDefaults] synchronize];

    [self showAlertTitle:ann[@"title"] ?: @"公告"
                 message:ann[@"content"] ?: @""
               inputCard:NO handler:^(NSString *c) {}];
}

@end
