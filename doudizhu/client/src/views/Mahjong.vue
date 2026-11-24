<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { room as roomApi } from '../api'
import { getSocket } from '../socket'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const roomId = computed(() => route.query.roomId || '')
const state = ref(null)
const error = ref('')
const messages = ref([])
const chatText = ref('')
const selectedTile = ref(null)
const showResult = ref(false)
const mySeat = computed(() => state.value?.selfSeat ?? -1)
const me = computed(() => state.value?.players?.[mySeat.value] || null)

const quickPhrases = ['快点出牌~', '胡牌啦！', '碰一个', '杠！', 'good game']

const isMyTurn = computed(() => state.value?.current === mySeat.value && isPlaying.value)
const isPlaying = computed(() => state.value?.state === 'playing')
const isClaim = computed(() => state.value?.state === 'claim')
const myPending = computed(() => state.value?.pendingClaims?.find((c) => c.seat === mySeat.value) || null)

const stateLabel = computed(() => ({
  waiting: '等待开始', playing: '对局中', claim: '响应阶段', finished: '已结束',
}[state.value?.state] || ''))

function socket() { return getSocket() }

function emit(type, data = {}) {
  const s = socket()
  if (s) s.emit('game:action', { type, data })
}

function tileLabel(t) { return t?.label || '' }

function sortHand(hand) {
  return hand ? [...hand].sort((a, b) => (a.weight || 0) - (b.weight || 0)) : []
}

function selectTile(tile) {
  if (!isMyTurn.value) return
  selectedTile.value = selectedTile.value?.id === tile.id ? null : tile
}

function doDiscard() {
  if (!selectedTile.value) { error.value = '请先点选一张牌'; return }
  emit('discard', { tileId: selectedTile.value.id })
  selectedTile.value = null
}

function doDraw() { emit('draw') }
function doSelfWin() { emit('selfwin') }
function doClaim(type) { emit('claim', { claimType: type }) }
function doPassAll() { emit('passall') }
function doKong(key) { emit('kong', { key }) }

function sendChat() {
  const text = chatText.value.trim()
  if (!text) return
  const s = socket()
  if (s) s.emit('chat:room', { text })
  chatText.value = ''
}

function startGame() {
  const s = socket()
  if (s) s.emit('game:start')
}

function trustToggle() {
  if (!me.value) return
  const s = socket()
  if (s) s.emit('game:trust', { value: !me.value.trust })
}

function backLobby() { router.push('/lobby') }
function again() { showResult.value = false; startGame() }

function bindSocket() {
  const s = socket()
  if (!s) { error.value = '网络未连接，请刷新页面重试'; return }
  s.emit('room:join', { roomId: roomId.value })
  s.on('game:state', (data) => {
    state.value = data
    if (data.state === 'finished') showResult.value = true
  })
  s.on('game:system', (p) => pushMessage(`[系统] ${p.text}`))
  s.on('game:error', (p) => { error.value = p.message || '操作失败'; setTimeout(() => { error.value = '' }, 2500) })
  s.on('game:finish', (result) => { showResult.value = true; pushMessage(result.draw ? '荒庄流局' : `胡牌！${(result.patterns || []).join('、')}`) })
  s.on('chat:room', (m) => pushMessage(`${m.from}: ${m.text}`))
  s.on('user:updated', (u) => userStore.setProfile?.({ ...(userStore.profile || {}), ...u }))
}

function pushMessage(text) {
  messages.value.push({ text, at: Date.now() })
  if (messages.value.length > 100) messages.value.shift()
}

function unbindSocket() {
  const s = socket()
  if (!s) return
  s.off('game:state'); s.off('game:system'); s.off('game:error')
  s.off('game:finish'); s.off('chat:room'); s.off('user:updated')
  if (roomId.value) s.emit('room:leave')
}

onMounted(async () => {
  if (!roomId.value) { error.value = '缺少房间号'; return }
  try { await roomApi.detail(roomId.value) } catch (e) { error.value = e.message }
  bindSocket()
})
onUnmounted(unbindSocket)
watch(() => route.query.roomId, () => { unbindSocket(); bindSocket() })

const resultTitle = computed(() => {
  const r = state.value?.result
  if (!r) return ''
  if (r.draw) return '荒庄流局'
  return r.winner === mySeat.value ? '🎉 恭喜胡牌！' : `💥 ${state.value.players[r.winner]?.name || '对手'} 胡牌`
})
const myDelta = computed(() => state.value?.result?.deltas?.[mySeat.value] || 0)
</script>

<template>
  <div class="mj-table">
    <div v-if="error" class="mj-toast error">{{ error }}</div>

    <div class="mj-topbar">
      <button class="btn ghost" @click="backLobby">← 返回大厅</button>
      <div class="mj-title">🀄 内蒙麻将 <span class="room-tag">房间 {{ roomId }}</span></div>
      <div class="mj-info">
        <span>底分 <b>{{ state?.baseScore || '-' }}</b></span>
        <span>余牌 <b>{{ state?.wallCount ?? '-' }}</b></span>
        <span class="status-tag">{{ stateLabel }}</span>
      </div>
    </div>

    <div class="mj-stage">
      <!-- 对手区 -->
      <div class="mj-opponents">
        <div v-for="p in (state?.players || []).filter(x => x.seat !== mySeat)" :key="p.seat"
             class="mj-opponent" :class="{ active: state?.current === p.seat }">
          <div class="mj-avatar">{{ (p.name || '玩')[0] }}</div>
          <div class="mj-op-info">
            <div class="mj-op-name">
              {{ p.name }}
              <span v-if="p.isDealer" class="dealer-badge">庄</span>
              <span v-if="p.trust" class="trust-badge">托管</span>
              <span v-if="!p.connected" class="offline-badge">离线</span>
            </div>
            <div class="mj-op-meta">手牌 {{ p.handCount }} 张</div>
            <div class="mj-melds">
              <span v-for="(m, i) in p.melds" :key="i" class="meld-chip">
                {{ m.type === 'kong' ? '杠' : '碰' }}·{{ (m.key || '').toUpperCase() }}
              </span>
            </div>
          </div>
          <div class="mj-op-discards">
            <span v-for="(t, i) in (p.discarded || []).slice(-8)" :key="i" class="mini-tile">{{ t.label }}</span>
          </div>
        </div>
      </div>

      <!-- 中央牌河/弃牌区 -->
      <div class="mj-center">
        <div class="mj-wall-info">🀄 牌墙剩余 {{ state?.wallCount ?? '-' }} 张</div>
        <div v-if="state?.lastDiscard" class="last-discard">
          <div class="last-discard-label">{{ state.players[state.lastDiscard.seat]?.name }} 打出</div>
          <div class="big-tile discard">{{ state.lastDiscard.label }}</div>
        </div>
        <div v-else class="last-discard empty">等待出牌…</div>
      </div>

      <!-- 响应操作 -->
      <div v-if="isClaim && myPending" class="claim-actions">
        <div class="claim-hint">你可以响应：</div>
        <button v-if="myPending.options.win" class="btn danger big" @click="doClaim('win')">🎉 胡</button>
        <button v-if="myPending.options.kong" class="btn primary big" @click="doClaim('kong')">杠</button>
        <button v-if="myPending.options.pung" class="btn primary big" @click="doClaim('pung')">碰</button>
        <button class="btn ghost big" @click="doClaim('pass') === undefined && doPassAll()">过</button>
      </div>

      <div v-if="isPlaying && isMyTurn" class="claim-actions">
        <button class="btn success big" @click="doDraw">摸牌</button>
        <button v-if="me && me.handCount + me.melds.length * 3 === 14" class="btn danger big" @click="doSelfWin">🎉 自摸胡</button>
      </div>

      <!-- 我的暗杠提示 -->
      <div v-if="isPlaying && isMyTurn && me" class="my-kongs">
        <button v-for="k in concealedKongKeys" :key="k" class="btn small" @click="doKong(k)">暗杠 {{ k.toUpperCase() }}</button>
      </div>
    </div>

    <!-- 我的手牌区 -->
    <div class="mj-hand-area">
      <div class="mj-my-info">
        <div class="mj-avatar me">{{ (me?.name || '我')[0] }}</div>
        <div>
          <div class="mj-my-name">{{ me?.name || '我' }} <span v-if="me?.isDealer" class="dealer-badge">庄</span></div>
          <div class="mj-ting" v-if="me?.ting?.length">👂 听: {{ me.ting.map(t => labelOfKey(t)).join(' ') }}</div>
        </div>
        <button class="btn ghost small" @click="trustToggle">{{ me?.trust ? '解除托管' : '托管' }}</button>
      </div>
      <div class="mj-hand">
        <button v-for="t in sortHand(me?.hand)" :key="t.id"
                class="mj-tile" :class="{ selected: selectedTile?.id === t.id, red: ['zhong','fa'].includes(t.suit) }"
                @click="selectTile(t)">
          <span class="tile-face">{{ tileLabel(t) }}</span>
        </button>
      </div>
      <div class="mj-hand-actions">
        <button class="btn primary" :disabled="!selectedTile || !isMyTurn" @click="doDiscard">打出选中</button>
        <span class="turn-hint">{{ isMyTurn ? '轮到你了' : '等待他人出牌' }}</span>
      </div>
    </div>

    <!-- 聊天 -->
    <div class="mj-chat">
      <div class="chat-list">
        <div v-for="(m, i) in messages" :key="i" class="chat-line">{{ m.text }}</div>
      </div>
      <div class="chat-input">
        <button v-for="q in quickPhrases" :key="q" class="quick-phrase" @click="chatText = q">{{ q }}</button>
        <input v-model="chatText" placeholder="输入聊天内容…" @keyup.enter="sendChat" />
        <button class="btn small" @click="sendChat">发送</button>
      </div>
    </div>

    <!-- 开局提示 -->
    <div v-if="state?.state === 'waiting'" class="overlay">
      <div class="overlay-card">
        <h2>🀄 房间已就绪</h2>
        <p>玩家 {{ state.players.length }}/4 · {{ state.players.map(p => p.name).join('、') }}</p>
        <p class="hint">房主点击开始，AI 会自动补位</p>
        <button v-if="state.players[mySeat]?.id === state.players[0]?.id || isOwner" class="btn primary big" @click="startGame">开始游戏</button>
        <button v-else class="btn ghost big" disabled>等待房主开始…</button>
      </div>
    </div>

    <!-- 结算 -->
    <div v-if="showResult && state?.result" class="overlay">
      <div class="overlay-card result-card">
        <h2>{{ resultTitle }}</h2>
        <div class="result-patterns">{{ (state.result.patterns || []).join(' · ') || '屁胡' }}</div>
        <div class="result-delta" :class="myDelta >= 0 ? 'positive' : 'negative'">
          {{ myDelta >= 0 ? '+' : '' }}{{ myDelta }} 金币
        </div>
        <div class="result-detail" v-for="p in state.players" :key="p.seat">
          {{ p.name }}: {{ state.result.deltas[p.seat] >= 0 ? '+' : '' }}{{ state.result.deltas[p.seat] }}
        </div>
        <div class="result-actions">
          <button class="btn primary" @click="again">再来一局</button>
          <button class="btn ghost" @click="backLobby">返回大厅</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  computed: {
    isOwner() {
      const s = this.state
      const meSeatP = s?.players?.[this.mySeat]
      return !!(meSeatP && s?.players?.[0] && meSeatP.id === s.players[0].id)
    },
    concealedKongKeys() {
      const meP = this.me
      if (!meP?.hand) return []
      const counts = {}
      meP.hand.forEach(t => {
        const k = t.suit === 'wan' ? 'w' + t.rank : t.suit === 'tong' ? 't' + t.rank : t.suit === 'tiao' ? 's' + t.rank : ({zhong:'z1',fa:'z2',bai:'z3'}[t.suit])
        if (k) counts[k] = (counts[k] || 0) + 1
      })
      return Object.entries(counts).filter(([, c]) => c === 4).map(([k]) => k)
    },
  },
  methods: {
    labelOfKey(key) {
      const n = Number(key.slice(1))
      const map = { w: '萬', t: '筒', s: '條' }
      if (map[key[0]]) return n + map[key[0]]
      return ['', '中', '发', '白'][n] || key
    },
  },
}
</script>

<style scoped>
.mj-table { min-height: 100vh; background: radial-gradient(circle at 50% 30%, #1f6b4f, #0d3b2a 70%); color: #fff; padding: 12px 16px 140px; position: relative; }
.mj-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 999; padding: 10px 20px; border-radius: 8px; font-weight: bold; }
.mj-toast.error { background: #c0392b; }
.mj-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.mj-title { font-size: 20px; font-weight: bold; color: #ffd76a; }
.room-tag { font-size: 12px; background: rgba(0,0,0,.3); padding: 3px 8px; border-radius: 6px; color: #ddd; }
.mj-info { display: flex; gap: 14px; font-size: 13px; }
.mj-info b { color: #ffd76a; }
.status-tag { background: rgba(255,255,255,.15); padding: 3px 10px; border-radius: 12px; }
.mj-stage { max-width: 1100px; margin: 0 auto; }
.mj-opponents { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.mj-opponent { display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,.25); border: 2px solid transparent; border-radius: 12px; padding: 10px 14px; min-width: 220px; }
.mj-opponent.active { border-color: #ffd76a; box-shadow: 0 0 16px rgba(255,215,106,.5); }
.mj-avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg,#ffd76a,#f39c12); color: #4a2f00; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; flex-shrink: 0; }
.mj-avatar.me { background: linear-gradient(135deg,#74b9ff,#0984e3); color: #fff; }
.mj-op-info { flex: 1; }
.mj-op-name { font-weight: bold; font-size: 14px; }
.mj-op-meta { font-size: 12px; color: #b9e6d0; }
.dealer-badge { background: #e74c3c; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
.trust-badge, .offline-badge { background: #7f8c8d; font-size: 10px; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
.mj-melds { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.meld-chip { font-size: 10px; background: rgba(255,255,255,.2); padding: 1px 5px; border-radius: 4px; }
.mj-op-discards { display: flex; flex-wrap: wrap; gap: 2px; max-width: 120px; }
.mini-tile { font-size: 9px; background: #eee; color: #222; padding: 1px 3px; border-radius: 2px; }
.mj-center { text-align: center; padding: 16px; }
.mj-wall-info { color: #b9e6d0; font-size: 13px; margin-bottom: 12px; }
.last-discard { margin-top: 8px; }
.last-discard.empty { color: #88bfa5; font-size: 13px; }
.last-discard-label { font-size: 12px; color: #ffd76a; margin-bottom: 6px; }
.big-tile { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 78px; background: #f7f3e8; color: #1a1a1a; border-radius: 8px; font-size: 20px; font-weight: bold; box-shadow: 0 6px 14px rgba(0,0,0,.4); }
.big-tile.discard { border: 3px solid #ffd76a; }
.claim-actions { display: flex; gap: 10px; justify-content: center; align-items: center; margin: 12px 0; flex-wrap: wrap; }
.claim-hint { color: #ffd76a; font-weight: bold; }
.my-kongs { display: flex; gap: 6px; justify-content: center; margin-top: 8px; flex-wrap: wrap; }
.mj-hand-area { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,.45); padding: 8px 16px 12px; backdrop-filter: blur(6px); }
.mj-my-info { display: flex; align-items: center; gap: 10px; max-width: 1200px; margin: 0 auto 6px; }
.mj-my-name { font-weight: bold; }
.mj-ting { font-size: 12px; color: #ffd76a; }
.mj-hand { display: flex; gap: 3px; justify-content: center; flex-wrap: wrap; max-width: 1200px; margin: 0 auto; }
.mj-tile { width: 42px; height: 60px; border: none; border-radius: 6px; background: linear-gradient(#fffef8,#e8e2cf); color: #1a1a1a; font-weight: bold; cursor: pointer; transition: transform .12s; box-shadow: 0 3px 6px rgba(0,0,0,.3); padding: 0; }
.mj-tile:hover { transform: translateY(-4px); }
.mj-tile.selected { transform: translateY(-12px); box-shadow: 0 0 0 3px #ffd76a; }
.mj-tile.red { color: #c0392b; }
.tile-face { font-size: 14px; }
.mj-hand-actions { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 8px; }
.turn-hint { font-size: 12px; color: #b9e6d0; }
.mj-chat { position: fixed; right: 12px; top: 80px; width: 240px; background: rgba(0,0,0,.35); border-radius: 10px; padding: 8px; }
.chat-list { height: 180px; overflow-y: auto; font-size: 12px; line-height: 1.6; }
.chat-line { color: #d5f0e0; word-break: break-all; }
.chat-input { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.chat-input input { flex: 1; min-width: 100px; padding: 5px 8px; border-radius: 6px; border: none; font-size: 12px; }
.quick-phrase { font-size: 10px; background: rgba(255,255,255,.2); color: #fff; border: none; border-radius: 8px; padding: 2px 6px; cursor: pointer; }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 500; }
.overlay-card { background: #123d2c; border: 2px solid #ffd76a; border-radius: 16px; padding: 28px 36px; text-align: center; max-width: 420px; }
.overlay-card h2 { color: #ffd76a; margin-top: 0; }
.hint { color: #b9e6d0; font-size: 13px; }
.result-patterns { font-size: 18px; color: #fff; margin: 10px 0; }
.result-delta { font-size: 30px; font-weight: bold; margin: 10px 0; }
.result-delta.positive { color: #2ecc71; }
.result-delta.negative { color: #e74c3c; }
.result-detail { font-size: 13px; color: #d5f0e0; }
.result-actions { display: flex; gap: 12px; justify-content: center; margin-top: 18px; }

.btn { padding: 8px 16px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn.primary { background: linear-gradient(135deg,#ffd76a,#f39c12); color: #4a2f00; }
.btn.success { background: #27ae60; color: #fff; }
.btn.danger { background: #e74c3c; color: #fff; }
.btn.ghost { background: rgba(255,255,255,.18); color: #fff; }
.btn.big { padding: 12px 24px; font-size: 16px; }
.btn.small { padding: 5px 10px; font-size: 11px; }
</style>
