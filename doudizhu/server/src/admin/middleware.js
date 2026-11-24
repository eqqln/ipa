/**
 * 管理端鉴权中间件：支持玩家 admin 账号与 RBAC 独立管理员
 */
import { verifyToken } from '../utils/auth.js'
import { hasPermission } from './rbac.js'
import { audit } from './audit.js'

/** 解析管理员身份（兼容两类 token） */
export function resolveAdmin(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token
  const payload = token ? verifyToken(token) : null
  if (!payload) return res.status(401).json({ code: 401, message: '登录已失效', data: null })

  // 玩家表中的 admin 角色（旧体系）
  let adminInfo = null
  if (payload.role === 'admin') {
    adminInfo = { id: payload.id, username: payload.username, name: '系统管理员', role: 'super_admin' }
  } else {
    // RBAC 管理员表
    const { store } = req.app.locals
    const rbacAdmin = store.find('admins', (a) => a.id === payload.id)
    if (rbacAdmin) {
      adminInfo = {
        id: rbacAdmin.id,
        username: rbacAdmin.username,
        name: rbacAdmin.name,
        role: rbacAdmin.role,
      }
    }
  }
  if (!adminInfo) return res.status(403).json({ code: 403, message: '需要管理员权限', data: null })
  req.admin = adminInfo
  next()
}

/** 权限校验工厂 */
export function requirePerm(permission) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ code: 401, message: '未认证', data: null })
    if (!hasPermission(req.admin.role, permission)) {
      audit(req, 'permission:denied', permission, { role: req.admin.role }, 'warn')
      return res.status(403).json({ code: 403, message: '权限不足', data: null })
    }
    next()
  }
}
