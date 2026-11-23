#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
壳 App 源码本地自检（Windows 可跑）
验证：OC 源码结构完整性、Mach-O 常量与 Python 引擎一致性、
      前后端接口路径匹配、编译配置关键项。真正的 OC 编译需在 macOS/GitHub 完成。
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "shell-app", "Sources")
passed, failed = 0, 0

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        print("  [OK] %s" % name); passed += 1
    else:
        print("  [FAIL] %s %s" % (name, detail)); failed += 1

def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

print("===== 1. 源码文件完整性 =====")
required = ["main.m","AppDelegate.m","ViewController.m","IPAInjector.m",
            "MachOInjector.m","ZipArchive.m","ServerAPI.m","SignService.m",
            "Config.h","AppDelegate.h","ViewController.h","IPAInjector.h",
            "MachOInjector.h","ZipArchive.h","ServerAPI.h","SignService.h"]
for f in required:
    check("存在 %s" % f, os.path.isfile(os.path.join(SRC, f)))

print("\n===== 2. Objective-C 括号/引号配平 =====")
for f in required:
    if not f.endswith((".m", ".h")): continue
    txt = read(os.path.join(SRC, f))
    # 先剥离字符串字面量（避免 http:// 里的 // 被误判为注释），再去注释后配平
    t = re.sub(r'@?"([^"\\]|\\.)*"', '""', txt)
    t = re.sub(r'//.*', '', t)
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    check("%s 花括号配平" % f, t.count("{") == t.count("}"),
          "{%d }%d" % (t.count("{"), t.count("}")))

print("\n===== 3. Mach-O 注入常量与 Python 引擎一致性 =====")
py = read(os.path.join(ROOT, "ipa-injector", "inject.py"))
oc = read(os.path.join(SRC, "MachOInjector.m"))
consts = {
    "LC_LOAD_DYLIB = 0xC":  ("0xC" in py, "kLC_LOAD_DYLIB = 0xC" in oc or "kLC_LOAD_DYLIB = 0x0C" in oc),
    "LC_CODE_SIGN = 0x1D":  ("0x1D" in py, "kLC_CODE_SIGN  = 0x1D" in oc or "kLC_CODE_SIGN = 0x1D" in oc),
    "FAT_MAGIC 0xCAFEBABE": ("0xCAFEBABE" in py, "0xCAFEBABE" in oc),
    "MH_MAGIC_64 0xFEEDFACF": ("0xFEEDFACF" in py, "0xFEEDFACF" in oc),
    "dylib 前缀 @executable_path/Frameworks/":
        ("@executable_path/Frameworks/" in py, "@executable_path/Frameworks/" in oc),
}
for name, (a, b) in consts.items():
    check(name, a and b, "(py=%s oc=%s)" % (a, b))

print("\n===== 4. 前后端接口路径匹配 =====")
server_admin = read(os.path.join(ROOT, "server", "routes", "admin.js"))
server_app = read(os.path.join(ROOT, "server", "app.js"))
api = read(os.path.join(SRC, "ServerAPI.m"))
verify = read(os.path.join(ROOT, "tweak", "VerifyPlugin.m"))
check("后台路由挂载 /api/admin", "/api/admin" in server_app)
check("壳App登录路径 /api/admin/login", "/api/admin/login" in api)
check("壳App应用路径 /api/admin/apps", "/api/admin/apps" in api)
check("服务端存在 POST /login", "router.post('/login'" in server_admin)
check("服务端存在 GET /apps", "router.get('/apps'" in server_admin)
check("插件验证接口 /api/verify", "/api/verify" in verify)
check("应用列表返回 app_key 字段", "app_key" in server_admin)
check("应用列表返回 app_secret 字段", "app_secret" in server_admin)

print("\n===== 5. 配置 plist 键值匹配 =====")
check("注入器写 AppKey", "AppKey" in read(os.path.join(SRC,"IPAInjector.m")))
check("插件读 AppKey", "AppKey" in verify)
check("配置名 IPAVerifyConfig 一致",
      "IPAVerifyConfig" in read(os.path.join(SRC,"Config.h")) and "IPAVerifyConfig" in verify)

print("\n===== 6. 编译配置关键项 =====")
yml = read(os.path.join(ROOT, "shell-app", "project.yml"))
wf = read(os.path.join(ROOT, ".github", "workflows", "build.yml"))
sh = read(os.path.join(ROOT, "shell-app", "build.sh"))
check("project.yml 关闭签名", "CODE_SIGNING_ALLOWED: NO" in yml)
check("workflow 用 macOS runner", "macos-" in wf)
check("workflow 触发自动编译", "workflow_dispatch" in wf and "push" in wf)
check("build.sh 编译 dylib", "clang -dynamiclib" in sh)
check("build.sh 用 xcodegen", "xcodegen generate" in sh)
check("build.sh 产出 IPA", "zip -qry IPAShell.ipa" in sh)
check("build.sh 引用 tweak/VerifyPlugin.m", "tweak/VerifyPlugin.m" in sh)

print("\n===== 7. 自动签名安装链路 =====")
vc = read(os.path.join(SRC,"ViewController.m"))
sign = read(os.path.join(SRC,"SignService.m"))
check("SignService 实现 itms-services 安装", "itms-services://" in sign)
check("SignService multipart 上传 IPA", "multipart/form-data" in sign)
check("界面接入自动签名按钮", "installBtn" in vc and "installIPA" in vc)

print("\n===== 结果 =====")
print("通过 %d / 失败 %d" % (passed, failed))
sys.exit(1 if failed else 0)
