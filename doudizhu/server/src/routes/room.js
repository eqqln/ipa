import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as rs from '../services/roomService.js'
import { findUserById } from '../services/userService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  ok(res, rs.listRooms(req.query.game || null))
}))

router.post('/', auth, route(async (req, res) => {
  const user = findUserById(req.user.id)
  ok(res, rs.createRoom(user, req.body || {}), '房间创建成功')
}))

router.post('/quick', auth, route(async (req, res) => {
  const user = findUserById(req.user.id)
  const { mode, baseScore, game, allowSevenPairs, allowPiao, allowOneShotThree } = req.body || {}
  const result = rs.matchRoom(user, mode || 'human', baseScore, game || 'doudizhu', {
    allowSevenPairs, allowPiao, allowOneShotThree,
  })
  ok(res, result)
}))

router.get('/:id', auth, route(async (req, res) => {
  const room = rs.getRoom(req.params.id)
  if (!room) throw new Error('房间不存在')
  ok(res, rs.publicRoom(room))
}))

router.post('/:id/join', auth, route(async (req, res) => {
  const user = findUserById(req.user.id)
  ok(res, rs.joinRoom(req.params.id, user, req.body?.password || ''), '加入房间成功')
}))

router.post('/:id/leave', auth, route(async (req, res) => {
  ok(res, rs.leaveRoom(req.params.id, req.user.id), '已离开房间')
}))

export default router
