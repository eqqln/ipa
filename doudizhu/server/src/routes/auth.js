import { Router } from 'express'
import { route, ok, unauthorized } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import * as us from '../services/userService.js'

const router = Router()

router.post('/register', route(async (req, res) => {
  ok(res, us.register(req.body || {}), '注册成功')
}))

router.post('/login', route(async (req, res) => {
  ok(res, us.login(req.body || {}), '登录成功')
}))

router.get('/me', auth, route(async (req, res) => {
  const user = us.findUserById(req.user.id)
  if (!user) return unauthorized(res)
  ok(res, us.publicUser(user))
}))

router.post('/password', auth, route(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  us.changePassword(req.user.id, oldPassword, newPassword)
  ok(res, null, '密码修改成功')
}))

export default router
