import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAdminStore } from '../stores/admin'

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

request.interceptors.request.use((config) => {
  const store = useAdminStore()
  if (store.token) {
    config.headers.Authorization = `Bearer ${store.token}`
  }
  return config
})

request.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data
      return Promise.reject(new Error(body.message || `接口异常(${body.code})`))
    }
    return body
  },
  (err) => {
    if (err.response?.status === 401) {
      useAdminStore().logout()
    }
    return Promise.reject(err)
  }
)

export const api = {
  login: (data) => request.post('/auth/login', data),

  getDashboard: () => request.get('/admin/dashboard'),
  getUsers: (params) => request.get('/admin/users', { params }),
  setUserStatus: (id, status) => request.post(`/admin/users/${id}/status`, { status }),
  grantUser: (id, data) => request.post(`/admin/users/${id}/grant`, data),

  getAnnouncements: () => request.get('/admin/announcements'),
  createAnnouncement: (data) => request.post('/admin/announcements', data),
  deleteAnnouncement: (id) => request.delete(`/admin/announcements/${id}`),
  broadcast: (data) => request.post('/admin/broadcast', data),

  getCoinLogs: (limit = 100) => request.get('/admin/coinlogs', { params: { limit } }),
  getGames: (limit = 100) => request.get('/admin/games', { params: { limit } }),
  getRooms: (game) => request.get('/room', { params: { game } }),
  getRank: (type) => request.get('/rank', { params: { type } }),

  getRoles: () => request.get('/admin/rbac/roles'),
  getAdmins: () => request.get('/admin/rbac/admins'),
  createAdmin: (data) => request.post('/admin/rbac/admins', data),
  deleteAdmin: (id) => request.delete(`/admin/rbac/admins/${id}`),

  getAuditLogs: (params) => request.get('/admin/audit/logs', { params }),
  getAnalyticsOverview: (days = 7) => request.get('/admin/analytics/overview', { params: { days } }),
  getRetention: () => request.get('/admin/analytics/retention'),
  getRiskEvents: () => request.get('/admin/risk/events'),
  handleRiskEvent: (id, status) => request.post(`/admin/risk/events/${id}/handle`, { status }),
  getConfig: () => request.get('/admin/config'),
  saveConfig: (data) => request.put('/admin/config', data),
  getLiveRooms: () => request.get('/admin/rooms/live'),
  getFinanceSummary: () => request.get('/admin/finance/summary')
}

/**
 * 接口不可用时返回兜底数据，保证页面不空白
 */
export async function safeCall(fn, fallback) {
  try {
    const result = await fn()
    return result === undefined || result === null ? fallback : result
  } catch {
    return fallback
  }
}

export function notifySuccess(message) {
  ElMessage({ type: 'success', message, duration: 2000 })
}

export function notifyError(message) {
  ElMessage({ type: 'error', message, duration: 2500 })
}
