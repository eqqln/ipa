//
//  ViewController.m
//  纯代码构建界面：连接后台 -> 选应用 -> 选 IPA -> 注入 -> 导出
//
#import "ViewController.h"
#import "ServerAPI.h"
#import "IPAInjector.h"
#import "SignService.h"
#import "Config.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@interface ViewController () <UITextFieldDelegate, UIDocumentPickerDelegate, UIPickerViewDataSource, UIPickerViewDelegate>

@property (nonatomic, strong) UIScrollView *scroll;
@property (nonatomic, strong) UITextField *serverField;
@property (nonatomic, strong) UITextField *userField;
@property (nonatomic, strong) UITextField *passField;
@property (nonatomic, strong) UIButton *connectBtn;
@property (nonatomic, strong) UIPickerView *appPicker;
@property (nonatomic, strong) NSArray *apps;
@property (nonatomic, strong) NSString *cookie;
@property (nonatomic, strong) NSString *ipaPath;
@property (nonatomic, strong) UILabel *ipaLabel;
@property (nonatomic, strong) UITextField *customKeyField;
@property (nonatomic, strong) UITextField *customSecretField;
@property (nonatomic, strong) UIButton *selectBtn;
@property (nonatomic, strong) UIButton *injectBtn;
@property (nonatomic, strong) UIButton *exportBtn;
@property (nonatomic, strong) UIButton *installBtn;
@property (nonatomic, strong) UITextField *signEndpointField;
@property (nonatomic, strong) UITextView *logView;
@property (nonatomic, strong) NSString *outputPath;
@property (nonatomic, strong) NSString *pickedAppKey;
@property (nonatomic, strong) NSString *pickedAppSecret;

@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:0.96 green:0.97 blue:0.99 alpha:1];
    self.title = @"IPA 授权助手";
    [self buildUI];
    [self loadSaved];
}

#pragma mark - 界面构建
- (void)buildUI {
    CGFloat W = [UIScreen mainScreen].bounds.size.width;
    CGFloat pad = 18, y = 20, fieldH = 42, gap = 10;

    self.scroll = [[UIScrollView alloc] initWithFrame:self.view.bounds];
    self.scroll.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self.view addSubview:self.scroll];

    UILabel *title = [UILabel new];
    title.frame = CGRectMake(pad, y, W - 2 * pad, 34);
    title.text = @"🔐 IPA 授权插件生成器";
    title.font = [UIFont boldSystemFontOfSize:20];
    [self.scroll addSubview:title];
    y += 42;

    UILabel *tip = [UILabel new];
    tip.frame = CGRectMake(pad, y, W - 2 * pad, 40);
    tip.text = @"连接网站后台，选择目标 IPA，一键植入授权插件并导出成品（导入全能签安装）";
    tip.font = [UIFont systemFontOfSize:13];
    tip.textColor = [UIColor darkGrayColor];
    tip.numberOfLines = 0;
    [self.scroll addSubview:tip];
    y += 46;

    // 服务器配置区
    self.serverField = [self makeFieldAtY:&y W:W pad:pad placeholder:@"验证服务器地址 如 https://verify.xxx.com"];
    self.userField   = [self makeFieldAtY:&y W:W pad:pad placeholder:@"后台账号 admin"];
    self.passField   = [self makeFieldAtY:&y W:W pad:pad placeholder:@"后台密码"];
    self.passField.secureTextEntry = YES;

    self.connectBtn = [self makeButtonTitle:@"① 连接后台 / 获取应用" y:&y W:W pad:pad color:[UIColor colorWithRed:0.15 green:0.42 blue:0.85 alpha:1]];
    [self.connectBtn addTarget:self action:@selector(connectServer) forControlEvents:UIControlEventTouchUpInside];

    // 应用选择
    UILabel *appHint = [UILabel new];
    appHint.frame = CGRectMake(pad, y, W - 2 * pad, 24);
    appHint.text = @"② 选择授权应用（AppKey / AppSecret 自动带入）";
    appHint.font = [UIFont boldSystemFontOfSize:13];
    [self.scroll addSubview:appHint];
    y += 26;

    self.appPicker = [[UIPickerView alloc] initWithFrame:CGRectMake(pad, y, W - 2 * pad, 120)];
    self.appPicker.dataSource = self;
    self.appPicker.delegate = self;
    self.appPicker.layer.cornerRadius = 8;
    self.appPicker.backgroundColor = [UIColor whiteColor];
    [self.scroll addSubview:self.appPicker];
    y += 128;

    UILabel *manual = [UILabel new];
    manual.frame = CGRectMake(pad, y, W - 2 * pad, 22);
    manual.text = @"或手动填写密钥（不连后台时）";
    manual.font = [UIFont systemFontOfSize:12];
    manual.textColor = [UIColor darkGrayColor];
    [self.scroll addSubview:manual];
    y += 24;

    self.customKeyField    = [self makeFieldAtY:&y W:W pad:pad placeholder:@"AppKey  如 AK_xxxx"];
    self.customSecretField = [self makeFieldAtY:&y W:W pad:pad placeholder:@"AppSecret"];

    // 分发签名服务（作者填写一次，客户无感自动签名安装）
    self.signEndpointField = [self makeFieldAtY:&y W:W pad:pad placeholder:@"分发签名服务地址（选填，如 https://sign.xxx.com）"];

    // IPA 选择
    self.selectBtn = [self makeButtonTitle:@"③ 选择要授权的 IPA 文件" y:&y W:W pad:pad color:[UIColor colorWithRed:0.2 green:0.6 blue:0.35 alpha:1]];
    [self.selectBtn addTarget:self action:@selector(selectIPA) forControlEvents:UIControlEventTouchUpInside];

    self.ipaLabel = [[UILabel alloc] initWithFrame:CGRectMake(pad, y, W - 2 * pad, 30)];
    self.ipaLabel.text = @"未选择 IPA";
    self.ipaLabel.font = [UIFont systemFontOfSize:13];
    self.ipaLabel.textColor = [UIColor darkGrayColor];
    [self.scroll addSubview:self.ipaLabel];
    y += 32;

    self.injectBtn = [self makeButtonTitle:@"④ 一键植入授权插件" y:&y W:W pad:pad color:[UIColor colorWithRed:0.85 green:0.45 blue:0.1 alpha:1]];
    [self.injectBtn addTarget:self action:@selector(injectIPA) forControlEvents:UIControlEventTouchUpInside];

    self.exportBtn = [self makeButtonTitle:@"⑤ 导出成品 IPA 到文件（备用）" y:&y W:W pad:pad color:[UIColor colorWithRed:0.45 green:0.45 blue:0.5 alpha:1]];
    [self.exportBtn addTarget:self action:@selector(exportIPA) forControlEvents:UIControlEventTouchUpInside];
    self.exportBtn.enabled = NO;

    self.installBtn = [self makeButtonTitle:@"⑥ 自动签名并一键安装到手机 ⭐" y:&y W:W pad:pad color:[UIColor colorWithRed:0.85 green:0.15 blue:0.35 alpha:1]];
    [self.installBtn addTarget:self action:@selector(installIPA) forControlEvents:UIControlEventTouchUpInside];
    self.installBtn.enabled = NO;

    // 日志
    self.logView = [[UITextView alloc] initWithFrame:CGRectMake(pad, y, W - 2 * pad, 180)];
    self.logView.backgroundColor = [UIColor colorWithWhite:0.12 alpha:1];
    self.logView.textColor = [UIColor colorWithRed:0.5 green:1 blue:0.6 alpha:1];
    self.logView.font = [UIFont fontWithName:@"Menlo" size:12] ?: [UIFont systemFontOfSize:12];
    self.logView.editable = NO;
    self.logView.layer.cornerRadius = 8;
    self.logView.text = @"日志输出：\n";
    [self.scroll addSubview:self.logView];
    y += 190;

    self.scroll.contentSize = CGSizeMake(W, y + 30);
}

- (UITextField *)makeFieldAtY:(CGFloat *)y W:(CGFloat)W pad:(CGFloat)pad placeholder:(NSString *)ph {
    UITextField *f = [[UITextField alloc] initWithFrame:CGRectMake(pad, *y, W - 2 * pad, 42)];
    f.borderStyle = UITextBorderStyleRoundedRect;
    f.placeholder = ph;
    f.font = [UIFont systemFontOfSize:14];
    f.autocapitalizationType = UITextAutocapitalizationTypeNone;
    f.autocorrectionType = UITextAutocorrectionTypeNo;
    f.delegate = self;
    [self.scroll addSubview:f];
    *y += 42 + 8;
    return f;
}

- (UIButton *)makeButtonTitle:(NSString *)t y:(CGFloat *)y W:(CGFloat)W pad:(CGFloat)pad color:(UIColor *)c {
    UIButton *b = [UIButton buttonWithType:UIButtonTypeSystem];
    b.frame = CGRectMake(pad, *y, W - 2 * pad, 44);
    [b setTitle:t forState:UIControlStateNormal];
    b.backgroundColor = c;
    [b setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
    b.titleLabel.font = [UIFont boldSystemFontOfSize:15];
    b.layer.cornerRadius = 8;
    [self.scroll addSubview:b];
    *y += 44 + 12;
    return b;
}

#pragma mark - 本地配置存取
- (void)loadSaved {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    self.serverField.text = [ud stringForKey:kStoredServerKey] ?: @"";
    self.userField.text   = [ud stringForKey:kStoredUserKey] ?: @"admin";
    self.passField.text   = [ud stringForKey:kStoredPassKey] ?: @"";
    self.customKeyField.text    = [ud stringForKey:kStoredAppKeyKey] ?: @"";
    self.customSecretField.text = [ud stringForKey:kStoredSecretKey] ?: @"";
    self.signEndpointField.text = [ud stringForKey:kStoredSignEndpointKey] ?: @"";
    self.cookie = [ud stringForKey:kStoredCookieKey] ?: @"";
}
- (void)saveServerAndUser {
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    [ud setObject:self.serverField.text ?: @"" forKey:kStoredServerKey];
    [ud setObject:self.userField.text ?: @"" forKey:kStoredUserKey];
    [ud setObject:self.passField.text ?: @"" forKey:kStoredPassKey];
    [ud synchronize];
}

#pragma mark - 日志
- (void)log:(NSString *)msg {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSDateFormatter *f = [NSDateFormatter new];
        f.dateFormat = @"HH:mm:ss";
        NSString *line = [NSString stringWithFormat:@"\n[%@] %@", [f stringFromDate:[NSDate date]], msg];
        self.logView.text = [self.logView.text stringByAppendingString:line];
        [self.logView scrollRangeToVisible:NSMakeRange(self.logView.text.length, 0)];
    });
}

#pragma mark - 连接后台
- (void)connectServer {
    [self.view endEditing:YES];
    if (self.serverField.text.length == 0) { [self log:@"⚠️ 请先填写服务器地址"]; return; }
    [self saveServerAndUser];
    [self log:@"连接后台…"];
    self.connectBtn.enabled = NO;
    __weak typeof(self) weak = self;
    [ServerAPI loginToServer:self.serverField.text
                    username:self.userField.text
                    password:self.passField.text
                  completion:^(BOOL ok, NSString *cookie, NSString *msg) {
        if (!ok) {
            [weak log:[@"❌ " stringByAppendingString:msg ?: @"登录失败"]];
            dispatch_async(dispatch_get_main_queue(), ^{ weak.connectBtn.enabled = YES; });
            return;
        }
        weak.cookie = cookie;
        [[NSUserDefaults standardUserDefaults] setObject:cookie forKey:kStoredCookieKey];
        [[NSUserDefaults standardUserDefaults] synchronize];
        [weak log:@"✅ 登录成功，拉取应用列表…"];
        [ServerAPI fetchAppsFromServer:weak.serverField.text
                                cookie:cookie
                            completion:^(BOOL ok2, NSArray *apps, NSString *msg2) {
            dispatch_async(dispatch_get_main_queue(), ^{
                weak.connectBtn.enabled = YES;
                if (!ok2 || apps.count == 0) {
                    [weak log:[@"⚠️ " stringByAppendingString:msg2 ?: @"暂无应用，请在后台创建"]];
                    return;
                }
                weak.apps = apps;
                [weak.appPicker reloadAllComponents];
                [weak log:[NSString stringWithFormat:@"✅ 获取到 %lu 个应用，请在选择器中选择", (unsigned long)apps.count]];
                [weak pickAppAtIndex:0];
            });
        }];
    }];
}

#pragma mark - 选择 IPA
- (void)selectIPA {
    UIDocumentPickerViewController *picker;
    if (@available(iOS 14.0, *)) {
        NSArray *types = @[ [UTType typeWithIdentifier:@"com.apple.itunes.ipa"],
                            [UTType typeWithIdentifier:@"public.item"] ];
        picker = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:YES];
    } else {
        picker = [[UIDocumentPickerViewController alloc] initWithDocumentTypes:@[@"public.item"]
                                                                       inMode:UIDocumentPickerModeImport];
    }
    picker.delegate = self;
    picker.allowsMultipleSelection = NO;
    [self presentViewController:picker animated:YES completion:nil];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller
didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    NSURL *url = urls.firstObject;
    if (!url) return;
    BOOL access = [url startAccessingSecurityScopedResource];
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) { [self log:@"❌ 无法读取该 IPA 文件"]; if (access) [url stopAccessingSecurityScopedResource]; return; }
    NSString *name = url.lastPathComponent;
    NSString *dst = [NSTemporaryDirectory() stringByAppendingPathComponent:name];
    [data writeToFile:dst atomically:YES];
    if (access) [url stopAccessingSecurityScopedResource];

    self.ipaPath = dst;
    self.ipaLabel.text = [NSString stringWithFormat:@"已选：%@ (%.1f MB)", name, data.length / 1024.0 / 1024.0];
    [self log:[NSString stringWithFormat:@"✅ 已选择 IPA：%@", name]];
}

#pragma mark - 注入
- (void)injectIPA {
    if (!self.ipaPath) { [self log:@"⚠️ 请先选择 IPA 文件"]; return; }
    NSString *key = self.pickedAppKey.length ? self.pickedAppKey : (self.customKeyField.text ?: @"");
    NSString *sec = self.pickedAppSecret.length ? self.pickedAppSecret : (self.customSecretField.text ?: @"");
    NSString *srv = self.serverField.text ?: @"";
    if (key.length == 0 || srv.length == 0) {
        [self log:@"⚠️ 请连接后台选择应用，或手动填写 AppKey 与服务器地址"];
        return;
    }

    [self.view endEditing:YES];
    self.injectBtn.enabled = NO;
    NSUserDefaults *ud = [NSUserDefaults standardUserDefaults];
    [ud setObject:key forKey:kStoredAppKeyKey];
    [ud setObject:sec forKey:kStoredSecretKey];
    [ud synchronize];

    NSString *outName = [[self.ipaPath.lastPathComponent stringByDeletingPathExtension]
                         stringByAppendingString:@"_已授权.ipa"];
    NSString *outPath = [NSTemporaryDirectory() stringByAppendingPathComponent:outName];
    __weak typeof(self) weak = self;
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSError *err = nil;
        NSString *result = [IPAInjector injectIPAAtPath:weak.ipaPath
                                                 appKey:key secret:sec server:srv output:outPath
                                               progress:^(NSString *step) { [weak log:step]; }
                                                  error:&err];
        dispatch_async(dispatch_get_main_queue(), ^{
            weak.injectBtn.enabled = YES;
            if (!result) {
                [weak log:[@"❌ 注入失败：" stringByAppendingString:err.localizedDescription ?: @"未知错误"]];
                return;
            }
            weak.outputPath = result;
            weak.exportBtn.enabled = YES;
            weak.installBtn.enabled = YES;
            NSUserDefaults *du = [NSUserDefaults standardUserDefaults];
            [du setObject:weak.signEndpointField.text ?: @"" forKey:kStoredSignEndpointKey];
            [du synchronize];
            [weak log:[NSString stringWithFormat:@"🎉 成品已生成：%@", outName]];
            [weak log:@"点「自动签名并一键安装」即可安装，客户只需输激活码"];
        });
    });
}

#pragma mark - 自动签名并一键安装
- (void)installIPA {
    if (!self.outputPath) { [self log:@"⚠️ 请先生成成品 IPA"]; return; }
    [self log:@"自动签名中（客户无需操作证书）…"];
    self.installBtn.enabled = NO;
    __weak typeof(self) weak = self;
    [SignService autoSignIPA:self.outputPath
                signEndpoint:self.signEndpointField.text
                installBase:self.serverField.text
                  completion:^(NSString *installURL, NSString *err) {
        dispatch_async(dispatch_get_main_queue(), ^{
            weak.installBtn.enabled = YES;
            if (!installURL) {
                [weak log:[@"❌ 自动签名失败：" stringByAppendingString:err ?: @"未知错误"]];
                [weak log:@"可先用「导出到文件」手动处理"];
                return;
            }
            [weak log:@"✅ 签名完成，正在拉起安装…"];
            NSURL *u = [NSURL URLWithString:installURL];
            if (@available(iOS 10.0, *)) {
                [[UIApplication sharedApplication] openURL:u options:@{} completionHandler:^(BOOL ok) {
                    if (!ok) [weak log:@"⚠️ 无法拉起安装，请确认已配置分发签名服务"];
                }];
            } else {
                [[UIApplication sharedApplication] openURL:u];
            }
        });
    }];
}

#pragma mark - 导出
- (void)exportIPA {
    if (!self.outputPath) return;
    NSURL *fileURL = [NSURL fileURLWithPath:self.outputPath];
    UIActivityViewController *av = [[UIActivityViewController alloc]
                                    initWithActivityItems:@[fileURL] applicationActivities:nil];
    if (@available(iOS 13.0, *)) {
        av.popoverPresentationController.sourceView = self.exportBtn;
        av.popoverPresentationController.sourceRect = self.exportBtn.bounds;
    }
    [self presentViewController:av animated:YES completion:nil];
}

#pragma mark - UIPickerView
- (NSInteger)numberOfComponentsInPickerView:(UIPickerView *)pickerView { return 1; }
- (NSInteger)pickerView:(UIPickerView *)pickerView numberOfRowsInComponent:(NSInteger)component {
    return self.apps.count ?: 1;
}
- (NSString *)pickerView:(UIPickerView *)pickerView titleForRow:(NSInteger)row forComponent:(NSInteger)component {
    if (!self.apps.count) return @"（连接后台后显示应用）";
    return self.apps[row][@"name"] ?: @"未命名应用";
}
- (void)pickerView:(UIPickerView *)pickerView didSelectRow:(NSInteger)row inComponent:(NSInteger)component {
    [self pickAppAtIndex:row];
}
- (void)pickAppAtIndex:(NSInteger)row {
    if (row >= self.apps.count) return;
    NSDictionary *app = self.apps[row];
    self.pickedAppKey    = app[@"app_key"] ?: @"";
    self.pickedAppSecret = app[@"app_secret"] ?: @"";
    self.customKeyField.text    = self.pickedAppKey;
    self.customSecretField.text = self.pickedAppSecret;
    [self log:[NSString stringWithFormat:@"已选应用：%@", app[@"name"] ?: @""]];
}

#pragma mark - 键盘收起
- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [textField resignFirstResponder];
    return YES;
}
- (void)touchesBegan:(NSSet *)touches withEvent:(UIEvent *)event { [self.view endEditing:YES]; }

@end
