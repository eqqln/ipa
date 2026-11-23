#!/usr/bin/env bash
# ============================================================
#  授权壳 App 一键编译脚本（在 macOS / GitHub Actions 上运行）
#  产出：未签名 IPAShell.ipa —— 下载后用全能签重签安装
#
#  本地运行：  cd shell-app && bash build.sh
#  GitHub：    由 .github/workflows/build.yml 自动调用
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"       # 项目根目录
APPDIR="$ROOT/shell-app"
RESOURCES="$APPDIR/Resources"
BUILD="$APPDIR/build"

echo "===== [1/5] 编译验证插件 dylib (VerifyPlugin.m -> VerifyPlugin.dylib) ====="
SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
mkdir -p "$RESOURCES"
clang -dynamiclib \
  -arch arm64 \
  -isysroot "$SDK" \
  -miphoneos-version-min=15.0 \
  -fobjc-arc \
  -framework UIKit \
  -framework Foundation \
  -framework Security \
  "$ROOT/tweak/VerifyPlugin.m" \
  -o "$RESOURCES/VerifyPlugin.dylib"

file "$RESOURCES/VerifyPlugin.dylib"

echo "===== [2/5] 生成 Xcode 工程 (xcodegen) ====="
cd "$APPDIR"
if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate --spec project.yml
else
  echo "xcodegen 未安装，请先执行: brew install xcodegen"
  exit 1
fi

echo "===== [3/5] 编译归档（不签名）====="
rm -rf "$BUILD/IPAShell.xcarchive"
xcodebuild \
  -project "$APPDIR/IPAShell.xcodeproj" \
  -scheme IPAShell \
  -configuration Release \
  -sdk iphoneos \
  -archivePath "$BUILD/IPAShell.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGN_IDENTITY="" \
  clean archive

echo "===== [4/5] 打包为未签名 IPA ====="
rm -rf "$BUILD/Payload" "$BUILD/IPAShell.ipa"
mkdir -p "$BUILD/Payload"
cp -R "$BUILD/IPAShell.xcarchive/Products/Applications/IPAShell.app" "$BUILD/Payload/"

# 显式把验证插件 dylib 拷进 App（xcodegen resources 对 .dylib 不保证拷贝）
mkdir -p "$BUILD/Payload/IPAShell.app/Frameworks"
cp -f "$RESOURCES/VerifyPlugin.dylib" "$BUILD/Payload/IPAShell.app/Frameworks/VerifyPlugin.dylib"
echo "验证插件已内置: $(ls -lh "$BUILD/Payload/IPAShell.app/Frameworks/VerifyPlugin.dylib" | awk '{print $5}')"

cd "$BUILD"
zip -qry IPAShell.ipa Payload

echo "===== [5/5] 完成 ====="
ls -lh "$BUILD/IPAShell.ipa"
echo "产物: $BUILD/IPAShell.ipa"
echo "下一步: 用全能签导入该 IPA，选择你的证书重签后安装到手机"
