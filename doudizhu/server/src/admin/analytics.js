/**
 * 数据分析报表：对局趋势、新用户、金币流动、游戏占比、留存
 */
import { store } from '../db/store.js'

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

function lastNDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    days.push(dayKey(Date.now() - i * 86400000))
  }
  return days
}

/** 总览趋势数据 */
export function overview(days = 7) {
  const n = Math.max(1, Math.min(Number(days) || 7, 90))
  const dayList = lastNDays(n)
  const records = store.data.records
  const users = store.data.users.filter((u) => u.role !== 'admin')
  const coinLogs = store.data.coinLogs || []

  const buckets = Object.fromEntries(dayList.map((d) => [d, {
    date: d, games: 0, newUsers: 0, coinFlow: 0, doudizhu: 0, mahjong: 0, revenue: 0,
  }]))

  for (const r of records) {
    const k = dayKey(r.at)
    if (buckets[k]) {
      buckets[k].games++
      if (r.game === 'mahjong') buckets[k].mahjong++
      else buckets[k].doudizhu++
      const flow = (r.players || []).reduce((s, p) => s + Math.abs(p.delta || 0), 0)
      buckets[k].coinFlow += flow
    }
  }
  for (const u of users) {
    const k = dayKey(u.createdAt)
    if (buckets[k]) buckets[k].newUsers++
  }
  for (const l of coinLogs) {
    const k = dayKey(l.at)
    if (buckets[k] && l.delta > 0) buckets[k].revenue += l.delta
  }

  const daily = dayList.map((d) => buckets[d])
  const sum = (key) => daily.reduce((s, d) => s + d[key], 0)
  return {
    days: n,
    daily,
    summary: {
      totalGames: sum('games'),
      totalNewUsers: sum('newUsers'),
      totalCoinFlow: sum('coinFlow'),
      totalRevenue: sum('revenue'),
      avgGamesPerDay: Math.round(sum('games') / n),
      gameDistribution: [
        { name: '斗地主', value: sum('doudizhu') },
        { name: '内蒙麻将', value: sum('mahjong') },
      ],
    },
  }
}

/** 留存率（近似：按注册日统计后续活跃） */
export function retention() {
  const users = store.data.users.filter((u) => u.role !== 'admin' && u.lastLoginAt)
  const buckets = [
    { label: '次日留存', key: 'day1', threshold: 1, count: 0, total: 0 },
    { label: '3日留存', key: 'day3', threshold: 3, count: 0, total: 0 },
    { label: '7日留存', key: 'day7', threshold: 7, count: 0, total: 0 },
  ]
  for (const u of users) {
    const span = (dayKey(u.lastLoginAt) === dayKey(u.createdAt))
      ? 0
      : Math.floor((new Date(u.lastLoginAt) - new Date(u.createdAt)) / 86400000)
    for (const b of buckets) {
      if (span >= b.threshold) b.count++
      b.total++
    }
  }
  return buckets.map((b) => ({
    label: b.label,
    key: b.key,
    rate: b.total ? Math.round((b.count / b.total) * 1000) / 10 : 0,
    count: b.count,
    total: b.total,
  }))
}

/** 用户活跃分层 */
export function userSegments() {
  const users = store.data.users.filter((u) => u.role !== 'admin')
  const classify = (u) => {
    if ((u.games || 0) >= 100) return '核心玩家'
    if ((u.games || 0) >= 20) return '活跃玩家'
    if ((u.games || 0) >= 1) return '普通玩家'
    return '未开局'
  }
  const segments = {}
  for (const u of users) {
    const s = classify(u)
    segments[s] = (segments[s] || 0) + 1
  }
  return Object.entries(segments).map(([name, value]) => ({ name, value }))
}
