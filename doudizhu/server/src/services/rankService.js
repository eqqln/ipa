import { store } from '../db/store.js'

function metricOf(u, type) {
  if (type === 'wins') return u.wins || 0
  if (type === 'winRate') return u.games ? Math.round(((u.wins || 0) / u.games) * 1000) / 10 : 0
  if (type === 'exp') return u.exp || 0
  if (type === 'bombs') return u.totalBombs || 0
  return u.coins || 0
}

export function rankList(type = 'coins', limit = 50) {
  const users = store.filter('users', (u) => u.status !== 'banned' && u.role !== 'admin')
  users.sort((a, b) => metricOf(b, type) - metricOf(a, type))
  return users.slice(0, limit).map((u, i) => ({
    rank: i + 1,
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    avatarFrame: u.avatarFrame,
    title: u.title,
    level: u.level,
    coins: u.coins,
    games: u.games || 0,
    wins: u.wins || 0,
    winRate: u.games ? Math.round(((u.wins || 0) / u.games) * 100) : 0,
    bombs: u.totalBombs || 0,
    value: metricOf(u, type),
  }))
}

export function myRank(userId, type = 'coins') {
  const list = rankList(type, 10000)
  const found = list.find((r) => r.id === userId)
  return found ? { rank: found.rank, total: list.length, ...found } : null
}
