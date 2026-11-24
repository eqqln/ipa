import { defineStore } from 'pinia'
import { auth, user as userApi } from '@/api'
import { connect, disconnect } from '@/socket'

const TOKEN_KEY = 'ddz_token'
const USER_KEY = 'ddz_user'

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: readUser(),
    profile: null,
    stats: null,
    unreadMails: 0,
  }),
  getters: {
    isLogin: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin',
    nickname: (s) => s.user?.nickname || s.profile?.nickname || '牌友',
    coins: (s) => s.profile?.coins ?? s.user?.coins ?? 0,
    diamonds: (s) => s.profile?.diamonds ?? s.user?.diamonds ?? 0,
    level: (s) => s.profile?.level ?? s.user?.level ?? 1,
  },
  actions: {
    _persist() {
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token)
      else localStorage.removeItem(TOKEN_KEY)
      if (this.user) localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      else localStorage.removeItem(USER_KEY)
    },
    async login(payload) {
      const data = await auth.login(payload)
      this._applySession(data)
      return data
    },
    async register(payload) {
      const data = await auth.register(payload)
      this._applySession(data)
      return data
    },
    _applySession(data) {
      this.token = data?.token || ''
      this.user = data?.user || null
      this._persist()
      if (this.token) connect(this.token)
    },
    async fetchProfile() {
      const data = await userApi.profile()
      this.profile = data
      this.unreadMails = Number(data?.unreadMails || 0)
      // 用最新资料覆盖本地用户，便于昵称/等级即时刷新
      if (this.user && data) {
        this.user = { ...this.user, ...data }
        this._persist()
      }
      return data
    },
    async updateProfile(patch) {
      const data = await userApi.updateProfile(patch)
      this.user = { ...(this.user || {}), ...data }
      if (this.profile) this.profile = { ...this.profile, ...data }
      this._persist()
      return data
    },
    async fetchStats() {
      this.stats = await userApi.stats()
      return this.stats
    },
    setUnread(count) {
      this.unreadMails = Math.max(0, Number(count) || 0)
    },
    refreshCoins(patch = {}) {
      if (this.profile) this.profile = { ...this.profile, ...patch }
      if (this.user) {
        this.user = { ...this.user, ...patch }
        this._persist()
      }
    },
    bootstrapSocket() {
      if (this.token) connect(this.token)
    },
    logout() {
      this.token = ''
      this.user = null
      this.profile = null
      this.stats = null
      this.unreadMails = 0
      this._persist()
      disconnect()
    },
  },
})
