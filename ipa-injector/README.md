# IPA 插件注入工具（免费插件生成工具核心）

纯 Python 标准库实现，跨平台，无需第三方依赖。功能是：把验证插件 dylib 注入到 IPA，写入内置密钥配置，打包成成品 IPA。

## 依赖
- Python 3.6+（仅标准库）
- 重签名（可选）：macOS + `codesign` + 开发者证书

## 用法
```bash
python inject.py \
  --ipa 原始.ipa \
  --dylib VerifyPlugin.dylib \
  --app-key AK_你的AppKey \
  --app-secret 你的AppSecret \
  --server https://verify.example.com \
  --output 成品.ipa
```

可选参数：
| 参数 | 说明 |
| :--- | :--- |
| `--identity "证书名"` | macOS 重签名，如 `iPhone Developer: xxx` |
| `--entitlements ent.plist` | 签名权限文件 |
| `--extra '{"k":"v"}'` | 追加写入配置 plist 的额外键值 |

## 内部流程
1. 解压 IPA 到临时目录，读取 `Info.plist` 找到主可执行文件。
2. 拷贝 dylib 到 `App.app/Frameworks/`。
3. 解析 Mach-O（支持 32/64 位、大小端、FAT 多架构），注入 `LC_LOAD_DYLIB` 加载命令：
   - 移除原 `LC_CODE_SIGNATURE`（重签名会重建）。
   - 更新 `ncmds` 与 `sizeofcmds`，写入 `@executable_path/Frameworks/xxx.dylib`。
   - 校验 section 数据区不被覆盖。
4. 写入 `IPAVerifyConfig.plist`（AppKey/AppSecret/ServerURL/版本）。
5. 可选 codesign 重签名。
6. 重新打包为 IPA（`Payload/` 路径结构）。

## 测试
```bash
python test_inject.py
```
脚本构造一个模拟 64 位 Mach-O 与 IPA，验证注入后 load command 正确、配置写入、原数据未破坏。

## 常见问题
- **"Load command 空间不足"**：IPA 可能已加壳或 section 紧贴 load commands，换用未加密的 IPA。
- **安装后闪退**：未完成重签名。需在 macOS 用 `--identity` 指定证书，或手动重签后再安装。
- **插件不生效**：用 `otool -L 可执行文件 | grep VerifyPlugin` 确认 dylib 已注入。
