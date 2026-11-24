#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""极跃棋牌 - 通过 GitHub REST API 发布源码并驱动移动端 CI。

子命令：
  ensure-repo   创建（或复用）远端仓库
  push          用 Contents API 并发推送全部 git 跟踪文件
  dispatch      手动触发 Android / iOS 两条 workflow
  status        查询最近的 workflow run
  artifacts     列出并可选下载 artifact zip

用法示例：
  python docs/github_publish.py ensure-repo
  python docs/github_publish.py push
  python docs/github_publish.py dispatch
  python docs/github_publish.py status
  python docs/github_publish.py artifacts --download
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

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
OWNER = "eqqln"
REPO = "ipa"
BRANCH = "main"
PREFIX = "doudizhu"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.github.com"
MSG = "极跃棋牌企业级三端系统：Android APK 与 iOS 未签名 IPA 云端编译"
HDR = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "jiyue-qipai-publisher",
    "X-GitHub-Api-Version": "2022-11-28",
}



def http(method, path, body=None, timeout=90, retries=4, raw=False):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = dict(HDR)
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                blob = resp.read()
                if raw:
                    return blob, resp.status
                text = blob.decode("utf-8")
                return (json.loads(text) if text else None), resp.status
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "ignore")
            try:
                parsed = json.loads(detail)
            except Exception:
                parsed = {"message": detail[:300]}
            # 5xx 可重试，4xx 直接抛
            if e.code >= 500 and attempt < retries - 1:
                last = e
                time.sleep(1.5 * (attempt + 1))
                continue
            return parsed, e.code
        except Exception as e:
            last = e
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
    raise RuntimeError("网络错误(重试%d次): %s" % (retries, last))


def ensure_repo():
    print("===== 1. 检查 / 创建远端仓库 %s/%s =====" % (OWNER, REPO))
    repo, code = http("GET", "/repos/%s/%s" % (OWNER, REPO))
    if code == 200:
        print("  仓库已存在: %s | default=%s" % (repo["html_url"], repo["default_branch"]))
        return repo
    print("  GET 返回 %d，尝试创建..." % code)
    repo, code = http("POST", "/user/repos", {
        "name": REPO,
        "private": False,
        "description": "极跃棋牌企业级三端运营系统 - Android APK / iOS 未签名 IPA 自动编译",
        "auto_init": False,
        "default_branch": BRANCH,
    })
    if code in (200, 201):
        print("  创建成功: %s" % repo["html_url"])
        return repo
    # REST 建仓库失败，走 GraphQL
    print("  REST 创建返回 %d，改走 GraphQL..." % code)
    query = "mutation($i:CreateRepositoryInput!){createRepository(input:$i){repository{name url} clientMutationId}}"
    variables = {"i": {"name": REPO, "visibility": "PUBLIC"}}
    result, code = http("POST", "/graphql", {"query": query, "variables": variables})
    created = ((result or {}).get("data") or {}).get("createRepository") or {}
    if created.get("repository"):
        print("  GraphQL 创建成功: %s" % created["repository"]["url"])
        return http("GET", "/repos/%s/%s" % (OWNER, REPO))[0]
    raise RuntimeError("创建仓库失败: %s" % json.dumps(result, ensure_ascii=False)[:400])


def tracked_files():
    out = subprocess.check_output(
        ["git", "-c", "core.quotepath=false", "ls-files"], cwd=ROOT
    ).decode("utf-8")
    files = []
    for line in out.splitlines():
        rel = line.strip()
        if not rel:
            continue
        full = os.path.join(ROOT, rel)
        if os.path.isfile(full):
            files.append(rel.replace("\\", "/"))
    return files


def push_one(rel):
    full = os.path.join(ROOT, rel)
    with open(full, "rb") as fh:
        content = base64.b64encode(fh.read()).decode("ascii")
    enc_path = urllib.parse.quote(PREFIX + "/" + rel, safe="/")
    endpoint = "/repos/%s/%s/contents/%s" % (OWNER, REPO, enc_path)
    sha = None
    cur, code = http("GET", endpoint)
    if code == 200 and isinstance(cur, dict):
        sha = cur.get("sha")
    body = {"message": MSG, "content": content, "branch": BRANCH}
    if sha:
        body["sha"] = sha
    result, code = http("PUT", endpoint, body)
    if code not in (200, 201):
        raise RuntimeError("PUT %s -> HTTP %d %s" % (rel, code, (result or {}).get("message", "")))
    return rel


def create_blob(rel_and_bytes):
    rel, raw = rel_and_bytes
    result, code = http("POST", "/repos/%s/%s/git/blobs" % (OWNER, REPO), {
        "content": base64.b64encode(raw).decode("ascii"),
        "encoding": "base64",
    })
    if code not in (200, 201):
        raise RuntimeError("blob %s -> HTTP %d %s" % (rel, code, (result or {}).get("message", "")))
    return rel, result["sha"]


def push():
    print("===== 2. Git Data API 原子提交源码到 %s =====" % BRANCH)
    files = tracked_files()
    print("  本地文件数: %d" % len(files))

    # 2.1 读取当前 main 分支的 commit / tree，作为 base_tree 保留原有 IPA 文件
    ref, code = http("GET", "/repos/%s/%s/git/ref/heads/%s" % (OWNER, REPO, BRANCH))
    if code != 200:
        raise RuntimeError("读取 main ref 失败 HTTP %d %s" % (code, ref))
    parent_sha = ref["object"]["sha"]
    commit, code = http("GET", "/repos/%s/%s/git/commits/%s" % (OWNER, REPO, parent_sha))
    if code != 200:
        raise RuntimeError("读取父 commit 失败 HTTP %d" % code)
    base_tree = commit["tree"]["sha"]
    print("  父 commit: %s | base_tree: %s" % (parent_sha[:10], base_tree[:10]))

    # 2.2 构造待提交条目：源码全部加 doudizhu/ 前缀，根目录 workflow 独立
    payloads = []
    for rel in files:
        full = os.path.join(ROOT, rel)
        with open(full, "rb") as fh:
            payloads.append((PREFIX + "/" + rel, fh.read()))
    # 根目录两条独立 workflow：Android-only + 独立 iOS，互不取消
    wf_pairs = [
        ("jiyue-mobile-root.yml", ".github/workflows/jiyue-mobile.yml"),
        ("jiyue-ios-standalone.yml", ".github/workflows/jiyue-ios.yml"),
    ]
    for src_name, dst in wf_pairs:
        src = os.path.join(ROOT, ".github", "workflows", src_name)
        with open(src, "rb") as fh:
            payloads.append((dst, fh.read()))
    print("  待创建 blob 数: %d" % len(payloads))

    # 2.3 并发创建 blob（内容寻址，无 ref 竞争）
    tree_entries = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(create_blob, item) for item in payloads]
        for i, fut in enumerate(as_completed(futures), 1):
            rel, sha = fut.result()
            tree_entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": sha})
            if i % 40 == 0 or i == len(payloads):
                print("  blob 进度 %d/%d" % (i, len(payloads)))

    # 2.4 一次创建 tree
    tree, code = http("POST", "/repos/%s/%s/git/trees" % (OWNER, REPO), {
        "base_tree": base_tree,
        "tree": tree_entries,
    })
    if code not in (200, 201):
        raise RuntimeError("创建 tree 失败 HTTP %d %s" % (code, tree))
    print("  ✅ tree 创建: %s" % tree["sha"][:10])

    # 2.5 一次创建 commit
    new_commit, code = http("POST", "/repos/%s/%s/git/commits" % (OWNER, REPO), {
        "message": MSG,
        "tree": tree["sha"],
        "parents": [parent_sha],
    })
    if code not in (200, 201):
        raise RuntimeError("创建 commit 失败 HTTP %d %s" % (code, new_commit))
    print("  ✅ commit 创建: %s" % new_commit["sha"][:10])

    # 2.6 更新 ref（唯一一次 ref 写，无冲突）
    updated, code = http("PATCH", "/repos/%s/%s/git/refs/heads/%s" % (OWNER, REPO, BRANCH), {
        "sha": new_commit["sha"],
        "force": False,
    })
    if code != 200:
        raise RuntimeError("更新 ref 失败 HTTP %d %s" % (code, updated))
    print("  ✅ main 已更新 -> %s" % new_commit["sha"][:10])
    print("  源码隔离在 doudizhu/ 子目录；根目录 Android/iOS 两条独立 workflow 已就位，push 自动触发")


def workflow_id(filename):
    data, code = http("GET", "/repos/%s/%s/actions/workflows" % (OWNER, REPO))
    if code != 200:
        raise RuntimeError("读取 workflows 失败 HTTP %d" % code)
    for wf in data.get("workflows", []):
        if wf.get("path", "").endswith(filename) or wf.get("name") == filename:
            return wf["id"], wf["name"]
    return None, None


def dispatch(which="all"):
    print("===== 3. 触发云端编译 =====")
    wid, name = workflow_id("jiyue-mobile.yml")
    if not wid:
        print("  [跳过] 未找到 workflow %s" % "jiyue-mobile.yml")
        return
    result, code = http(
        "POST",
        "/repos/%s/%s/actions/workflows/%s/dispatches" % (OWNER, REPO, wid),
        {"ref": BRANCH},
    )
    if code in (200, 201, 204):
        print("  ✅ 已触发 %s (id=%s)" % (name, wid))
    else:
        print("  ❌ 触发 %s 失败 HTTP %d %s" % (name, code, result))


def status():
    print("===== 4. 最近 workflow runs =====")
    data, code = http("GET", "/repos/%s/%s/actions/runs?per_page=12" % (OWNER, REPO))
    if code != 200:
        print("  查询失败 HTTP %d %s" % (code, data))
        return
    print("  总数: %s" % data.get("total_count"))
    for r in data.get("workflow_runs", []):
        print(
            "  #%s | %s | %s | %s | %s"
            % (
                r["id"],
                r.get("name"),
                r.get("status"),
                r.get("conclusion"),
                r.get("html_url"),
            )
        )


def artifacts(download=False):
    print("===== 5. Artifact 产物 =====")
    data, code = http("GET", "/repos/%s/%s/actions/artifacts?per_page=30" % (OWNER, REPO))
    if code != 200:
        print("  查询失败 HTTP %d %s" % (code, data))
        return
    found = data.get("artifacts", [])
    print("  产物数: %d" % len(found))
    outdir = os.path.join(ROOT, "mobile", "artifacts")
    os.makedirs(outdir, exist_ok=True)
    for a in found:
        print("  - id=%s | %s | %s bytes | expired=%s" % (
            a["id"], a["name"], a.get("size_in_bytes"), a.get("expired")))
        if download and not a.get("expired"):
            blob, scode = http("GET", "/repos/%s/%s/actions/artifacts/%s/zip" % (OWNER, REPO, a["id"]), raw=True)
            path = os.path.join(outdir, a["name"] + ".zip")
            with open(path, "wb") as fh:
                fh.write(blob)
            print("    ✅ 下载 -> %s (%d bytes)" % (path, len(blob)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["ensure-repo", "push", "dispatch", "status", "artifacts", "all"])
    ap.add_argument("--which", default="all", choices=["all", "android", "ios"])
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()

    if args.action in ("ensure-repo", "all"):
        ensure_repo()
    if args.action in ("push", "all"):
        push()
    if args.action in ("dispatch", "all"):
        dispatch(args.which)
    if args.action in ("status", "all"):
        status()
    if args.action in ("artifacts", "all"):
        artifacts(args.download)


if __name__ == "__main__":
    main()
