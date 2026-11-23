'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const Store = require('./lib/store');
const util = require('./lib/util');
const verifyRouter = require('./routes/verify');
const adminRouter = require('./routes/admin');
const membersRouter = require('./routes/members');
const mc = require('./lib/memberconfig');

const app = express();
const store = new Store(config.dataDir);
app.locals.store = store;

/* ---------- 初始化默认数据 ---------- */
if (store.admins.count() === 0) {
  const a = store.admins.insert({
    username: config.defaultAdmin.username,
    password_hash: util.hashPassword(config.defaultAdmin.password)
  });
  console.log(`[init] 已创建默认管理员：${a.username} / ${config.defaultAdmin.password}（请尽快修改）`);
}

// 首次启动写入默认会员套餐
if (store.plans.count() === 0) {
  mc.DEFAULT_PLANS.forEach(p => {
    store.plans.insert(Object.assign({}, p, { status: 'active' }));
  });
  console.log('[init] 已写入默认会员套餐');
}

if (config.seedDemo && store.apps.count() === 0) {
  const appDemo = store.apps.insert({
    name: '演示应用', bundle_id: 'com.demo.app', remark: 'SEED_DEMO=1 自动创建',
    app_key: util.genAppKey(), app_secret: util.genAppSecret(), status: 'active'
  });
  for (let i = 0; i < 5; i++) {
    let code;
    do { code = util.genCardCode(); } while (store.cards.findOne({ code }));
    store.cards.insert({
      app_id: appDemo.id, code, status: 'active', expire_at: 0,
      device_limit: 3, device_count: 0, note: '演示卡密'
    });
  }
  store.announcements.insert({
    app_id: appDemo.id, title: '欢迎使用验证系统',
    content: '这是一条远程公告示例，可在管理后台随时修改并推送到所有客户端。',
    status: 'active'
  });
  console.log('[init] 演示数据已写入');
}

/* ---------- 中间件 ---------- */
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ---------- 路由 ---------- */
app.use('/api', verifyRouter);          // /api/verify /api/heartbeat /api/announcement
app.use('/api/admin', adminRouter);     // 管理后台 API
app.use('/api/member', membersRouter);  // 会员前台 + 会员管理 API

app.get('/health', (req, res) => {
  res.json({ ok: true, time: Date.now(), version: '1.0.0' });
});

app.use(express.static(path.join(__dirname, 'public')));

/* ---------- 统一错误处理 ---------- */
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

const server = app.listen(config.port, config.host, () => {
  console.log('==================================================');
  console.log('  iOS 网络验证授权系统 已启动');
  console.log(`  管理后台: http://localhost:${config.port}/`);
  console.log(`  健康检查: http://localhost:${config.port}/health`);
  console.log(`  验证接口: POST http://localhost:${config.port}/api/verify`);
  console.log('==================================================');
});

module.exports = { app, server };
