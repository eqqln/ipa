'use strict';
const express = require('express');
const router = express.Router();
const util = require('../lib/util');
const auth = require('../lib/auth');
const mc = require('../lib/memberconfig');

const SESS_COOKIE = 'ipa_member_sess';
const SESSION_TTL = 7 * 24 * 3600;
const sessOpts = { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL * 1000, path: '/' };
const adminOpts = { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000, path: '/' };

function ok(res, data, msg = 'ok') { return res.json({ code: 0, msg, data }); }
function bad(res, msg, code = 400) { return res.status(code).json({ code, msg }); }

function memberSession(m) {
  const payload = Buffer.from(JSON.stringify({ mid: m.id, exp: Date.now() + SESSION_TTL * 1000 })).toString('base64url');
  const sig = util.hmac(require('../config').sessionSecret, payload);
  return `${payload}.${sig}`;
}
function parseMemberSession(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  if (!util.timingSafeEqual(sig, util.hmac(require('../config').sessionSecret, payload))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return d.exp > Date.now() ? d : null;
  } catch (e) { return null; }
}
function memberAuth(req, res, next) {
  const s = parseMemberSession(req.cookies && req.cookies[SESS_COOKIE]);
  if (!s) return bad(res, '请先登录会员账号', 401);
  const m = req.app.locals.store.members.findById(s.mid);
  if (!m) return bad(res, '会员不存在', 401);
  if (m.status !== 'active') return bad(res, '账号已被冻结', 403);
  req.member = m;
  next();
}

function publicMember(m) {
  if (!m) return null;
  const copy = Object.assign({}, m);
  delete copy.password_hash;
  copy.level_info = mc.levelInfo(m.level);
  copy.capabilities = mc.capabilitiesOf(m.level);
  copy.expired = m.expire_at > 0 && m.expire_at < Date.now();
  return copy;
}
function genUsername() {
  return 'U' + Date.now().toString(36).toUpperCase() + util.randomToken(2).toUpperCase();
}
function genPassword() {
  return util.randomToken(4).toUpperCase();
}
function validExpire(level, days) {
  let d = parseInt(days);
  if (isNaN(d) || d <= 0) d = 30;
  return Date.now() + d * 86400000;
}

/* ================= 会员前台 API ================= */

/** 会员注册 */
router.post('/register', (req, res) => {
  const s = req.app.locals.store;
  const { username, password, email, phone } = req.body || {};
  const uname = String(username || '').trim();
  if (uname.length < 3) return bad(res, '账号至少 3 位');
  if (String(password || '').length < 6) return bad(res, '密码至少 6 位');
  if (s.members.findOne({ username: uname })) return bad(res, '账号已存在');
  if (email && s.members.findOne({ email: String(email) })) return bad(res, '邮箱已被使用');

  const m = s.members.insert({
    username: uname,
    password_hash: util.hashPassword(password),
    email: String(email || ''),
    phone: String(phone || ''),
    level: 0,
    status: 'active',
    expire_at: 0,
    points: 0,
    source: 'self',
    last_login: 0
  });
  return ok(res, publicMember(m), '注册成功');
});

/** 会员登录 */
router.post('/login', (req, res) => {
  const s = req.app.locals.store;
  const { username, password } = req.body || {};
  const m = s.members.findOne({ username: String(username || '') });
  if (!m || !util.verifyPassword(String(password || ''), m.password_hash)) return bad(res, '账号或密码错误', 401);
  if (m.status !== 'active') return bad(res, '账号已被冻结', 403);
  if (m.expire_at && m.expire_at < Date.now()) return bad(res, '会员已到期，请联系管理员续费', 403);
  s.members.updateById(m.id, { last_login: Date.now() });
  res.cookie(SESS_COOKIE, memberSession(m), sessOpts);
  return ok(res, publicMember(m), '登录成功');
});

router.post('/logout', (req, res) => {
  res.clearCookie(SESS_COOKIE, { path: '/' });
  return ok(res, null, '已退出');
});

router.get('/me', memberAuth, (req, res) => ok(res, publicMember(req.member)));

/** 会员等级与套餐浏览（公开） */
router.get('/catalog', (req, res) => {
  const plans = req.app.locals.store.plans.all().filter(p => p.status !== 'hidden')
    .map(p => Object.assign({}, p, { level_info: mc.levelInfo(p.level) }));
  return ok(res, { levels: mc.LEVELS, capabilities: mc.CAPABILITIES, plans });
});

/* ================= 管理端：会员管理 ================= */

/** 会员列表（管理员鉴权） */
router.get('/admin/list', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  let list = s.members.all();
  if (req.query.level !== undefined && req.query.level !== '') list = list.filter(m => Number(m.level) === Number(req.query.level));
  if (req.query.status) list = list.filter(m => m.status === req.query.status);
  if (req.query.keyword) {
    const kw = String(req.query.keyword).toLowerCase();
    list = list.filter(m => (m.username || '').toLowerCase().includes(kw) ||
      (m.email || '').toLowerCase().includes(kw) || (m.phone || '').includes(kw));
  }
  list.sort((a, b) => b.created_at - a.created_at);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const size = Math.min(Math.max(parseInt(req.query.pageSize) || 20, 1), 200);
  const total = list.length;
  const items = list.slice((page - 1) * size, page * size).map(publicMember);
  return ok(res, { items, total, page, pageSize: size, totalPages: Math.ceil(total / size) });
});

/** 单个创建会员 */
router.post('/admin/create', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const { username, password, email, phone, level, days, status } = req.body || {};
  const uname = String(username || '').trim();
  if (!uname) return bad(res, '账号不能为空');
  if (s.members.findOne({ username: uname })) return bad(res, '账号已存在');
  const lv = Math.min(Math.max(parseInt(level) || 0, 0), 3);
  const m = s.members.insert({
    username: uname,
    password_hash: util.hashPassword(String(password || '123456')),
    email: String(email || ''),
    phone: String(phone || ''),
    level: lv,
    status: status || 'active',
    expire_at: lv > 0 ? validExpire(lv, days || 30) : 0,
    points: 0,
    source: 'admin',
    last_login: 0
  });
  return ok(res, publicMember(m), '会员创建成功');
});

/** 批量注册会员 */
router.post('/admin/batch', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const { count, prefix, level, days, status, note } = req.body || {};
  const n = Math.min(Math.max(parseInt(count) || 1, 1), 500);
  const lv = Math.min(Math.max(parseInt(level) || 0, 0), 3);
  const p = String(prefix || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'USER';
  const expireAt = lv > 0 ? validExpire(lv, days || 30) : 0;
  const created = [];
  for (let i = 0; i < n; i++) {
    let username;
    do { username = p + String(Date.now()).slice(-5) + util.randomToken(2).toUpperCase(); }
    while (s.members.findOne({ username }));
    const pw = genPassword();
    const m = s.members.insert({
      username, password_hash: util.hashPassword(pw),
      email: '', phone: '', level: lv, status: status || 'active',
      expire_at: expireAt, points: 0, source: 'batch', note: String(note || ''),
      plain_password: pw, last_login: 0
    });
    created.push({ id: m.id, username, password: pw });
  }
  return ok(res, { members: created }, `成功批量注册 ${n} 个会员`);
});

/** 批量导出会员 */
router.post('/admin/export', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const format = (req.body.format || 'csv').toLowerCase();
  let list = s.members.all();
  if (Array.isArray(req.body.ids) && req.body.ids.length) list = list.filter(m => req.body.ids.includes(m.id));
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let content;
  if (format === 'txt') {
    content = list.map(m => [m.username, m.plain_password || '******', mc.levelInfo(m.level).name,
      m.expire_at ? new Date(m.expire_at).toLocaleString('zh-CN') : '永久',
      m.email || '', m.phone || ''].join('\t')).join('\n');
  } else {
    const head = ['账号', '密码', '等级', '到期时间', '邮箱', '手机', '状态', '来源'];
    const rows = list.map(m => [m.username, m.plain_password || '******', mc.levelInfo(m.level).name,
      m.expire_at ? new Date(m.expire_at).toLocaleString('zh-CN') : '永久',
      m.email || '', m.phone || '', m.status, m.source].map(esc).join(','));
    content = '\ufeff' + [head.map(esc).join(','), ...rows].join('\r\n');
  }
  return ok(res, { content, filename: `members_${Date.now()}.${format}`, count: list.length });
});

/** 编辑会员（管理端） */
router.put('/admin/:id', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const patch = {};
  ['status', 'email', 'phone', 'note'].forEach(k => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
  if (req.body.level !== undefined) {
    patch.level = Math.min(Math.max(parseInt(req.body.level) || 0, 0), 3);
  }
  if (req.body.days !== undefined) {
    const d = parseInt(req.body.days);
    patch.expire_at = d > 0 ? Date.now() + d * 86400000 : 0;
  }
  if (req.body.password) patch.password_hash = util.hashPassword(req.body.password);
  const m = s.members.updateById(req.params.id, patch);
  if (!m) return bad(res, '会员不存在', 404);
  return ok(res, publicMember(m), '已保存');
});

/** 批量操作会员 */
router.post('/admin/batch-action', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const { ids, action, level, days } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return bad(res, '未选择会员');
  let n = 0;
  ids.forEach(id => {
    let patch = null;
    if (action === 'ban') patch = { status: 'banned' };
    if (action === 'unban') patch = { status: 'active' };
    if (action === 'delete') { s.members.deleteById(id); s.orders.deleteMany({ member_id: id }); n++; return; }
    if (action === 'upgrade' && level !== undefined) patch = { level: Math.min(Math.max(parseInt(level) || 0, 0), 3) };
    if (action === 'renew' && days) patch = { expire_at: Date.now() + parseInt(days) * 86400000 };
    if (patch && s.members.updateById(id, patch)) n++;
  });
  return ok(res, { affected: n }, `已处理 ${n} 个会员`);
});

/** 删除单个会员 */
router.delete('/admin/:id', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  s.orders.deleteMany({ member_id: req.params.id });
  s.members.deleteById(req.params.id);
  return ok(res, null, '已删除');
});

/* ================= 管理端：套餐管理 ================= */

router.get('/admin/plans', auth.requireAdmin, (req, res) => {
  const plans = req.app.locals.store.plans.all().map(p => Object.assign({}, p, { level_info: mc.levelInfo(p.level) }));
  return ok(res, plans);
});

router.post('/admin/plans', auth.requireAdmin, (req, res) => {
  const { name, level, price, days, benefits, featured } = req.body || {};
  if (!name) return bad(res, '套餐名称必填');
  const p = req.app.locals.store.plans.insert({
    name: String(name), level: Math.min(Math.max(parseInt(level) || 0, 0), 3),
    price: Number(price) || 0, days: parseInt(days) || 30,
    benefits: String(benefits || ''), featured: !!featured, status: 'active'
  });
  return ok(res, p, '套餐已创建');
});

router.put('/admin/plans/:id', auth.requireAdmin, (req, res) => {
  const patch = {};
  ['name', 'price', 'days', 'benefits', 'featured', 'status'].forEach(k => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  if (req.body.level !== undefined) patch.level = Math.min(Math.max(parseInt(req.body.level) || 0, 0), 3);
  const p = req.app.locals.store.plans.updateById(req.params.id, patch);
  if (!p) return bad(res, '套餐不存在', 404);
  return ok(res, p, '已保存');
});

router.delete('/admin/plans/:id', auth.requireAdmin, (req, res) => {
  req.app.locals.store.plans.deleteById(req.params.id);
  return ok(res, null, '已删除');
});

/** 管理端统计（会员维度） */
router.get('/admin/stats', auth.requireAdmin, (req, res) => {
  const s = req.app.locals.store;
  const members = s.members.all();
  return ok(res, {
    total: members.length,
    active: members.filter(m => m.status === 'active').length,
    banned: members.filter(m => m.status === 'banned').length,
    expired: members.filter(m => m.expire_at && m.expire_at < Date.now()).length,
    vip: members.filter(m => m.level === 1).length,
    svip: members.filter(m => m.level === 2).length,
    super: members.filter(m => m.level === 3).length,
    today_new: members.filter(m => m.created_at >= new Date().setHours(0, 0, 0, 0)).length,
    revenue: s.orders.find({ status: 'paid' }).reduce((sum, o) => sum + (o.amount || 0), 0)
  });
});

/** 等级/能力常量（管理端） */
router.get('/admin/levels', auth.requireAdmin, (req, res) => {
  return ok(res, { levels: mc.LEVELS, capabilities: mc.CAPABILITIES });
});

module.exports = router;
module.exports.SESS_COOKIE = SESS_COOKIE;
