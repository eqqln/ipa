import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import Login from '@/views/Login.vue'

const routes = [
  { path: '/', redirect: '/lobby' },
  { path: '/login', name: 'login', component: Login, meta: { public: true } },
  { path: '/lobby', name: 'lobby', component: () => import('@/views/Lobby.vue'), meta: { requiresAuth: true } },
  { path: '/game', name: 'game', component: () => import('@/views/Game.vue'), meta: { requiresAuth: true } },
  { path: '/mahjong', name: 'mahjong', component: () => import('@/views/Mahjong.vue'), meta: { requiresAuth: true } },
  { path: '/rank', name: 'rank', component: () => import('@/views/Rank.vue'), meta: { requiresAuth: true } },
  { path: '/shop', name: 'shop', component: () => import('@/views/Shop.vue'), meta: { requiresAuth: true } },
  { path: '/mail', name: 'mail', component: () => import('@/views/Mail.vue'), meta: { requiresAuth: true } },
  { path: '/task', name: 'task', component: () => import('@/views/Task.vue'), meta: { requiresAuth: true } },
  { path: '/friend', name: 'friend', component: () => import('@/views/Friend.vue'), meta: { requiresAuth: true } },
  { path: '/record', name: 'record', component: () => import('@/views/Record.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: () => import('@/views/Profile.vue'), meta: { requiresAuth: true } },
  { path: '/admin', name: 'admin', component: () => import('@/views/Admin.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/:pathMatch(.*)*', redirect: '/lobby' },
]

const router = createRouter({
  // Electron 生产环境以 file:// 加载页面，history 模式会白屏，必须使用 hash 模式
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to, from, next) => {
  const store = useUserStore()
  if (to.meta.requiresAuth && !store.token) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
  if (to.meta.requiresAdmin && !store.isAdmin) {
    return next({ name: 'lobby' })
  }
  if (to.name === 'login' && store.token) {
    return next({ name: 'lobby' })
  }
  next()
})

export default router
