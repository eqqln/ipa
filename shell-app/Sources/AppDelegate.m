//
//  AppDelegate.m
//
#import "AppDelegate.h"
#import "ViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
    ViewController *vc = [[ViewController alloc] init];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:vc];
    if (@available(iOS 13.0, *)) {
        // 使用SceneDelegate的项目可在Info.plist禁用；这里用传统window方式
    }
    self.window.rootViewController = nav;
    [self.window makeKeyAndVisible];
    return YES;
}

@end
