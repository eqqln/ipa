import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { config } from './config/index.js'
import routes from './routes/index.js'
import { setupSockets } from './sockets/index.js'
import { fail } from './utils/response.js'
import { ensureAdminAccount } from './services/userService.js'
import { store } from './db/store.js'
import { ensureRootAdmin } from './admin/rbac.js'
import adminRoutes from './admin/routes.js'

export function createApp() {
  ensureAdminAccount()
  ensureRootAdmin()

  const app = express()
  app.locals.store = store
  app.use(cors({ origin: '*' }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (req, res) => {
    res.json({ ok: true, name: config.name, version: config.version, time: Date.now() })
  })
  // 企业级管理后台接口（RBAC 独立的角色权限体系）—— 必须先于旧 /api 路由挂载
  app.use('/api/admin', adminRoutes)
  app.use('/api', routes)

  app.use((req, res) => fail(res, '接口不存在', 404))
  app.use((err, req, res, next) => {
    console.error('[http]', err)
    if (res.headersSent) return next(err)
    fail(res, err?.message || '服务器内部错误', 500)
  })

  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
  })
  setupSockets(io)

  return { app, httpServer, io }
}
