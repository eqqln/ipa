import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as us from '../services/userService.js'
import * as ts from '../services/taskService.js'
import { unreadCount } from '../services/mailService.js'

const router = Router()

router.get('/profile', auth, route(async (req, res) => {
  const user = us.findUserById(req.user.id)
  ok(res, {
    ...us.publicUser(user),
    unreadMails: unreadCount(req.user.id),
    levelInfo: us.levelInfo(user.exp),
  })
}))

router.get('/profile/:id', auth, route(async (req, res) => {
  const user = us.findUserById(req.params.id)
  if (!user) throw new Error('用户不存在')
  const { coins, diamonds, ...safe } = us.publicUser(user)
  ok(res, safe)
}))

router.put('/profile', auth, route(async (req, res) => {
  ok(res, us.updateProfile(req.user.id, req.body || {}), '资料已更新')
}))

router.post('/signin', auth, route(async (req, res) => {
  const result = us.signin(req.user.id)
  ts.syncProgress(req.user.id)
  ok(res, result, `签到成功，连续 ${result.streak} 天`)
}))

router.post('/bankruptcy', auth, route(async (req, res) => {
  ok(res, us.bankruptcy(req.user.id), '破产补助已发放')
}))

router.get('/stats', auth, route(async (req, res) => {
  const user = us.findUserById(req.user.id)
  ok(res, {
    games: user.games || 0,
    wins: user.wins || 0,
    losses: user.losses || 0,
    winRate: user.games ? Math.round(((user.wins || 0) / user.games) * 100) : 0,
    totalBombs: user.totalBombs || 0,
    level: user.level,
    exp: user.exp,
  })
}))

export default router
