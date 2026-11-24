import { nanoid } from 'nanoid'
import { store } from '../db/store.js'
import { onlineUsers, activeRooms } from './runtime.js'
import { publicUser, findUserById } from './userService.js'

export function dashboard() {
  const users = store.data.users.filter((u) => u.role !== 'admin')
  const today = new Date().toISOString().slice(0, 10)
  const records = store.data.records
  return {
    totalUsers: users.length,
    onlineUsers: onlineUsers.size,
    activeRooms: activeRooms.size,
    totalCoins: users.reduce((s, u) => s + (u.coins || 0), 0),
    totalDiamonds: users.reduce((s, u) => s + (u.diamonds || 0), 0),
    totalGames: records.length,
    todayGames: records.filter((r) => new Date(r.at).toISOString().slice(0, 10) === today).length,
    totalBetFlow: records.reduce((s, r) => s + (r.multiplier || 1) * (r.baseScore || 0), 0),
  }
}

export function listUsers(keyword = '', page = 1, pageSize = 20) {
  const kw = keyword.toLowerCase()
  let users = store.filter('users', (u) => u.role !== 'admin' && (
    !kw || u.username.includes(kw) || u.nickname.toLowerCase().includes(kw) || u.id === kw
  ))
  users = users.sort((a, b) => b.createdAt - a.createdAt)
  const start = (page - 1) * pageSize
  return { total: users.length, page, pageSize, list: users.slice(start, start + pageSize).map(publicUser) }
}

export function setUserStatus(userId, status) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  user.status = status === 'banned' ? 'banned' : 'active'
  store.save()
  return publicUser(user)
}

export function grantUser(userId, { coins = 0, diamonds = 0 } = {}) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  user.coins += Number(coins) || 0
  user.diamonds += Number(diamonds) || 0
  store.collection('coinLogs').push({ userId, delta: Number(coins) || 0, reason: '管理员发放', at: Date.now() })
  store.save()
  return publicUser(user)
}

export function listAnnouncements() {
  return store.data.announcements.slice().sort((a, b) => b.createdAt - a.createdAt)
}

export function addAnnouncement({ title, content, pinned = false }) {
  const a = {
    id: nanoid(8),
    title: title || '公告',
    content: content || '',
    pinned: !!pinned,
    createdAt: Date.now(),
  }
  store.data.announcements.push(a)
  store.save()
  return a
}

export function removeAnnouncement(id) {
  const before = store.data.announcements.length
  store.data.announcements = store.data.announcements.filter((a) => a.id !== id)
  store.save()
  return store.data.announcements.length < before
}

export function broadcastMail({ title, content, rewards = {} }) {
  const mail = {
    id: nanoid(10),
    toUserId: null,
    title: title || '系统邮件',
    content: content || '',
    rewards,
    readBy: [],
    claimedBy: [],
    createdAt: Date.now(),
  }
  store.insert('mails', mail)
  return mail
}

export function coinLogs(limit = 100) {
  return store.filter('coinLogs', () => true).sort((a, b) => b.at - a.at).slice(0, limit)
}

export function recentGames(limit = 30) {
  return store.data.records.slice().sort((a, b) => b.at - a.at).slice(0, limit)
}
