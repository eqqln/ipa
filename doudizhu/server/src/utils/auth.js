import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { unauthorized, forbidden } from './response.js'

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    config.jwtSecret,
    { expiresIn: config.jwtExpires },
  )
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret)
  } catch {
    return null
  }
}

/** HTTP 鉴权中间件 */
export function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token
  const payload = token ? verifyToken(token) : null
  if (!payload) return unauthorized(res)
  req.user = payload
  next()
}

/** 管理后台鉴权 */
export function adminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token
  const payload = token ? verifyToken(token) : null
  if (!payload) return unauthorized(res)
  if (payload.role !== 'admin') return forbidden(res, '需要管理员权限')
  req.user = payload
  next()
}

/** Socket 鉴权：从 handshake auth / query 取 token */
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    const err = new Error('未授权')
    err.data = { message: '登录已失效' }
    return next(err)
  }
  socket.user = payload
  next()
}
