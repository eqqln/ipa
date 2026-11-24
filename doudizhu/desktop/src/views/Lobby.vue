<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { room as roomApi, user as userApi, announcements as annApi } from '@/api'

const emit = defineEmits(['toast'])
const router = useRouter()
const store = useUserStore()

const rooms = ref([])
const anns = ref([])
const loading = ref(false)
const signedToday = ref(false)

const mode = ref('ai')
const baseScore = ref(10)
const baseScores = [10, 50, 100, 500]

// 当前游戏：doudizhu / mahjong
const activeGame = ref('doudizhu')
const mjOptions = ref({ allowSevenPairs: true, allowPiao: true })
const showCreate = ref(false)
const createForm = ref({ name: '', mode: 'human', baseScore: 10, password: '' })

const isMahjong = computed(() => activeGame.value === 'mahjong')
function gameRoute() { return isMahjong.value ? 'mahjong' : 'game' }
function switchGame(g) {
  activeGame.value = g
  loadRooms()
}

const quickEntries = [
  { name: '排行榜', icon: '🏆', route: 'rank', color: '#eecb6a' },
  { name: '商城', icon: '🛒', route: 'shop', color: '#7fd8ff' },
  { name: '每日任务', icon: '📜', route: 'task', color: '#a5e887' },
  { name: '我的邮件', icon: '📮', route: 'mail', color: '#ff9d97' },
  { name: '好友', icon: '👥', route: 'friend', color: '#c9a7ff' },
  { name: '战绩', icon: '📊', route: 'record', color: '#ffd08a' },
]

const levelInfo = computed(() => store.profile?.levelInfo || null)
const winRate = computed(() => {
  const p = store.profile
  if (!p?.games) return 0
  return Math.round((p.wins / p.games) * 100)
})

async function loadRooms() {
  try {
    rooms.value = await roomApi.list(activeGame.value)
  } catch (e) { emit('toast', e.message, 'error') }
}

async function loadAnns() {
  try {
    anns.value = await annApi()
  } catch (e) { /* 公告非关键，静默 */ }
}

async function signin() {
  try {
    const r = await userApi.signin()
    store.refreshCoins({ coins: (store.coins || 0) + (r?.coins || 0), diamonds: (store.diamonds || 0) + (r?.diamonds || 0) })
    signedToday.value = true
    emit('toast', `签到成功！+${r?.coins || 0} 金币${r?.diamonds ? ` +${r.diamonds} 钻石` : ''}`, 'success')
    store.fetchProfile().catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}

async function bankruptcy() {
  try {
    const r = await userApi.bankruptcy()
    store.refreshCoins({ coins: (store.coins || 0) + (r?.coins || 0) })
    emit('toast', `破产补助 +${r?.coins || 0} 金币`, 'success')
    store.fetchProfile().catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}

async function quickMatch() {
  loading.value = true
  try {
    const payload = { mode: mode.value, baseScore: baseScore.value, game: activeGame.value }
    if (isMahjong.value) Object.assign(payload, mjOptions.value)
    const data = await roomApi.quick(payload)
    const hint = mode.value === 'ai'
      ? (data?.matched ? '已进入人机房间，正在开局…' : '人机房间已创建，正在开局…')
      : (data?.matched ? '匹配到房间，正在进入…' : '已创建房间，等待对手…')
    emit('toast', hint, 'success')
    router.push({ name: gameRoute(), query: { roomId: data.room.id } })
  } catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}

async function joinRoom(r) {
  try {
    if (r.hasPassword) {
      const pwd = window.prompt('该房间需要密码')
      if (!pwd) return
      await roomApi.join(r.id, pwd)
    } else {
      await roomApi.join(r.id)
    }
    router.push({ name: (r.game === 'mahjong' ? 'mahjong' : 'game'), query: { roomId: r.id } })
  } catch (e) { emit('toast', e.message, 'error') }
}

async function createRoom() {
  try {
    const payload = { ...createForm.value, game: activeGame.value }
    if (isMahjong.value) Object.assign(payload, mjOptions.value)
    const data = await roomApi.create(payload)
    showCreate.value = false
    emit('toast', '房间创建成功', 'success')
    router.push({ name: gameRoute(), query: { roomId: data.id } })
  } catch (e) { emit('toast', e.message, 'error') }
}

onMounted(() => {
  loadRooms()
  loadAnns()
  store.fetchProfile().catch(() => {})
  store.fetchStats().catch(() => {})
})
</script>

<template>
  <div class="lobby">
    <!-- 用户信息卡 -->
    <div class="card user-card">
      <div class="user-main">
        <div class="avatar big">{{ store.user?.avatar || '😎' }}</div>
        <div class="user-meta">
          <div class="user-name">{{ store.nickname }} <span class="badge badge-green">Lv.{{ store.level }}</span></div>
          <div class="user-desc soft">牌桌新人 · 快乐斗地主</div>
          <div class="exp-bar" v-if="levelInfo">
            <div class="progress"><i :style="{ width: (levelInfo.currentExp / levelInfo.nextExp * 100) + '%' }"></i></div>
            <span class="muted">经验 {{ levelInfo.currentExp }}/{{ levelInfo.nextExp }}</span>
          </div>
        </div>
      </div>
      <div class="user-stats">
        <div class="stat"><span class="stat-num">{{ store.coins.toLocaleString() }}</span><span class="stat-label">🪙 金币</span></div>
        <div class="stat"><span class="stat-num diamond">{{ store.diamonds.toLocaleString() }}</span><span class="stat-label">💎 钻石</span></div>
        <div class="stat"><span class="stat-num">{{ store.stats?.games || 0 }}</span><span class="stat-label">🎮 对局</span></div>
        <div class="stat"><span class="stat-num">{{ winRate }}%</span><span class="stat-label">🏅 胜率</span></div>
      </div>
      <div class="user-actions">
        <button class="btn btn-gold" @click="signin" :disabled="signedToday">📅 {{ signedToday ? '已签到' : '每日签到' }}</button>
        <button class="btn btn-ghost" @click="bankruptcy">🆘 破产补助</button>
      </div>
    </div>

    <div class="lobby-grid">
      <!-- 快速匹配 -->
      <div class="card section">
        <h3 class="section-title">⚡ 快速匹配</h3>
        <!-- 游戏切换 -->
        <div class="seg game-tabs">
          <button :class="{ active: activeGame === 'doudizhu' }" @click="switchGame('doudizhu')">🃏 斗地主</button>
          <button :class="{ active: activeGame === 'mahjong' }" @click="switchGame('mahjong')">🀄 内蒙麻将</button>
        </div>
        <div v-if="isMahjong" class="mj-rule-box">
          <label class="check-line"><input type="checkbox" v-model="mjOptions.allowSevenPairs" /> 允许七对胡牌</label>
          <label class="check-line"><input type="checkbox" v-model="mjOptions.allowPiao" /> 飘胡计分</label>
          <div class="mj-hint">4 人局 · 只碰不吃 · 支持明杠/暗杠/碰碰胡</div>
        </div>
        <div class="field">
          <label>对战模式</label>
          <div class="seg">
            <button :class="{ active: mode === 'ai' }" @click="mode = 'ai'">🤖 人机对战</button>
            <button :class="{ active: mode === 'human' }" @click="mode = 'human'">👥 真人对战</button>
          </div>
        </div>
        <div class="field">
          <label>底分选择</label>
          <div class="seg scores">
            <button v-for="s in baseScores" :key="s" :class="{ active: baseScore === s }" @click="baseScore = s">{{ s }}</button>
          </div>
        </div>
        <button class="btn btn-gold btn-lg btn-block match-btn" @click="quickMatch" :disabled="loading">
          <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px;"></span>
          <span v-else>🎯 开始匹配</span>
        </button>
        <button class="btn btn-green btn-block mt-12" @click="showCreate = true">➕ 创建房间</button>
      </div>

      <!-- 房间列表 -->
      <div class="card section">
        <div class="flex-between">
          <h3 class="section-title">🏠 房间列表</h3>
          <button class="btn btn-ghost btn-sm" @click="loadRooms">🔄 刷新</button>
        </div>
        <div class="room-list">
          <div v-if="!rooms.length" class="empty"><span class="emoji">🫧</span>暂无房间，快来创建一个吧</div>
          <div v-for="r in rooms" :key="r.id" class="room-item">
            <div class="room-icon">{{ r.mode === 'ai' ? '🤖' : '👥' }}</div>
            <div class="room-info">
              <div class="room-name">{{ r.name }} <span v-if="r.hasPassword" class="badge badge-gray">🔒 密码</span></div>
              <div class="room-sub muted">房主 {{ r.ownerName }} · 底分 {{ r.baseScore }} · 编号 {{ r.id }}</div>
            </div>
            <div class="room-right">
              <span class="badge badge-green">{{ r.playerCount }}/{{ r.maxPlayers }}</span>
              <button class="btn btn-gold btn-sm" @click="joinRoom(r)">加入</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 公告 -->
      <div class="card section">
        <h3 class="section-title">📢 系统公告</h3>
        <div class="ann-list">
          <div v-for="a in anns" :key="a.id" class="ann-item">
            <span class="ann-pin" v-if="a.pinned">📌</span>
            <div>
              <div class="ann-title">{{ a.title }}</div>
              <div class="ann-content soft">{{ a.content }}</div>
            </div>
          </div>
          <div v-if="!anns.length" class="muted">暂无公告</div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="card section">
        <h3 class="section-title">🚀 快捷入口</h3>
        <div class="quick-grid">
          <button v-for="q in quickEntries" :key="q.name" class="quick-item" @click="router.push({ name: q.route })">
            <span class="quick-icon" :style="{ color: q.color }">{{ q.icon }}</span>
            <span>{{ q.name }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 创建房间弹窗 -->
    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3 class="section-title">➕ 创建房间</h3>
        <div class="field">
          <label>房间名称</label>
          <input v-model="createForm.name" class="input" placeholder="默认：我的房间" />
        </div>
        <div class="field">
          <label>模式</label>
          <div class="seg">
            <button :class="{ active: createForm.mode === 'ai' }" @click="createForm.mode = 'ai'">🤖 人机</button>
            <button :class="{ active: createForm.mode === 'human' }" @click="createForm.mode = 'human'">👥 真人</button>
          </div>
        </div>
        <div class="field">
          <label>底分</label>
          <div class="seg scores">
            <button v-for="s in baseScores" :key="s" :class="{ active: createForm.baseScore === s }" @click="createForm.baseScore = s">{{ s }}</button>
          </div>
        </div>
        <div class="field">
          <label>密码（可选）</label>
          <input v-model="createForm.password" class="input" placeholder="留空则不设密码" />
        </div>
        <div class="flex gap-12 mt-20">
          <button class="btn btn-ghost flex-1" @click="showCreate = false">取消</button>
          <button class="btn btn-gold flex-1" @click="createRoom">创建并进入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lobby { display: flex; flex-direction: column; gap: 18px; }
.user-card {
  display: grid;
  grid-template-columns: 1.4fr 2fr auto;
  gap: 24px; align-items: center;
  padding: 20px 24px;
  background: linear-gradient(120deg, var(--brand-100), #ffffff);
}
.user-main { display: flex; align-items: center; gap: 14px; }
.avatar.big { width: 64px; height: 64px; font-size: 32px; }
.user-name { font-size: 19px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
.user-desc { font-size: 12px; margin: 3px 0 6px; }
.exp-bar { display: flex; align-items: center; gap: 8px; }
.exp-bar .progress { width: 130px; }
.exp-bar span { font-size: 11px; }
.user-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.stat { text-align: center; padding: 10px 6px; border-radius: 10px; background: rgba(30, 122, 224, 0.05); }
.stat-num { display: block; font-size: 20px; font-weight: 900; color: var(--gold-300); }
.stat-num.diamond { color: #8fd8ff; }
.stat-label { font-size: 11px; color: var(--ink-mute); }
.user-actions { display: flex; flex-direction: column; gap: 8px; }

.lobby-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.section { padding: 20px; }
.seg { display: flex; gap: 6px; background: rgba(30, 122, 224, 0.05); padding: 5px; border-radius: 10px; }
.seg button {
  flex: 1; padding: 9px; border: none; border-radius: 7px;
  background: transparent; color: var(--ink-soft);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all .18s;
}
.seg button.active { background: linear-gradient(135deg, var(--green-400), var(--green-600)); color: #fff; box-shadow: 0 4px 12px rgba(26,168,120,.28); }
.seg.scores button.active { background: linear-gradient(135deg, var(--brand-400), var(--brand-600)); color: #fff; box-shadow: 0 4px 12px rgba(30,122,224,.28); }
.game-tabs { margin-bottom: 12px; }
.game-tabs button { font-size: 15px; font-weight: 700; }
.mj-rule-box { background: rgba(30, 122, 224, 0.05); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
.check-line { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; cursor: pointer; }
.check-line input { accent-color: var(--gold-400); width: 15px; height: 15px; }
.mj-hint { font-size: 11px; color: var(--muted); margin-top: 6px; }
.match-btn { margin-top: 6px; }

.room-list, .ann-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.room-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(30, 122, 224, 0.05); border: 1px solid var(--line);
}
.room-icon { font-size: 24px; }
.room-info { flex: 1; min-width: 0; }
.room-name { font-weight: 700; font-size: 14px; }
.room-sub { font-size: 11px; margin-top: 2px; }
.room-right { display: flex; align-items: center; gap: 8px; }
.ann-item { display: flex; gap: 8px; padding: 9px 12px; border-radius: 10px; background: rgba(30, 122, 224, 0.05); }
.ann-pin { font-size: 14px; }
.ann-title { font-weight: 700; font-size: 13px; color: var(--gold-300); }
.ann-content { font-size: 12px; margin-top: 2px; line-height: 1.5; }

.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.quick-item {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 8px; border-radius: 12px; cursor: pointer;
  background: rgba(30, 122, 224, 0.05); border: 1px solid var(--line);
  color: var(--ink); font-size: 12px; font-weight: 600;
  transition: all .18s;
}
.quick-item:hover { transform: translateY(-3px); border-color: var(--line-strong); box-shadow: var(--glow); }
.quick-icon { font-size: 28px; }
.flex-1 { flex: 1; }

@media (max-width: 900px) {
  .user-card { grid-template-columns: 1fr; }
  .user-actions { flex-direction: row; }
  .user-actions .btn { flex: 1; }
  .lobby-grid { grid-template-columns: 1fr; }
}
</style>
