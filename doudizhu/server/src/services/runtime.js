/** 进程内运行时状态（在线用户 / socket 映射），不持久化 */
export const onlineUsers = new Map() // userId -> Set<socketId>
export const socketIndex = new Map() // socketId -> { userId, roomId, seat }
export const activeRooms = new Map() // roomId -> { engine, players, ... }

export function addOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set())
  onlineUsers.get(userId).add(socketId)
}

export function removeOnline(userId, socketId) {
  const set = onlineUsers.get(userId)
  if (!set) return
  set.delete(socketId)
  if (set.size === 0) onlineUsers.delete(userId)
}

export function isOnline(userId) {
  return onlineUsers.has(userId)
}
