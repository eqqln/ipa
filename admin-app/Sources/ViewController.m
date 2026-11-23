#import "ViewController.h"
#import <WebKit/WebKit.h>

static NSString * const kAdminURL = @"https://ipa.shengka.net/";

@interface ViewController () <WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate>
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UIProgressView *progress;
@property (nonatomic, strong) UIView *topBar;
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UIButton *backBtn;
@property (nonatomic, assign) BOOL didLoadError;
@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:0.96 green:0.97 blue:0.99 alpha:1.0];
    [self buildTopBar];
    [self buildWebView];
}

#pragma mark - 顶部白底导航栏
- (void)buildTopBar {
    UIView *bar = [[UIView alloc] init];
    bar.translatesAutoresizingMaskIntoConstraints = NO;
    bar.backgroundColor = [UIColor whiteColor];
    bar.layer.shadowColor = [UIColor colorWithWhite:0 alpha:0.07].CGColor;
    bar.layer.shadowOpacity = 1.0;
    bar.layer.shadowOffset = CGSizeMake(0, 1);
    bar.layer.shadowRadius = 3;
    [self.view addSubview:bar];
    self.topBar = bar;

    CGFloat top = [UIApplication sharedApplication].statusBarFrame.size.height;
    if (top <= 0) top = 20;

    // 返回按钮
    UIButton *back = [UIButton buttonWithType:UIButtonTypeSystem];
    back.translatesAutoresizingMaskIntoConstraints = NO;
    [back setTitle:@"‹ 返回" forState:UIControlStateNormal];
    back.titleLabel.font = [UIFont systemFontOfSize:16 weight:UIFontWeightMedium];
    [back setTitleColor:[UIColor colorWithRed:0.20 green:0.45 blue:0.95 alpha:1.0] forState:UIControlStateNormal];
    [back addTarget:self action:@selector(goBack) forControlEvents:UIControlEventTouchUpInside];
    [bar addSubview:back];
    self.backBtn = back;

    // 标题
    UILabel *title = [[UILabel alloc] init];
    title.translatesAutoresizingMaskIntoConstraints = NO;
    title.text = @"授权中心";
    title.font = [UIFont systemFontOfSize:17 weight:UIFontWeightSemibold];
    title.textColor = [UIColor colorWithRed:0.12 green:0.14 blue:0.18 alpha:1.0];
    title.textAlignment = NSTextAlignmentCenter;
    [bar addSubview:title];
    self.titleLabel = title;

    // 刷新
    UIButton *refresh = [UIButton buttonWithType:UIButtonTypeSystem];
    refresh.translatesAutoresizingMaskIntoConstraints = NO;
    [refresh setTitle:@"↻" forState:UIControlStateNormal];
    refresh.titleLabel.font = [UIFont systemFontOfSize:24];
    [refresh setTitleColor:[UIColor colorWithRed:0.20 green:0.45 blue:0.95 alpha:1.0] forState:UIControlStateNormal];
    [refresh addTarget:self action:@selector(reloadPage) forControlEvents:UIControlEventTouchUpInside];
    [bar addSubview:refresh];

    // 更多
    UIButton *more = [UIButton buttonWithType:UIButtonTypeSystem];
    more.translatesAutoresizingMaskIntoConstraints = NO;
    [more setTitle:@"⋯" forState:UIControlStateNormal];
    more.titleLabel.font = [UIFont systemFontOfSize:24 weight:UIFontWeightBold];
    [more setTitleColor:[UIColor colorWithRed:0.20 green:0.45 blue:0.95 alpha:1.0] forState:UIControlStateNormal];
    [more addTarget:self action:@selector(showMenu) forControlEvents:UIControlEventTouchUpInside];
    [bar addSubview:more];

    NSDictionary *views = @{@"back":back, @"title":title, @"refresh":refresh, @"more":more};
    [NSLayoutConstraint activateConstraints:@[
        [bar.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [bar.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [bar.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [bar.heightAnchor constraintEqualToConstant:top + 50],

        [back.leadingAnchor constraintEqualToAnchor:bar.leadingAnchor constant:8],
        [back.bottomAnchor constraintEqualToAnchor:bar.bottomAnchor constant:-8],
        [back.widthAnchor constraintGreaterThanOrEqualToConstant:64],
        [back.heightAnchor constraintEqualToConstant:40],

        [title.centerXAnchor constraintEqualToAnchor:bar.centerXAnchor],
        [title.centerYAnchor constraintEqualToAnchor:back.centerYAnchor],
        [title.leadingAnchor constraintGreaterThanOrEqualToAnchor:back.trailingAnchor constant:4],

        [refresh.trailingAnchor constraintEqualToAnchor:more.leadingAnchor constant:-4],
        [refresh.centerYAnchor constraintEqualToAnchor:back.centerYAnchor],
        [refresh.widthAnchor constraintEqualToConstant:40],
        [refresh.heightAnchor constraintEqualToConstant:40],

        [more.trailingAnchor constraintEqualToAnchor:bar.trailingAnchor constant:-8],
        [more.centerYAnchor constraintEqualToAnchor:back.centerYAnchor],
        [more.widthAnchor constraintEqualToConstant:36],
        [more.heightAnchor constraintEqualToConstant:40],
    ]];
}

#pragma mark - WebView
- (void)buildWebView {
    WKWebViewConfiguration *cfg = [[WKWebViewConfiguration alloc] init];
    cfg.allowsInlineMediaPlayback = YES;
    cfg.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    // 共享 cookie：保证 WKWebView 与系统/其他 App 之间登录态一致
    cfg.websiteDataStore = [WKWebsiteDataStore defaultDataStore];

    WKWebView *web = [[WKWebView alloc] initWithFrame:CGRectZero configuration:cfg];
    web.translatesAutoresizingMaskIntoConstraints = NO;
    web.navigationDelegate = self;
    web.UIDelegate = self;
    web.allowsBackForwardNavigationGestures = YES;
    web.backgroundColor = [UIColor whiteColor];
    web.opaque = NO;
    [self.view addSubview:web];
    self.webView = web;

    [NSLayoutConstraint activateConstraints:@[
        [web.topAnchor constraintEqualToAnchor:self.topBar.bottomAnchor],
        [web.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [web.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [web.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    ]];

    // 顶部进度条
    UIProgressView *pv = [[UIProgressView alloc] initWithProgressViewStyle:UIProgressViewStyleDefault];
    pv.translatesAutoresizingMaskIntoConstraints = NO;
    pv.progressTintColor = [UIColor colorWithRed:0.20 green:0.45 blue:0.95 alpha:1.0];
    pv.trackTintColor = [UIColor clearColor];
    [self.view addSubview:pv];
    self.progress = pv;
    [NSLayoutConstraint activateConstraints:@[
        [pv.topAnchor constraintEqualToAnchor:self.topBar.bottomAnchor],
        [pv.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [pv.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [pv.heightAnchor constraintEqualToConstant:2],
    ]];
    [web addObserver:self forKeyPath:@"estimatedProgress" options:NSKeyValueObservingOptionNew context:nil];

    // 下拉刷新
    UIRefreshControl *rc = [[UIRefreshControl alloc] init];
    rc.tintColor = [UIColor colorWithRed:0.20 green:0.45 blue:0.95 alpha:1.0];
    [rc addTarget:self action:@selector(reloadPage) forControlEvents:UIControlEventValueChanged];
    web.scrollView.refreshControl = rc;

    [self loadHome];
}

- (void)loadHome {
    self.didLoadError = NO;
    NSURL *url = [NSURL URLWithString:kAdminURL];
    NSURLRequest *req = [NSURLRequest requestWithURL:url cachePolicy:NSURLRequestUseProtocolCachePolicy timeoutInterval:30];
    [self.webView loadRequest:req];
}

- (void)reloadPage {
    if (self.didLoadError) { [self loadHome]; return; }
    [self.webView reload];
    [self.webView.scrollView.refreshControl endRefreshing];
}

- (void)goBack {
    if ([self.webView canGoBack]) {
        [self.webView goBack];
    } else {
        [self loadHome];
    }
}

#pragma mark - 菜单
- (void)showMenu {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"授权中心" message:nil preferredStyle:UIAlertControllerStyleActionSheet];

    [sheet addAction:[UIAlertAction actionWithTitle:@"🏠 回到首页" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){
        [self loadHome];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"↻ 刷新页面" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){
        [self reloadPage];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"🧹 清除缓存并重新登录" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){
        [self clearCache];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"🌐 用浏览器打开" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){
        [self openExternally:[NSURL URLWithString:kAdminURL]];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];

    if (sheet.popoverPresentationController) {
        sheet.popoverPresentationController.sourceView = self.view;
        sheet.popoverPresentationController.sourceRect = CGRectMake(self.view.bounds.size.width - 40, 40, 20, 20);
    }
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)clearCache {
    [self.webView.scrollView.refreshControl endRefreshing];
    NSSet *types = [WKWebsiteDataStore allWebsiteDataTypes];
    NSDate *since = [NSDate dateWithTimeIntervalSince1970:0];
    [[WKWebsiteDataStore defaultDataStore] removeDataOfTypes:types modifiedSince:since completionHandler:^{
        dispatch_async(dispatch_get_main_queue(), ^{
            [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:kAdminURL]]];
        });
    }];
}

- (void)openExternally:(NSURL *)url {
    if ([[UIApplication sharedApplication] canOpenURL:url]) {
        [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
    }
}

#pragma mark - KVO 进度
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    if ([keyPath isEqualToString:@"estimatedProgress"]) {
        double p = self.webView.estimatedProgress;
        [self.progress setHidden:p >= 1.0];
        [self.progress setProgress:p animated:YES];
    }
}

#pragma mark - WKNavigationDelegate
- (void)webView:(WKWebView *)webView didStartProvisionalNavigation:(WKNavigation *)navigation {
    self.didLoadError = NO;
    self.titleLabel.text = @"加载中…";
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    [self.progress setHidden:YES];
    [self.webView.scrollView.refreshControl endRefreshing];
    self.titleLabel.text = @"授权中心";
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self showError:error];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self showError:error];
}

- (void)showError:(NSError *)error {
    [self.progress setHidden:YES];
    [self.webView.scrollView.refreshControl endRefreshing];
    if (error.code == -999) return; // 主动取消
    self.didLoadError = YES;
    self.titleLabel.text = @"加载失败";
    NSString *html = [NSString stringWithFormat:
        @"<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{font-family:-apple-system;background:#f5f7fa;color:#333;display:flex;"
        "flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}"
        ".b{background:#3b6fe0;color:#fff;padding:12px 28px;border-radius:10px;font-size:16px;margin-top:20px}"
        ".t{font-size:48px}p{color:#888;font-size:14px}</style></head><body>"
        "<div class='t'>📡</div><h3>无法连接服务器</h3><p>%@</p>"
        "<div class='b' onclick='location.href=\"%@\"'>点击重试</div></body></html>",
        [self esc:[error localizedDescription]], kAdminURL];
    [self.webView loadHTMLString:html baseURL:nil];
}

- (NSString *)esc:(NSString *)s {
    s = [s stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
    s = [s stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
    s = [s stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
    return s ?: @"";
}

// 拦截导航：站内 http(s) 放行；外链/电话/mailto 交系统；新窗口用当前 webView 打开
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
        if ([[UIApplication sharedApplication] canOpenURL:url]) {
            [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
        }
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    if (![url.host isEqualToString:@"ipa.shengka.net"] && navigationAction.navigationType == WKNavigationTypeLinkActivated) {
        [self openExternally:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

#pragma mark - WKUIDelegate（让网页 alert / confirm 正常弹出）
- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    UIAlertController *ac = [UIAlertController alertControllerWithTitle:@"提示" message:message preferredStyle:UIAlertControllerStyleAlert];
    [ac addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){ completionHandler(); }]];
    [self presentViewController:ac animated:YES completion:nil];
}

- (void)webView:(WKWebView *)webView runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL))completionHandler {
    UIAlertController *ac = [UIAlertController alertControllerWithTitle:@"确认" message:message preferredStyle:UIAlertControllerStyleAlert];
    [ac addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:^(UIAlertAction *a){ completionHandler(NO); }]];
    [ac addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a){ completionHandler(YES); }]];
    [self presentViewController:ac animated:YES completion:nil];
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (!navigationAction.targetFrame.isMainFrame) {
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

- (void)dealloc {
    @try { [self.webView removeObserver:self forKeyPath:@"estimatedProgress"]; } @catch (NSException *e) {}
}

@end
