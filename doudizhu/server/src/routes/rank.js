import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import { rankList, myRank } from '../services/rankService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  const type = req.query.type || 'coins'
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  ok(res, { type, list: rankList(type, limit) })
}))

router.get('/me', auth, route(async (req, res) => {
  ok(res, myRank(req.user.id, req.query.type || 'coins'))
}))

export default router
