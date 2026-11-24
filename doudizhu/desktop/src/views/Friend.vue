<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { friend as friendApi } from '@/api'
import { useUserStore } from '@/stores/user'
import { getSocket } from '@/socket'

const emit = defineEmits(['toast'])
const store = useUserStore()

const friends = ref([])
const searchQ = ref('')
const searchResults = ref([])
const loading = ref(false)

const activeFriend = ref(null)
const chatMsgs = ref([])
const chatInput = ref('')

function onPrivate(msg) {
  if (!activeFriend.value || !msg) return
  const me = store.user?.id
  const other = activeFriend.value.id
  if ((msg.fromId === me && msg.toId === other) || (msg.fromId === other && msg.toId === me)) {
    chatMsgs.value.push({ mine: msg.fromId === me, text: msg.content, at: msg.at })
  }
}

function onFriendOnline({ id, online }) {
  const f = friends.value.find((x) => x.id === id)
  if (f) f.online = online
}

onMounted(() => {
  loadFriends()
  const socket = getSocket()
  if (socket) {
    socket.on('chat:private', onPrivate)
    socket.on('friend:online', onFriendOnline)
  }
})
onUnmounted(() => {
  const socket = getSocket()
  if (socket) {
    socket.off('chat:private', onPrivate)
    socket.off('friend:online', onFriendOnline)
  }
})

async function loadFriends() {
  try { friends.value = await friendApi.list() }
  catch (e) { emit('toast', e.message, 'error') }
}

async function doSearch() {
  if (!searchQ.value.trim()) { searchResults.value = []; return }
  try { searchResults.value = await friendApi.search(searchQ.value.trim()) }
  catch (e) { emit('toast', e.message, 'error') }
}

async function addFriend(id) {
  try {
    await friendApi.add(id)
    emit('toast', '好友添加成功', 'success')
    loadFriends()
    searchResults.value = searchResults.value.filter((u) => u.id !== id)
  } catch (e) { emit('toast', e.message, 'error') }
}

async function removeFriend(f) {
  try {
    await friendApi.remove(f.id)
    friends.value = friends.value.filter((x) => x.id !== f.id)
    if (activeFriend.value?.id === f.id) activeFriend.value = null
    emit('toast', '已删除好友', 'success')
  } catch (e) { emit('toast', e.message, 'error') }
}

async function openChat(f) {
  activeFriend.value = f
  try {
    const history = await friendApi.chatHistory(f.id, 50)
    chatMsgs.value = (history || []).map((m) => ({ mine: m.fromId === store.user?.id, text: m.content, at: m.at }))
  } catch (e) { emit('toast', e.message, 'error') }
}

function sendChat() {
  const text = chatInput.value.trim()
  if (!text || !activeFriend.value) return
  const socket = getSocket()
  if (!socket) return emit('toast', '连接未就绪', 'error')
  socket.emit('chat:private', { toId: activeFriend.value.id, text })
  chatInput.value = ''
}
</script>

<template>
  <div class="friend-page">
    <div class="page-head"><h1 class="page-title">👥 好友</h1><p class="page-sub">与牌友保持联系，随时约战</p></div>

    <div class="friend-layout">
      <div class="card friend-list">
        <h3 class="section-title">我的好友 ({{ friends.length }})</h3>
        <div class="search-box">
          <input v-model="searchQ" class="input" placeholder="搜索账号/昵称/ID" @keyup.enter="doSearch" />
          <button class="btn btn-gold btn-sm" @click="doSearch">🔍</button>
        </div>

        <div v-if="searchResults.length" class="search-results">
          <div class="search-title muted">搜索结果</div>
          <div v-for="u in searchResults" :key="u.id" class="friend-row">
            <span class="avatar" style="width:36px;height:36px;font-size:18px;">{{ u.avatar || '😀' }}</span>
            <span class="f-name">{{ u.nickname }}</span>
            <button class="btn btn-green btn-sm" @click="addFriend(u.id)">＋添加</button>
          </div>
        </div>

        <div class="list">
          <div v-for="f in friends" :key="f.id" class="friend-row" :class="{ active: activeFriend?.id === f.id }" @click="openChat(f)">
            <span class="avatar" style="width:40px;height:40px;font-size:20px;">{{ f.avatar || '😀' }}</span>
            <span class="f-name">
              {{ f.nickname }}
              <i class="online-dot" :class="{ on: f.online }"></i>
              <small class="muted">{{ f.online ? '在线' : '离线' }}</small>
            </span>
            <button class="btn btn-ghost btn-sm" @click.stop="removeFriend(f)">删除</button>
          </div>
          <div v-if="!friends.length" class="empty"><span class="emoji">👻</span>还没有好友，搜索添加吧</div>
        </div>
      </div>

      <div class="card chat-box">
        <template v-if="activeFriend">
          <div class="chat-head">
            <span class="avatar" style="width:36px;height:36px;font-size:18px;">{{ activeFriend.avatar || '😀' }}</span>
            <b>与 {{ activeFriend.nickname }} 私聊</b>
          </div>
          <div class="chat-msgs">
            <div v-for="(m, i) in chatMsgs" :key="i" class="bubble" :class="{ mine: m.mine }">{{ m.text }}</div>
            <div v-if="!chatMsgs.length" class="muted tcenter" style="padding:30px">发条消息打个招呼吧~</div>
          </div>
          <div class="chat-send">
            <input v-model="chatInput" class="input" placeholder="输入消息…" @keyup.enter="sendChat" />
            <button class="btn btn-gold" @click="sendChat">发送</button>
          </div>
        </template>
        <div v-else class="empty"><span class="emoji">💬</span>选择一位好友开始私聊</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.friend-page { max-width: 1000px; margin: 0 auto; }
.page-head { margin-bottom: 16px; }
.friend-layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; }
.friend-list, .chat-box { padding: 16px; }
.search-box { display: flex; gap: 6px; margin-bottom: 12px; }
.search-results { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.search-title { font-size: 12px; margin-bottom: 6px; }
.friend-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; margin-bottom: 6px; background: rgba(0,0,0,.18); cursor: pointer; transition: background .18s; }
.friend-row:hover, .friend-row.active { background: rgba(238,203,106,.1); }
.f-name { flex: 1; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.f-name small { font-size: 11px; font-weight: 400; }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: #666; display: inline-block; }
.online-dot.on { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
.chat-box { display: flex; flex-direction: column; min-height: 480px; }
.chat-head { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--line); font-size: 15px; }
.chat-msgs { flex: 1; overflow-y: auto; padding: 16px 0; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 72%; padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.5; background: rgba(0,0,0,.3); align-self: flex-start; }
.bubble.mine { align-self: flex-end; background: linear-gradient(135deg, var(--green-600), var(--green-700)); color: var(--ink); }
.chat-send { display: flex; gap: 8px; }
@media (max-width: 720px) { .friend-layout { grid-template-columns: 1fr; } }
</style>
