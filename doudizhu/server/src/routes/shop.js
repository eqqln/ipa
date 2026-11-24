import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as ss from '../services/shopService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  ok(res, ss.shopList())
}))

router.get('/bag', auth, route(async (req, res) => {
  ok(res, ss.userItems(req.user.id))
}))

router.post('/buy', auth, route(async (req, res) => {
  const { itemId, payType } = req.body || {}
  ok(res, ss.buyItem(req.user.id, itemId, payType || 'coins'), '购买成功')
}))

router.post('/equip', auth, route(async (req, res) => {
  ok(res, ss.equipItem(req.user.id, req.body?.itemId), '装备成功')
}))

router.post('/use', auth, route(async (req, res) => {
  ok(res, ss.consumeItem(req.user.id, req.body?.itemId), '道具已使用')
}))

export default router
