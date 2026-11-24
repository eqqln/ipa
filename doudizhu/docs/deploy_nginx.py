#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署步骤3：配置Nginx反代 + 引导页"""
import paramiko

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
BASE = '/www/wwwroot/game.shengka.net'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)
sftp = c.open_sftp()

def run(cmd, timeout=60, label=None):
    print(f'\n>>> {label or cmd[:60]}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    if out: print(out[-1200:])
    if err: print('[err]', err[-600:])
    print(f'[exit={rc}]')
    return rc, out, err

# 1. 创建 extension 目录并上传配置
run(f'sudo -n mkdir -p /www/server/panel/vhost/nginx/extension/game.shengka.net', label='创建extension目录')
sftp.put('D:/guoneiai/doudizhu/docs/nginx_jiyue.conf', '/tmp/jiyue.conf')
run('sudo -n cp /tmp/jiyue.conf /www/server/panel/vhost/nginx/extension/game.shengka.net/jiyue.conf && echo 配置已写入', label='写入Nginx配置')

# 2. 创建引导首页
index_html = open('D:/guoneiai/doudizhu/docs/portal.html', encoding='utf-8').read()
with sftp.open(f'/tmp/jiyue_index.html', 'w') as f:
    f.write(index_html)
run(f'sudo -n cp /tmp/jiyue_index.html {BASE}/index.html && sudo -n chown www:www {BASE}/index.html && echo 首页已创建', label='创建引导首页')

# 3. 测试 Nginx 配置
rc, out, err = run('sudo -n nginx -t 2>&1', timeout=30, label='测试Nginx配置')

# 4. 重载 Nginx
if 'successful' in (out + err):
    run('sudo -n nginx -s reload && echo Nginx已重载', timeout=30, label='重载Nginx')
else:
    print('⚠ Nginx配置测试未通过，暂不重载')

sftp.close()
c.close()
