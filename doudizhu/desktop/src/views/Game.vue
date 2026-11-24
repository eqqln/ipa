<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getSocket, connect } from '@/socket'
import { room as roomApi } from '@/api'

const emit = defineEmits(['toast'])
const router = useRouter()
const route = useRoute()
const store = useUserStore()

const roomId = String(route.query.roomId || '')
const ownerId = ref('')
const state = ref(null)
const systemMessages = ref([])
const chatMessages = ref([])
const chatText = ref('')
const showResult = ref(false)
const connecting = ref(true)
const selected = reactive(new Set())
const hintIndex = ref(0)
const candidates = ref([])
const quickPhrases = ['你好，请多指教~', '打得漂亮！', '快点出牌啦', '一路顺风~', '再来一局！']

const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦', J: '' }
const RANK_LABEL = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王' }

function parseCard(id) {
  if (!id || id === '?') return { id, face: '?', mark: '', rank: 0, color: 'back' }
  const [r, suit = ''] = String(id).split('-')
  const rank = Number(r)
  const red = suit === 'H' || suit === 'D' || rank === 17
  return {
    id,
    rank,
    suit,
    mark: SUIT_SYMBOL[suit] || '',
    face: RANK_LABEL[rank] || String(rank),
    color: red ? 'red' : 'black',
  }
}

const phase = computed(() => state.value?.state || 'waiting')
const selfSeat = computed(() => state.value?.selfSeat ?? -1)
const players = computed(() => state.value?.players || [])
const selfPlayer = computed(() => players.value[selfSeat.value] || null)
const myHand = computed(() => (selfPlayer.value?.hand || []).map(parseCard))
const isMyTurn = computed(() => state.value?.current === selfSeat.value)
const bottomCards = computed(() => (state.value?.bottom || []).map(parseCard))
const lastPlay = computed(() => state.value?.lastPlay || null)
const lastCards = computed(() => (lastPlay.value?.cards || []).map(parseCard))
const canHintPlay = computed(() => phase.value === 'playing' && isMyTurn.value && !selfPlayer.value?.trust)

const phaseLabel = computed(() => ({
  waiting: '等待开始', bidding: '叫地主', grabbing: '抢地主',
  doubling: '加倍', playing: '出牌中', finished: '已结算',
}[phase.value] || ''))

function seatOf(idx) {
  // 将自己固定在下方，其余两家按相对位置分布在左/右
  if (selfSeat.value < 0) return ['left', 'right'][idx] || 'left'
  const diff = (idx - selfSeat.value + 3) % 3
  return diff === 0 ? 'self' : diff === 1 ? 'right' : 'left'
}

function orderedOpponents() {
  const others = players.value.filter((p) => p.seat !== selfSeat.value)
  const left = others.find((p) => seatOf(p.seat) === 'left')
  const right = others.find((p) => seatOf(p.seat) === 'right')
  return { left, right }
}

const leftPlayer = computed(() => orderedOpponents().left)
const rightPlayer = computed(() => orderedOpponents().right)

function effectiveLast() {
  // 自己刚出的牌不构成压制，视为自由出牌
  if (!lastPlay.value || lastPlay.value.seat === selfSeat.value) return null
  return lastPlay.value.pattern
}

function groupByRank(hand) {
  const map = new Map()
  for (const c of hand) {
    if (!map.has(c.rank)) map.set(c.rank, [])
    map.get(c.rank).push(c)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

/** 本地简化提示：构造一组可压过上家的候选牌 */
function buildCandidates(hand, pattern) {
  const groups = groupByRank(hand)
  const out = []
  const type = pattern?.type
  const weight = pattern?.weight || 0
  const count = pattern?.count || 0

  if (!type) {
    for (const [, cards] of groups) out.push(cards.map((c) => c.id))
    if (hand.length) out.push(hand.map((c) => c.id))
    return out
  }

  if (['single', 'pair', 'triple'].includes(type)) {
    const need = type === 'single' ? 1 : type === 'pair' ? 2 : 3
    for (const [rank, cards] of groups) {
      if (rank > weight && cards.length >= need) out.push(cards.slice(0, need).map((c) => c.id))
    }
  } else if (count > 0) {
    for (const [rank, cards] of groups) {
      if (rank > weight && cards.length >= count) out.push(cards.slice(0, count).map((c) => c.id))
    }
  }

  // 炸弹可压绝大多数牌型
  if (type !== 'rocket') {
    for (const [rank, cards] of groups) {
      if (cards.length === 4 && rank !== weight) out.push(cards.map((c) => c.id))
    }
    const jokers = hand.filter((c) => c.rank === 16 || c.rank === 17)
    if (jokers.length === 2) out.push(jokers.map((c) => c.id))
  } else if (type === 'bomb') {
    for (const [rank, cards] of groups) {
      if (cards.length === 4 && rank > weight) out.push(cards.map((c) => c.id))
    }
  }
  return out
}

function onHint() {
  if (!candidates.value.length) candidates.value = buildCandidates(myHand.value, effectiveLast())
  if (!candidates.value.length) {
    emit('toast', '没有能压过的牌，选择「不出」吧', 'error')
    return
  }
  const group = candidates.value[hintIndex.value % candidates.value.length]
  hintIndex.value++
  selected.clear()
  group.forEach((id) => selected.add(id))
}

function toggleCard(id) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}

function send(type, data = {}) {
  const socket = getSocket()
  if (!socket) return emit('toast', '连接未就绪，请稍候', 'error')
  socket.emit('game:action', { type, data })
}

function actBid(score) { send('bid', { score }); selected.clear() }
function actGrab(yes) { send('grab', { yes }); selected.clear() }
function actDouble(yes) { send('double', { yes }); selected.clear() }
function actPass() { send('pass'); selected.clear(); candidates.value = [] }
function actMing() { send('ming') }
function actPlay() {
  if (!selected.size) return emit('toast', '请先选择要出的牌', 'error')
  send('play', { ids: [...selected] })
  selected.clear()
  candidates.value = []
}
function toggleTrust() {
  const socket = getSocket()
  if (!socket) return
  socket.emit('game:trust', { value: !selfPlayer.value?.trust })
}
function sendChat() {
  const text = chatText.value.trim()
  if (!text) return
  const socket = getSocket()
  if (!socket) return
  socket.emit('chat:room', { text })
  chatText.value = ''
}
function startNext() {
  if (ownerId.value && ownerId.value !== store.user?.id) {
    return emit('toast', '只有房主可以开始下一局', 'error')
  }
  const socket = getSocket()
  if (!socket) return
  socket.emit('game:start')
  showResult.value = false
}

watch([() => state.value?.state, () => lastPlay.value?.at, () => lastPlay.value?.seat], () => {
  candidates.value = []
  hintIndex.value = 0
  selected.clear()
})

function onState(payload) {
  state.value = payload
  connecting.value = false
  if (payload?.state !== 'finished') showResult.value = false
}
function onSystem(msg) {
  systemMessages.value.push({ ...msg, at: Date.now() })
  if (systemMessages.value.length > 30) systemMessages.value.shift()
}
function onFinish(result) {
  state.value = { ...(state.value || {}), state: 'finished', result }
  showResult.value = true
  selected.clear()
  store.fetchProfile().catch(() => {})
  store.fetchStats().catch(() => {})
}
function onError(msg) { emit('toast', msg?.message || '操作失败', 'error') }
function onChat(msg) {
  chatMessages.value.push(msg)
  if (chatMessages.value.length > 60) chatMessages.value.shift()
}
function onStarted() {
  showResult.value = false
  systemMessages.value = []
}

let socketRef = null

onMounted(async () => {
  if (!roomId) {
    emit('toast', '缺少房间编号', 'error')
    return router.replace({ name: 'lobby' })
  }
  if (!getSocket()) connect(store.token)
  const socket = getSocket()
  socketRef = socket
  if (!socket) {
    emit('toast', '连接失败，请刷新重试', 'error')
    connecting.value = false
    return
  }

  socket.on('game:state', onState)
  socket.on('game:system', onSystem)
  socket.on('game:finish', onFinish)
  socket.on('game:error', onError)
  socket.on('chat:room', onChat)
  socket.on('game:started', onStarted)

  if (socket.connected) socket.emit('room:join', { roomId })
  else socket.once('connect', () => socket.emit('room:join', { roomId }))

  try {
    const info = await roomApi.detail(roomId)
    ownerId.value = info?.ownerId || ''
  } catch { /* 房主信息用于再来一局按钮，失败按房主处理 */ }

  setTimeout(() => { if (!state.value) connecting.value = false }, 5000)
})

onUnmounted(() => {
  const socket = socketRef || getSocket()
  if (socket) {
    socket.off('game:state', onState)
    socket.off('game:system', onSystem)
    socket.off('game:finish', onFinish)
    socket.off('game:error', onError)
    socket.off('chat:room', onChat)
    socket.off('game:started', onStarted)
    socket.emit('room:leave')
  }
})

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="game-page">
    <div class="game-topbar">
      <button class="btn btn-ghost btn-sm" @click="router.push('/lobby')">← 返回大厅</button>
      <div class="room-info">房间 <b>{{ roomId }}</b> · 底分 <b class="gold">{{ state?.baseScore || '-' }}</b> · 倍数 <b class="gold">×{{ state?.multiplier || 1 }}</b> · 炸弹 <b>{{ state?.bombCount || 0 }}</b></div>
      <div class="phase-badge">{{ phaseLabel }}</div>
    </div>

    <div class="game-layout">
      <div class="table-wrap">
        <div class="poker-table">
          <div v-if="connecting && !state" class="table-loading"><span class="spinner"></span><p>正在进入牌桌…</p></div>

          <!-- 左侧对手 -->
          <SeatPanel v-if="leftPlayer" :player="leftPlayer" :current="state?.current === leftPlayer.seat" :result="state?.result" />

          <!-- 中央 -->
          <div class="table-center">
            <div class="bottom-zone">
              <div class="zone-label">底牌</div>
              <div class="bottom-cards">
                <div v-for="(c, i) in bottomCards" :key="i" class="mini-card" :class="c.color">
                  <template v-if="c.color === 'back'">🂠</template>
                  <template v-else><span class="mini-mark">{{ c.mark }}</span><b>{{ c.face }}</b></template>
                </div>
              </div>
            </div>

            <div class="play-zone">
              <div class="zone-label">{{ lastPlay ? `${players[lastPlay.seat]?.name || '玩家'} 出牌` : '等待出牌' }}</div>
              <div class="played-cards">
                <div v-for="c in lastCards" :key="c.id" class="poker small" :class="c.color">
                  <span class="p-corner">{{ c.mark }}{{ c.face }}</span>
                  <span class="p-center" :class="{ 'joker-face': c.face.length > 2 }">{{ c.face }}</span>
                </div>
              </div>
            </div>

            <div class="feed-zone">
              <div v-for="(m, i) in systemMessages.slice(-4)" :key="i" class="feed-line">{{ m.text }}</div>
            </div>
          </div>

          <!-- 右侧对手 -->
          <SeatPanel v-if="rightPlayer" :player="rightPlayer" :current="state?.current === rightPlayer.seat" :result="state?.result" />

          <!-- 托管遮罩提示 -->
          <div v-if="selfPlayer?.trust" class="trust-flag">🤖 托管中，点击「取消托管」接管</div>
        </div>

        <!-- 操作栏 -->
        <div class="control-bar">
          <template v-if="phase === 'bidding' && isMyTurn">
            <span class="ctrl-label">叫地主：</span>
            <button class="btn btn-ghost" @click="actBid(0)">不叫</button>
            <button class="btn btn-green" @click="actBid(1)">1 分</button>
            <button class="btn btn-green" @click="actBid(2)">2 分</button>
            <button class="btn btn-gold" @click="actBid(3)">3 分</button>
          </template>
          <template v-else-if="phase === 'grabbing' && isMyTurn">
            <span class="ctrl-label">抢地主：</span>
            <button class="btn btn-ghost" @click="actGrab(false)">不抢</button>
            <button class="btn btn-gold" @click="actGrab(true)">🔥 抢地主</button>
          </template>
          <template v-else-if="phase === 'doubling' && isMyTurn">
            <span class="ctrl-label">加倍：</span>
            <button class="btn btn-ghost" @click="actDouble(false)">不加倍</button>
            <button class="btn btn-gold" @click="actDouble(true)">⚡ 加倍</button>
          </template>
          <template v-else-if="phase === 'playing' && isMyTurn">
            <button class="btn btn-ghost" @click="actPass" :disabled="!lastPlay || lastPlay.seat === selfSeat">不出</button>
            <button class="btn btn-green" @click="onHint">💡 提示</button>
            <button class="btn btn-gold" @click="actPlay" :disabled="!selected.size">出牌 ({{ selected.size }})</button>
          </template>
          <template v-else-if="phase === 'waiting' && ownerId === store.user?.id">
            <span class="ctrl-label">房间已就绪：</span>
            <button class="btn btn-gold" @click="startNext">▶️ 开始游戏</button>
          </template>
          <template v-else>
            <span class="ctrl-wait muted">{{ isMyTurn ? '处理中…' : `等待 ${players[state?.current]?.name || '对手'} 操作` }}</span>
          </template>

          <div class="ctrl-extra">
            <button class="btn btn-ghost btn-sm" v-if="phase === 'bidding' && !selfPlayer?.ming" @click="actMing">👁️ 明牌</button>
            <button class="btn btn-ghost btn-sm" @click="toggleTrust">{{ selfPlayer?.trust ? '🙋 取消托管' : '🤖 托管' }}</button>
          </div>
        </div>

        <!-- 自己的手牌 -->
        <div class="hand-zone">
          <div class="hand-meta">
            <span class="avatar sm">{{ store.user?.avatar || '😎' }}</span>
            <b>{{ selfPlayer?.name || store.nickname }}</b>
            <span v-if="selfPlayer?.isLandlord" class="badge">👑 地主</span>
            <span v-else class="badge badge-green">🌾 农民</span>
            <span class="muted">手牌 {{ myHand.length }} 张</span>
            <span v-if="selfPlayer?.doubled" class="badge badge-red">加倍</span>
          </div>
          <div class="my-hand">
            <div
              v-for="c in myHand"
              :key="c.id"
              class="poker hand-card"
              :class="[c.color, { selected: selected.has(c.id) }]"
              @click="toggleCard(c.id)"
            >
              <span class="p-corner">{{ c.mark }}{{ c.face }}</span>
              <span class="p-center" :class="{ 'joker-face': c.face.length > 2 }">{{ c.face }}</span>
            </div>
            <div v-if="!myHand.length" class="muted">等待发牌…</div>
          </div>
        </div>
      </div>

      <!-- 聊天区 -->
      <div class="chat-panel card">
        <h3 class="section-title">💬 房间聊天</h3>
        <div class="chat-list">
          <div v-for="(m, i) in chatMessages" :key="i" class="chat-line">
            <b :class="{ me: m.fromId === store.user?.id }">{{ m.from }}：</b><span>{{ m.text }}</span>
          </div>
          <div v-if="!chatMessages.length" class="muted">和大家打个招呼吧~</div>
        </div>
        <div class="quick-phrases">
          <button v-for="p in quickPhrases" :key="p" class="phrase" @click="chatText = p">{{ p }}</button>
        </div>
        <div class="chat-input">
          <input v-model="chatText" class="input" placeholder="输入聊天内容…" @keyup.enter="sendChat" maxlength="200" />
          <button class="btn btn-gold btn-sm" @click="sendChat">发送</button>
        </div>
      </div>
    </div>

    <!-- 结算弹窗 -->
    <div v-if="showResult && state?.result" class="modal-mask">
      <div class="modal result-modal">
        <div class="result-crown">🏆</div>
        <h2 class="result-title">{{ resultWin ? '胜利！' : '惜败' }}</h2>
        <p class="result-sub tcenter soft">{{ state.result.spring || '正常结算' }} · 倍数 ×{{ state.result.multiplier }} · 底分 {{ state.result.baseScore }}</p>
        <div class="result-list">
          <div v-for="p in state.players" :key="p.seat" class="result-row" :class="{ me: p.seat === selfSeat }">
            <span class="avatar sm">{{ p.avatar || '😎' }}</span>
            <span class="result-name">{{ p.name }} {{ p.isLandlord ? '👑' : '🌾' }}</span>
            <span class="result-delta" :class="state.result.deltas[p.seat] >= 0 ? 'green' : 'red'">
              {{ state.result.deltas[p.seat] >= 0 ? '+' : '' }}{{ state.result.deltas[p.seat] }}
            </span>
          </div>
        </div>
        <div class="flex gap-12 mt-20">
          <button class="btn btn-ghost flex-1" @click="router.push('/lobby')">返回大厅</button>
          <button class="btn btn-gold flex-1" @click="startNext">再来一局</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/** 座位面板：作为局部组件复用，避免主逻辑臃肿 */
import { h } from 'vue'
const SeatPanel = {
  name: 'SeatPanel',
  props: ['player', 'current', 'result'],
  setup(props) {
    return () => h('div', { class: ['seat-panel', props.current ? 'active' : ''] }, [
      h('div', { class: 'seat-avatar-wrap' }, [
        h('div', { class: 'seat-avatar' }, props.player.avatar || '😀'),
        props.player.isLandlord ? h('span', { class: 'crown' }, '👑') : null,
        props.player.trust ? h('span', { class: 'trust' }, '🤖') : null,
        props.player.connected === false ? h('span', { class: 'offline' }, '💤') : null,
      ]),
      h('div', { class: 'seat-name' }, [
        props.player.name,
        props.player.doubled ? h('span', { class: 'badge badge-red' }, '加倍') : null,
      ]),
      h('div', { class: 'seat-cards' }, [
        h('span', { class: 'card-back-icon' }, '🂠'),
        h('b', {}, `× ${props.player.handCount}`),
      ]),
    ])
  },
}
export default { components: { SeatPanel } }
</script>

<style scoped>
.game-page { min-height: 100vh; display: flex; flex-direction: column; }
.game-topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 20px;
  background: rgba(6, 26, 20, .9);
  border-bottom: 1px solid var(--line);
}
.room-info { flex: 1; font-size: 13px; color: var(--ink-soft); }
.room-info b { color: var(--ink); }
.phase-badge { padding: 5px 14px; border-radius: 999px; background: rgba(238,203,106,.14); color: var(--gold-300); font-size: 13px; font-weight: 700; border: 1px solid var(--line-strong); }

.game-layout { flex: 1; display: grid; grid-template-columns: 1fr 280px; gap: 16px; padding: 16px; }
.table-wrap { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

.poker-table {
  position: relative;
  flex: 1;
  min-height: 420px;
  display: grid;
  grid-template-columns: 150px 1fr 150px;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid rgba(233, 200, 120, .34);
  background:
    radial-gradient(ellipse at 50% 42%, rgba(35, 150, 124, .5), transparent 62%),
    radial-gradient(circle at 12% 18%, rgba(233, 200, 120, .08), transparent 32%),
    linear-gradient(160deg, #0b2a2b 0%, #06171c 62%, #040d11 100%);
  box-shadow: inset 0 0 100px rgba(0,0,0,.52), 0 24px 70px rgba(0,0,0,.42);
  overflow: hidden;
}
.table-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 5; background: rgba(6,26,20,.6); }
.table-loading p { color: var(--ink-soft); font-size: 13px; }
.trust-flag { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-size: 12px; color: var(--gold-300); background: rgba(0,0,0,.4); padding: 5px 14px; border-radius: 999px; border: 1px solid var(--line); }

.seat-panel { text-align: center; padding: 12px 8px; border-radius: 14px; background: rgba(0,0,0,.2); border: 1px solid transparent; transition: all .2s; align-self: start; margin-top: 10px; }
.seat-panel.active { border-color: var(--gold-400); box-shadow: var(--glow); background: rgba(238,203,106,.1); transform: translateY(-3px); }
.seat-avatar-wrap { position: relative; display: inline-block; }
.seat-avatar { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30px; background: linear-gradient(135deg, var(--green-600), var(--green-800)); border: 2px solid var(--line-strong); }
.crown, .trust, .offline { position: absolute; font-size: 16px; }
.crown { top: -10px; right: -6px; }
.trust { bottom: -4px; left: -8px; }
.offline { bottom: -4px; right: -8px; }
.seat-name { margin-top: 8px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 5px; flex-wrap: wrap; }
.seat-cards { margin-top: 6px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; background: rgba(0,0,0,.3); font-size: 12px; }
.card-back-icon { font-size: 15px; color: var(--gold-300); }

.table-center { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.zone-label { font-size: 11px; color: var(--ink-mute); text-align: center; margin-bottom: 5px; }
.bottom-cards, .played-cards { display: flex; gap: 6px; justify-content: center; min-height: 60px; align-items: center; }
.mini-card {
  width: 40px; height: 56px; border-radius: 6px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 20px; background: #f7f5ef; border: 1px solid #d8d2c0;
  box-shadow: 0 3px 8px rgba(0,0,0,.3);
}
.mini-card.red { color: #d92b2b; }
.mini-card.black { color: #1a1a1a; }
.mini-card .mini-mark { font-size: 13px; line-height: 1; }
.mini-card b { font-size: 14px; line-height: 1.2; }
.mini-card.back { background: repeating-linear-gradient(45deg, #1b4d38, #1b4d38 5px, #133b2a 5px, #133b2a 10px); color: var(--gold-400); }
.feed-zone { min-height: 40px; text-align: center; }
.feed-line { font-size: 11px; color: var(--gold-300); opacity: .85; line-height: 1.6; }

/* 扑克牌 */
.poker {
  position: relative;
  width: 44px; height: 64px;
  border-radius: 7px;
  background: linear-gradient(155deg, #fffdf7 0%, #f7f2e5 58%, #e9e1cf 100%);
  border: 1px solid rgba(255,255,255,.72);
  box-shadow: 0 8px 18px rgba(0,0,0,.42), inset 0 0 0 1px rgba(120,96,42,.18);
  flex-shrink: 0;
  user-select: none;
}
.poker.red { color: #c81f2b; }
.poker.black { color: #111820; }
.p-corner { position: absolute; top: 4px; left: 5px; font-size: 11px; font-weight: 800; line-height: 1; }
.p-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 900; opacity: .95; }
.p-center.joker-face { font-size: 13px; writing-mode: vertical-rl; letter-spacing: 1px; }
.poker.small { width: 36px; height: 52px; }
.poker.small .p-center { font-size: 20px; }
.poker.small .p-center.joker-face { font-size: 10px; }
.poker.small .p-corner { font-size: 9px; }

.control-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 12px 16px; border-radius: 12px;
  background: rgba(6, 26, 20, .8); border: 1px solid var(--line);
  min-height: 56px;
}
.ctrl-label { font-size: 13px; color: var(--ink-soft); }
.ctrl-wait { font-size: 13px; flex: 1; }
.ctrl-extra { margin-left: auto; display: flex; gap: 8px; }

.hand-zone {
  padding: 12px 16px 18px;
  border-radius: 14px;
  background: rgba(6, 26, 20, .75);
  border: 1px solid var(--line);
}
.hand-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 10px; }
.avatar.sm { width: 28px; height: 28px; font-size: 15px; }
.my-hand { display: flex; justify-content: center; align-items: flex-end; min-height: 74px; padding-top: 14px; }
.hand-card { cursor: pointer; transition: transform .15s ease, box-shadow .15s ease; margin-left: -10px; }
.hand-card:first-child { margin-left: 0; }
.hand-card:hover { transform: translateY(-8px); z-index: 2; }
.hand-card.selected { transform: translateY(-18px); box-shadow: 0 8px 18px rgba(238,203,106,.5); border-color: var(--gold-400); z-index: 3; }

.chat-panel { display: flex; flex-direction: column; padding: 16px; min-height: 420px; }
.chat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 12px; margin-bottom: 10px; }
.chat-line { line-height: 1.5; word-break: break-all; }
.chat-line b { color: var(--gold-300); }
.chat-line b.me { color: #7fe0ad; }
.quick-phrases { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.phrase { font-size: 11px; padding: 4px 8px; border-radius: 999px; background: rgba(238,203,106,.08); border: 1px solid var(--line); color: var(--ink-soft); cursor: pointer; }
.phrase:hover { color: var(--gold-300); border-color: var(--line-strong); }
.chat-input { display: flex; gap: 6px; }
.chat-input .input { padding: 8px 10px; font-size: 12px; }

.result-modal { text-align: center; }
.result-crown { font-size: 60px; }
.result-title { font-size: 30px; font-weight: 900; margin: 4px 0; color: var(--gold-300); }
.result-sub { font-size: 13px; margin: 0 0 18px; }
.result-list { display: flex; flex-direction: column; gap: 8px; }
.result-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: rgba(0,0,0,.25); }
.result-row.me { border: 1px solid var(--line-strong); background: rgba(238,203,106,.08); }
.result-name { flex: 1; text-align: left; font-size: 13px; font-weight: 700; }
.result-delta { font-size: 16px; font-weight: 900; }
.flex-1 { flex: 1; }

@media (max-width: 1000px) {
  .game-layout { grid-template-columns: 1fr; }
  .chat-panel { min-height: 240px; }
  .poker-table { grid-template-columns: 100px 1fr 100px; }
  .seat-avatar { width: 44px; height: 44px; font-size: 24px; }
}
@media (max-width: 640px) {
  .poker-table { grid-template-columns: 1fr; gap: 8px; padding: 12px; }
  .seat-panel { justify-self: center; }
  .hand-card { margin-left: -16px; width: 38px; height: 56px; }
  .p-center { font-size: 22px; }
}
</style>
