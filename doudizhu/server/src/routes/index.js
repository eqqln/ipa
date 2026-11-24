import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import authRoutes from './auth.js'
import userRoutes from './user.js'
import roomRoutes from './room.js'
import rankRoutes from './rank.js'
import mailRoutes from './mail.js'
import taskRoutes from './task.js'
import shopRoutes from './shop.js'
import friendRoutes from './friend.js'
import recordRoutes from './record.js'
import adminRoutes from './admin.js'
import { store } from '../db/store.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/user', userRoutes)
router.use('/room', roomRoutes)
router.use('/rank', rankRoutes)
router.use('/mail', mailRoutes)
router.use('/task', taskRoutes)
router.use('/shop', shopRoutes)
router.use('/friend', friendRoutes)
router.use('/record', recordRoutes)
router.use('/admin', adminRoutes)

router.get('/announcements', auth, route(async (req, res) => {
  ok(res, store.data.announcements.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt))
}))

export default router
