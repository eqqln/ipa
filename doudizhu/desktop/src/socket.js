import { io } from 'socket.io-client'
import { SOCKET_URL } from './config'

let socket = null

/** 建立（或重建）socket 连接，token 通过 handshake.auth 传递 */
export function connect(token) {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  if (!token) return null
  // 开发环境走 vite 代理（相对路径）；生产环境 file:// 加载直连配置的服务器
  socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
    auth: { token },
  })
  socket.on('connect_error', (err) => {
    // 鉴权失败时让上层统一处理，避免无效重连风暴
    if (err?.data?.message === '登录已失效') {
      window.dispatchEvent(new CustomEvent('auth:expired'))
      disconnect()
    }
  })
  return socket
}

/** 获取当前 socket 实例（可能未连接） */
export function getSocket() {
  return socket
}

/** 断开并释放实例 */
export function disconnect() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export default { connect, getSocket, disconnect }
