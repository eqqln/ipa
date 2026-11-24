import { nanoid } from 'nanoid'
import { store } from '../db/store.js'
import { addCoins } from './userService.js'

export function listMails(userId) {
  return store.filter('mails', (m) => m.toUserId === null || m.toUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((m) => ({
      ...m,
      read: m.readBy.includes(userId),
      claimed: m.claimedBy.includes(userId),
    }))
}

export function sendMail({ toUserId = null, title, content, rewards = {} }) {
  const mail = {
    id: nanoid(10),
    toUserId,
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

export function readMail(userId, mailId) {
  const mail = store.find('mails', (m) => m.id === mailId &&
    (m.toUserId === null || m.toUserId === userId))
  if (!mail) throw new Error('邮件不存在')
  if (!mail.readBy.includes(userId)) mail.readBy.push(userId)
  store.save()
  return true
}

export function claimMail(userId, mailId) {
  const user = store.find('users', (u) => u.id === userId)
  const mail = store.find('mails', (m) => m.id === mailId &&
    (m.toUserId === null || m.toUserId === userId))
  if (!user) throw new Error('用户不存在')
  if (!mail) throw new Error('邮件不存在')
  if (mail.claimedBy.includes(userId)) throw new Error('奖励已领取')
  if (!mail.readBy.includes(userId)) mail.readBy.push(userId)
  mail.claimedBy.push(userId)
  const rewards = mail.rewards || {}
  if (rewards.coins) user.coins += rewards.coins
  if (rewards.diamonds) user.diamonds += rewards.diamonds
  store.save()
  return { coins: rewards.coins || 0, diamonds: rewards.diamonds || 0 }
}

export function deleteMail(userId, mailId) {
  const mail = store.find('mails', (m) => m.id === mailId && m.toUserId === userId)
  if (mail) mail.deletedBy = [...(mail.deletedBy || []), userId]
  store.save()
  return true
}

export function unreadCount(userId) {
  return store.filter('mails', (m) =>
    (m.toUserId === null || m.toUserId === userId) && !m.readBy.includes(userId),
  ).length
}

/** 供对局结算发奖使用 */
export function grantUserReward(userId, rewards, title = '对局奖励') {
  if (!rewards || (!rewards.coins && !rewards.diamonds)) return
  addCoins(userId, rewards.coins || 0, title)
  const user = store.find('users', (u) => u.id === userId)
  if (user && rewards.diamonds) user.diamonds += rewards.diamonds
  store.save()
}
