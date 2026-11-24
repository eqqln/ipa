import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { adminAuth } from '../utils/auth.js'
import * as ad from '../services/adminService.js'

const router = Router()

router.get('/dashboard', adminAuth, route(async (req, res) => {
  ok(res, ad.dashboard())
}))

router.get('/users', adminAuth, route(async (req, res) => {
  ok(res, ad.listUsers(req.query.q || '', Number(req.query.page) || 1, Number(req.query.pageSize) || 20))
}))

router.post('/users/:id/status', adminAuth, route(async (req, res) => {
  ok(res, ad.setUserStatus(req.params.id, req.body?.status), '状态已更新')
}))

router.post('/users/:id/grant', adminAuth, route(async (req, res) => {
  ok(res, ad.grantUser(req.params.id, req.body || {}), '发放成功')
}))

router.get('/announcements', adminAuth, route(async (req, res) => {
  ok(res, ad.listAnnouncements())
}))

router.post('/announcements', adminAuth, route(async (req, res) => {
  ok(res, ad.addAnnouncement(req.body || {}), '公告已发布')
}))

router.delete('/announcements/:id', adminAuth, route(async (req, res) => {
  ok(res, ad.removeAnnouncement(req.params.id), '公告已删除')
}))

router.post('/broadcast', adminAuth, route(async (req, res) => {
  ok(res, ad.broadcastMail(req.body || {}), '全员邮件已发送')
}))

router.get('/coinlogs', adminAuth, route(async (req, res) => {
  ok(res, ad.coinLogs(Number(req.query.limit) || 100))
}))

router.get('/games', adminAuth, route(async (req, res) => {
  ok(res, ad.recentGames(Number(req.query.limit) || 30))
}))

export default router
