<script setup>
import { ref, onMounted } from 'vue'
import { admin as adminApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const tab = ref('dashboard')
const tabs = [
  { key: 'dashboard', label: '📈 数据看板', icon: '📈' },
  { key: 'users', label: '👥 用户管理', icon: '👥' },
  { key: 'ann', label: '📢 公告管理', icon: '📢' },
  { key: 'broadcast', label: '✉️ 全员邮件', icon: '✉️' },
  { key: 'coinlogs', label: '🪙 金币流水', icon: '🪙' },
  { key: 'games', label: '🎮 近期对局', icon: '🎮' },
]

const dashboard = ref(null)
const users = ref([])
const userTotal = ref(0)
const userPage = ref(1)
const userQ = ref('')
const anns = ref([])
const coinlogs = ref([])
const games = ref([])

const annForm = ref({ title: '', content: '', pinned: false })
const broadcastForm = ref({ title: '', content: '', coins: 0, diamonds: 0 })
const grantState = ref({})

async function loadDashboard() {
  try { dashboard.value = await adminApi.dashboard() }
  catch (e) { emit('toast', e.message, 'error') }
}
async function loadUsers() {
  try {
    const d = await adminApi.users({ q: userQ.value, page: userPage.value, pageSize: 20 })
    users.value = d?.list || []
    userTotal.value = d?.total || 0
  } catch (e) { emit('toast', e.message, 'error') }
}
async function loadAnns() {
  try { anns.value = await adminApi.announcements() }
  catch (e) { emit('toast', e.message, 'error') }
}
async function loadCoinlogs() {
  try { coinlogs.value = await adminApi.coinlogs(100) }
  catch (e) { emit('toast', e.message, 'error') }
}
async function loadGames() {
  try { games.value = await adminApi.games(30) }
  catch (e) { emit('toast', e.message, 'error') }
}

function switchTab(t) {
  tab.value = t
  if (t === 'dashboard') loadDashboard()
  if (t === 'users') loadUsers()
  if (t === 'ann') loadAnns()
  if (t === 'coinlogs') loadCoinlogs()
  if (t === 'games') loadGames()
}

async function setStatus(u) {
  const next = u.status === 'banned' ? 'active' : 'banned'
  try {
    await adminApi.setStatus(u.id, next)
    u.status = next
    emit('toast', `已将 ${u.nickname} ${next === 'banned' ? '封禁' : '解封'}`, 'success')
  } catch (e) { emit('toast', e.message, 'error') }
}
async function grant(u) {
  const g = grantState.value[u.id] || { coins: 0, diamonds: 0 }
  try {
    await adminApi.grant(u.id, { coins: Number(g.coins) || 0, diamonds: Number(g.diamonds) || 0 })
    emit('toast', `已向 ${u.nickname} 发放奖励`, 'success')
    grantState.value[u.id] = { coins: 0, diamonds: 0 }
    loadUsers()
  } catch (e) { emit('toast', e.message, 'error') }
}
async function addAnn() {
  try {
    await adminApi.addAnnouncement(annForm.value)
    emit('toast', '公告已发布', 'success')
    annForm.value = { title: '', content: '', pinned: false }
    loadAnns()
  } catch (e) { emit('toast', e.message, 'error') }
}
async function delAnn(id) {
  try {
    await adminApi.deleteAnnouncement(id)
    emit('toast', '公告已删除', 'success')
    loadAnns()
  } catch (e) { emit('toast', e.message, 'error') }
}
async function broadcast() {
  try {
    const rewards = {}
    if (Number(broadcastForm.value.coins)) rewards.coins = Number(broadcastForm.value.coins)
    if (Number(broadcastForm.value.diamonds)) rewards.diamonds = Number(broadcastForm.value.diamonds)
    await adminApi.broadcast({ title: broadcastForm.value.title, content: broadcastForm.value.content, rewards })
    emit('toast', '全员邮件已发送', 'success')
    broadcastForm.value = { title: '', content: '', coins: 0, diamonds: 0 }
  } catch (e) { emit('toast', e.message, 'error') }
}

function fmt(ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }) }
const num = (n) => Number(n || 0).toLocaleString()

onMounted(loadDashboard)
</script>

<template>
  <div class="admin-page">
    <div class="page-head">
      <h1 class="page-title">🛡️ 管理后台</h1>
      <p class="page-sub">管理员 {{ store.nickname }} · 平台运营控制台</p>
    </div>

    <div class="admin-tabs card">
      <button v-for="t in tabs" :key="t.key" :class="{ active: tab === t.key }" @click="switchTab(t.key)">{{ t.label }}</button>
    </div>

    <!-- 数据看板 -->
    <div v-if="tab === 'dashboard'" class="dashboard">
      <div v-if="!dashboard" class="tcenter" style="padding:50px"><span class="spinner"></span></div>
      <div class="dash-grid" v-else>
        <div class="dash-card card" v-for="d in [
          { label: '注册用户', value: num(dashboard.totalUsers), icon: '👥', color: '#7fd8ff' },
          { label: '在线用户', value: num(dashboard.onlineUsers), icon: '🟢', color: '#7fe0ad' },
          { label: '活跃房间', value: num(dashboard.activeRooms), icon: '🏠', color: '#c9a7ff' },
          { label: '总对局数', value: num(dashboard.totalGames), icon: '🎮', color: '#ffd08a' },
          { label: '今日对局', value: num(dashboard.todayGames), icon: '📅', color: '#a5e887' },
          { label: '系统金币', value: num(dashboard.totalCoins), icon: '🪙', color: '#eecb6a' },
          { label: '系统钻石', value: num(dashboard.totalDiamonds), icon: '💎', color: '#8fd8ff' },
          { label: '投注流水', value: num(dashboard.totalBetFlow), icon: '💰', color: '#ff9d97' },
        ]" :key="d.label">
          <div class="dash-icon" :style="{ color: d.color }">{{ d.icon }}</div>
          <div class="dash-value" :style="{ color: d.color }">{{ d.value }}</div>
          <div class="dash-label muted">{{ d.label }}</div>
        </div>
      </div>
    </div>

    <!-- 用户管理 -->
    <div v-else-if="tab === 'users'" class="card panel">
      <div class="search-box">
        <input v-model="userQ" class="input" placeholder="搜索账号/昵称/ID" @keyup.enter="loadUsers" />
        <button class="btn btn-gold" @click="loadUsers">🔍 搜索</button>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>玩家</th><th>金币</th><th>钻石</th><th>等级</th><th>战绩</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td><span class="avatar" style="width:30px;height:30px;font-size:15px;">{{ u.avatar || '😀' }}</span> {{ u.nickname }}<br><small class="muted">{{ u.username }}</small></td>
              <td class="gold">{{ num(u.coins) }}</td>
              <td style="color:#8fd8ff">{{ num(u.diamonds) }}</td>
              <td>Lv.{{ u.level }}</td>
              <td class="muted">{{ u.wins }}/{{ u.games }}</td>
              <td><span class="badge" :class="u.status === 'banned' ? 'badge-red' : 'badge-green'">{{ u.status === 'banned' ? '已封禁' : '正常' }}</span></td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm" :class="u.status === 'banned' ? 'btn-green' : 'btn-danger'" @click="setStatus(u)">{{ u.status === 'banned' ? '解封' : '封禁' }}</button>
                  <input v-model="grantState[u.id].coins" type="number" class="mini-input" placeholder="金币" />
                  <input v-model="grantState[u.id].diamonds" type="number" class="mini-input" placeholder="钻石" />
                  <button class="btn btn-gold btn-sm" @click="grant(u)">发放</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination" v-if="userTotal > 20">
        <button class="btn btn-ghost btn-sm" :disabled="userPage <= 1" @click="userPage--;loadUsers()">上一页</button>
        <span>第 {{ userPage }} / {{ Math.ceil(userTotal / 20) }} 页 · 共 {{ userTotal }} 人</span>
        <button class="btn btn-ghost btn-sm" :disabled="userPage >= Math.ceil(userTotal / 20)" @click="userPage++;loadUsers()">下一页</button>
      </div>
    </div>

    <!-- 公告管理 -->
    <div v-else-if="tab === 'ann'" class="admin-split">
      <div class="card panel">
        <h3 class="section-title">发布公告</h3>
        <div class="field"><label>标题</label><input v-model="annForm.title" class="input" placeholder="公告标题" /></div>
        <div class="field"><label>内容</label><textarea v-model="annForm.content" class="textarea" placeholder="公告内容"></textarea></div>
        <label class="check"><input type="checkbox" v-model="annForm.pinned" /> 置顶公告</label>
        <button class="btn btn-gold btn-block mt-12" @click="addAnn">📢 发布</button>
      </div>
      <div class="card panel">
        <h3 class="section-title">公告列表 ({{ anns.length }})</h3>
        <div v-for="a in anns" :key="a.id" class="list-row">
          <div><b>{{ a.pinned ? '📌 ' : '' }}{{ a.title }}</b><p class="muted small">{{ a.content }}</p></div>
          <button class="btn btn-danger btn-sm" @click="delAnn(a.id)">删除</button>
        </div>
        <div v-if="!anns.length" class="muted tcenter" style="padding:20px">暂无公告</div>
      </div>
    </div>

    <!-- 全员邮件 -->
    <div v-else-if="tab === 'broadcast'" class="card panel" style="max-width:600px">
      <h3 class="section-title">✉️ 发送全员邮件</h3>
      <div class="field"><label>邮件标题</label><input v-model="broadcastForm.title" class="input" placeholder="例如：节日礼包" /></div>
      <div class="field"><label>邮件内容</label><textarea v-model="broadcastForm.content" class="textarea" placeholder="写给所有玩家的话"></textarea></div>
      <div class="grid grid-2">
        <div class="field"><label>奖励金币</label><input v-model.number="broadcastForm.coins" type="number" class="input" min="0" /></div>
        <div class="field"><label>奖励钻石</label><input v-model.number="broadcastForm.diamonds" type="number" class="input" min="0" /></div>
      </div>
      <button class="btn btn-gold btn-lg btn-block" @click="broadcast">🚀 发送给全体玩家</button>
    </div>

    <!-- 金币流水 -->
    <div v-else-if="tab === 'coinlogs'" class="card panel">
      <h3 class="section-title">🪙 金币流水 (最近 {{ coinlogs.length }} 条)</h3>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>时间</th><th>用户ID</th><th>变动</th><th>原因</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in coinlogs" :key="i">
              <td class="muted">{{ fmt(l.at) }}</td>
              <td class="muted">{{ l.userId }}</td>
              <td :class="l.delta >= 0 ? 'green' : 'red'"><b>{{ l.delta >= 0 ? '+' : '' }}{{ l.delta }}</b></td>
              <td>{{ l.reason || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!coinlogs.length" class="muted tcenter" style="padding:20px">暂无流水</div>
    </div>

    <!-- 近期对局 -->
    <div v-else-if="tab === 'games'" class="card panel">
      <h3 class="section-title">🎮 近期对局 (最近 {{ games.length }} 场)</h3>
      <div class="game-list">
        <div v-for="g in games" :key="g.id" class="list-row">
          <div>
            <b>房间 {{ g.roomId }}</b>
            <span class="badge badge-gray">×{{ g.multiplier }}</span>
            <span v-if="g.spring" class="badge">{{ g.spring }}</span>
            <p class="muted small">{{ g.landlordWin ? '地主胜' : '农民胜' }} · 底分 {{ g.baseScore }} · {{ fmt(g.at) }}</p>
          </div>
          <div class="game-players">
            <span v-for="p in g.players" :key="p.seat" :class="p.win ? 'green' : 'muted'">{{ p.name }} {{ p.isLandlord ? '👑' : '' }} ({{ p.delta >= 0 ? '+' : '' }}{{ p.delta }})</span>
          </div>
        </div>
        <div v-if="!games.length" class="muted tcenter" style="padding:20px">暂无对局</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1180px; margin: 0 auto; }
.page-head { margin-bottom: 16px; }
.admin-tabs { display: flex; gap: 4px; padding: 8px; margin-bottom: 18px; overflow-x: auto; }
.admin-tabs button { padding: 9px 16px; border: none; border-radius: 8px; background: transparent; color: var(--ink-soft); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.admin-tabs button.active { background: linear-gradient(135deg, var(--gold-400), var(--gold-600)); color: #3a2a06; }
.panel { padding: 18px; }
.dash-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.dash-card { padding: 20px; text-align: center; }
.dash-icon { font-size: 32px; }
.dash-value { font-size: 26px; font-weight: 900; margin: 6px 0; }
.dash-label { font-size: 12px; }
.search-box { display: flex; gap: 8px; margin-bottom: 14px; max-width: 400px; }
.table-scroll { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
.data-table th { text-align: left; padding: 10px; color: var(--ink-mute); border-bottom: 1px solid var(--line-strong); }
.data-table td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,.05); }
.data-table tr:hover td { background: rgba(238,203,106,.04); }
.row-actions { display: flex; gap: 5px; align-items: center; }
.mini-input { width: 62px; padding: 6px; border-radius: 6px; background: rgba(30, 122, 224, 0.05); border: 1px solid var(--line); color: var(--ink); font-size: 11px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 16px; font-size: 13px; color: var(--ink-soft); }
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-soft); margin-bottom: 12px; }
.admin-split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.list-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; background: rgba(30, 122, 224, 0.05); margin-bottom: 8px; }
.list-row > div:first-child { flex: 1; min-width: 0; }
.list-row b { font-size: 13px; }
.small { font-size: 11px; margin: 4px 0 0; }
.game-players { display: flex; flex-direction: column; gap: 2px; font-size: 11px; text-align: right; }
@media (max-width: 900px) { .dash-grid { grid-template-columns: repeat(2, 1fr); } .admin-split { grid-template-columns: 1fr; } }
</style>
