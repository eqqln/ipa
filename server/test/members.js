'use strict';
/** 会员注册管理系统端到端测试 */
const BASE = 'http://127.0.0.1:8080';
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`);

let ADMIN_COOKIE = '';
function setAdminCookie(c) { ADMIN_COOKIE = c; }
async function req(path, opts = {}) {
  const h = Object.assign({}, opts.headers);
  const cookie = opts.cookie || (path.startsWith('/admin') ? ADMIN_COOKIE : null);
  if (cookie) h.Cookie = cookie;
  if (opts.body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + '/api/member' + path, {
    method: opts.method || 'GET', headers: h,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json();
  const sc = r.headers.get('set-cookie');
  return { data, cookie: sc ? sc.split(';')[0] : null };
}

(async () => {
  console.log('===== 会员注册管理系统测试 =====\n');
  // 管理员登录走 /api/admin/login（会员管理端点复用 admin 会话）
  const admResp = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const rootCookie = (admResp.headers.get('set-cookie') || '').split(';')[0];
  setAdminCookie(rootCookie);
  const isAdmin = await fetch(BASE + '/api/admin/me', { headers: { Cookie: rootCookie } }).then(r => r.json());
  ok('管理员会话可用于会员管理', isAdmin.code === 0);

  // 等级与套餐元数据
  const meta = await req('/admin/levels');
  ok('等级定义', meta.data.code === 0 && meta.data.data.levels.length === 4,
     meta.data.data.levels.map(l => l.name).join('/'));
  ok('超级功能权益点', meta.data.data.capabilities.length >= 9,
     `${meta.data.data.capabilities.length} 个能力`);

  const plans = await req('/admin/plans');
  ok('默认套餐', plans.data.code === 0 && plans.data.data.length >= 5,
     `${plans.data.data.length} 个套餐`);

  // 前台自助注册
  const uname = 'test_' + Date.now().toString().slice(-6);
  const reg = await req('/register', { method: 'POST', body: {
    username: uname, password: '123456', email: uname + '@test.com'
  }});
  ok('会员自助注册', reg.data.code === 0 && reg.data.data.username === uname);
  ok('新会员默认普通等级', reg.data.data.level === 0);

  // 会员登录
  const login = await req('/login', { method: 'POST', body: { username: uname, password: '123456' } });
  ok('会员登录', login.data.code === 0);
  const memberCookie = login.cookie;

  // 会员查看权益（普通等级仅基础功能）
  const me = await req('/me', { cookie: memberCookie });
  ok('会员查看自身权益', me.data.code === 0 && me.data.data.capabilities.length >= 1,
     `解锁 ${me.data.data.capabilities.length} 项功能`);
  const capKeys = me.data.data.capabilities.map(c => c.key);
  ok('普通等级无超级功能', !capKeys.includes('white_label') && !capKeys.includes('super_panel'));

  // 批量注册
  const batch = await req('/admin/batch', { method: 'POST', body: {
    count: 30, prefix: 'VIP', level: 1, days: 30, note: '测试批量'
  }});
  ok('批量注册会员', batch.data.code === 0 && batch.data.data.members.length === 30,
     `生成 ${batch.data.data.members.length} 个`);
  ok('批量注册带明文密码', batch.data.data.members[0].password &&
     batch.data.data.members[0].password.length >= 8, batch.data.data.members[0].username);

  // 升级会员到超级
  const targetId = batch.data.data.members[0].id;
  const up = await req('/admin/' + targetId, { method: 'PUT', body: { level: 3, days: 365 } });
  ok('升级到超级会员', up.data.code === 0 && up.data.data.level === 3);
  const superCaps = up.data.data.capabilities.map(c => c.key);
  ok('超级会员解锁白标+超级面板', superCaps.includes('white_label') && superCaps.includes('super_panel'),
     `共 ${superCaps.length} 项功能`);

  // 会员统计
  const stats = await req('/admin/stats');
  ok('会员统计', stats.data.code === 0 && stats.data.data.total >= 31,
     `总 ${stats.data.data.total} 会员 / 超级 ${stats.data.data.super}`);

  // 会员列表筛选
  const list = await req('/admin/list?level=1&page=1&pageSize=50');
  ok('按等级筛选会员', list.data.code === 0 && list.data.data.items.every(m => m.level === 1),
     `命中 ${list.data.data.total}`);

  // 导出会员
  const exp = await req('/admin/export', { method: 'POST', body: { format: 'csv' } });
  ok('批量导出会员', exp.data.code === 0 && exp.data.data.content.includes('账号') &&
     exp.data.data.count >= 31, `${exp.data.data.count} 条`);

  // 批量操作：冻结
  const ids = batch.data.data.members.slice(0, 5).map(m => m.id);
  const ba = await req('/admin/batch-action', { method: 'POST', body: { ids, action: 'ban' } });
  ok('批量冻结会员', ba.data.code === 0 && ba.data.data.affected === 5);

  // 目录浏览（公开）
  const catalog = await req('/catalog');
  ok('公开套餐目录', catalog.data.code === 0 && catalog.data.data.plans.length >= 5);

  console.log('\n===== 测试结束 =====');
})().catch(e => { console.error('异常:', e); process.exit(1); });
