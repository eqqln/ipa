#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署步骤2：上传代码 + 安装依赖 + PM2启动 + Nginx反代"""
import paramiko
import os

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
REMOTE_BASE = '/www/wwwroot/game.shengka.net'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)
sftp = c.open_sftp()

def run(cmd, timeout=300, label=None):
    print(f'\n>>> {label or cmd[:65]}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    if out: print(out[-1500:])
    if err: print('[err]', err[-500:])
    print(f'[exit={rc}]')
    return rc, out

def upload(local, remote):
    print(f'上传 {local} -> {remote}')
    sftp.put(local, remote)

# 1. 上传 server
run(f'sudo -n rm -rf {REMOTE_BASE}/server/* 2>/dev/null; echo ok', timeout=20, label='清空server目录')
upload('D:/guoneiai/doudizhu/_deploy_server.tar.gz', '/tmp/ddz-server.tar.gz')
run(f'cd {REMOTE_BASE}/server && sudo -n tar xzf /tmp/ddz-server.tar.gz && echo 解压完成', timeout=60, label='解压server')

# 2. 上传 admin-web dist
run(f'sudo -n rm -rf {REMOTE_BASE}/admin/* 2>/dev/null; echo ok', timeout=20, label='清空admin目录')
upload('D:/guoneiai/doudizhu/_deploy_admin.tar.gz', '/tmp/ddz-admin.tar.gz')
run(f'cd {REMOTE_BASE}/admin && sudo -n tar xzf /tmp/ddz-admin.tar.gz && echo 解压完成', timeout=60, label='解压admin')

# 3. 服务器安装 server 依赖
rc, out = run(f'cd {REMOTE_BASE}/server && sudo -n npm install --production 2>&1 | tail -8', timeout=400, label='安装后端依赖')

# 4. 权限修正
run(f'sudo -n chown -R www:www {REMOTE_BASE}/server {REMOTE_BASE}/admin {REMOTE_BASE}/download && echo 权限已修正', timeout=30, label='修正目录权限')

# 5. PM2 启动后端（仅本地回环 3100）
run(f'cd {REMOTE_BASE}/server && sudo -n PORT=3100 HOST=127.0.0.1 pm2 start src/index.js --name jiyue-server --update-env 2>&1 | tail -12', timeout=60, label='PM2启动后端')
run('sleep 3 && pm2 list 2>&1 | tail -8', timeout=30, label='PM2状态')
run('curl -s http://127.0.0.1:3100/health', timeout=20, label='后端健康检查')

sftp.close()
c.close()
print('\n✅ 步骤2完成')
