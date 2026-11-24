#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 Windows 绿色版客户端上传到 GitHub Release（大文件直传）。"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

def _load_token():
    import os
    t = os.environ.get("GH_TOKEN", "")
    if t:
        return t
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gh_token")
    try:
        return open(p, encoding="utf-8").read().strip()
    except Exception:
        return ""


TOKEN = _load_token()
OWNER, REPO = "eqqln", "ipa"
API = "https://api.github.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, "desktop", "release", "JiyueQipai-win-x64-green.zip")
ASSET_NAME = "JiyueQipai-win-x64-green.zip"
HDR = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "jiyue-release-uploader",
    "X-GitHub-Api-Version": "2022-11-28",
}



def http(method, path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDR)
    if data is not None:
        h["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(API + path, data=data, headers=h, method=method), timeout=timeout) as r:
            raw = r.read().decode()
            return (json.loads(raw) if raw else None), r.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}"), e.code


def get_release(release_id):
    return http("GET", "/repos/%s/%s/releases/%s" % (OWNER, REPO, release_id))


def delete_old_asset(release_id, name):
    rel, code = get_release(release_id)
    if code != 200:
        print("读取 release 失败 HTTP %d" % code)
        return
    for a in rel.get("assets", []):
        if a["name"] == name:
            print("  删除旧 asset id=%s ..." % a["id"])
            http("DELETE", "/repos/%s/%s/releases/assets/%s" % (OWNER, REPO, a["id"]))


def upload(release_id):
    rel, code = get_release(release_id)
    if code != 200:
        raise RuntimeError("release 不存在 HTTP %d" % code)
    upload_url = rel["upload_url"].split("{")[0]
    url = "%s?name=%s" % (upload_url, urllib.parse.quote(ASSET_NAME)) if False else upload_url + "?name=" + ASSET_NAME
    size = os.path.getsize(ZIP)
    print("上传 %s (%.1f MB) -> %s" % (ASSET_NAME, size / 1024 / 1024, url[:70]))

    # 用 curl 直传，显示进度；Bearer 认证
    cmd = [
        "curl", "-sS", "-X", "POST",
        "-H", "Authorization: Bearer " + TOKEN,
        "-H", "Content-Type: application/zip",
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2022-11-28",
        "--data-binary", "@" + ZIP,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    out = result.stdout.strip()
    try:
        data = json.loads(out)
    except Exception:
        print("上传返回非 JSON:", out[:400], "stderr:", result.stderr[:200])
        return None
    if "id" in data and "browser_download_url" in data:
        print("  ✅ 上传成功 asset id=%s" % data["id"])
        print("  下载链接:", data["browser_download_url"])
        return data
    print("  ❌ 上传失败:", json.dumps(data, ensure_ascii=False)[:400])
    return None


def publish(release_id):
    body = {"draft": False, "name": "极跃棋牌 Windows 客户端（白色企业版）",
            "body": "白色企业级界面 + 斗地主增强功能（记牌器/表情/设置/全屏/音效）\n\n解压 JiyueQipai-win-x64-green.zip 后运行 JiyueQipai.exe"}
    rel, code = http("PATCH", "/repos/%s/%s/releases/%s" % (OWNER, REPO, release_id), body)
    if code == 200:
        print("  ✅ Release 已发布:", rel.get("html_url"))
    else:
        print("  发布失败 HTTP %d %s" % (code, rel))


if __name__ == "__main__":
    import urllib.parse
    rid = sys.argv[1] if len(sys.argv) > 1 else open(os.path.join(ROOT, "docs", "_release_id.txt")).read().strip()
    print("===== Release ID:", rid, "=====")
    delete_old_asset(rid, ASSET_NAME)
    upload(rid)
    publish(rid)
