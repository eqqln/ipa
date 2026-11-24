#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import paramiko
HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)

for label, cmd in [
    ('站点配置全文', 'sudo -n cat /www/server/panel/vhost/nginx/game.shengka.net.conf'),
    ('站点目录内容', 'sudo -n find /www/wwwroot/game.shengka.net -maxdepth 2 -type f | head -30'),
    ('已有进程(node相关)', 'ps aux | grep -E "node|pm2" | grep -v grep | head -10'),
]:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=20)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f'\n===== {label} =====\n{out if out else err}')
c.close()
