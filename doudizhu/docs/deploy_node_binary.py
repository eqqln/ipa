#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用官方二进制安装 Node.js 20 + PM2（绕过 apt）"""
import paramiko
import time

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)

def run(cmd, timeout=300, label=None):
    print(f'\n>>> {label or cmd[:60]}')
    _,_,so = c.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', errors='replace').strip()
    rc = so.channel.recv_exit_status()
    if out: print(out[-1200:])
    print(f'[exit={rc}]')
    return rc, out

# 0. 修复可能残留的 dpkg 状态
run('sudo -n dpkg --configure -a 2>&1 | tail -5', timeout=120, label='修复dpkg状态')

# 1. 下载 Node 20 官方二进制（用国内镜像加速）
run('cd /tmp && curl -fsSL -o node20.tar.xz https://npmmirror.com/mirrors/node/v20.18.1/node-v20.18.1-linux-x64.tar.xz && ls -lh node20.tar.xz', timeout=300, label='下载Node20二进制')

# 2. 解压安装
run('cd /usr/local && sudo -n tar -xJf /tmp/node20.tar.xz --strip-components=1 && echo 解压完成', timeout=180, label='解压到/usr/local')

# 3. 验证
rc, out = run('/usr/local/bin/node -v && /usr/local/bin/npm -v', timeout=30, label='验证Node')
if 'v20' in out:
    # 4. 安装 PM2
    run('sudo -n /usr/local/bin/npm install -g pm2 2>&1 | tail -8', timeout=300, label='安装PM2')
    run('sudo -n /usr/local/bin/pm2 -v', timeout=30, label='验证PM2')

c.close()
print('\n✅ 二进制安装流程完成')
