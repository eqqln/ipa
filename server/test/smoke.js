'use strict';
/**
 * 端到端冒烟测试：启动服务后执行 `node test/smoke.js`
 * 覆盖：健康检查 → 登录 → 应用/卡密读取 → HMAC 签名验证 → 防重放 → 心跳 → 公告
 */
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://127.0.0.1:8080';

const ok = (name, cond, extra = '') =>
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function req(path, opts = {}) {
  const headers = Object.assign({}, opts.headers);
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, {
    method: opts.method || 'GET', headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  let data;
  try { data = await r.json(); } catch (e) { data = { raw: await r.text() }; }
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data, cookie: sc ? sc.split(';')[0] : null };
}

function signHeaders(app, card, udid, nonce) {
  const timestamp = Date.now();
  const raw = [app.app_key, card, udid, timestamp, nonce].join('|');
  return {
    headers: {
      'X-App-Key': app.app_key,
      'X-Timestamp': String(timestamp),
      'X-Nonce': nonce,
      'X-Sign': hmac(app.app_secret, raw)
    },
    body: { card, udid, model: 'iPhone16,2', device_name: 'SmokeTest', bundle_id: 'com.demo.app', version: '1.0' }
  };
}

(async () => {
  console.log('===== iOS 验证系统冒烟测试 =====\n');

  const health = await req('/health');
  ok('健康检查', health.data.ok === true, JSON.stringify(health.data));

  const login = await req('/api/admin/login', {
    method: 'POST', body: { username: 'admin', password: 'admin123' }
  });
  ok('管理员登录', login.data.code === 0);
  const cookie = login.cookie;

  const appsR = await req('/api/admin/apps', { cookie });
  ok('读取应用列表', appsR.data.code === 0 && appsR.data.data.length > 0);
  const app = appsR.data.data[0];

  const cardsR = await req('/api/admin/cards?page=1&pageSize=5&app_id=' + app.id, { cookie });
  ok('读取卡密列表', cardsR.data.code === 0 && cardsR.data.data.items.length > 0);
  const card = cardsR.data.data.items[0].code;

  const udid = 'SMOKE-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const nonce1 = 'n' + Date.now() + 'a';

  const v1 = await req('/api/verify', Object.assign({ method: 'POST' }, signHeaders(app, card, udid, nonce1)));
  ok('卡密激活验证', v1.data.code === 0 && v1.data.data.valid === true, JSON.stringify(v1.data));

  const v2 = await req('/api/verify', Object.assign({ method: 'POST' }, signHeaders(app, card, udid, nonce1)));
  ok('nonce 防重放', v2.data.code === 1002, v2.data.msg);

  const badCard = await req('/api/verify', Object.assign({ method: 'POST' }, signHeaders(app, 'AAAAA-AAAAA-AAAAA-AAAAA', udid, 'n' + Date.now() + 'b')));
  ok('无效卡密拒绝', badCard.data.code === 1004, badCard.data.msg);

  const hb = await req('/api/heartbeat', Object.assign({ method: 'POST' }, signHeaders(app, card, udid, 'n' + Date.now() + 'c')));
  ok('心跳保活', hb.data.code === 0 && hb.data.data.valid === true);

  const ann = await req('/api/announcement?app_key=' + app.app_key);
  ok('远程公告读取', ann.data.code === 0 && ann.data.data.announcement !== null);

  const devices = await req('/api/admin/devices?keyword=' + udid, { cookie });
  ok('设备自动绑定入库', devices.data.code === 0 && devices.data.data.total >= 1);

  console.log('\n===== 测试结束 =====');
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
