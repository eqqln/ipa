/**
 * 企业级管理后台 API（RBAC 权限 + 审计 + 报表 + 风控 + 配置）
 * 挂载于 /api/admin
 */
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { store } from '../db/store.js'
import { route, ok } from '../utils/response.js'
import { resolveAdmin, requirePerm } from './middleware.js'
import { audit, listAuditLogs, auditStats } from './audit.js'
import * as rbac from './rbac.js'
import * as analytics from './analytics.js'
import * as risk from './risk.js'
import * as cfg from './config.js'

const router = Router()

/** 管理员登录（RBAC）—— 无需鉴权，必须在 resolveAdmin 之前 */
router.post('/auth/login-admin', route(async (req, res) => {
  const { username, password } = req.body || {}
  const admin = rbac.verifyAdminLogin(username, password)
  if (!admin) throw new Error('账号或密码错误')
  audit({ admin, ip: req.ip }, 'auth:login', 'admin', { username })
  // role 设为 'admin' 以兼容存量旧接口；adminRole 标识真实 RBAC 角色
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: 'admin', adminRole: admin.role },
    config.jwtSecret,
    { expiresIn: '30d' },
  )
  ok(res, {
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
      roleName: rbac.ROLES[admin.role]?.name || admin.role,
      permissions: rbac.ROLES[admin.role]?.permissions || [],
    },
  }, '登录成功')
}))

// 除登录外的所有企业级接口需要管理员身份
router.use(resolveAdmin)

/** 当前管理员信息 */
router.get('/auth/me', route(async (req, res) => {
  ok(res, {
    ...req.admin,
    roleName: rbac.ROLES[req.admin.role]?.name || req.admin.role,
    permissions: rbac.ROLES[req.admin.role]?.permissions || [],
  })
}))

// ---------- RBAC ----------
router.get('/rbac/roles', requirePerm('user:view'), route(async (req, res) => {
  ok(res, rbac.listRoles())
}))

router.get('/rbac/admins', requirePerm('user:view'), route(async (req, res) => {
  ok(res, rbac.listAdmins())
}))

router.post('/rbac/admins', requirePerm('user:ban'), route(async (req, res) => {
  const admin = rbac.createAdmin(req.body || {})
  audit(req, 'rbac:create_admin', admin.id, req.body)
  ok(res, admin, '管理员创建成功')
}))

router.delete('/rbac/admins/:id', requirePerm('user:ban'), route(async (req, res) => {
  rbac.deleteAdmin(req.params.id)
  audit(req, 'rbac:delete_admin', req.params.id, {})
  ok(res, null, '管理员已删除')
}))

// ---------- 审计日志 ----------
router.get('/audit/logs', requirePerm('audit:view'), route(async (req, res) => {
  ok(res, listAuditLogs({
    limit: Number(req.query.limit) || 100,
    action: req.query.action || '',
    level: req.query.level || '',
  }))
}))

router.get('/audit/stats', requirePerm('audit:view'), route(async (req, res) => {
  ok(res, auditStats())
}))

// ---------- 数据分析 ----------
router.get('/analytics/overview', requirePerm('analytics:view'), route(async (req, res) => {
  ok(res, analytics.overview(Number(req.query.days) || 7))
}))

router.get('/analytics/retention', requirePerm('analytics:view'), route(async (req, res) => {
  ok(res, analytics.retention())
}))

router.get('/analytics/segments', requirePerm('analytics:view'), route(async (req, res) => {
  ok(res, analytics.userSegments())
}))

// ---------- 风控 ----------
router.get('/risk/events', requirePerm('risk:view'), route(async (req, res) => {
  ok(res, risk.listRiskEvents({
    level: req.query.level || '',
    status: req.query.status || '',
    limit: Number(req.query.limit) || 100,
  }))
}))

router.get('/risk/stats', requirePerm('risk:view'), route(async (req, res) => {
  ok(res, risk.riskStats())
}))

router.post('/risk/events/:id/handle', requirePerm('risk:handle'), route(async (req, res) => {
  const result = risk.handleRiskEvent(req.params.id, {
    status: req.body?.status,
    handledBy: req.admin?.name || req.admin?.username || 'admin',
  })
  audit(req, 'risk:handle', req.params.id, req.body)
  ok(res, result, '风控事件已处理')
}))

// ---------- 配置中心 ----------
router.get('/config', requirePerm('content:edit'), route(async (req, res) => {
  ok(res, cfg.listConfig())
}))

router.put('/config', requirePerm('content:edit'), route(async (req, res) => {
  const result = req.body?.key
    ? cfg.updateConfig(req.body.key, req.body.value)
    : cfg.updateConfigBatch(req.body || {})
  audit(req, 'config:update', req.body?.key || 'batch', req.body)
  ok(res, result, '配置已保存')
}))

// ---------- 实时房间监控 ----------
router.get('/rooms/live', requirePerm('game:view'), route(async (req, res) => {
  const { activeRooms } = await import('../services/runtime.js')
  const list = [...activeRooms.values()].map((r) => ({
    id: r.id,
    game: r.game || 'doudizhu',
    mode: r.mode,
    baseScore: r.baseScore,
    status: r.status,
    playerCount: r.players?.length || 0,
    players: (r.players || []).map((p) => ({ name: p.name, seat: p.seat })),
    state: r.engine?.state || 'waiting',
    createdAt: r.createdAt,
  }))
  ok(res, list)
}))

router.post('/rooms/:id/kick', requirePerm('game:kick'), route(async (req, res) => {
  const { activeRooms } = await import('../services/runtime.js')
  const room = activeRooms.get(req.params.id)
  if (!room) throw new Error('房间不存在')
  activeRooms.delete(req.params.id)
  audit(req, 'game:kick_room', req.params.id, { reason: req.body?.reason || '' })
  ok(res, null, '房间已解散')
}))

// ---------- 财务汇总 ----------
router.get('/finance/summary', requirePerm('finance:view'), route(async (req, res) => {
  const users = store.filter('users', (u) => u.role !== 'admin')
  const logs = store.data.coinLogs || []
  const today = new Date().toISOString().slice(0, 10)
  const positive = logs.filter((l) => l.delta > 0)
  const negative = logs.filter((l) => l.delta < 0)
  const sum = (arr) => arr.reduce((s, l) => s + Math.abs(l.delta || 0), 0)
  ok(res, {
    totalCoins: users.reduce((s, u) => s + (u.coins || 0), 0),
    totalDiamonds: users.reduce((s, u) => s + (u.diamonds || 0), 0),
    totalIn: sum(positive),
    totalOut: sum(negative),
    todayIn: sum(positive.filter((l) => new Date(l.at).toISOString().slice(0, 10) === today)),
    todayOut: sum(negative.filter((l) => new Date(l.at).toISOString().slice(0, 10) === today)),
    logCount: logs.length,
  })
}))

// ---------- 用户封禁（审计增强版，覆盖旧接口） ----------
router.post('/users/:id/status', requirePerm('user:ban'), route(async (req, res) => {
  const user = store.find('users', (u) => u.id === req.params.id)
  if (!user) throw new Error('用户不存在')
  user.status = req.body?.status === 'banned' ? 'banned' : 'active'
  store.save()
  audit(req, `user:${user.status === 'banned' ? 'ban' : 'unban'}`, user.id, { nickname: user.nickname })
  ok(res, { id: user.id, status: user.status }, '状态已更新')
}))

router.post('/users/:id/grant', requirePerm('finance:grant'), route(async (req, res) => {
  const user = store.find('users', (u) => u.id === req.params.id)
  if (!user) throw new Error('用户不存在')
  const coins = Number(req.body?.coins) || 0
  const diamonds = Number(req.body?.diamonds) || 0
  user.coins += coins
  user.diamonds += diamonds
  store.collection('coinLogs').push({ userId: user.id, delta: coins, reason: '管理员发放', at: Date.now() })
  store.save()
  audit(req, 'finance:grant', user.id, { coins, diamonds, nickname: user.nickname })
  ok(res, { id: user.id, coins: user.coins, diamonds: user.diamonds }, '发放成功')
}))

export default router
