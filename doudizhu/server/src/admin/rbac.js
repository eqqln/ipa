/**
 * RBAC 权限体系
 * 角色：super_admin(超管) / operation(运营) / finance(财务) / service(客服) / analyst(分析师)
 * 权限点：模块:操作，如 user:ban, finance:grant
 */
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { store } from '../db/store.js'

export const ROLES = {
  super_admin: {
    name: '超级管理员',
    desc: '拥有全部权限，不可删除',
    permissions: ['*'],
  },
  operation: {
    name: '运营',
    desc: '用户管理、内容管理、游戏管控',
    permissions: [
      'dashboard:view', 'user:view', 'user:ban', 'content:view', 'content:edit',
      'game:view', 'game:kick', 'risk:view', 'risk:handle', 'audit:view', 'analytics:view',
    ],
  },
  finance: {
    name: '财务',
    desc: '财务流水、金币发放、经济报表',
    permissions: [
      'dashboard:view', 'user:view', 'finance:view', 'finance:grant',
      'analytics:view', 'audit:view',
    ],
  },
  service: {
    name: '客服',
    desc: '用户查询、邮件、基础内容',
    permissions: ['dashboard:view', 'user:view', 'content:view'],
  },
  analyst: {
    name: '数据分析师',
    desc: '仅查看报表与审计',
    permissions: ['dashboard:view', 'analytics:view', 'audit:view'],
  },
}

export function hasPermission(role, permission) {
  const def = ROLES[role]
  if (!def) return false
  if (def.permissions.includes('*')) return true
  return def.permissions.includes(permission)
}

export function listRoles() {
  return Object.entries(ROLES).map(([key, v]) => ({
    key, name: v.name, desc: v.desc, permissions: v.permissions,
  }))
}

export function listAdmins() {
  return store.filter('admins', () => true).map((a) => ({
    id: a.id,
    username: a.username,
    name: a.name,
    role: a.role,
    roleName: ROLES[a.role]?.name || a.role,
    permissions: ROLES[a.role]?.permissions || [],
    status: a.status,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  }))
}

export function createAdmin({ username, password, name, role }) {
  if (!/^[a-z0-9_]{3,20}$/.test(String(username || '').toLowerCase())) {
    throw new Error('账号需为 3-20 位字母数字下划线')
  }
  if (String(password || '').length < 6) throw new Error('密码至少 6 位')
  if (!ROLES[role]) throw new Error('无效角色')
  if (store.find('admins', (a) => a.username === username.toLowerCase())) {
    throw new Error('管理员账号已存在')
  }
  const admin = {
    id: nanoid(10),
    username: username.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 8),
    name: name || username,
    role,
    status: 'active',
    createdAt: Date.now(),
    lastLoginAt: 0,
  }
  store.insert('admins', admin)
  return listAdmins().find((a) => a.id === admin.id)
}

export function deleteAdmin(id) {
  const admin = store.find('admins', (a) => a.id === id)
  if (!admin) throw new Error('管理员不存在')
  if (admin.username === 'admin') throw new Error('不能删除超级管理员根账号')
  return store.remove('admins', (a) => a.id === id) !== null
}

export function verifyAdminLogin(username, password) {
  const admin = store.find('admins', (a) => a.username === String(username || '').toLowerCase())
  if (!admin || admin.status !== 'active') return null
  if (!bcrypt.compareSync(String(password || ''), admin.passwordHash)) return null
  admin.lastLoginAt = Date.now()
  store.save()
  return admin
}

/** 确保根管理员存在，并纳入 RBAC 体系 */
export function ensureRootAdmin() {
  const existing = store.find('admins', (a) => a.username === 'admin')
  if (!existing) {
    store.insert('admins', {
      id: 'admin-root',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123456', 8),
      name: '系统超级管理员',
      role: 'super_admin',
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: 0,
    })
  }
}
