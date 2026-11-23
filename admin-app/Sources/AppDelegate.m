#import "AppDelegate.h"
#import "ViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    ViewController *root = [[ViewController alloc] init];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:root];
    nav.navigationBarHidden = YES;              // 用自绘白底顶栏，沉浸式
    self.window.rootViewController = nav;
    [self.window makeKeyAndVisible];
    return YES;
}

// App 内允许后台音频/网络，切后台不中断登录态心跳
- (void)applicationDidBecomeActive:(UIApplication *)application {
    if (self.window.rootViewController) {
        // 通知 webView 页面重新校验（可选），由 VC 自己处理
    }
}

@end
