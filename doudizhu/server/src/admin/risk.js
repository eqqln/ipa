/**
 * 风控中心：异常金币流动、异常对局、频繁破产补助等检测
 */
import { nanoid } from 'nanoid'
import { store } from '../db/store.js'

/** 扫描并生成风控事件（调用时实时计算） */
export function scanRiskEvents() {
  const users = store.data.users.filter((u) => u.role !== 'admin')
  const events = []
  const now = Date.now()

  // 规则1：单局金币变动异常（远超正常倍数）
  const records = store.data.records.slice(-500)
  for (const r of records) {
    const maxDelta = Math.max(...(r.players || []).map((p) => Math.abs(p.delta || 0)), 0)
    if (maxDelta > 50000) {
      events.push({
        id: `risk-${r.id}`,
        userId: (r.players || []).find((p) => Math.abs(p.delta || 0) === maxDelta)?.id || '',
        type: '异常金币变动',
        level: maxDelta > 200000 ? 'high' : 'medium',
        detail: `对局 ${r.id} 单局金币变动 ${maxDelta}，倍数 ${r.multiplier || '-'}`,
        refId: r.id,
        status: 'pending',
        at: r.at,
      })
    }
  }

  // 规则2：短时间内频繁领取破产补助
  const bankrupts = store.data.bankruptcy || []
  const byUser = {}
  for (const b of bankrupts) {
    byUser[b.userId] = (byUser[b.userId] || 0) + 1
  }
  for (const [userId, count] of Object.entries(byUser)) {
    if (count >= 5) {
      const u = users.find((x) => x.id === userId)
      events.push({
        id: `risk-bank-${userId}`,
        userId,
        type: '频繁破产补助',
        level: count >= 10 ? 'high' : 'medium',
        detail: `用户「${u?.nickname || userId}」累计领取破产补助 ${count} 次`,
        refId: '',
        status: 'pending',
        at: now - 3600000,
      })
    }
  }

  // 规则3：金币异常膨胀（远超正常游戏积累）
  for (const u of users) {
    if ((u.coins || 0) > 5000000) {
      events.push({
        id: `risk-coin-${u.id}`,
        userId: u.id,
        type: '金币异常膨胀',
        level: 'high',
        detail: `用户「${u.nickname}」持有金币 ${u.coins.toLocaleString()}，超出正常范围`,
        refId: '',
        status: 'pending',
        at: now - 7200000,
      })
    }
  }

  // 合并人工处理状态
  const handled = store.filter('riskHandled', () => true)
  const handledMap = Object.fromEntries(handled.map((h) => [h.id, h]))
  const merged = events.map((e) => ({
    ...e,
    status: handledMap[e.id]?.status || e.status,
    handledBy: handledMap[e.id]?.handledBy || '',
    handledAt: handledMap[e.id]?.handledAt || 0,
  }))

  return merged.sort((a, b) => {
    const levelWeight = { high: 0, medium: 1, low: 2 }
    return levelWeight[a.level] - levelWeight[b.level] || b.at - a.at
  })
}

export function listRiskEvents({ level = '', status = '', limit = 100 } = {}) {
  return scanRiskEvents().filter((e) =>
    (!level || e.level === level) && (!status || e.status === status),
  ).slice(0, Math.min(limit, 300))
}

export function handleRiskEvent(id, { status, handledBy }) {
  if (!['resolved', 'ignored', 'banned'].includes(status)) throw new Error('无效处理状态')
  const existing = store.find('riskHandled', (h) => h.id === id)
  if (existing) {
    Object.assign(existing, { status, handledBy, handledAt: Date.now() })
  } else {
    store.insert('riskHandled', { id, status, handledBy, handledAt: Date.now() })
  }
  store.save()
  return { id, status, handledBy, handledAt: Date.now() }
}

export function riskStats() {
  const events = scanRiskEvents()
  return {
    total: events.length,
    high: events.filter((e) => e.level === 'high').length,
    medium: events.filter((e) => e.level === 'medium').length,
    pending: events.filter((e) => e.status === 'pending').length,
    resolved: events.filter((e) => e.status === 'resolved').length,
  }
}
