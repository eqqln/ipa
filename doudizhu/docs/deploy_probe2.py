#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""深入探查：sudo权限、站点目录、nginx配置、宝塔"""
import paramiko

HOST, USER, PWD = '117.50.162.204', 'ubuntu', 'Ll123156.'

def run(client, label, cmd, timeout=20):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f'\n--- {label} ---')
    print(out if out else (err if err else '(空)'))

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PWD, timeout=20)

    run(c, 'sudo免密测试', 'sudo -n whoami 2>&1')
    run(c, 'nginx站点配置列表', 'sudo -n ls -la /etc/nginx/sites-enabled/ 2>&1')
    run(c, '宝塔站点配置', 'sudo -n ls /www/server/panel/vhost/nginx/ 2>&1 | head -30')
    run(c, '域名配置位置', 'sudo -n grep -rl "game.shengka.net" /www/server/panel/vhost/nginx/ /etc/nginx/ 2>/dev/null | head -10')
    run(c, '匹配域名配置内容', 'sudo -n grep -rn "game.shengka.net" /www/server/panel/vhost/nginx/ 2>/dev/null | head -20')
    run(c, 'www目录', 'sudo -n ls -la /www/wwwroot/ 2>&1 | head -30')
    run(c, '架构', 'uname -m')
    run(c, 'curl测试', 'curl -s -o /dev/null -w "%{http_code}" http://game.shengka.net 2>&1')
    c.close()

if __name__ == '__main__':
    main()
