import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as ms from '../services/mailService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  ok(res, ms.listMails(req.user.id))
}))

router.post('/:id/read', auth, route(async (req, res) => {
  ms.readMail(req.user.id, req.params.id)
  ok(res, null, '已读')
}))

router.post('/:id/claim', auth, route(async (req, res) => {
  ok(res, ms.claimMail(req.user.id, req.params.id), '奖励领取成功')
}))

router.post('/:id/delete', auth, route(async (req, res) => {
  ms.deleteMail(req.user.id, req.params.id)
  ok(res, null, '已删除')
}))

export default router
