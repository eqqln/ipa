#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IPA 插件注入与授权工具 —— 免费插件生成工具核心引擎

功能：
  1. 解压 IPA，定位主可执行 Mach-O
  2. 向 Mach-O 注入 LC_LOAD_DYLIB，加载验证插件 dylib（支持 Thin / FAT 多架构）
  3. 写入内置配置 plist（AppKey / AppSecret / 服务器地址）
  4. 可选：codesign 重签名（需 macOS + 开发者证书）
  5. 重新打包为成品 IPA

纯 Python 标准库实现，跨平台（Mach-O 字节解析与系统无关），无需第三方依赖。
用法见 README.md 或执行 `python inject.py --help`。
"""
import os
import sys
import struct
import shutil
import zipfile
import plistlib
import tempfile
import subprocess
import argparse

# ---------------- Mach-O 常量 ----------------
MH_MAGIC = 0xFEEDFACE
MH_CIGAM = 0xCEFAEDFE
MH_MAGIC_64 = 0xFEEDFACF
MH_CIGAM_64 = 0xCFFAEDFE
LC_SEGMENT = 0x1
LC_SEGMENT_64 = 0x19
LC_LOAD_DYLIB = 0xC
LC_CODE_SIGNATURE = 0x1D
FAT_MAGIC = 0xCAFEBABE
FAT_CIGAM = 0xBEBAFECA

DYLIB_INSTALL_PREFIX = "@executable_path/Frameworks/"


class InjectError(Exception):
    pass


def log(msg):
    print("[inject] " + str(msg))


# ---------------- Mach-O 单架构注入 ----------------
class MachO:
    """对单个 Mach-O 切片注入 LC_LOAD_DYLIB。"""

    def __init__(self, path):
        self.path = path
        with open(path, "rb") as f:
            self.data = bytearray(f.read())
        self._parse_header()

    def _parse_header(self):
        d = self.data
        if len(d) < 32:
            raise InjectError("Mach-O 文件过小")
        magic = struct.unpack_from("<I", d, 0)[0]
        if magic == MH_MAGIC_64:
            self.bits64, self.endian = True, "<"
        elif magic == MH_CIGAM_64:
            self.bits64, self.endian = True, ">"
        elif magic == MH_MAGIC:
            self.bits64, self.endian = False, "<"
        elif magic == MH_CIGAM:
            self.bits64, self.endian = False, ">"
        else:
            raise InjectError("无法识别的 Mach-O magic: 0x%X" % magic)
        self.header_size = 32 if self.bits64 else 28
        self.ncmds = struct.unpack_from(self.endian + "I", d, 16)[0]
        self.sizeofcmds = struct.unpack_from(self.endian + "I", d, 20)[0]
        self.cmds = []
        self.min_section_off = None

    def _parse_commands(self):
        off = self.header_size
        for _ in range(self.ncmds):
            if off + 8 > len(self.data):
                raise InjectError("Load command 越界")
            cmd, cmdsize = struct.unpack_from(self.endian + "II", self.data, off)
            if cmdsize < 8 or off + cmdsize > len(self.data):
                raise InjectError("非法 cmdsize: %d" % cmdsize)
            self.cmds.append((cmd, bytes(self.data[off:off + cmdsize])))

            # 收集所有 section 的 file offset，用于判断可插入空间
            if cmd in (LC_SEGMENT, LC_SEGMENT_64):
                if cmd == LC_SEGMENT_64:
                    nsects = struct.unpack_from(self.endian + "I", self.data, off + 64)[0]
                    sect_base, sect_stride, off_in_sect = off + 72, 80, 48
                else:
                    nsects = struct.unpack_from(self.endian + "I", self.data, off + 48)[0]
                    sect_base, sect_stride, off_in_sect = off + 56, 68, 40
                for i in range(nsects):
                    so = sect_base + i * sect_stride
                    if so + off_in_sect + 4 > off + cmdsize:
                        break
                    sec_off = struct.unpack_from(self.endian + "I", self.data, so + off_in_sect)[0]
                    if sec_off and (self.min_section_off is None or sec_off < self.min_section_off):
                        self.min_section_off = sec_off
            off += cmdsize

    def build_dylib_command(self, dylib_name):
        path = DYLIB_INSTALL_PREFIX + dylib_name
        raw = path.encode("utf-8") + b"\0"
        raw += b"\0" * ((8 - len(raw) % 8) % 8)
        cmdsize = 24 + len(raw)
        # cmd, cmdsize, name.offset=24, timestamp, current_version, compatibility_version
        return struct.pack(self.endian + "IIIIII", LC_LOAD_DYLIB, cmdsize, 24, 0, 0x10000, 0x10000) + raw

    def inject(self, dylib_name):
        self._parse_commands()
        # 已有则跳过
        for cmd, _ in self.cmds:
            if cmd == LC_LOAD_DYLIB:
                pass  # 同名检测见下
        for cmd, raw in self.cmds:
            if cmd == LC_LOAD_DYLIB and dylib_name.encode() in raw:
                log("已存在 %s 的加载命令，跳过注入" % dylib_name)
                return False

        dylib_cmd = self.build_dylib_command(dylib_name)
        # 移除原代码签名命令（重签名会重建），释放空间并追加 dylib 命令
        kept = [raw for cmd, raw in self.cmds if cmd != LC_CODE_SIGNATURE]
        new_cmds = b"".join(kept) + dylib_cmd
        new_size = len(new_cmds)
        new_ncmds = len(kept) + 1

        limit = self.min_section_off if self.min_section_off else len(self.data)
        if self.header_size + new_size > limit:
            raise InjectError(
                "Load command 空间不足（需要 %d 字节，可用 %d 字节），请换用未加壳 IPA"
                % (new_size, limit - self.header_size)
            )

        out = bytearray(self.data)
        struct.pack_into(self.endian + "I", out, 16, new_ncmds)
        struct.pack_into(self.endian + "I", out, 20, new_size)
        out[self.header_size:self.header_size + new_size] = new_cmds
        with open(self.path, "wb") as f:
            f.write(out)
        log("注入 LC_LOAD_DYLIB -> %s (架构: %s)" % (dylib_name, "64位" if self.bits64 else "32位"))
        return True


def inject_macho_file(path, dylib_name):
    """自动识别 Thin / FAT，逐个切片注入。"""
    with open(path, "rb") as f:
        head = f.read(8)
    magic_be = struct.unpack_from(">I", head, 0)[0]
    magic_le = struct.unpack_from("<I", head, 0)[0]

    if magic_be == FAT_MAGIC or magic_le == FAT_MAGIC:
        endian = ">" if magic_be == FAT_MAGIC else "<"
        with open(path, "rb") as f:
            data = bytearray(f.read())
        nfat = struct.unpack_from(endian + "I", data, 4)[0]
        log("检测到 FAT 多架构，共 %d 个切片" % nfat)
        for i in range(nfat):
            ao = 8 + i * 20
            cputype, _, slice_off, slice_size, _ = struct.unpack_from(endian + "IIIII", data, ao)
            tmp = tempfile.NamedTemporaryFile(delete=False)
            tmp.write(data[slice_off:slice_off + slice_size])
            tmp.close()
            try:
                MachO(tmp.name).inject(dylib_name)
                with open(tmp.name, "rb") as f:
                    patched = f.read()
                if len(patched) > slice_size:
                    raise InjectError("切片 %d 注入后体积超出原空间" % i)
                data[slice_off:slice_off + len(patched)] = patched
                log("架构 cputype=0x%X 注入完成" % cputype)
            finally:
                os.unlink(tmp.name)
        with open(path, "wb") as f:
            f.write(data)
    else:
        MachO(path).inject(dylib_name)


# ---------------- IPA 处理流程 ----------------
def find_app_bundle(workdir):
    payload = os.path.join(workdir, "Payload")
    if not os.path.isdir(payload):
        raise InjectError("IPA 内缺少 Payload 目录")
    apps = [d for d in os.listdir(payload) if d.endswith(".app")]
    if not apps:
        raise InjectError("Payload 内未找到 .app 目录")
    return os.path.join(payload, apps[0])


def write_config(app_bundle, app_key, app_secret, server, extra=None):
    cfg = {
        "AppKey": app_key,
        "AppSecret": app_secret,
        "ServerURL": server.rstrip("/"),
        "PluginVersion": "1.0.0",
    }
    if extra:
        cfg.update(extra)
    target = os.path.join(app_bundle, "IPAVerifyConfig.plist")
    with open(target, "wb") as f:
        plistlib.dump(cfg, f)
    log("已写入内置配置: IPAVerifyConfig.plist")


def resign(app_bundle, identity, entitlements=None):
    if sys.platform != "darwin":
        log("当前系统非 macOS，跳过 codesign。请在 macOS 上执行重签名后再安装。")
        return False
    if subprocess.call(["which", "codesign"], stdout=subprocess.DEVNULL) != 0:
        log("未找到 codesign，跳过重签名")
        return False
    cmd = ["codesign", "--force", "--deep", "--sign", identity]
    if entitlements and os.path.exists(entitlements):
        cmd += ["--entitlements", entitlements]
    cmd.append(app_bundle)
    log("执行重签名: " + " ".join(cmd[:4]) + " ...")
    subprocess.check_call(cmd)
    return True


def pack_ipa(workdir, output):
    # 压缩包内路径必须以 Payload/ 开头，因此相对 workdir 计算
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, dirs, files in os.walk(workdir):
            for name in files:
                full = os.path.join(root, name)
                arc = os.path.relpath(full, workdir).replace("\\", "/")
                z.write(full, arc)
    log("成品 IPA 已生成: %s (%d 字节)" % (output, os.path.getsize(output)))


def inject_ipa(ipa, dylib, app_key, app_secret, server, output,
               identity=None, entitlements=None, extra=None):
    if not os.path.isfile(ipa):
        raise InjectError("IPA 不存在: " + ipa)
    if not os.path.isfile(dylib):
        raise InjectError("插件 dylib 不存在: " + dylib)

    workdir = tempfile.mkdtemp(prefix="ipa_inject_")
    try:
        log("解压 IPA: " + ipa)
        with zipfile.ZipFile(ipa, "r") as z:
            z.extractall(workdir)

        app_bundle = find_app_bundle(workdir)
        info_path = os.path.join(app_bundle, "Info.plist")
        with open(info_path, "rb") as f:
            info = plistlib.load(f)
        exe_name = info.get("CFBundleExecutable")
        if not exe_name:
            raise InjectError("Info.plist 缺少 CFBundleExecutable")
        exe_path = os.path.join(app_bundle, exe_name)
        if not os.path.isfile(exe_path):
            raise InjectError("主可执行文件不存在: " + exe_path)
        log("主可执行文件: " + exe_name)

        # 拷贝 dylib 到 Frameworks
        fw_dir = os.path.join(app_bundle, "Frameworks")
        os.makedirs(fw_dir, exist_ok=True)
        dylib_name = os.path.basename(dylib)
        shutil.copy2(dylib, os.path.join(fw_dir, dylib_name))
        log("已拷贝插件: Frameworks/" + dylib_name)

        inject_macho_file(exe_path, dylib_name)
        write_config(app_bundle, app_key, app_secret, server, extra)

        if identity:
            resign(app_bundle, identity, entitlements)
        else:
            log("未指定签名证书，产出为未签名 IPA")

        out_dir = os.path.dirname(os.path.abspath(output))
        if out_dir and not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        pack_ipa(workdir, output)
        return output
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    p = argparse.ArgumentParser(description="IPA 插件注入与授权工具")
    p.add_argument("--ipa", required=True, help="原始 IPA 路径")
    p.add_argument("--dylib", required=True, help="验证插件 dylib 路径（Theos 编译产物）")
    p.add_argument("--app-key", required=True, help="服务端应用 AppKey")
    p.add_argument("--app-secret", required=True, help="服务端应用 AppSecret")
    p.add_argument("--server", required=True, help="验证服务器地址，如 https://verify.example.com")
    p.add_argument("--output", required=True, help="输出 IPA 路径")
    p.add_argument("--identity", default=None, help="签名证书名（仅 macOS）")
    p.add_argument("--entitlements", default=None, help="entitlements plist 路径（可选）")
    p.add_argument("--extra", default=None, help="额外配置 JSON 字符串（可选）")
    args = p.parse_args()

    extra = None
    if args.extra:
        import json
        extra = json.loads(args.extra)

    try:
        inject_ipa(args.ipa, args.dylib, args.app_key, args.app_secret,
                   args.server, args.output, args.identity, args.entitlements, extra)
        print("\n✅ 注入完成: " + os.path.abspath(args.output))
    except InjectError as e:
        print("\n❌ 注入失败: " + str(e), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
