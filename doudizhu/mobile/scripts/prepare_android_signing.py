#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 CI 中写入 Android release 签名配置。"""
import base64
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / 'android' / 'app'
GRADLE = APP_DIR / 'build.gradle'
KEYSTORE = APP_DIR / 'release.jks'

required = [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit('缺少 Android 签名变量: ' + ', '.join(missing))

KEYSTORE.write_bytes(base64.b64decode(os.environ['ANDROID_KEYSTORE_BASE64']))

source = GRADLE.read_text(encoding='utf-8')
if 'signingConfigs' in source:
    print('signingConfigs 已存在，跳过注入')
else:
    store_password = json.dumps(os.environ['ANDROID_KEYSTORE_PASSWORD'])
    key_alias = json.dumps(os.environ['ANDROID_KEY_ALIAS'])
    key_password = json.dumps(os.environ['ANDROID_KEY_PASSWORD'])
    signing = (
        "\n"
        "    signingConfigs {\n"
        "        release {\n"
        "            storeFile file('release.jks')\n"
        f"            storePassword {store_password}\n"
        f"            keyAlias {key_alias}\n"
        f"            keyPassword {key_password}\n"
        "        }\n"
        "    }\n"
    )
    if 'android {' not in source:
        raise SystemExit('build.gradle 缺少 android 配置块')
    source = source.replace('android {', 'android {' + signing, 1)
    if '        release {\n            minifyEnabled false' not in source:
        raise SystemExit('build.gradle release 配置结构不匹配')
    source = source.replace(
        '        release {\n            minifyEnabled false',
        '        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false',
        1,
    )
    GRADLE.write_text(source, encoding='utf-8')
    print('Android release 签名配置已写入')

print(f'keystore: {KEYSTORE}')
