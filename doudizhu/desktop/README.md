# 极跃棋牌 · Electron 桌面客户端

基于 Vue 3 + Vite + Electron 的企业级桌面游戏客户端。渲染层沿用原前端工程，主进程负责窗口、托盘与桌面能力桥接。

## 环境要求

- Node.js >= 20（推荐 22.x）
- npm >= 10
- 后端服务运行在 `http://localhost:3100`

## 安装依赖

```bash
cd desktop
npm install
```

## 开发调试

```bash
npm run dev
```

该命令会并行启动 Vite 开发服务器（端口 `5175`）与 Electron 窗口。Vite 将 `/api`、`/socket.io` 代理到 `http://localhost:3100`，开发环境因此可以使用相对地址请求后端。

仅调试网页渲染层：

```bash
npx vite --port 5175
```

## 构建与打包

```bash
# 仅构建渲染层到 dist/
npm run build

# 构建并生成 Windows 安装包（NSIS，输出在 release/）
npm run electron:build

# 构建并生成免安装目录（可用于快速验证）
npm run electron:dir
```

生成的安装包位于 `desktop/release/`，支持自定义安装目录、创建桌面与开始菜单快捷方式，安装语言为简体中文。

## 生产环境后端连接

Electron 生产模式通过 `file://` 加载 `dist/index.html`，此时 Vite 代理不生效。代码中用 `import.meta.env.PROD` 做了区分：

- 开发环境：`/api` 与 Socket 相对地址，走 Vite 代理
- 生产环境：Axios `http://localhost:3100/api`，Socket `http://localhost:3100`

因此启动桌面客户端前，请先确保后端服务在 `3100` 端口运行。

## 关键实现说明

- `vite.config.js` 的 `base: './'` 为必填项，否则 `file://` 下静态资源路径会失效。
- 路由使用 `createWebHashHistory()`，`file://` 协议下无法使用 history 模式。
- 窗口为无边框（`frame: false`），顶部 38px 标题栏由 `src/components/TitleBar.vue` 实现，中间区域 `-webkit-app-region: drag`，按钮区域 `no-drag`。
- `electron/preload.js` 通过 `contextBridge` 暴露 `window.electronAPI`，渲染层统一经 `src/utils/electron.js` 调用；在浏览器中运行时自动降级为 noop。
- 主进程启用单例锁，重复启动会唤起已有窗口；托盘提供显示窗口、重新加载与退出。
- 窗口关闭或应用退出时会通知渲染层断开 Socket。

## 目录结构

```text
desktop/
├── electron/
│   ├── main.js          主进程
│   ├── preload.js       预加载桥接
│   └── package.json     限定主进程模块为 CommonJS
├── src/
│   ├── components/TitleBar.vue
│   ├── utils/electron.js
│   ├── api/index.js
│   ├── socket.js
│   ├── router/index.js
│   └── views/
├── dist/                渲染层构建产物
├── release/             安装包输出
├── index.html
├── vite.config.js
└── package.json
```
