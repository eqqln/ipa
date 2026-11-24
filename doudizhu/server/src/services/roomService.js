import { nanoid } from 'nanoid'
import { config } from '../config/index.js'
import { activeRooms } from './runtime.js'
import { findUserById } from './userService.js'

export const GAME_TYPES = ['doudizhu', 'mahjong']

/** 不同游戏的人数上限 */
export function maxPlayersOf(game) {
  return game === 'mahjong' ? 4 : config.room.maxPlayers
}

export function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    game: room.game || 'doudizhu',
    ownerId: room.ownerId,
    ownerName: room.ownerName,
    baseScore: room.baseScore,
    mode: room.mode,
    hasPassword: !!room.password,
    status: room.status,
    playerCount: room.players.length,
    maxPlayers: maxPlayersOf(room.game),
    options: room.options || {},
    players: room.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, seat: p.seat })),
    createdAt: room.createdAt,
  }
}

export function createRoom(user, opts = {}) {
  const baseScore = Number(opts.baseScore) || config.room.defaultBaseScore
  if (!config.room.baseScores.includes(baseScore)) throw new Error('无效的房间底分')
  if (user.coins < baseScore * 10) throw new Error('金币不足，无法进入该房间')
  const mode = opts.mode === 'ai' ? 'ai' : 'human'
  const game = GAME_TYPES.includes(opts.game) ? opts.game : 'doudizhu'
  const options = game === 'mahjong' ? {
    allowSevenPairs: opts.allowSevenPairs !== false,
    allowPiao: opts.allowPiao !== false,
    allowOneShotThree: !!opts.allowOneShotThree,
  } : {}
  const room = {
    id: nanoid(6).toUpperCase(),
    name: String(opts.name || `${user.nickname}的房间`).slice(0, 20),
    game,
    ownerId: user.id,
    ownerName: user.nickname,
    baseScore,
    mode,
    options,
    password: opts.password ? String(opts.password).slice(0, 16) : '',
    status: 'waiting',
    players: [{ id: user.id, name: user.nickname, avatar: user.avatar, seat: 0 }],
    createdAt: Date.now(),
    engine: null,
    timers: {},
    lastPlayAt: 0,
  }
  activeRooms.set(room.id, room)
  return publicRoom(room)
}

export function getRoom(id) {
  return activeRooms.get(id) || null
}

export function listRooms(game = null) {
  return [...activeRooms.values()]
    .filter((r) => (!game || (r.game || 'doudizhu') === game))
    .filter((r) => r.status === 'waiting' && r.players.length < maxPlayersOf(r.game))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicRoom)
}

export function joinRoom(id, user, password = '') {
  const room = getRoom(id)
  if (!room) throw new Error('房间不存在或已解散')
  if (room.password && room.password !== String(password)) throw new Error('房间密码错误')
  if (room.status !== 'waiting') throw new Error('对局已经开始')
  if (room.players.length >= maxPlayersOf(room.game)) throw new Error('房间已满')
  if (room.players.some((p) => p.id === user.id)) return publicRoom(room)
  if (user.coins < room.baseScore * 10) throw new Error('金币不足，无法进入该房间')
  room.players.push({
    id: user.id,
    name: user.nickname,
    avatar: user.avatar,
    seat: room.players.length,
  })
  return publicRoom(room)
}

export function leaveRoom(id, userId) {
  const room = getRoom(id)
  if (!room) return null
  room.players = room.players.filter((p) => p.id !== userId)
  if (room.players.length === 0 || room.ownerId === userId) {
    destroyRoom(id)
    return null
  }
  room.players.forEach((p, i) => { p.seat = i })
  return publicRoom(room)
}

export function destroyRoom(id) {
  const room = getRoom(id)
  if (!room) return false
  if (room.timers) {
    for (const timer of Object.values(room.timers)) {
      if (timer) clearTimeout(timer)
    }
  }
  return activeRooms.delete(id)
}

/** 快速匹配：优先加入已有房间，否则新建 */
export function matchRoom(user, mode = 'human', baseScore = config.room.defaultBaseScore, game = 'doudizhu', options = {}) {
  const candidates = [...activeRooms.values()].filter((r) =>
    r.status === 'waiting' && r.mode === mode && !r.password &&
    (r.game || 'doudizhu') === game &&
    r.baseScore === baseScore && r.players.length < maxPlayersOf(r.game) &&
    !r.players.some((p) => p.id === user.id),
  )
  if (candidates.length) {
    return { room: joinRoom(candidates[0].id, user), matched: true }
  }
  return { room: createRoom(user, { mode, baseScore, game, ...options }), matched: false }
}

/** 补齐人机空位 */
export function resolvePlayers(room) {
  const players = room.players.map((p) => ({ ...p, isHuman: true }))
  if (room.mode === 'ai') {
    const isMJ = room.game === 'mahjong'
    const BOT_NAMES = isMJ
      ? ['麻友张三', '麻友李四', '麻友王五', '麻友赵六', '内蒙麻神', '牌友小甜柚']
      : ['小地主', '牌神007', '农民阿强', '欢乐豆', '斗地主达人', '老王', '牌王', '小甜柚']
    const needed = maxPlayersOf(room.game)
    let i = 0
    while (players.length < needed) {
      const idx = (room.players.length + i) % BOT_NAMES.length
      players.push({
        id: `bot-${nanoid(6)}`,
        name: BOT_NAMES[idx],
        avatar: '',
        isHuman: false,
      })
      i++
    }
  }
  return players
}

export function userInRoom(userId) {
  for (const room of activeRooms.values()) {
    if (room.players.some((p) => p.id === userId)) return room
  }
  return null
}
