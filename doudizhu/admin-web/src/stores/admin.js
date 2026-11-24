import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const TOKEN_KEY = 'gd_admin_token'
const USER_KEY = 'gd_admin_user'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export const useAdminStore = defineStore('admin', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref(readJson(USER_KEY, null))

  const isLogin = computed(() => !!token.value)
  const displayName = computed(() => user.value?.nickname || user.value?.username || '管理员')
  const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase())

  function setLogin(userData, tokenValue) {
    token.value = tokenValue || ''
    user.value = userData || null
    if (token.value) localStorage.setItem(TOKEN_KEY, token.value)
    if (user.value) localStorage.setItem(USER_KEY, JSON.stringify(user.value))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLogin, displayName, avatarText, setLogin, logout }
})
