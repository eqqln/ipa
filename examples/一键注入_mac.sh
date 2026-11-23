#!/bin/bash
# IPA 一键注入授权插件 - macOS（含重签名）
# 用法：chmod +x 一键注入_mac.sh && ./一键注入_mac.sh

cd "$(dirname "$0")" || exit 1
INJECTOR="../ipa-injector/inject.py"

echo "=================================================="
echo "  IPA 一键注入授权插件 - macOS（含重签名）"
echo "=================================================="
echo

read -rp "原始 IPA 路径: " IPA_FILE
read -rp "插件 dylib 路径: " DYLIB_FILE
read -rp "AppKey: " APP_KEY
read -rp "AppSecret: " APP_SECRET
read -rp "服务器地址(https): " SERVER
read -rp "输出文件名: " OUT_FILE
read -rp "签名证书名(留空则跳过签名): " IDENTITY

echo
echo "开始注入..."
if [ -n "$IDENTITY" ]; then
  python3 "$INJECTOR" \
    --ipa "$IPA_FILE" \
    --dylib "$DYLIB_FILE" \
    --app-key "$APP_KEY" \
    --app-secret "$APP_SECRET" \
    --server "$SERVER" \
    --output "$OUT_FILE" \
    --identity "$IDENTITY"
else
  python3 "$INJECTOR" \
    --ipa "$IPA_FILE" \
    --dylib "$DYLIB_FILE" \
    --app-key "$APP_KEY" \
    --app-secret "$APP_SECRET" \
    --server "$SERVER" \
    --output "$OUT_FILE"
fi

echo
echo "完成！成品: $OUT_FILE"
