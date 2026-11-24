import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import { tasksForUser, claimTask } from '../services/taskService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  ok(res, tasksForUser(req.user.id))
}))

router.post('/:id/claim', auth, route(async (req, res) => {
  ok(res, claimTask(req.user.id, req.params.id), '任务奖励已领取')
}))

export default router
