#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键演示：构造一个“原始 IPA” -> 注入授权插件 -> 校验成品。
运行: python examples/demo.py
真实场景只需把 demo.ipa 换成你的 IPA，把 stub.dylib 换成 Theos 编译的 VerifyPlugin.dylib。
"""
import os, sys, struct, plistlib, zipfile, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'ipa-injector'))
from inject import inject_ipa, LC_LOAD_DYLIB

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_IPA = os.path.join(HERE, 'demo_原始.ipa')
DYLIB   = os.path.join(HERE, 'VerifyPlugin.dylib')
OUT_IPA = os.path.join(HERE, 'demo_已注入插件.ipa')

APP_KEY = 'AK_CC34D1A228F73094'
APP_SECRET = '1fdb0432ad328b827e005e8c96733023192de9717fbc041c'
SERVER = 'http://localhost:8080'


def make_macho():
    hdr = struct.pack('<IiiIIIII', 0xFEEDFACF, 0x0100000C, 0, 2, 1, 152, 0, 0)
    seg = struct.pack('<II16sQQQQiiII', 0x19, 152, b'__TEXT'+b'\0'*10,
                      0x100000000, 0x4000, 0, 0x4000, 7, 5, 1, 0)
    sect = struct.pack('<16s16sQQIIIIIIII', b'__text'+b'\0'*10, b'__TEXT'+b'\0'*10,
                       0x100000400, 0x100, 0x1000, 4, 0, 0, 0, 0, 0, 0)
    d = bytearray(hdr + seg + sect)
    d += b'\0' * (0x1000 - len(d)) + b'MACH-O-OK' + b'\0' * 200
    return bytes(d)


def build_src_ipa():
    with zipfile.ZipFile(SRC_IPA, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('Payload/Demo.app/Info.plist', plistlib.dumps({
            'CFBundleExecutable': 'Demo', 'CFBundleIdentifier': 'com.demo.app'}))
        z.writestr('Payload/Demo.app/Demo', make_macho())


def inspect():
    print('\n' + '=' * 56)
    print('注入后成品 IPA 内容：')
    with zipfile.ZipFile(OUT_IPA) as z:
        names = z.namelist()
        for n in names:
            print('   📦 ' + n)
        macho = z.read('Payload/Demo.app/Demo')
        cfg = plistlib.loads(z.read('Payload/Demo.app/IPAVerifyConfig.plist'))
    ncmds = struct.unpack_from('<I', macho, 16)[0]
    print('\n   主程序 Mach-O load commands 数量:', ncmds)
    print('   含 LC_LOAD_DYLIB 注入:', b'\x0c\x00\x00\x00' in macho[:400])
    print('   内置配置 AppKey :', cfg['AppKey'])
    print('   内置配置 ServerURL:', cfg['ServerURL'])
    print('=' * 56)


if __name__ == '__main__':
    with open(DYLIB, 'wb') as f:
        f.write(b'FAKE-VERIFY-PLUGIN-DYLIB')
    build_src_ipa()
    print('① 已生成演示原始 IPA:', os.path.basename(SRC_IPA))
    print('② 开始注入授权插件 ...\n')
    inject_ipa(SRC_IPA, DYLIB, APP_KEY, APP_SECRET, SERVER, OUT_IPA)
    inspect()
    print('\n✅ 演示完成！成品:', OUT_IPA)
