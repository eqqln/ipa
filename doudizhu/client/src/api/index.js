import axios from 'axios'

const TOKEN_KEY = 'ddz_token'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

/** 请求拦截：自动携带 Bearer token */
http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

/** 响应拦截：统一 { code, message, data }，code!==0 抛错 */
http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data
      if (body.code === 401) {
        localStorage.removeItem(TOKEN_KEY)
        window.dispatchEvent(new CustomEvent('auth:expired'))
      }
      const err = new Error(body.message || '请求失败')
      err.code = body.code
      return Promise.reject(err)
    }
    return body
  },
  (error) => {
    const msg = error?.response?.data?.message || error?.message || '网络异常，请稍后再试'
    const err = new Error(msg)
    err.code = error?.response?.status || -1
    return Promise.reject(err)
  },
)

/** 认证 */
export const auth = {
  register: (data) => http.post('/auth/register', data),
  login: (data) => http.post('/auth/login', data),
  me: () => http.get('/auth/me'),
  password: (data) => http.post('/auth/password', data),
}

/** 用户 */
export const user = {
  profile: () => http.get('/user/profile'),
  profileOf: (id) => http.get(`/user/profile/${id}`),
  updateProfile: (data) => http.put('/user/profile', data),
  signin: () => http.post('/user/signin'),
  bankruptcy: () => http.post('/user/bankruptcy'),
  stats: () => http.get('/user/stats'),
}

/** 房间 */
export const room = {
  list: (game) => http.get('/room', { params: game ? { game } : {} }),
  create: (data) => http.post('/room', data),
  quick: (data) => http.post('/room/quick', data),
  detail: (id) => http.get(`/room/${id}`),
  join: (id, password = '') => http.post(`/room/${id}/join`, { password }),
  leave: (id) => http.post(`/room/${id}/leave`),
}

/** 排行榜 */
export const rank = {
  list: (type = 'coins', limit = 50) => http.get('/rank', { params: { type, limit } }),
  me: (type = 'coins') => http.get('/rank/me', { params: { type } }),
}

/** 邮件 */
export const mail = {
  list: () => http.get('/mail'),
  read: (id) => http.post(`/mail/${id}/read`),
  claim: (id) => http.post(`/mail/${id}/claim`),
  delete: (id) => http.post(`/mail/${id}/delete`),
}

/** 任务 */
export const task = {
  list: () => http.get('/task'),
  claim: (id) => http.post(`/task/${id}/claim`),
}

/** 商城 */
export const shop = {
  list: () => http.get('/shop'),
  bag: () => http.get('/shop/bag'),
  buy: (itemId, payType = 'coins') => http.post('/shop/buy', { itemId, payType }),
  equip: (itemId) => http.post('/shop/equip', { itemId }),
  use: (itemId) => http.post('/shop/use', { itemId }),
}

/** 好友 */
export const friend = {
  list: () => http.get('/friend'),
  search: (q) => http.get('/friend/search', { params: { q } }),
  add: (keyword) => http.post('/friend/add', { keyword }),
  remove: (id) => http.delete(`/friend/${id}`),
  chatHistory: (id, limit = 50) => http.get(`/friend/${id}/chat`, { params: { limit } }),
}

/** 战绩 */
export const record = {
  list: (page = 1, pageSize = 20) => http.get('/record', { params: { page, pageSize } }),
  detail: (id) => http.get(`/record/${id}`),
}

/** 管理后台 */
export const admin = {
  dashboard: () => http.get('/admin/dashboard'),
  users: (params) => http.get('/admin/users', { params }),
  setStatus: (id, status) => http.post(`/admin/users/${id}/status`, { status }),
  grant: (id, data) => http.post(`/admin/users/${id}/grant`, data),
  announcements: () => http.get('/admin/announcements'),
  addAnnouncement: (data) => http.post('/admin/announcements', data),
  deleteAnnouncement: (id) => http.delete(`/admin/announcements/${id}`),
  broadcast: (data) => http.post('/admin/broadcast', data),
  coinlogs: (limit = 100) => http.get('/admin/coinlogs', { params: { limit } }),
  games: (limit = 30) => http.get('/admin/games', { params: { limit } }),
}

/** 公告 */
export const announcements = () => http.get('/announcements')

export { http as request }
export default {
  auth, user, room, rank, mail, task, shop, friend, record, admin, announcements,
}
