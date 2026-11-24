#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署步骤1：安装 Node.js 20 + PM2 + 创建目录"""
import paramiko
import time

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)

def run(cmd, timeout=180, label=None):
    print(f'\n>>> {label or cmd[:70]}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    rc = stdout.channel.recv_exit_status()
    if out.strip(): print(out.strip()[-1500:])
    if err.strip(): print('[stderr]', err.strip()[-800:])
    print(f'[exit={rc}]')
    return rc, out, err

# 1. 安装 Node.js 20（NodeSource）
rc, out, _ = run('node -v 2>/dev/null || echo NODE_MISSING', timeout=20, label='检查node')
if 'NODE_MISSING' in out:
    run('curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -', timeout=300, label='添加NodeSource源')
    run('sudo apt-get install -y nodejs', timeout=400, label='安装Node.js')

rc, out, _ = run('node -v && npm -v', timeout=20, label='确认Node版本')

# 2. 安装 PM2
rc, out, _ = run('pm2 -v 2>/dev/null || echo PM2_MISSING', timeout=20, label='检查pm2')
if 'PM2_MISSING' in out:
    run('sudo npm install -g pm2', timeout=300, label='安装PM2')
run('pm2 -v', timeout=20, label='确认PM2')

# 3. 创建部署目录
run('sudo mkdir -p /www/wwwroot/game.shengka.net/{server,admin,download} && sudo chown -R www:www /www/wwwroot/game.shengka.net && echo 目录已创建', timeout=30, label='创建目录结构')

# 4. 开放3100端口到本地（仅本机监听，通过nginx反代，不需防火墙放行）
run('echo "后端将监听 127.0.0.1:3100，仅nginx反代访问"', timeout=10, label='端口说明')

c.close()
print('\n✅ 步骤1完成')
