#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构造模拟 Mach-O + IPA，端到端验证注入引擎。运行: python test_inject.py"""
import os
import sys
import struct
import plistlib
import tempfile
import zipfile

from inject import inject_ipa, LC_LOAD_DYLIB

E = "<"
FAT = None


def make_fake_macho():
    """构造一个最小 64 位 Mach-O：header + __TEXT segment(含1个section)"""
    hdr = struct.pack(E + "IiiIIIII",
                      0xFEEDFACF,        # magic
                      0x0100000C,        # cputype arm64
                      0x00000000,        # cpusubtype
                      2,                 # filetype MH_EXECUTE
                      1,                 # ncmds
                      152,               # sizeofcmds
                      0, 0)              # flags, reserved
    seg = struct.pack(E + "II16sQQQQiiII",
                      0x19, 152,
                      b"__TEXT" + b"\0" * 10,
                      0x100000000, 0x4000, 0, 0x4000,
                      7, 5, 1, 0)
    sect = struct.pack(E + "16s16sQQIIIIIIII",
                       b"__text" + b"\0" * 10,
                       b"__TEXT" + b"\0" * 10,
                      0x100000400, 0x100,
                      0x1000, 4, 0, 0, 0, 0, 0, 0)
    data = bytearray(hdr + seg + sect)
    data += b"\0" * (0x1000 - len(data))
    data += b"SECTION-DATA-MARKER" + b"\0" * 200
    return bytes(data)


def build_ipa(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Payload/Test.app/Info.plist",
                   plistlib.dumps({"CFBundleExecutable": "Test", "CFBundleIdentifier": "com.test.app"}))
        z.writestr("Payload/Test.app/Test", make_fake_macho())


def parse_commands(data):
    magic = struct.unpack_from(E + "I", data, 0)[0]
    assert magic == 0xFEEDFACF, "magic 不正确"
    ncmds = struct.unpack_from(E + "I", data, 16)[0]
    sizeofcmds = struct.unpack_from(E + "I", data, 20)[0]
    off, cmds = 32, []
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from(E + "II", data, off)
        cmds.append(cmd)
        off += cmdsize
    return ncmds, sizeofcmds, off, cmds


def run():
    tmp = tempfile.mkdtemp(prefix="ipa_test_")
    src = os.path.join(tmp, "src.ipa")
    out = os.path.join(tmp, "out.ipa")
    dylib = os.path.join(tmp, "FakePlugin.dylib")
    with open(dylib, "wb") as f:
        f.write(b"FAKE-DYLIB-BINARY")

    build_ipa(src)
    inject_ipa(src, dylib, "AK_TEST123", "secret-abc",
               "https://verify.example.com", out)

    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        assert "Payload/Test.app/IPAVerifyConfig.plist" in names, "配置 plist 缺失"
        assert "Payload/Test.app/Frameworks/FakePlugin.dylib" in names, "dylib 未拷贝"
        macho = z.read("Payload/Test.app/Test")
        cfg = plistlib.loads(z.read("Payload/Test.app/IPAVerifyConfig.plist"))

    ncmds, sizeofcmds, cmds_end, cmds = parse_commands(macho)
    assert LC_LOAD_DYLIB in cmds, "LC_LOAD_DYLIB 未注入"
    assert cmds_end == 32 + sizeofcmds, "sizeofcmds 与实际不一致"
    assert b"@executable_path/Frameworks/FakePlugin.dylib" in macho, "dylib 路径缺失"
    assert b"SECTION-DATA-MARKER" in macho, "原 section 数据被破坏"
    assert cfg["AppKey"] == "AK_TEST123" and cfg["ServerURL"] == "https://verify.example.com"

    print("\n✅ 注入引擎测试全部通过")
    print("   ncmds=%d  sizeofcmds=%d  load commands 结束于 0x%X" % (ncmds, sizeofcmds, cmds_end))
    print("   内置配置: AppKey=%s ServerURL=%s" % (cfg["AppKey"], cfg["ServerURL"]))


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print("\n❌ 测试失败: %s" % e, file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
