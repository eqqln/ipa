'use strict';

/* ============ 全局状态 ============ */
const S = {
  view: 'dashboard',
  apps: [],
  cardTypes: [],
  expireModes: [],
  page: {},
  filters: { cards: {}, devices: {}, logs: {} }
};

const $ = sel => document.querySelector(sel);
const content = () => $('#content');

/* ============ 工具 ============ */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(ts) {
  if (!ts) return '<span class="muted">永久</span>';
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function statusTag(s) {
  if (s === 'active') return '<span class="tag tag-ok">正常</span>';
  if (s === 'banned' || s === 'frozen') return '<span class="tag tag-ban">冻结</span>';
  return `<span class="tag tag-gray">${esc(s)}</span>`;
}
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2600);
}
async function api(path, opts = {}) {
  const cfg = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (opts.body !== undefined) cfg.body = JSON.stringify(opts.body);
  // path 以 / 开头且含 api 前缀时为完整路径，否则默认加 /api/admin
  const url = opts.full ? path : '/api/admin' + path;
  try {
    const r = await fetch(url, cfg);
    return await r.json();
  } catch (e) {
    toast('网络请求失败', 'err');
    return { code: -1, msg: '网络错误' };
  }
}
/** 会员系统 API（/api/member 前缀） */
const memberApi = (path, opts = {}) => api('/api/member' + path, Object.assign({}, opts, { full: true }));
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('已复制', 'ok')).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('已复制', 'ok'); } catch (e) { toast('复制失败，请手动选择', 'err'); }
  document.body.removeChild(ta);
}

/* ============ 弹窗 ============ */
function openModal(html, wide = false) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'modalMask';
  mask.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  mask.addEventListener('mousedown', e => { if (e.target === mask) closeModal(); });
  $('#modalRoot').appendChild(mask);
  return mask;
}
function closeModal() {
  const m = $('#modalMask');
  if (m) m.remove();
}
function modalHead(title) {
  return `<div class="modal-head"><h3>${esc(title)}</h3><span class="modal-close" data-act="close-modal">×</span></div>`;
}

/* ============ 登录 / 会话 ============ */
async function checkLogin() {
  const r = await api('/me');
  if (r.code === 0) {
    $('#adminName').textContent = r.data.username;
    showApp();
  } else {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
  }
}
async function showApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  await loadApps();
  await loadCardTypes();
  switchView('dashboard');
}
async function loadApps() {
  const r = await api('/apps');
  if (r.code === 0) S.apps = r.data;
}
async function loadCardTypes() {
  const r = await api('/card-types');
  if (r.code === 0) {
    S.cardTypes = r.data.types;
    S.expireModes = r.data.expire_modes;
  }
}
function appName(id) {
  const a = S.apps.find(x => x.id === id);
  return a ? a.name : '-';
}
function appOptions(selected) {
  return S.apps.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}

/* ============ 视图切换 ============ */
const TITLES = {
  dashboard: '概览', apps: '应用管理', cards: '卡密管理', devices: '设备管理',
  announcements: '远程公告', logs: '验证日志', members: '会员管理',
  plans: '会员套餐', settings: '系统设置'
};
async function switchView(view) {
  S.view = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('#crumbTitle').textContent = TITLES[view] || view;
  const renders = {
    dashboard: viewDashboard, apps: viewApps, cards: viewCards,
    devices: viewDevices, announcements: viewAnnouncements, logs: viewLogs,
    members: viewMembers, plans: viewPlans, settings: viewSettings
  };
  await (renders[view] || viewDashboard)();
}

/* ============ 概览 ============ */
async function viewDashboard() {
  const r = await api('/stats');
  if (r.code !== 0) return;
  const d = r.data;
  const card = (n, label, ic, cls) => `<div class="stat ${cls}"><div class="ic">${ic}</div><div class="label">${label}</div><div class="num">${n}</div></div>`;
  const logs = await api('/logs?page=1&pageSize=6');
  const rows = (logs.data ? logs.data.items : []).map(l => `
    <tr><td>${fmt(l.created_at)}</td><td class="code">${esc(l.card || '-')}</td>
    <td class="muted">${esc(l.udid || '-')}</td><td>${l.result === 'success' ? '<span class="tag tag-ok">成功</span>' : '<span class="tag tag-ban">失败</span>'}</td>
    <td class="muted">${esc(l.detail || '')}</td></tr>`).join('');
  content().innerHTML = `
    <div class="stats-grid">
      ${card(d.apps, '应用数量', '📱', 'c1')}
      ${card(d.cards_total, '激活码总数', '🎟️', 'c4')}
      ${card(d.cards_active, '有效激活码', '✅', 'c2')}
      ${card(d.cards_frozen, '冻结激活码', '🚫', 'c3')}
      ${card(d.devices, '在线设备', '📲', 'c1')}
      ${card(d.verify_today, '今日验证', '📈', 'c2')}
    </div>
    <div class="table-wrap">
      <div style="padding:16px 18px;font-weight:600;border-bottom:1px solid var(--line)">最近验证记录</div>
      <div class="scroll-x"><table><thead><tr>
        <th>时间</th><th>激活码</th><th>设备标识</th><th>结果</th><th>说明</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">暂无记录</td></tr>'}</tbody></table></div>
    </div>`;
}

/* ============ 应用管理 ============ */
async function viewApps() {
  const r = await api('/apps');
  if (r.code !== 0) return;
  S.apps = r.data;
  const rows = S.apps.map(a => `
    <tr>
      <td><b>${esc(a.name)}</b></td>
      <td class="muted">${esc(a.bundle_id)}</td>
      <td class="code">${esc(a.app_key)}</td>
      <td>${a.card_count || 0}</td>
      <td>${statusTag(a.status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-xs" data-act="app-key" data-id="${a.id}">密钥</button>
          <button class="btn btn-ghost btn-xs" data-act="app-edit" data-id="${a.id}">编辑</button>
          <button class="btn btn-ghost btn-xs" data-act="app-regen" data-id="${a.id}">重置密钥</button>
          <button class="btn btn-danger btn-xs" data-act="app-del" data-id="${a.id}">删除</button>
        </div>
      </td>
    </tr>`).join('');
  content().innerHTML = `
    <div class="toolbar">
      <div class="note" style="margin:0;flex:1">每个应用拥有独立 AppKey / AppSecret，用于插件签名校验。上传 IPA 时需在插件生成工具中填入对应密钥。</div>
      <button class="btn btn-primary" data-act="app-new">＋ 新建应用</button>
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th>应用名称</th><th>Bundle ID</th><th>AppKey</th><th>卡密数</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty"><div class="big">📱</div>还没有应用，点右上角新建</td></tr>'}</tbody></table></div></div>`;
}

function appForm(a) {
  return `${modalHead(a ? '编辑应用' : '新建应用')}
    <form id="appForm" data-form="app" data-id="${a ? a.id : ''}">
      <div class="modal-body">
        <div class="field"><label>应用名称</label><input class="input" name="name" value="${esc(a ? a.name : '')}" required></div>
        <div class="field"><label>Bundle ID</label><input class="input" name="bundle_id" value="${esc(a ? a.bundle_id : '')}" placeholder="com.example.app" required></div>
        <div class="field"><label>备注</label><input class="input" name="remark" value="${esc(a ? a.remark : '')}"></div>
        ${a ? `<div class="field"><label>状态</label><select class="select" name="status">
          <option value="active" ${a.status === 'active' ? 'selected' : ''}>启用</option>
          <option value="disabled" ${a.status === 'disabled' ? 'selected' : ''}>停用</option>
        </select></div>` : ''}
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>`;
}

/* ============ 卡密管理 ============ */
function typeTag(c) {
  const t = S.cardTypes.find(x => x.key === c.type);
  const name = c.type_name || (t ? t.name : (c.type || '自定义'));
  const color = t ? t.color : '#64748b';
  return `<span class="tag" style="background:${color}1a;color:${color}">${esc(name)}</span>`;
}
async function viewCards() {
  const f = S.filters.cards;
  const qs = new URLSearchParams({ page: S.page.cards || 1, pageSize: 20 });
  ['app_id', 'status', 'type', 'batch', 'keyword'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  const r = await api('/cards?' + qs.toString());
  if (r.code !== 0) return;
  const d = r.data;
  S.page.cards = d.page;

  // 类型快捷标签页
  const tabs = [
    `<a class="type-tab ${!f.type ? 'active' : ''}" data-act="card-type" data-type="">全部</a>`,
    ...S.cardTypes.map(t => `<a class="type-tab ${f.type === t.key ? 'active' : ''}" data-act="card-type" data-type="${t.key}">${esc(t.name)}</a>`)
  ].join('');

  const rows = d.items.map(c => `
    <tr>
      <td><input type="checkbox" class="card-check" value="${c.id}"></td>
      <td class="code">${esc(c.code)}</td>
      <td>${typeTag(c)}</td>
      <td>${esc(c.app_name)}</td>
      <td>${statusTag(c.status)}</td>
      <td>${c.device_count || 0} / ${c.device_limit || 1}</td>
      <td>${fmt(c.expire_at)}</td>
      <td class="muted">${esc(c.batch || '-')}</td>
      <td class="muted">${esc(c.note || '')}</td>
      <td>
        <div class="row-actions">
          <button class="btn ${c.status === 'active' ? 'btn-danger' : 'btn-ok'} btn-xs" data-act="card-toggle" data-id="${c.id}" data-status="${c.status}">${c.status === 'active' ? '冻结' : '解冻'}</button>
          <button class="btn btn-ghost btn-xs" data-act="card-edit" data-id="${c.id}">编辑</button>
          <button class="btn btn-danger btn-xs" data-act="card-del" data-id="${c.id}">删除</button>
        </div>
      </td>
    </tr>`).join('');

  content().innerHTML = `
    <div class="type-tabs">${tabs}</div>
    <div class="toolbar">
      <select class="select filter-input" data-filter="cards" data-key="app_id">
        <option value="">全部应用</option>${S.apps.map(a => `<option value="${a.id}" ${f.app_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <select class="select filter-input" data-filter="cards" data-key="status">
        <option value="">全部状态</option>
        <option value="active" ${f.status === 'active' ? 'selected' : ''}>正常</option>
        <option value="banned" ${f.status === 'banned' ? 'selected' : ''}>冻结</option>
      </select>
      <input class="input filter-input" data-filter="cards" data-key="keyword" placeholder="搜索激活码/备注/批次" value="${esc(f.keyword || '')}">
      <button class="btn btn-ghost btn-sm" data-act="card-ban-selected">批量冻结</button>
      <button class="btn btn-ghost btn-sm" data-act="card-unban-selected">批量解冻</button>
      <button class="btn btn-ghost btn-sm" data-act="card-export">📤 批量导出</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="card-new">＋ 生成激活码</button>
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th><input type="checkbox" id="checkAll"></th><th>激活码</th><th>类型</th><th>应用</th><th>状态</th>
      <th>设备</th><th>到期时间</th><th>批次</th><th>备注</th><th>操作</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="10" class="empty"><div class="big">🎟️</div>暂无激活码，点右上角生成</td></tr>`}</tbody></table></div>
    ${pagerHtml(d, 'cards')}</div>`;
}

function defaultExpire(s) {
  const d = new Date(Date.now() + (s.days || 30) * 86400000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function cardForm() {
  const first = S.cardTypes[0] || { key: 'custom', name: '自定义', days: 0, device_limit: 1 };
  return `${modalHead('批量生成激活码')}
    <form id="cardForm" data-form="card-create">
      <div class="modal-body">
        <div class="field"><label>卡密类型</label>
          <div class="type-picker">
            ${S.cardTypes.map((t, i) => `<label class="type-opt ${i === 0 ? 'selected' : ''}" data-type="${t.key}">
              <input type="radio" name="type" value="${t.key}" ${i === 0 ? 'checked' : ''}>
              <span class="tname" style="color:${t.color}">${esc(t.name)}</span>
              <span class="tdesc">${esc(t.desc)}</span>
            </label>`).join('')}
          </div>
        </div>
        <div class="field"><label>所属应用</label><select class="select" name="app_id" required>${appOptions()}</select></div>
        <div class="field-row">
          <div class="field"><label>生成数量（1-1000）</label><input class="input" type="number" name="count" value="100" min="1" max="1000" required></div>
          <div class="field"><label>设备绑定上限</label><input class="input" type="number" name="device_limit" value="${first.device_limit}" min="1" max="100"></div>
        </div>
        <div class="field"><label>到期方式</label>
          <select class="select" name="expire_mode" id="expireMode" data-change="expire-mode">
            ${S.expireModes.map(m => `<option value="${m.key}" ${m.key === 'days' ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <div id="expireDaysBox">
          <div class="field"><label>有效天数（0 表示永久）</label><input class="input" type="number" name="expire_days" value="${first.days}" min="0"></div>
        </div>
        <div id="expireDateBox" class="hidden">
          <div class="field"><label>到期日期时间（年月日时分）</label><input class="input" type="datetime-local" name="expire_date" value="${defaultExpire(first)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>批次号（可留空自动生成）</label><input class="input" name="batch" placeholder="例如：2026首批"></div>
          <div class="field"><label>卡密前缀（可选）</label><input class="input" name="prefix" placeholder="例如：VIP"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>售价（元，可选）</label><input class="input" type="number" name="price" value="0" min="0" step="0.01"></div>
          <div class="field"><label>备注</label><input class="input" name="note" placeholder="例如：渠道A-批发"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">生成</button>
      </div>
    </form>`;
}
function datetimeOf(ts) {
  if (!ts) return defaultExpire({ days: 0 });
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function cardEditForm(c) {
  return `${modalHead('编辑激活码')}
    <form id="cardEditForm" data-form="card-edit" data-id="${c.id}">
      <div class="modal-body">
        <div class="kv" style="margin-bottom:16px"><span class="k">激活码</span><span class="code">${esc(c.code)}</span></div>
        <div class="field-row">
          <div class="field"><label>状态</label><select class="select" name="status">
            <option value="active" ${c.status === 'active' ? 'selected' : ''}>正常</option>
            <option value="banned" ${c.status === 'banned' ? 'selected' : ''}>冻结</option>
          </select></div>
          <div class="field"><label>卡密类型</label><select class="select" name="type">
            ${S.cardTypes.map(t => `<option value="${t.key}" ${c.type === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>到期方式</label>
          <select class="select" name="expire_mode" data-change="expire-mode">
            <option value="date" ${c.expire_at ? 'selected' : ''}>指定到期日期（年月日时分）</option>
            <option value="days">按有效天数（从现在重新计算）</option>
            <option value="forever" ${!c.expire_at ? 'selected' : ''}>永久有效</option>
          </select>
        </div>
        <div class="edit-expire-date"><div class="field"><label>到期日期时间</label><input class="input" type="datetime-local" name="expire_date" value="${datetimeOf(c.expire_at)}"></div></div>
        <div class="edit-expire-days hidden"><div class="field"><label>有效天数</label><input class="input" type="number" name="expire_days" value="30" min="0"></div></div>
        <div class="field-row">
          <div class="field"><label>设备绑定上限</label><input class="input" type="number" name="device_limit" value="${c.device_limit || 1}" min="1" max="100"></div>
          <div class="field"><label>售价（元）</label><input class="input" type="number" name="price" value="${c.price || 0}" min="0" step="0.01"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>批次</label><input class="input" name="batch" value="${esc(c.batch || '')}"></div>
          <div class="field"><label>备注</label><input class="input" name="note" value="${esc(c.note || '')}"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>`;
}
function showCardResult(cards) {
  const list = cards.map(c => `<span class="code" data-act="copy-code" data-code="${esc(c.code)}" title="点击复制">${esc(c.code)}</span>`).join('');
  const ids = cards.map(c => c.id);
  openModal(`${modalHead('激活码生成成功')}
    <div class="modal-body">
      <div class="note">共生成 <b>${cards.length}</b> 张激活码，点击任意码可复制。请妥善保存，关闭后仍可在列表查看。</div>
      <div class="result-box">${list}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="copy-all" data-codes="${esc(cards.map(c => c.code).join('\n'))}">复制全部</button>
      <button class="btn btn-ghost" data-act="export-ids" data-ids="${esc(ids.join(','))}">📤 导出 TXT</button>
      <button class="btn btn-primary" data-act="close-modal">完成</button>
    </div>`);
}

/** 触发文件下载 */
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function doExport(payload) {
  const r = await api('/cards/export', { method: 'POST', body: payload });
  if (r.code === 0) {
    downloadFile(r.data.content, r.data.filename);
    toast(`已导出 ${r.data.count} 张激活码`, 'ok');
  } else {
    toast(r.msg, 'err');
  }
}
function exportDialog() {
  const selected = [...document.querySelectorAll('.card-check:checked')].map(x => x.value);
  const f = S.filters.cards;
  openModal(`${modalHead('批量导出激活码')}
    <div class="modal-body">
      <div class="note">可选择导出「当前勾选」或「当前筛选条件下的全部」激活码，支持 CSV（Excel 可打开）与 TXT 纯文本。</div>
      <div class="field"><label>导出范围</label>
        <select class="select" id="exportScope">
          <option value="filter">当前筛选全部（${esc(Object.values(f).filter(Boolean).length ? '有筛选条件' : '全部卡密')}）</option>
          <option value="selected" ${selected.length ? '' : 'disabled'}>当前勾选（${selected.length} 张）</option>
        </select>
      </div>
      <div class="field"><label>文件格式</label>
        <select class="select" id="exportFormat">
          <option value="csv">CSV（Excel 表格，含类型/设备/到期/批次等列）</option>
          <option value="txt">TXT（纯文本，制表符分隔）</option>
        </select>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="close-modal">取消</button>
      <button class="btn btn-primary" data-act="export-confirm" data-selected="${esc(selected.join(','))}">导出</button>
    </div>`);
}

/* ============ 设备管理 ============ */
async function viewDevices() {
  const f = S.filters.devices;
  const qs = new URLSearchParams({ page: S.page.devices || 1, pageSize: 20 });
  ['app_id', 'keyword'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  const r = await api('/devices?' + qs.toString());
  if (r.code !== 0) return;
  const d = r.data;
  S.page.devices = d.page;
  const rows = d.items.map(x => `
    <tr>
      <td class="code">${esc(x.udid)}</td>
      <td>${esc(x.device_name || '-')}</td>
      <td>${esc(x.model || '-')}</td>
      <td class="code">${esc(x.card_code || '-')}</td>
      <td>${fmt(x.last_active)}</td>
      <td>${statusTag(x.status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn ${x.status === 'active' ? 'btn-danger' : 'btn-ok'} btn-xs" data-act="dev-toggle" data-id="${x.id}" data-status="${x.status}">${x.status === 'active' ? '禁用' : '启用'}</button>
          <button class="btn btn-danger btn-xs" data-act="dev-del" data-id="${x.id}">解绑</button>
        </div>
      </td>
    </tr>`).join('');
  content().innerHTML = `
    <div class="toolbar">
      <select class="select filter-input" data-filter="devices" data-key="app_id">
        <option value="">全部应用</option>${S.apps.map(a => `<option value="${a.id}" ${f.app_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <input class="input filter-input" data-filter="devices" data-key="keyword" placeholder="搜索 UDID / 设备名" value="${esc(f.keyword || '')}">
      <div class="spacer"></div>
      <span class="muted">共 ${d.total} 台设备</span>
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th>UDID</th><th>设备名称</th><th>机型</th><th>绑定激活码</th><th>最后活跃</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty"><div class="big">📲</div>暂无设备</td></tr>'}</tbody></table></div>
    ${pagerHtml(d, 'devices')}</div>`;
}

/* ============ 远程公告 ============ */
async function viewAnnouncements() {
  const r = await api('/announcements');
  if (r.code !== 0) return;
  const rows = r.data.map(a => `
    <tr>
      <td>${esc(a.title)}</td>
      <td>${esc(appName(a.app_id))}</td>
      <td class="muted" style="white-space:normal;max-width:420px">${esc(a.content)}</td>
      <td>${statusTag(a.status)}</td>
      <td>${fmt(a.created_at)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-xs" data-act="ann-edit" data-id="${a.id}">编辑</button>
          <button class="btn btn-danger btn-xs" data-act="ann-del" data-id="${a.id}">删除</button>
        </div>
      </td>
    </tr>`).join('');
  content().innerHTML = `
    <div class="toolbar">
      <div class="note" style="margin:0;flex:1">发布后客户端在验证成功时自动获取最新公告并以弹窗展示，可用于通知维护、升级、活动信息。</div>
      <button class="btn btn-primary" data-act="ann-new">＋ 发布公告</button>
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th>标题</th><th>应用</th><th>内容</th><th>状态</th><th>发布时间</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty"><div class="big">📢</div>暂无公告</td></tr>'}</tbody></table></div></div>`;
}
function annForm(a) {
  return `${modalHead(a ? '编辑公告' : '发布公告')}
    <form id="annForm" data-form="ann" data-id="${a ? a.id : ''}">
      <div class="modal-body">
        <div class="field"><label>目标应用</label><select class="select" name="app_id" required>${appOptions(a ? a.app_id : S.apps[0] && S.apps[0].id)}</select></div>
        <div class="field"><label>标题</label><input class="input" name="title" value="${esc(a ? a.title : '')}" required></div>
        <div class="field"><label>内容</label><textarea class="textarea" name="content" required>${esc(a ? a.content : '')}</textarea></div>
        <div class="field"><label>状态</label><select class="select" name="status">
          <option value="active" ${!a || a.status === 'active' ? 'selected' : ''}>发布</option>
          <option value="hidden" ${a && a.status === 'hidden' ? 'selected' : ''}>隐藏</option>
        </select></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>`;
}

/* ============ 验证日志 ============ */
async function viewLogs() {
  const f = S.filters.logs;
  const qs = new URLSearchParams({ page: S.page.logs || 1, pageSize: 20 });
  ['app_id', 'result', 'keyword'].forEach(k => { if (f[k]) qs.set(k, f[k]); });
  const r = await api('/logs?' + qs.toString());
  if (r.code !== 0) return;
  const d = r.data;
  S.page.logs = d.page;
  const rows = d.items.map(l => `
    <tr>
      <td>${fmt(l.created_at)}</td>
      <td class="code">${esc(l.card || '-')}</td>
      <td class="muted">${esc(l.udid || '-')}</td>
      <td>${esc(l.ip || '-')}</td>
      <td>${l.result === 'success' ? '<span class="tag tag-ok">成功</span>' : '<span class="tag tag-ban">失败</span>'}</td>
      <td class="muted">${esc(l.detail || '')}</td>
    </tr>`).join('');
  content().innerHTML = `
    <div class="toolbar">
      <select class="select filter-input" data-filter="logs" data-key="app_id">
        <option value="">全部应用</option>${S.apps.map(a => `<option value="${a.id}" ${f.app_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <select class="select filter-input" data-filter="logs" data-key="result">
        <option value="">全部结果</option>
        <option value="success" ${f.result === 'success' ? 'selected' : ''}>成功</option>
        <option value="fail" ${f.result === 'fail' ? 'selected' : ''}>失败</option>
      </select>
      <input class="input filter-input" data-filter="logs" data-key="keyword" placeholder="搜索激活码/UDID" value="${esc(f.keyword || '')}">
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th>时间</th><th>激活码</th><th>UDID</th><th>IP</th><th>结果</th><th>说明</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty"><div class="big">📜</div>暂无日志</td></tr>'}</tbody></table></div>
    ${pagerHtml(d, 'logs')}</div>`;
}

/* ============ 会员管理 ============ */
let MLEVELS = [], MCAPS = [];
async function loadMemberMeta() {
  const r = await memberApi('/admin/levels');
  if (r.code === 0) { MLEVELS = r.data.levels; MCAPS = r.data.capabilities; }
}
function levelTag(level) {
  const l = MLEVELS.find(x => x.level === Number(level)) || { name: '普通', color: '#64748b', icon: '👤' };
  return `<span class="tag" style="background:${l.color}1a;color:${l.color}">${l.icon} ${esc(l.name)}</span>`;
}
async function viewMembers() {
  if (!MLEVELS.length) await loadMemberMeta();
  const f = S.filters.members = S.filters.members || {};
  const qs = new URLSearchParams({ page: S.page.members || 1, pageSize: 20 });
  ['level', 'status', 'keyword'].forEach(k => { if (f[k] !== undefined && f[k] !== '') qs.set(k, f[k]); });
  const r = await memberApi('/admin/list?' + qs.toString());
  if (r.code !== 0) { content().innerHTML = `<div class="card">加载失败：${esc(r.msg)}</div>`; return; }
  const d = r.data;
  S.page.members = d.page;
  const statsR = await memberApi('/admin/stats');
  const st = statsR.code === 0 ? statsR.data : {};

  const statCards = [
    ['会员总数', st.total || 0, '👥', 'c1'], ['正常', st.active || 0, '✅', 'c2'],
    ['VIP', st.vip || 0, '💎', 'c4'], ['SVIP', st.svip || 0, '👑', 'c3'],
    ['超级会员', st.super || 0, '🔥', 'c3'], ['累计营收', '¥' + (st.revenue || 0), '💰', 'c2']
  ].map(x => `<div class="stat ${x[3]}"><div class="ic">${x[2]}</div><div class="label">${x[0]}</div><div class="num">${x[1]}</div></div>`).join('');

  const rows = d.items.map(m => `
    <tr>
      <td><input type="checkbox" class="member-check" value="${m.id}"></td>
      <td><b>${esc(m.username)}</b>${m.plain_password ? `<div class="muted" style="font-size:11px">密码: <span class="code">${esc(m.plain_password)}</span></div>` : ''}</td>
      <td>${levelTag(m.level)}</td>
      <td>${m.status === 'active' ? '<span class="tag tag-ok">正常</span>' : '<span class="tag tag-ban">冻结</span>'}</td>
      <td>${m.expired ? '<span class="tag tag-ban">已到期</span>' : fmt(m.expire_at)}</td>
      <td class="muted">${esc(m.email || '-')}</td>
      <td class="muted">${esc(m.phone || '-')}</td>
      <td class="muted">${m.last_login ? fmt(m.last_login) : '从未登录'}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-xs" data-act="mem-edit" data-id="${m.id}">编辑</button>
        <button class="btn ${m.status === 'active' ? 'btn-danger' : 'btn-ok'} btn-xs" data-act="mem-toggle" data-id="${m.id}" data-status="${m.status}">${m.status === 'active' ? '冻结' : '解冻'}</button>
        <button class="btn btn-danger btn-xs" data-act="mem-del" data-id="${m.id}">删除</button>
      </div></td>
    </tr>`).join('');

  content().innerHTML = `
    <div class="stats-grid">${statCards}</div>
    <div class="toolbar">
      <select class="select filter-input" data-filter="members" data-key="level">
        <option value="">全部等级</option>${MLEVELS.map(l => `<option value="${l.level}" ${String(f.level) === String(l.level) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
      <select class="select filter-input" data-filter="members" data-key="status">
        <option value="">全部状态</option>
        <option value="active" ${f.status === 'active' ? 'selected' : ''}>正常</option>
        <option value="banned" ${f.status === 'banned' ? 'selected' : ''}>冻结</option>
      </select>
      <input class="input filter-input" data-filter="members" data-key="keyword" placeholder="搜索账号/邮箱/手机" value="${esc(f.keyword || '')}">
      <button class="btn btn-ghost btn-sm" data-act="mem-export">📤 导出会员</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" data-act="mem-batch">批量注册</button>
      <button class="btn btn-primary" data-act="mem-new">＋ 添加会员</button>
    </div>
    <div class="toolbar" style="margin-top:-8px">
      <button class="btn btn-ghost btn-sm" data-act="mem-ban-selected">批量冻结</button>
      <button class="btn btn-ghost btn-sm" data-act="mem-unban-selected">批量解冻</button>
      <button class="btn btn-ghost btn-sm" data-act="mem-upgrade-selected">批量升级</button>
      <button class="btn btn-ghost btn-sm" data-act="mem-renew-selected">批量续费</button>
      <button class="btn btn-danger btn-sm" data-act="mem-del-selected">批量删除</button>
    </div>
    <div class="table-wrap"><div class="scroll-x"><table><thead><tr>
      <th><input type="checkbox" id="checkAllMember"></th><th>账号</th><th>等级</th><th>状态</th>
      <th>到期</th><th>邮箱</th><th>手机</th><th>最后登录</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty"><div class="big">👥</div>暂无会员</td></tr>'}</tbody></table></div>
    ${pagerHtml(d, 'members')}</div>`;
}

function memberForm() {
  return `${modalHead('添加会员')}
    <form data-form="member-create">
      <div class="modal-body">
        <div class="field"><label>账号</label><input class="input" name="username" required></div>
        <div class="field"><label>密码（默认 123456）</label><input class="input" name="password" value="123456"></div>
        <div class="field-row">
          <div class="field"><label>等级</label><select class="select" name="level">${MLEVELS.map(l => `<option value="${l.level}">${esc(l.name)}</option>`).join('')}</select></div>
          <div class="field"><label>有效期（天，0 永久）</label><input class="input" type="number" name="days" value="30"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>邮箱</label><input class="input" name="email"></div>
          <div class="field"><label>手机</label><input class="input" name="phone"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">创建</button>
      </div>
    </form>`;
}
function memberBatchForm() {
  return `${modalHead('批量注册会员')}
    <form data-form="member-batch">
      <div class="modal-body">
        <div class="note">批量生成会员账号与随机密码，生成后可一键导出账号密码表（含密码）。</div>
        <div class="field-row">
          <div class="field"><label>注册数量（1-500）</label><input class="input" type="number" name="count" value="50" min="1" max="500"></div>
          <div class="field"><label>账号前缀</label><input class="input" name="prefix" value="USER"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>等级</label><select class="select" name="level">${MLEVELS.map(l => `<option value="${l.level}">${esc(l.name)}</option>`).join('')}</select></div>
          <div class="field"><label>有效期（天）</label><input class="input" type="number" name="days" value="30"></div>
        </div>
        <div class="field"><label>备注</label><input class="input" name="note" placeholder="例如：渠道批发"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">批量注册</button>
      </div>
    </form>`;
}
function memberEditForm(m) {
  return `${modalHead('编辑会员 · ' + esc(m.username))}
    <form data-form="member-edit" data-id="${m.id}">
      <div class="modal-body">
        <div class="field"><label>等级</label><select class="select" name="level">${MLEVELS.map(l => `<option value="${l.level}" ${m.level === l.level ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="field"><label>状态</label><select class="select" name="status">
          <option value="active" ${m.status === 'active' ? 'selected' : ''}>正常</option>
          <option value="banned" ${m.status === 'banned' ? 'selected' : ''}>冻结</option>
        </select></div>
        <div class="field"><label>续费天数（从现在计算，0 表示改回永久）</label><input class="input" type="number" name="days" value="30"></div>
        <div class="field"><label>重置密码（留空不改）</label><input class="input" name="password" placeholder="不修改请留空"></div>
        <div class="field-row">
          <div class="field"><label>邮箱</label><input class="input" name="email" value="${esc(m.email || '')}"></div>
          <div class="field"><label>手机</label><input class="input" name="phone" value="${esc(m.phone || '')}"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>`;
}
function memberBatchResult(members) {
  const list = members.map(m => `<span class="code" data-act="copy-code" data-code="${esc(m.username + ' / ' + m.password)}" title="点击复制">${esc(m.username)} : ${esc(m.password)}</span>`).join('');
  const ids = members.map(m => m.id);
  openModal(`${modalHead('批量注册成功')}
    <div class="modal-body">
      <div class="note">共注册 <b>${members.length}</b> 个会员，账号:密码 已列出，点击可复制。建议立即导出保存。</div>
      <div class="result-box">${list}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-act="export-member-ids" data-ids="${esc(ids.join(','))}">📤 导出账号密码</button>
      <button class="btn btn-primary" data-act="close-modal">完成</button>
    </div>`);
}

/* ============ 会员套餐 ============ */
async function viewPlans() {
  if (!MLEVELS.length) await loadMemberMeta();
  const r = await memberApi('/admin/plans');
  if (r.code !== 0) { content().innerHTML = `<div class="card">加载失败</div>`; return; }
  const rows = r.data.map(p => `
    <tr>
      <td><b>${esc(p.name)}</b>${p.featured ? ' <span class="tag tag-warn">推荐</span>' : ''}</td>
      <td>${levelTag(p.level)}</td>
      <td>¥${p.price}</td>
      <td>${p.days > 0 ? p.days + ' 天' : '永久'}</td>
      <td class="muted" style="white-space:normal;max-width:360px">${esc(p.benefits)}</td>
      <td>${p.status === 'active' ? '<span class="tag tag-ok">上架</span>' : '<span class="tag tag-gray">隐藏</span>'}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-xs" data-act="plan-edit" data-id="${p.id}">编辑</button>
        <button class="btn btn-danger btn-xs" data-act="plan-del" data-id="${p.id}">删除</button>
      </div></td>
    </tr>`).join('');
  // 权益矩阵
  const matrix = MCAPS.map(c => `<tr><td>${c.icon} ${esc(c.name)}</td><td class="muted">${esc(c.desc)}</td>
    <td>${c.minLevel === 0 ? '✅' : '—'}</td><td>${c.minLevel <= 1 ? '✅' : '—'}</td>
    <td>${c.minLevel <= 2 ? '✅' : '—'}</td><td>${c.minLevel <= 3 ? '✅' : '—'}</td></tr>`).join('');
  content().innerHTML = `
    <div class="toolbar">
      <div class="note" style="margin:0;flex:1">套餐绑定会员等级与有效期；权益矩阵展示各等级解锁的超级功能。</div>
      <button class="btn btn-primary" data-act="plan-new">＋ 新建套餐</button>
    </div>
    <div class="table-wrap" style="margin-bottom:22px"><div class="scroll-x"><table><thead><tr>
      <th>套餐名称</th><th>对应等级</th><th>价格</th><th>时长</th><th>权益说明</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">暂无套餐</td></tr>'}</tbody></table></div></div>
    <div class="card">
      <h3 style="margin-bottom:14px">🔥 超级功能权益矩阵</h3>
      <div class="scroll-x"><table><thead><tr>
        <th>功能</th><th>说明</th><th>普通</th><th>VIP</th><th>SVIP</th><th>超级</th>
      </tr></thead><tbody>${matrix}</tbody></table></div>
    </div>`;
}
function planForm(p) {
  return `${modalHead(p ? '编辑套餐' : '新建套餐')}
    <form data-form="plan" data-id="${p ? p.id : ''}">
      <div class="modal-body">
        <div class="field"><label>套餐名称</label><input class="input" name="name" value="${esc(p ? p.name : '')}" required></div>
        <div class="field-row">
          <div class="field"><label>对应等级</label><select class="select" name="level">${MLEVELS.map(l => `<option value="${l.level}" ${p && p.level === l.level ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="field"><label>价格（元）</label><input class="input" type="number" name="price" value="${p ? p.price : 0}" min="0"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>有效期（天）</label><input class="input" type="number" name="days" value="${p ? p.days : 30}"></div>
          <div class="field"><label>状态</label><select class="select" name="status">
            <option value="active" ${!p || p.status === 'active' ? 'selected' : ''}>上架</option>
            <option value="hidden" ${p && p.status === 'hidden' ? 'selected' : ''}>隐藏</option>
          </select></div>
        </div>
        <div class="field"><label>权益说明</label><input class="input" name="benefits" value="${esc(p ? p.benefits : '')}"></div>
        <div class="field"><label><input type="checkbox" name="featured" value="1" ${p && p.featured ? 'checked' : ''}> 标记为推荐套餐</label></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-act="close-modal">取消</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>`;
}

/* ============ 系统设置 ============ */
async function viewSettings() {
  const origin = location.origin;
  content().innerHTML = `
    <div class="card" style="max-width:760px">
      <h3 style="margin-bottom:16px">🔑 修改管理员密码</h3>
      <form id="pwdForm" data-form="pwd" style="max-width:380px">
        <div class="field"><label>原密码</label><input class="input" type="password" name="old_password" required></div>
        <div class="field"><label>新密码（至少 6 位）</label><input class="input" type="password" name="new_password" required></div>
        <button type="submit" class="btn btn-primary">修改密码</button>
      </form>
      <hr style="border:none;border-top:1px solid var(--line);margin:26px 0">
      <h3 style="margin-bottom:12px">🔌 接口地址（供插件调用）</h3>
      <div class="kv">
        <span class="k">激活验证</span><span class="copy-val">${origin}/api/verify</span>
        <span class="k">心跳保活</span><span class="copy-val">${origin}/api/heartbeat</span>
        <span class="k">远程公告</span><span class="copy-val">${origin}/api/announcement?app_key=你的AppKey</span>
      </div>
      <div class="note" style="margin-top:18px">
        插件请求需在 Header 携带 <b>X-App-Key / X-Timestamp / X-Nonce / X-Sign</b>。<br>
        签名算法：<b>X-Sign = HMAC-SHA256(AppSecret, AppKey|激活码|UDID|Timestamp|Nonce)</b>，时间戳与服务器相差不超过 300 秒。
      </div>
    </div>`;
}

/* ============ 分页组件 ============ */
function pagerHtml(d, view) {
  if (d.totalPages <= 1) return '';
  let btns = '';
  const cur = d.page;
  const from = Math.max(1, cur - 2), to = Math.min(d.totalPages, cur + 2);
  for (let i = from; i <= to; i++) {
    btns += `<button class="btn ${i === cur ? 'btn-primary' : 'btn-ghost'} btn-xs" data-act="page" data-view="${view}" data-page="${i}">${i}</button>`;
  }
  return `<div class="pager"><span class="info">共 ${d.total} 条 · 第 ${d.page}/${d.totalPages} 页</span>${btns}</div>`;
}

/* ============ 事件：点击 ============ */
document.addEventListener('click', async e => {
  // 导航（nav-item 无 data-act，需前置判断）
  const nav = e.target.closest('.nav-item');
  if (nav) { switchView(nav.dataset.view); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'close-modal') return closeModal();
  if (act === 'logout') { await api('/logout', { method: 'POST' }); location.reload(); return; }

  if (!S.view) return;

  // 应用
  if (act === 'app-new') return openModal(appForm(null));
  if (act === 'app-edit') {
    const a = S.apps.find(x => x.id === id);
    return openModal(appForm(a));
  }
  if (act === 'app-key') {
    const a = S.apps.find(x => x.id === id);
    if (!a) return;
    return openModal(`${modalHead('应用密钥 · ' + a.name)}
      <div class="modal-body">
        <div class="field"><label>AppKey</label><div class="copy-val" data-act="copy-code" data-code="${esc(a.app_key)}">${esc(a.app_key)}</div></div>
        <div class="field"><label>AppSecret</label><div class="copy-val" data-act="copy-code" data-code="${esc(a.app_secret)}">${esc(a.app_secret)}</div></div>
        <div class="field"><label>Bundle ID</label><div class="copy-val">${esc(a.bundle_id)}</div></div>
        <div class="note">将 AppKey / AppSecret 填入插件生成工具，生成的插件会内置这对密钥并与服务端校验。</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-act="close-modal">关闭</button></div>`);
  }
  if (act === 'app-regen') {
    if (!confirm('重置后旧插件将无法通过验证，需重新生成插件。确认重置？')) return;
    const r = await api('/apps/' + id + '/regenerate', { method: 'POST' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('apps');
    return;
  }
  if (act === 'app-del') {
    if (!confirm('删除应用会同时删除其全部卡密、设备、公告和日志，确认删除？')) return;
    const r = await api('/apps/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('apps');
    return;
  }

  // 卡密
  if (act === 'card-type') {
    S.filters.cards.type = el.dataset.type;
    S.page.cards = 1;
    switchView('cards');
    return;
  }
  if (act === 'card-new') {
    if (!S.apps.length) return toast('请先创建应用', 'err');
    return openModal(cardForm());
  }
  if (act === 'card-edit') {
    const r = await api('/cards?page=1&pageSize=200');
    const c = r.data && r.data.items.find(x => x.id === id);
    if (c) openModal(cardEditForm(c));
    return;
  }
  if (act === 'card-toggle') {
    const status = el.dataset.status === 'active' ? 'banned' : 'active';
    const r = await api('/cards/' + id, { method: 'PUT', body: { status } });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('cards');
    return;
  }
  if (act === 'card-del') {
    if (!confirm('确认删除该激活码？关联设备将一并解绑。')) return;
    const r = await api('/cards/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('cards');
    return;
  }
  if (act === 'card-ban-selected' || act === 'card-unban-selected') {
    const ids = [...document.querySelectorAll('.card-check:checked')].map(x => x.value);
    if (!ids.length) return toast('请先勾选激活码', 'err');
    const r = await api('/cards/batch', { method: 'POST', body: { ids, action: act === 'card-ban-selected' ? 'ban' : 'unban' } });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('cards');
    return;
  }
  if (act === 'copy-code') { copyText(el.dataset.code); return; }
  if (act === 'copy-all') { copyText(el.dataset.codes); return; }

  // 类型选择联动（生成表单）
  if (act === 'pick-type') {
    document.querySelectorAll('.type-opt').forEach(o => o.classList.remove('selected'));
    return;
  }
  if (act === 'card-export') return exportDialog();
  if (act === 'export-ids') {
    const ids = el.dataset.ids.split(',').filter(Boolean);
    return doExport({ format: 'txt', ids });
  }
  if (act === 'export-confirm') {
    const scope = $('#exportScope').value;
    const format = $('#exportFormat').value;
    const payload = { format };
    if (scope === 'selected') payload.ids = el.dataset.selected.split(',').filter(Boolean);
    else payload.filters = Object.assign({}, S.filters.cards);
    closeModal();
    return doExport(payload);
  }

  // 设备
  if (act === 'dev-toggle') {
    const status = el.dataset.status === 'active' ? 'banned' : 'active';
    const r = await api('/devices/' + id, { method: 'PUT', body: { status } });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('devices');
    return;
  }
  if (act === 'dev-del') {
    if (!confirm('确认解绑该设备？用户需重新激活。')) return;
    const r = await api('/devices/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('devices');
    return;
  }

  // 公告
  if (act === 'ann-new') return openModal(annForm(null));
  if (act === 'ann-edit') {
    const r = await api('/announcements');
    const a = r.data && r.data.find(x => x.id === id);
    if (a) openModal(annForm(a));
    return;
  }
  if (act === 'ann-del') {
    if (!confirm('确认删除该公告？')) return;
    const r = await api('/announcements/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('announcements');
    return;
  }

  // 会员管理
  if (act === 'mem-new') return openModal(memberForm());
  if (act === 'mem-batch') return openModal(memberBatchForm());
  if (act === 'mem-edit') {
    const r = await memberApi('/admin/list?page=1&pageSize=200');
    const m = r.data && r.data.items.find(x => x.id === id);
    if (m) openModal(memberEditForm(m));
    return;
  }
  if (act === 'mem-toggle') {
    const status = el.dataset.status === 'active' ? 'banned' : 'active';
    const r = await memberApi('/admin/' + id, { method: 'PUT', body: { status } });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('members');
    return;
  }
  if (act === 'mem-del') {
    if (!confirm('确认删除该会员？')) return;
    const r = await memberApi('/admin/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('members');
    return;
  }
  if (act.startsWith('mem-') && act.endsWith('-selected')) {
    const ids = [...document.querySelectorAll('.member-check:checked')].map(x => x.value);
    if (!ids.length) return toast('请先勾选会员', 'err');
    const actionMap = {
      'mem-ban-selected': 'ban', 'mem-unban-selected': 'unban',
      'mem-del-selected': 'delete', 'mem-upgrade-selected': 'upgrade', 'mem-renew-selected': 'renew'
    };
    const action = actionMap[act];
    if (action === 'delete' && !confirm(`确认删除选中的 ${ids.length} 个会员？`)) return;
    let extra = {};
    if (action === 'upgrade') {
      const lv = prompt('升级到等级（0普通 1VIP 2SVIP 3超级）:', '1');
      if (lv === null) return;
      extra = { level: parseInt(lv) || 1 };
    }
    if (action === 'renew') {
      const days = prompt('续费天数:', '30');
      if (days === null) return;
      extra = { days: parseInt(days) || 30 };
    }
    const r = await memberApi('/admin/batch-action', { method: 'POST', body: Object.assign({ ids, action }, extra) });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('members');
    return;
  }
  if (act === 'mem-export') {
    const ids = [...document.querySelectorAll('.member-check:checked')].map(x => x.value);
    const payload = ids.length ? { format: 'csv', ids } : { format: 'csv' };
    const r = await memberApi('/admin/export', { method: 'POST', body: payload });
    if (r.code === 0) { downloadFile(r.data.content, r.data.filename); toast(`已导出 ${r.data.count} 个会员`, 'ok'); }
    else toast(r.msg, 'err');
    return;
  }
  if (act === 'export-member-ids') {
    const ids = el.dataset.ids.split(',').filter(Boolean);
    const r = await memberApi('/admin/export', { method: 'POST', body: { format: 'txt', ids } });
    if (r.code === 0) { downloadFile(r.data.content, r.data.filename); toast('已导出账号密码', 'ok'); }
    return;
  }

  // 套餐管理
  if (act === 'plan-new') return openModal(planForm(null));
  if (act === 'plan-edit') {
    const r = await memberApi('/admin/plans');
    const p = r.data && r.data.find(x => x.id === id);
    if (p) openModal(planForm(p));
    return;
  }
  if (act === 'plan-del') {
    if (!confirm('确认删除该套餐？')) return;
    const r = await memberApi('/admin/plans/' + id, { method: 'DELETE' });
    toast(r.msg, r.code === 0 ? 'ok' : 'err');
    if (r.code === 0) switchView('plans');
    return;
  }

  // 分页
  if (act === 'page') {
    S.page[el.dataset.view] = Number(el.dataset.page);
    switchView(el.dataset.view);
    return;
  }
});

/* ============ 事件：表单提交 ============ */
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());

  if (form.dataset.form === 'login') {
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = '登录中...';
    const r = await api('/login', { method: 'POST', body: { username: $('#loginUser').value, password: $('#loginPass').value } });
    btn.disabled = false; btn.textContent = '登 录';
    if (r.code === 0) { toast('登录成功', 'ok'); checkLogin(); }
    else toast(r.msg, 'err');
    return;
  }

  switch (form.dataset.form) {
    case 'app': {
      const id = form.dataset.id;
      const r = await api(id ? '/apps/' + id : '/apps', { method: id ? 'PUT' : 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('apps'); }
      break;
    }
    case 'card-create': {
      const r = await api('/cards', { method: 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); showCardResult(r.data.cards); switchView('cards'); }
      break;
    }
    case 'card-edit': {
      const r = await api('/cards/' + form.dataset.id, { method: 'PUT', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('cards'); }
      break;
    }
    case 'ann': {
      const id = form.dataset.id;
      const r = await api(id ? '/announcements/' + id : '/announcements', { method: id ? 'PUT' : 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('announcements'); }
      break;
    }
    case 'member-create': {
      const r = await memberApi('/admin/create', { method: 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('members'); }
      break;
    }
    case 'member-batch': {
      const r = await memberApi('/admin/batch', { method: 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); memberBatchResult(r.data.members); switchView('members'); }
      break;
    }
    case 'member-edit': {
      const r = await memberApi('/admin/' + form.dataset.id, { method: 'PUT', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('members'); }
      break;
    }
    case 'plan': {
      const id = form.dataset.id;
      if (data.featured) data.featured = true;
      const r = await memberApi(id ? '/admin/plans/' + id : '/admin/plans', { method: id ? 'PUT' : 'POST', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) { closeModal(); switchView('plans'); }
      break;
    }
    case 'pwd': {
      const r = await api('/password', { method: 'PUT', body: data });
      toast(r.msg, r.code === 0 ? 'ok' : 'err');
      if (r.code === 0) form.reset();
      break;
    }
  }
});

/* ============ 事件：筛选 / 全选 ============ */
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.filter) {
    const key = el.dataset.key, group = el.dataset.filter;
    S.filters[group][key] = el.value;
    S.page[group] = 1;
    switchView(group);
  }
  if (el.id === 'checkAll') {
    document.querySelectorAll('.card-check').forEach(c => { c.checked = el.checked; });
  }
  if (el.id === 'checkAllMember') {
    document.querySelectorAll('.member-check').forEach(c => { c.checked = el.checked; });
  }
  // 卡密类型选择：联动天数/设备上限/高亮
  if (el.name === 'type' && el.type === 'radio') {
    document.querySelectorAll('.type-opt').forEach(o => o.classList.toggle('selected', o.dataset.type === el.value));
    const t = S.cardTypes.find(x => x.key === el.value);
    if (t) {
      const form = el.closest('form');
      const daysInput = form.querySelector('[name=expire_days]');
      const devInput = form.querySelector('[name=device_limit]');
      if (daysInput) daysInput.value = t.days;
      if (devInput) devInput.value = t.device_limit;
      if (t.key === 'permanent') {
        const em = form.querySelector('[name=expire_mode]');
        if (em) { em.value = 'forever'; em.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }
  }
  // 到期方式切换：天数 / 日期 / 永久
  if (el.dataset.change === 'expire-mode' || (el.name === 'expire_mode' && el.hasAttribute('data-change'))) {
    const form = el.closest('form');
    const isCreate = form && form.id === 'cardForm';
    const daysBox = isCreate ? form.querySelector('#expireDaysBox') : form.querySelector('.edit-expire-days');
    const dateBox = isCreate ? form.querySelector('#expireDateBox') : form.querySelector('.edit-expire-date');
    if (daysBox && dateBox) {
      daysBox.classList.toggle('hidden', el.value !== 'days');
      dateBox.classList.toggle('hidden', el.value !== 'date');
    }
  }
});
// 类型卡点击（label 内的 radio 触发 change，这里补充点击任意处都能选中）
document.addEventListener('click', e => {
  const opt = e.target.closest('.type-opt');
  if (opt) {
    const radio = opt.querySelector('input[type=radio]');
    if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target.matches('.filter-input')) {
    const el = e.target;
    S.filters[el.dataset.filter][el.dataset.key] = el.value;
    S.page[el.dataset.filter] = 1;
    switchView(el.dataset.filter);
  }
});

/* ============ 启动 ============ */
$('#logoutBtn') && $('#logoutBtn').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' });
  location.reload();
});
checkLogin();
