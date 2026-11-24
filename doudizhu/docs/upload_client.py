#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上传 Electron 绿色版客户端到 game.shengka.net/download/"""
import hashlib
import os
import paramiko

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
REMOTE_BASE = '/www/wwwroot/game.shengka.net'
LOCAL_ZIP = 'D:/guoneiai/doudizhu/desktop/release/JiyueQipai-win-x64-green.zip'
ZIP_NAME = 'JiyueQipai-win-x64-green.zip'
REMOTE_TMP = f'/tmp/{ZIP_NAME}'
REMOTE_ZIP = f'{REMOTE_BASE}/download/{ZIP_NAME}'

if not os.path.isfile(LOCAL_ZIP):
    raise SystemExit(f'本地压缩包不存在: {LOCAL_ZIP}')

sha = hashlib.sha256()
with open(LOCAL_ZIP, 'rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''):
        sha.update(chunk)
local_sha = sha.hexdigest()
local_size = os.path.getsize(LOCAL_ZIP)
print(f'本地包: {LOCAL_ZIP}')
print(f'大小: {local_size} bytes')
print(f'SHA256: {local_sha}')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)
sftp = c.open_sftp()


def run(cmd, timeout=300, label=None):
    print(f'\n>>> {label or cmd[:80]}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        print(out[-2000:])
    if err:
        print('[err]', err[-1000:])
    print(f'[exit={rc}]')
    return rc, out


run(f'sudo -n mkdir -p {REMOTE_BASE}/download && echo ok', timeout=30, label='确认下载目录')

print(f'\n>>> 上传 {LOCAL_ZIP} -> {REMOTE_TMP}')
sftp.put(LOCAL_ZIP, REMOTE_TMP)
print('上传完成')

run(f'sudo -n cp {REMOTE_TMP} {REMOTE_ZIP} && sudo -n chown www:www {REMOTE_ZIP} && sudo -n chmod 644 {REMOTE_ZIP} && echo ok',
    timeout=60, label='安装到下载目录')
run(f'stat -c "%n %s bytes" {REMOTE_ZIP}', timeout=30, label='远程文件大小')
run(f'sha256sum {REMOTE_ZIP}', timeout=120, label='远程 SHA256')

index_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>极跃棋牌 · 客户端下载</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #071b16; color: #e8fff7; margin: 0; padding: 40px; }}
    .card {{ max-width: 760px; margin: 0 auto; background: #0d2c24; border: 1px solid #1d5a49; border-radius: 14px; padding: 28px 32px; box-shadow: 0 12px 40px rgba(0,0,0,.25); }}
    h1 {{ margin: 0 0 12px; font-size: 28px; }}
    p {{ line-height: 1.8; color: #b8ded2; }}
    a {{ display: inline-block; margin-top: 18px; padding: 12px 22px; background: #16a878; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; }}
    code {{ color: #7ff0c5; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>极跃棋牌 · Windows 桌面客户端</h1>
    <p>版本：1.0.0 · Windows x64 绿色版</p>
    <p>文件名：<code>{ZIP_NAME}</code></p>
    <p>SHA256：<code>{local_sha}</code></p>
    <p>下载后解压，运行目录内的 <code>JiyueQipai.exe</code> 即可启动客户端。</p>
    <a href="/download/{ZIP_NAME}">立即下载客户端</a>
  </div>
</body>
</html>
"""
remote_index_tmp = '/tmp/jiyue-download-index.html'
with sftp.open(remote_index_tmp, 'w') as f:
    f.write(index_html)
run(f'sudo -n cp {remote_index_tmp} {REMOTE_BASE}/download/index.html && sudo -n chown www:www {REMOTE_BASE}/download/index.html && echo ok',
    timeout=30, label='写入下载页')

run(f'curl -s -o /dev/null -w "download_page=%{{http_code}}\\n" https://game.shengka.net/download/',
    timeout=30, label='公网下载页状态')
run(f'curl -s -o /dev/null -w "zip_head=%{{http_code}} size=%{{size_download}}\\n" -r 0-0 https://game.shengka.net/download/{ZIP_NAME}',
    timeout=60, label='公网压缩包可访问性')

sftp.close()
c.close()
print('\n客户端上传与验证完成')
