#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""轮询指定 workflow run 状态，完成后列出 jobs 与 artifacts。"""
import json
import sys
import time
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
HDR = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "jiyue-watch",
    "X-GitHub-Api-Version": "2022-11-28",
}



def get(path, retries=5):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request("https://api.github.com" + path, headers=HDR), timeout=45) as r:
                return json.loads(r.read().decode() or "{}"), r.status
        except urllib.error.HTTPError as e:
            return json.loads(e.read().decode() or "{}"), e.code
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            return {"message": "network error"}, 0


def watch(run_id, max_wait=900, interval=20):
    print("===== 跟踪 run %s =====" % run_id)
    url = "https://github.com/%s/%s/actions/runs/%s" % (OWNER, REPO, run_id)
    deadline = time.time() + max_wait
    last_state = None
    while time.time() < deadline:
        run, code = get("/repos/%s/%s/actions/runs/%s" % (OWNER, REPO, run_id))
        if code != 200:
            print("查询失败 HTTP %d %s" % (code, run))
            time.sleep(interval)
            continue
        status, conclusion = run.get("status"), run.get("conclusion")
        jobs, _ = get("/repos/%s/%s/actions/runs/%s/jobs" % (OWNER, REPO, run_id))
        brief = []
        for j in jobs.get("jobs", []):
            brief.append("%s=%s/%s" % (j["name"], j["status"], j.get("conclusion") or "-"))
        state = "%s | %s | %s" % (status, conclusion, " ".join(brief))
        if state != last_state:
            print("[%s] %s" % (time.strftime("%H:%M:%S"), state))
            last_state = state
        if status == "completed":
            print("\n=== 完成 ===")
            print("URL:", url)
            for j in jobs.get("jobs", []):
                print("  %s -> %s" % (j["name"], j.get("conclusion")))
                for s in j.get("steps", []):
                    if s.get("conclusion") not in ("success", "skipped", None):
                        print("     ❌ %s -> %s" % (s["name"], s.get("conclusion")))
            return True
        time.sleep(interval)
    print("超时未完成:", url)
    return False


def list_artifacts():
    data, code = get("/repos/%s/%s/actions/artifacts?per_page=30" % (OWNER, REPO))
    if code != 200:
        print("artifacts 查询失败", code)
        return
    print("\n=== 最近 artifacts ===")
    for a in data.get("artifacts", []):
        if "jiyue" in a["name"]:
            print("  id=%s | %s | %s bytes | expired=%s | %s" % (
                a["id"], a["name"], a.get("size_in_bytes"), a.get("expired"),
                a.get("archive_download_url")))


if __name__ == "__main__":
    run_id = sys.argv[1] if len(sys.argv) > 1 else "45437870410"
    watch(int(run_id))
    list_artifacts()
