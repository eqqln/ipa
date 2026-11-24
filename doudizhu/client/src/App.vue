<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getSocket } from '@/socket'
import Login from '@/views/Login.vue'

const router = useRouter()
const route = useRoute()
const store = useUserStore()

const navItems = [
  { name: 'lobby', label: '大厅', icon: '🏠' },
  { name: 'rank', label: '排行', icon: '🏆' },
  { name: 'shop', label: '商城', icon: '🛒' },
  { name: 'mail', label: '邮件', icon: '📮', badge: true },
  { name: 'task', label: '任务', icon: '📜' },
  { name: 'friend', label: '好友', icon: '👥' },
  { name: 'record', label: '战绩', icon: '📊' },
  { name: 'profile', label: '个人', icon: '👤' },
]

const toasts = ref([])
let toastId = 0

function pushToast(message, type = '') {
  const id = ++toastId
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 2600)
}

function onExpired() {
  store.logout()
  pushToast('登录已失效，请重新登录', 'error')
  router.replace({ name: 'login' })
}

function onUserUpdated(patch) {
  if (patch && typeof patch === 'object') store.refreshCoins(patch)
}

function onConnect() {
  // 连接建立后主动刷新未读数
  store.fetchProfile().catch(() => {})
}

onMounted(() => {
  window.__ddzToast = pushToast
  window.addEventListener('auth:expired', onExpired)
  if (store.token) {
    store.bootstrapSocket()
    store.fetchProfile().catch(() => {})
    const socket = getSocket()
    if (socket) {
      socket.on('connect', onConnect)
      socket.on('user:updated', onUserUpdated)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('auth:expired', onExpired)
  const socket = getSocket()
  if (socket) {
    socket.off('connect', onConnect)
    socket.off('user:updated', onUserUpdated)
  }
})

function logout() {
  store.logout()
  router.replace({ name: 'login' })
}

const hideChrome = computed(() => route.name === 'game')
const isAuthed = computed(() => !!store.token)
</script>

<template>
  <!-- 未登录：只显示登录/注册页 -->
  <Login v-if="!isAuthed" @toast="pushToast" />

  <!-- 已登录：完整布局 -->
  <div v-else class="app-shell">
    <header class="topbar" v-if="!hideChrome">
      <div class="brand" @click="router.push('/lobby')">
        <span class="brand-logo">🃏</span>
        <span class="brand-name">极跃斗地主</span>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-item"
          :class="{ active: route.name === item.name }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
          <span v-if="item.badge && store.unreadMails > 0" class="dot">{{ store.unreadMails > 99 ? '99+' : store.unreadMails }}</span>
        </RouterLink>
      </nav>

      <div class="wallet">
        <span class="chip gold-chip" title="金币">🪙 {{ store.coins.toLocaleString() }}</span>
        <span class="chip diamond-chip" title="钻石">💎 {{ store.diamonds.toLocaleString() }}</span>
        <span class="chip level-chip" title="等级">⭐ Lv.{{ store.level }}</span>
        <RouterLink v-if="store.isAdmin" :to="{ name: 'admin' }" class="chip admin-chip" title="管理后台">🛡️ 管理</RouterLink>
        <button class="avatar-btn" @click="router.push('/profile')" title="个人中心">
          <span class="avatar" style="width: 34px; height: 34px; font-size: 18px;">{{ store.user?.avatar || '😎' }}</span>
        </button>
        <button class="logout-btn" @click="logout" title="退出登录">🚪</button>
      </div>
    </header>

    <main :class="['main-area', { 'main-game': hideChrome }]">
      <RouterView v-slot="{ Component }">
        <component :is="Component" @toast="pushToast" />
      </RouterView>
    </main>

    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; }

.topbar {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; gap: 20px;
  padding: 10px 22px;
  background: linear-gradient(180deg, rgba(6, 26, 20, .98), rgba(6, 26, 20, .9));
  border-bottom: 1px solid var(--line);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .3);
  flex-wrap: wrap;
}

.brand { display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0; }
.brand-logo { font-size: 28px; filter: drop-shadow(0 2px 6px rgba(238,203,106,.5)); }
.brand-name {
  font-size: 19px; font-weight: 900; letter-spacing: 1px;
  background: linear-gradient(90deg, var(--gold-300), var(--gold-500));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.nav { display: flex; align-items: center; gap: 4px; flex: 1; flex-wrap: wrap; }
.nav-item {
  position: relative;
  display: flex; align-items: center; gap: 5px;
  padding: 7px 11px;
  border-radius: 9px;
  color: var(--ink-soft);
  font-size: 13px; font-weight: 600;
  transition: all .18s ease;
}
.nav-item:hover { background: rgba(238, 203, 106, .08); color: var(--ink); }
.nav-item.active {
  background: linear-gradient(135deg, rgba(238, 203, 106, .2), rgba(238, 203, 106, .06));
  color: var(--gold-300);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
.nav-icon { font-size: 15px; }
.dot {
  position: absolute; top: -3px; right: -3px;
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 999px;
  background: var(--red); color: #fff;
  font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 8px rgba(224, 71, 63, .6);
}

.wallet { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 700;
  padding: 6px 11px; border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, .25);
  white-space: nowrap;
}
.gold-chip { color: var(--gold-300); }
.diamond-chip { color: #8fd8ff; }
.level-chip { color: #b7e6c9; }
.admin-chip { color: #ffb3ad; border-color: rgba(224,71,63,.4); }
.avatar-btn, .logout-btn {
  background: none; border: none; cursor: pointer;
  display: inline-flex; align-items: center;
  transition: transform .16s ease;
}
.avatar-btn:hover, .logout-btn:hover { transform: scale(1.1); }
.logout-btn { font-size: 18px; opacity: .8; }

.main-area { flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: 24px 20px 60px; }
.main-game { max-width: none; padding: 0; }

@media (max-width: 720px) {
  .topbar { gap: 10px; padding: 8px 12px; }
  .brand-name { font-size: 16px; }
  .nav-item span:not(.nav-icon):not(.dot) { display: none; }
  .nav-item { padding: 7px 9px; }
  .wallet { width: 100%; justify-content: space-between; }
}
</style>
