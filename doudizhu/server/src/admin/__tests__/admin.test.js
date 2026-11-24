import test from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, hasPermission, listRoles, createAdmin, listAdmins, deleteAdmin } from '../rbac.js'
import { verifyAdminLogin, ensureRootAdmin } from '../rbac.js'
import { overview, retention, userSegments } from '../analytics.js'
import { scanRiskEvents, riskStats, handleRiskEvent } from '../risk.js'
import { listConfig, updateConfig, getConfigValue } from '../config.js'
import { store } from '../../db/store.js'

test('RBAC：角色权限判定', () => {
  assert.equal(hasPermission('super_admin', 'anything:go'), true)
  assert.equal(hasPermission('finance', 'finance:grant'), true)
  assert.equal(hasPermission('finance', 'user:ban'), false)
  assert.equal(hasPermission('service', 'content:view'), true)
  assert.equal(hasPermission('service', 'finance:view'), false)
  assert.equal(hasPermission('unknown', 'x'), false)
  assert.ok(listRoles().length >= 5)
})

test('RBAC：管理员增删改与登录', () => {
  ensureRootAdmin()
  const name = `admin_${Date.now().toString().slice(-6)}`
  const created = createAdmin({ username: name, password: '123456', name: '测试管理员', role: 'operation' })
  assert.equal(created.role, 'operation')
  assert.ok(listAdmins().find((a) => a.username === name))
  assert.ok(verifyAdminLogin(name, '123456'))
  assert.equal(verifyAdminLogin(name, 'wrongpass'), null)
  assert.equal(deleteAdmin(created.id), true)
  assert.equal(verifyAdminLogin(name, '123456'), null)
})

test('RBAC：不能删除根管理员', () => {
  ensureRootAdmin()
  const root = store.find('admins', (a) => a.username === 'admin')
  assert.throws(() => deleteAdmin(root.id), /超级管理员/)
})

test('审计权限校验覆盖', () => {
  assert.ok(ROLES.operation.permissions.includes('user:ban'))
  assert.ok(ROLES.analyst.permissions.includes('analytics:view'))
  assert.equal(ROLES.analyst.permissions.includes('user:ban'), false)
})

test('数据分析：总览/留存/分层结构正确', () => {
  const ov = overview(7)
  assert.equal(ov.days, 7)
  assert.equal(ov.daily.length, 7)
  assert.ok(Array.isArray(ov.summary.gameDistribution))
  const ret = retention()
  assert.equal(ret.length, 3)
  assert.ok(ret.every((r) => typeof r.rate === 'number'))
  assert.ok(Array.isArray(userSegments()))
})

test('风控：事件扫描与统计结构正确', () => {
  const events = scanRiskEvents()
  assert.ok(Array.isArray(events))
  const stats = riskStats()
  assert.equal(typeof stats.total, 'number')
  assert.equal(typeof stats.high, 'number')
  assert.equal(stats.total, events.length)
  if (events.length) {
    const r = handleRiskEvent(events[0].id, { status: 'resolved', handledBy: 'test' })
    assert.equal(r.status, 'resolved')
  }
})

test('配置中心：读写与默认值', () => {
  ensureRootAdmin()
  const all = listConfig()
  assert.ok(all.registerCoins)
  const old = getConfigValue('registerCoins')
  updateConfig('registerCoins', 12345)
  assert.equal(getConfigValue('registerCoins'), 12345)
  updateConfig('registerCoins', old)
  assert.equal(getConfigValue('registerCoins'), old)
  assert.throws(() => updateConfig('not_exist', 1), /未知配置项/)
})
