#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署步骤4：PM2开机自启 + 健康检查反代 + 加固"""
import paramiko

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=20)
sftp = c.open_sftp()

def run(cmd, timeout=90, label=None):
    print(f'\n>>> {label or cmd[:60]}')
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    if out: print(out[-1000:])
    if err: print('[err]', err[-400:])
    print(f'[exit={rc}]')
    return rc, out

# 1. PM2 开机自启（root 的 pm2）
run('sudo -n pm2 startup systemd -u root --hp /root 2>&1 | tail -5', label='PM2开机自启')
run('sudo -n pm2 save 2>&1 | tail -3', label='保存PM2进程列表')

# 2. 健康检查反代：在 extension 配置追加 /health
health_conf = '''
# 后端健康检查
location = /health {
    proxy_pass http://127.0.0.1:3100/health;
    proxy_set_header Host $host;
}
'''
with sftp.open('/tmp/health.conf', 'w') as f:
    f.write(health_conf)
run('sudo -n cp /tmp/health.conf /www/server/panel/vhost/nginx/extension/game.shengka.net/health.conf && echo ok', label='写入健康检查配置')

# 3. 测试并重载
rc, out = run('sudo -n nginx -t 2>&1', timeout=30, label='测试Nginx')
if 'successful' in out:
    run('sudo -n nginx -s reload && echo reloaded', label='重载Nginx')

# 4. 最终验证
run('curl -s http://127.0.0.1:3100/health', label='本机后端健康')
run('curl -s https://game.shengka.net/health', label='公网健康检查')

sftp.close()
c.close()
print('\n✅ 步骤4完成')
