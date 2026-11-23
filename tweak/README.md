# 验证插件 dylib（Theos）

`VerifyPlugin.m` 是注入到 IPA 的动态库源码，实现：激活码验证、设备绑定、远程公告弹窗、心跳保活、连续失败退出。

## 编译（需 Theos 环境，macOS）
```bash
# 1. 安装 Theos（若未安装）
bash <(curl -sL https://gitee.com/cykj/theos/raw/master/install.sh)

# 2. 进入本目录编译
cd tweak
make clean && make package

# 3. 产物在 packages/ 下，从中取出 VerifyPlugin.dylib
#    路径类似：./packages/com.ipaverify.plugin_1.0.0-1+debug_iphoneos-arm.deb
#    解压 deb 后取 Library/... 下的 dylib
```

## 工作原理
1. `+ (void)load`：dylib 被加载时自动触发，延迟 1 秒启动验证（等 UI 就绪）。
2. 读取 App Bundle 内 `IPAVerifyConfig.plist`（由 `inject.py` 注入时写入）中的 `AppKey/AppSecret/ServerURL`。
3. 从 `NSUserDefaults` 读取缓存激活码；没有则弹窗让用户输入，输入后本地缓存。
4. 请求 `POST /api/verify`， Header 携带 HMAC-SHA256 签名（CommonCrypto 的 `CCHmac`）。
5. 验证成功：启动 60 秒心跳、展示远程公告（同一条公告只弹一次，用 `updated_at` 去重）。
6. 验证失败：弹错误提示并清空本地激活码，连续 3 次失败 `exit(0)`。

## 配置 plist 结构（inject.py 自动生成）
```xml
<dict>
  <key>AppKey</key><string>AK_XXXX</string>
  <key>AppSecret</key><string>xxxx</string>
  <key>ServerURL</key><string>https://verify.example.com</string>
  <key>PluginVersion</key><string>1.0.0</string>
</dict>
```

## 注意事项
- 需开启 ARC（Makefile 已配置 `-fobjc-arc`）。
- 依赖 `UIKit / Foundation / CommonCrypto`（系统库）。
- 使用 `NSUserDefaults` 保存 UDID 与激活码（沙盒内持久化）。
- 生产环境服务器必须用 HTTPS，否则 ATS 会拦截请求；如需 HTTP 需在 App 的 Info.plist 配置 `NSAppTransportSecurity`。
- 注入命令由 `ipa-injector/inject.py` 完成，本目录只负责产出 dylib。
