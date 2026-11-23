'use strict';
/** 增强卡密功能测试：类型 / 年月日到期 / 前缀批次 / 批量导出 */
const BASE = 'http://127.0.0.1:8080';
const ok = (n, c, x = '') => console.log(`${c ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`);

async function req(path, opts = {}) {
  const h = Object.assign({}, opts.headers);
  if (opts.cookie) h.Cookie = opts.cookie;
  if (opts.body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method: opts.method || 'GET', headers: h,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json();
  const sc = r.headers.get('set-cookie');
  return { data, cookie: sc ? sc.split(';')[0] : null };
}

(async () => {
  console.log('===== 增强卡密功能测试 =====\n');
  const login = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  const cookie = login.cookie;
  const apps = await req('/api/admin/apps', { cookie });
  const appId = apps.data.data[0].id;

  // 类型预设
  const types = await req('/api/admin/card-types', { cookie });
  ok('卡密类型预设', types.data.code === 0 && types.data.data.types.length >= 7,
     types.data.data.types.map(t => t.name).join('/'));

  // 按类型批量生成年卡
  const gen = await req('/api/admin/cards', { method: 'POST', cookie, body: {
    app_id: appId, type: 'yearly', count: 20, expire_mode: 'days',
    device_limit: 3, prefix: 'YEAR', batch: '2026年卡', price: 99, note: '测试年卡'
  }});
  const cards = gen.data.data && gen.data.data.cards;
  ok('按类型批量生成', gen.data.code === 0 && cards.length === 20, `生成 ${cards && cards.length} 张`);
  ok('前缀生效', cards[0].code.startsWith('YEAR-'), cards[0].code);
  ok('类型名写入', cards[0].type_name === '年卡', cards[0].type_name);
  ok('批次写入', cards[0].batch === '2026年卡');
  const days = Math.round((cards[0].expire_at - Date.now()) / 86400000);
  ok('年卡365天到期', days >= 364 && days <= 365, `约 ${days} 天`);

  // 指定年月日到期
  const future = new Date(Date.now() + 1000 * 86400000).toISOString().slice(0, 16);
  const gen2 = await req('/api/admin/cards', { method: 'POST', cookie, body: {
    app_id: appId, type: 'custom', count: 5, expire_mode: 'date', expire_date: future
  }});
  const c2 = gen2.data.data.cards[0];
  const diffDays = Math.round((new Date(future).getTime() - c2.expire_at) / 86400000);
  ok('年月日到期生效', diffDays === 0, `目标 ${future}`);

  // 永久卡
  const gen3 = await req('/api/admin/cards', { method: 'POST', cookie, body: {
    app_id: appId, type: 'permanent', count: 3, expire_mode: 'forever'
  }});
  ok('永久卡无到期', gen3.data.data.cards[0].expire_at === 0);

  // 按类型筛选
  const filtered = await req('/api/admin/cards?type=yearly&page=1&pageSize=100', { cookie });
  ok('按类型筛选', filtered.data.data.items.every(c => c.type === 'yearly'),
     `命中 ${filtered.data.data.total} 张年卡`);

  // 批量导出 CSV
  const exp = await req('/api/admin/cards/export', { method: 'POST', cookie,
    body: { format: 'csv', filters: { type: 'yearly' } } });
  ok('批量导出CSV', exp.data.code === 0 && exp.data.data.content.includes('到期时间') &&
     exp.data.data.count >= 20, `${exp.data.data.count} 张, ${exp.data.data.filename}`);

  // 导出指定 ids 为 TXT
  const ids = cards.slice(0, 3).map(c => c.id);
  const exp2 = await req('/api/admin/cards/export', { method: 'POST', cookie,
    body: { format: 'txt', ids } });
  ok('按ID导出TXT', exp2.data.code === 0 && exp2.data.data.count === 3,
     `导出 ${exp2.data.data.count} 张`);

  console.log('\n===== 测试结束 =====');
})().catch(e => { console.error('异常:', e); process.exit(1); });
