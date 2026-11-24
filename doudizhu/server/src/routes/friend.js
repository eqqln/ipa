import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as fs from '../services/friendService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  ok(res, fs.friendList(req.user.id))
}))

router.get('/search', auth, route(async (req, res) => {
  ok(res, fs.searchUsers(req.query.q || ''))
}))

router.post('/add', auth, route(async (req, res) => {
  ok(res, fs.addFriend(req.user.id, req.body?.keyword), '好友添加成功')
}))

router.delete('/:id', auth, route(async (req, res) => {
  ok(res, fs.removeFriend(req.user.id, req.params.id), '已删除好友')
}))

router.get('/:id/chat', auth, route(async (req, res) => {
  ok(res, fs.chatHistory(req.user.id, req.params.id, Number(req.query.limit) || 50))
}))

export default router
