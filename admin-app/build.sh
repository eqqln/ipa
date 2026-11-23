#!/usr/bin/env bash
# ============================================================
#  后台管理客户端 App 一键编译脚本（macOS / GitHub Actions）
#  纯 UIKit + WebKit，产出未签名 AdminConsole.ipa
#  下载后用全能签/爱思导入并选择你的证书重签安装
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPDIR="$ROOT/admin-app"
BUILD="$APPDIR/build"

echo "===== [1/4] 生成 Xcode 工程 (xcodegen) ====="
cd "$APPDIR"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen 未安装，执行: brew install xcodegen"
  exit 1
fi
xcodegen generate --spec project.yml

echo "===== [2/4] 编译归档（不签名）====="
rm -rf "$BUILD/AdminConsole.xcarchive"
xcodebuild \
  -project "$APPDIR/AdminConsole.xcodeproj" \
  -scheme AdminConsole \
  -configuration Release \
  -sdk iphoneos \
  -archivePath "$BUILD/AdminConsole.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGN_IDENTITY="" \
  clean archive

echo "===== [3/4] 打包为未签名 IPA ====="
rm -rf "$BUILD/Payload" "$BUILD/AdminConsole.ipa"
mkdir -p "$BUILD/Payload"
cp -R "$BUILD/AdminConsole.xcarchive/Products/Applications/AdminConsole.app" "$BUILD/Payload/"

cd "$BUILD"
zip -qry AdminConsole.ipa Payload

echo "===== [4/4] 完成 ====="
ls -lh "$BUILD/AdminConsole.ipa"
echo "产物: $BUILD/AdminConsole.ipa"
echo "下一步: 用全能签导入该 IPA，选择你的证书重签后安装到手机"
