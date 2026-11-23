'use strict';
const express = require('express');
const router = express.Router();
const config = require('../config');
const util = require('../lib/util');
const auth = require('../lib/auth');
const cardtypes = require('../lib/cardtypes');

const COOKIE = auth.COOKIE;
const cookieOpts = { httpOnly: true, sameSite: 'lax', maxAge: config.adminSessionTTL * 1000, path: '/' };

function ok(res, data, msg = 'ok') {
  return res.json({ code: 0, msg, data });
}
function bad(res, msg, code = 400) {
  return res.status(code).json({ code, msg });
}
function paginate(list, req) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const size = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 200);
  const total = list.length;
  const items = list.slice((page - 1) * size, page * size);
  return { items, total, page, pageSize: size, totalPages: Math.ceil(total / size) };
}

/* ---------------- 登录 / 会话 ---------------- */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = req.app.locals.store.admins.findOne({ username: String(username || '') });
  if (!admin || !util.verifyPassword(String(password || ''), admin.password_hash)) {
    return bad(res, '账号或密码错误', 401);
  }
  const token = auth.issueSession(admin.id);
  res.cookie(COOKIE, token, cookieOpts);
  return ok(res, { username: admin.username }, '登录成功');
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  return ok(res, null, '已退出');
});

router.get('/me', auth.requireAdmin, (req, res) => {
  return ok(res, { id: req.admin.id, username: req.admin.username, created_at: req.admin.created_at });
});

router.put('/password', auth.requireAdmin, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!util.verifyPassword(String(old_password || ''), req.admin.password_hash)) {
    return bad(res, '原密码错误');
  }
  if (String(new_password || '').length < 6) return bad(res, '新密码至少 6 位');
  req.app.locals.store.admins.updateById(req.admin.id, { password_hash: util.hashPassword(new_password) });
  return ok(res, null, '密码已修改');
});

/* ---------------- 以下接口均需管理鉴权 ---------------- */
router.use(auth.requireAdmin);

/* 统计概览 */
router.get('/stats', (req, res) => {
  const s = req.app.locals.store;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cards = s.cards.all();
  const logs = s.logs.all();
  return ok(res, {
    apps: s.apps.count(),
    cards_total: cards.length,
    cards_active: cards.filter(c => c.status === 'active' && (!c.expire_at || c.expire_at > Date.now())).length,
    cards_frozen: cards.filter(c => c.status === 'banned' || c.status === 'frozen').length,
    devices: s.devices.count({ status: 'active' }),
    announcements: s.announcements.count(),
    verify_today: logs.filter(l => l.created_at >= today.getTime()).length,
    verify_total: logs.length
  });
});

/* ---------------- 应用管理 ---------------- */
router.get('/apps', (req, res) => {
  const apps = req.app.locals.store.apps.all().slice().reverse();
  return ok(res, apps.map(a => Object.assign({}, a, { card_count: req.app.locals.store.cards.count({ app_id: a.id }) })));
});

router.post('/apps', (req, res) => {
  const { name, bundle_id, remark } = req.body || {};
  if (!name || !bundle_id) return bad(res, '应用名称和 Bundle ID 必填');
  const app = req.app.locals.store.apps.insert({
    name: String(name),
    bundle_id: String(bundle_id),
    remark: String(remark || ''),
    app_key: util.genAppKey(),
    app_secret: util.genAppSecret(),
    status: 'active'
  });
  return ok(res, app, '应用创建成功');
});

router.put('/apps/:id', (req, res) => {
  const patch = {};
  ['name', 'bundle_id', 'remark', 'status'].forEach(k => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  const app = req.app.locals.store.apps.updateById(req.params.id, patch);
  if (!app) return bad(res, '应用不存在', 404);
  return ok(res, app, '已保存');
});

router.post('/apps/:id/regenerate', (req, res) => {
  const app = req.app.locals.store.apps.updateById(req.params.id, {
    app_key: util.genAppKey(),
    app_secret: util.genAppSecret()
  });
  if (!app) return bad(res, '应用不存在', 404);
  return ok(res, app, '密钥已重置，请重新生成插件');
});

router.delete('/apps/:id', (req, res) => {
  const s = req.app.locals.store;
  const id = req.params.id;
  if (!s.apps.findById(id)) return bad(res, '应用不存在', 404);
  const cardIds = s.cards.find({ app_id: id }).map(c => c.id);
  cardIds.forEach(cid => s.devices.deleteMany({ card_id: cid }));
  s.cards.deleteMany({ app_id: id });
  s.announcements.deleteMany({ app_id: id });
  s.logs.deleteMany({ app_id: id });
  s.apps.deleteById(id);
  return ok(res, null, '应用及关联数据已删除');
});

/* ---------------- 卡密管理 ---------------- */
router.get('/cards', (req, res) => {
  const s = req.app.locals.store;
  let list = s.cards.all();
  if (req.query.app_id) list = list.filter(c => c.app_id === req.query.app_id);
  if (req.query.status) list = list.filter(c => c.status === req.query.status);
  if (req.query.type) list = list.filter(c => c.type === req.query.type);
  if (req.query.batch) list = list.filter(c => c.batch === req.query.batch);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toUpperCase();
    list = list.filter(c => (c.code || '').includes(kw) || (c.note || '').includes(kw) ||
      (c.batch || '').toUpperCase().includes(kw));
  }
  list.sort((a, b) => b.created_at - a.created_at);
  const apps = {};
  s.apps.all().forEach(a => { apps[a.id] = a.name; });
  const pageData = paginate(list, req);
  pageData.items = pageData.items.map(c => Object.assign({}, c, { app_name: apps[c.app_id] || '-' }));
  return ok(res, pageData);
});

router.post('/cards', (req, res) => {
  const s = req.app.locals.store;
  const app = s.apps.findById(req.body.app_id);
  if (!app) return bad(res, '请选择有效应用');

  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 1000);
  const type = req.body.type || 'custom';
  const preset = cardtypes.getType(type);
  const expireMode = req.body.expire_mode || 'days';

  // 到期时间计算：优先使用指定的年月日(picker)，其次天数，最后按类型预设
  let expireAt = 0;
  if (expireMode === 'date' && req.body.expire_date) {
    const ts = new Date(req.body.expire_date).getTime();
    if (isNaN(ts)) return bad(res, '到期日期格式不正确');
    expireAt = ts;
  } else if (expireMode === 'days') {
    const days = parseInt(req.body.expire_days);
    const d = isNaN(days) ? preset.days : days;
    expireAt = d > 0 ? Date.now() + d * 86400000 : 0;
  } else {
    expireAt = 0; // 永久
  }

  const deviceLimit = Math.min(
    Math.max(parseInt(req.body.device_limit) || preset.device_limit || 1, 1), 100);
  const note = String(req.body.note || '');
  const batch = String(req.body.batch || 'B' + Date.now().toString(36).toUpperCase());
  const prefix = String(req.body.prefix || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  const batchId = util.randomToken(5);

  const created = [];
  for (let i = 0; i < count; i++) {
    let code;
    do {
      const base = util.genCardCode();
      code = prefix ? prefix + '-' + base : base;
    } while (s.cards.findOne({ code }));
    created.push(s.cards.insert({
      app_id: app.id,
      code,
      status: 'active',
      type,
      type_name: preset.name,
      expire_at: expireAt,
      device_limit: deviceLimit,
      device_count: 0,
      note,
      batch,
      batch_id: batchId,
      price: Number(req.body.price) || 0
    }));
  }
  return ok(res, { cards: created, batch }, `成功生成 ${count} 张激活码`);
});

/* 卡密类型预设（前后端共用） */
router.get('/card-types', (req, res) => {
  return ok(res, { types: cardtypes.CARD_TYPES, expire_modes: cardtypes.EXPIRE_MODES });
});

/* 批量导出：CSV / TXT，按当前筛选或指定 ids */
router.post('/cards/export', (req, res) => {
  const s = req.app.locals.store;
  const format = (req.body.format || 'csv').toLowerCase();
  let list = s.cards.all();
  if (Array.isArray(req.body.ids) && req.body.ids.length) {
    list = list.filter(c => req.body.ids.includes(c.id));
  } else {
    const f = req.body.filters || {};
    if (f.app_id) list = list.filter(c => c.app_id === f.app_id);
    if (f.status) list = list.filter(c => c.status === f.status);
    if (f.type) list = list.filter(c => c.type === f.type);
    if (f.batch) list = list.filter(c => c.batch === f.batch);
    if (f.keyword) {
      const kw = String(f.keyword).toUpperCase();
      list = list.filter(c => (c.code || '').includes(kw) || (c.note || '').includes(kw));
    }
  }
  list.sort((a, b) => b.created_at - a.created_at);

  const statusText = s => ({ active: '正常', banned: '冻结', frozen: '冻结' }[s] || s);
  const expiryText = c => (!c.expire_at ? '永久' : new Date(c.expire_at).toLocaleString('zh-CN'));
  let content;

  if (format === 'txt') {
    content = list.map(c => [c.code, c.type_name || c.type, c.note || '',
      `设备${c.device_count || 0}/${c.device_limit || 1}`, statusText(c.status),
      expiryText(c), c.batch || '-'].join('\t')).join('\n');
  } else {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['激活码', '类型', '应用ID', '状态', '已绑定设备', '设备上限', '到期时间', '批次', '备注', '售价', '创建时间'];
    const rows = list.map(c => [
      c.code, c.type_name || c.type, c.app_id, statusText(c.status),
      c.device_count || 0, c.device_limit || 1, expiryText(c), c.batch || '-',
      c.note || '', c.price || 0, new Date(c.created_at).toLocaleString('zh-CN')
    ].map(esc).join(','));
    content = '\ufeff' + [head.map(esc).join(','), ...rows].join('\r\n');
  }
  return ok(res, { content, filename: `cards_${Date.now()}.${format}`, count: list.length });
});


router.put('/cards/:id', (req, res) => {
  const patch = {};
  ['status', 'note', 'price', 'batch'].forEach(k => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
  if (req.body.expire_mode === 'date' && req.body.expire_date) {
    const ts = new Date(req.body.expire_date).getTime();
    if (!isNaN(ts)) patch.expire_at = ts;
  } else if (req.body.expire_mode === 'forever') {
    patch.expire_at = 0;
  } else if (req.body.expire_days !== undefined) {
    const d = parseInt(req.body.expire_days) || 0;
    patch.expire_at = d > 0 ? Date.now() + d * 86400000 : 0;
  }
  if (req.body.device_limit !== undefined) {
    patch.device_limit = Math.min(Math.max(parseInt(req.body.device_limit) || 1, 1), 100);
  }
  if (req.body.type !== undefined) {
    patch.type = req.body.type;
    patch.type_name = cardtypes.getType(req.body.type).name;
  }
  const card = req.app.locals.store.cards.updateById(req.params.id, patch);
  if (!card) return bad(res, '激活码不存在', 404);
  return ok(res, card, '已保存');
});

router.post('/cards/batch', (req, res) => {
  const { ids, action } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return bad(res, '未选择激活码');
  const s = req.app.locals.store;
  let n = 0;
  ids.forEach(id => {
    let patch = null;
    if (action === 'ban') patch = { status: 'banned' };
    if (action === 'unban') patch = { status: 'active' };
    if (action === 'delete') {
      s.devices.deleteMany({ card_id: id });
      s.cards.deleteById(id);
      n++;
      return;
    }
    if (patch && s.cards.updateById(id, patch)) n++;
  });
  return ok(res, { affected: n }, `已处理 ${n} 条`);
});

router.delete('/cards/:id', (req, res) => {
  const s = req.app.locals.store;
  s.devices.deleteMany({ card_id: req.params.id });
  s.cards.deleteById(req.params.id);
  return ok(res, null, '已删除');
});

/* ---------------- 设备管理 ---------------- */
router.get('/devices', (req, res) => {
  const s = req.app.locals.store;
  let list = s.devices.all();
  if (req.query.app_id) list = list.filter(d => d.app_id === req.query.app_id);
  if (req.query.card_id) list = list.filter(d => d.card_id === req.query.card_id);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toUpperCase();
    list = list.filter(d => (d.udid || '').toUpperCase().includes(kw) || (d.device_name || '').includes(kw));
  }
  list.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));
  const cardMap = {};
  s.cards.all().forEach(c => { cardMap[c.id] = c.code; });
  const pageData = paginate(list, req);
  pageData.items = pageData.items.map(d => Object.assign({}, d, { card_code: cardMap[d.card_id] || '-' }));
  return ok(res, pageData);
});

router.put('/devices/:id', (req, res) => {
  const patch = {};
  if (req.body.status !== undefined) patch.status = req.body.status;
  const d = req.app.locals.store.devices.updateById(req.params.id, patch);
  if (!d) return bad(res, '设备不存在', 404);
  return ok(res, d, '已保存');
});

router.delete('/devices/:id', (req, res) => {
  const s = req.app.locals.store;
  const d = s.devices.findById(req.params.id);
  if (!d) return bad(res, '设备不存在', 404);
  s.devices.deleteById(d.id);
  const card = s.cards.findById(d.card_id);
  if (card) s.cards.updateById(card.id, { device_count: Math.max((card.device_count || 1) - 1, 0) });
  return ok(res, null, '设备已解绑');
});

/* ---------------- 远程公告 ---------------- */
router.get('/announcements', (req, res) => {
  let list = req.app.locals.store.announcements.all();
  if (req.query.app_id) list = list.filter(a => a.app_id === req.query.app_id);
  list.sort((a, b) => b.created_at - a.created_at);
  return ok(res, list);
});

router.post('/announcements', (req, res) => {
  const { app_id, title, content, status } = req.body || {};
  if (!app_id || !title || !content) return bad(res, '应用、标题、内容必填');
  const a = req.app.locals.store.announcements.insert({
    app_id, title: String(title), content: String(content), status: status || 'active'
  });
  return ok(res, a, '公告已发布');
});

router.put('/announcements/:id', (req, res) => {
  const patch = {};
  ['title', 'content', 'status', 'app_id'].forEach(k => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  const a = req.app.locals.store.announcements.updateById(req.params.id, patch);
  if (!a) return bad(res, '公告不存在', 404);
  return ok(res, a, '已保存');
});

router.delete('/announcements/:id', (req, res) => {
  req.app.locals.store.announcements.deleteById(req.params.id);
  return ok(res, null, '已删除');
});

/* ---------------- 验证日志 ---------------- */
router.get('/logs', (req, res) => {
  let list = req.app.locals.store.logs.all();
  if (req.query.app_id) list = list.filter(l => l.app_id === req.query.app_id);
  if (req.query.result) list = list.filter(l => l.result === req.query.result);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toUpperCase();
    list = list.filter(l => (l.card || '').toUpperCase().includes(kw) || (l.udid || '').toUpperCase().includes(kw));
  }
  list.sort((a, b) => b.created_at - a.created_at);
  return ok(res, paginate(list, req));
});

module.exports = router;
