/**
 * 操作审计日志：记录所有后台管理动作，不可篡改（追加写）
 */
import { nanoid } from 'nanoid'
import { store } from '../db/store.js'

/** 记录一条审计日志 */
export function audit(req, action, target, detail = {}, level = 'info') {
  const admin = req?.admin || req?.user || {}
  const entry = {
    id: nanoid(12),
    adminId: admin.id || 'unknown',
    adminName: admin.name || admin.username || 'system',
    role: admin.role || 'system',
    action,
    target: String(target || ''),
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    level,
    ip: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
    at: Date.now(),
  }
  store.collection('auditLogs').push(entry)
  store.save()
  return entry
}

export function listAuditLogs({ limit = 100, action = '', level = '' } = {}) {
  return store.filter('auditLogs', (l) =>
    (!action || l.action.includes(action)) && (!level || l.level === level),
  ).sort((a, b) => b.at - a.at).slice(0, Math.min(limit, 500))
}

export function auditStats() {
  const logs = store.filter('auditLogs', () => true)
  const today = new Date().toISOString().slice(0, 10)
  const byAction = {}
  for (const l of logs) byAction[l.action] = (byAction[l.action] || 0) + 1
  return {
    total: logs.length,
    today: logs.filter((l) => new Date(l.at).toISOString().slice(0, 10) === today).length,
    byAction,
  }
}
