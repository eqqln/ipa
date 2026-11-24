import { nanoid } from 'nanoid'
import { store } from '../db/store.js'
import { publicUser, findUserById } from './userService.js'
import { isOnline } from './runtime.js'

export function searchUsers(keyword) {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return []
  return store.filter('users', (u) =>
    u.role !== 'admin' && (
      u.username.includes(kw) || u.nickname.toLowerCase().includes(kw) || u.id === kw
    ),
  ).slice(0, 20).map((u) => ({ ...publicUser(u), online: isOnline(u.id) }))
}

export function addFriend(userId, keyword) {
  const target = searchUsers(keyword).find((u) => u.id === keyword || u.username === keyword || u.nickname === keyword)
  if (!target) throw new Error('找不到该用户')
  if (target.id === userId) throw new Error('不能添加自己为好友')
  if (store.find('friends', (f) => f.userId === userId && f.friendId === target.id)) {
    throw new Error('已经是好友了')
  }
  store.insert('friends', { userId, friendId: target.id, createdAt: Date.now() })
  return { ...target, online: isOnline(target.id) }
}

export function friendList(userId) {
  return store.filter('friends', (f) => f.userId === userId)
    .map((f) => {
      const u = findUserById(f.friendId)
      return u ? { ...publicUser(u), online: isOnline(u.id), friendSince: f.createdAt } : null
    })
    .filter(Boolean)
}

export function removeFriend(userId, friendId) {
  const doc = store.remove('friends', (f) => f.userId === userId && f.friendId === friendId)
  return !!doc
}

export function chatHistory(userId, friendId, limit = 50) {
  return store.filter('chatMessages', (m) =>
    (m.fromId === userId && m.toId === friendId) || (m.fromId === friendId && m.toId === userId),
  ).sort((a, b) => a.at - b.at).slice(-limit)
}

export function saveChat(fromId, toId, content, type = 'text') {
  const msg = {
    id: nanoid(10),
    fromId,
    toId,
    content: String(content || '').slice(0, 500),
    type,
    at: Date.now(),
  }
  store.insert('chatMessages', msg)
  return msg
}
