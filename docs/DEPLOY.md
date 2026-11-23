# 部署指南

## 环境要求
- Node.js >= 14（推荐 18/20/22）
- npm
- 可选：Python 3（IPA 注入工具）
- 可选：macOS + Theos（编译/重签名 dylib）

## 本地运行
```bash
cd server
npm install
node app.js
```
首次启动自动创建：
- 管理员 `admin / admin123`
- 5 个默认会员套餐

## 生产部署

### 1. 修改安全配置（务必）
```bash
export SESSION_SECRET="$(openssl rand -hex 32)"
export ADMIN_USER=admin
export ADMIN_PASS='你的强密码'
export PORT=8080
```

### 2. 用 PM2 守护进程
```bash
npm install -g pm2
pm2 start app.js --name ipa-verify
pm2 save
pm2 startup
```

### 3. 反向代理（Nginx，启用 HTTPS）
```nginx
server {
    listen 443 ssl;
    server_name verify.example.com;
    ssl_certificate     /path/cert.pem;
    ssl_certificate_key /path/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
> 插件端 App Transport Security 要求 HTTPS，生产必须配置证书。

### 4. 数据持久化
数据存放在 `server/data/*.json`，首次启动自动创建。备份时打包该目录即可：
```bash
tar czf backup.tar.gz server/data/
```
恢复：`npm install` 后放入 `server/data/` 再启动。

### 5. 数据规模
JSON 存储适合中小规模（万级卡密/设备）。更大规模建议迁移 SQLite/MySQL：
- `lib/store.js` 的 Collection 接口（`find/findOne/insert/updateById/deleteById/count`）可直接替换为 SQL 实现，路由层无需改动。

## 常见问题
- **管理后台打不开**：确认 `node app.js` 正在运行、`PORT` 未被占用。
- **验证总是失败**：确认 AppKey/AppSecret 与服务端应用一致，服务器时间同步（时间戳容差 300 秒）。
- **插件不弹验证窗**：确认 dylib 已注入（用 `otool -L` 查看 Mach-O 加载命令），配置 plist 已写入。
