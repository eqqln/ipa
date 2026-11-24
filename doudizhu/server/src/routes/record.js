import { Router } from 'express'
import { route, ok } from '../utils/response.js'
import { auth } from '../utils/auth.js'
import { listRecords, recordDetail } from '../services/recordService.js'

const router = Router()

router.get('/', auth, route(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(Number(req.query.pageSize) || 20, 100)
  ok(res, listRecords(req.user.id, page, pageSize))
}))

router.get('/:id', auth, route(async (req, res) => {
  const record = recordDetail(req.params.id)
  if (!record) throw new Error('战绩不存在')
  ok(res, record)
}))

export default router
