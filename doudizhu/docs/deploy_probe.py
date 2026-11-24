#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部署前探查服务器环境"""
import paramiko

HOST = '117.50.162.204'
USER = 'ubuntu'
PWD = 'Ll123156.'

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PWD, timeout=20)
    print('✅ SSH 连接成功')

    cmds = [
        ('系统版本', 'cat /etc/os-release | head -3'),
        ('当前用户/权限', 'whoami; id | head -1'),
        ('Node', 'node -v 2>/dev/null || echo "无node"'),
        ('npm', 'npm -v 2>/dev/null || echo "无npm"'),
        ('Nginx', 'nginx -v 2>&1 | head -1 || echo "无nginx"'),
        ('PM2', 'pm2 -v 2>/dev/null || echo "无pm2"'),
        ('站点目录', 'ls -la /var/www/ 2>/dev/null; ls -la /home/ubuntu/ 2>/dev/null | head -20'),
        ('Nginx配置', 'sudo -n ls /etc/nginx/sites-enabled/ 2>/dev/null || ls /etc/nginx/sites-enabled/ 2>/dev/null || echo "需sudo"'),
        ('域名配置', 'grep -rl "game.shengka.net" /etc/nginx/ 2>/dev/null | head -5 || echo "未找到域名配置(可能需sudo)"'),
        ('端口占用', 'sudo -n ss -tlnp 2>/dev/null | head -20 || ss -tln 2>/dev/null | head -20'),
        ('磁盘', 'df -h / | tail -1'),
        ('内存', 'free -h | head -2'),
    ]
    for label, cmd in cmds:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=15)
        out = stdout.read().decode('utf-8', errors='replace').strip()
        err = stderr.read().decode('utf-8', errors='replace').strip()
        print(f'\n--- {label} ---')
        print(out if out else (err if err else '(空)'))

    client.close()

if __name__ == '__main__':
    main()
