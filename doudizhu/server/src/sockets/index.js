/**
 * Socket.IO 实时对战层（同时支持斗地主与内蒙麻将）
 * 通过游戏适配器 dispatch：不同游戏引擎共享同一套在线/超时/广播调度
 */
import { socketAuth } from '../utils/auth.js'
import { config } from '../config/index.js'
import { GameEngine, STATE as DDZ_STATE } from '../game/GameEngine.js'
import { MahjongEngine, MJ_STATE } from '../mahjong/MahjongEngine.js'
import { addOnline, removeOnline, socketIndex } from '../services/runtime.js'
import { getRoom, resolvePlayers, leaveRoom, destroyRoom, publicRoom } from '../services/roomService.js'
import { findUserById, applyGameResult } from '../services/userService.js'
import { syncProgress } from '../services/taskService.js'
import { addRecord } from '../services/recordService.js'
import { saveChat, friendList } from '../services/friendService.js'

let ioRef = null

/** AI 思考延迟：默认 600-1000ms（真人节奏）；设置 AI_THINK_MS 可加速（测试用） */
function aiThinkMs() {
  const fixed = Number(process.env.AI_THINK_MS || 0)
  return fixed > 0 ? fixed : 600 + Math.floor(Math.random() * 400)
}

export function setupSockets(io) {
  ioRef = io
  io.use(socketAuth)
  io.on('connection', handleConnection)
}

/** 游戏类型 → 终局状态集合 */
function isTerminal(room) {
  const e = room.engine
  if (!e) return true
  return room.game === 'mahjong'
    ? [MJ_STATE.WAITING, MJ_STATE.FINISHED].includes(e.state)
    : [DDZ_STATE.WAITING, DDZ_STATE.FINISHED].includes(e.state)
}

function broadcastStates(room) {
  const engine = room?.engine
  if (!engine) return
  for (const p of engine.players) {
    if (!p.isHuman) continue
    ioRef.to(`user:${p.id}`).emit('game:state', engine.snapshot(p.seat))
  }
}

function turnTimeoutMs(room) {
  if (room.game === 'mahjong') return config.game.playTimeoutMs
  const state = room.engine.state
  if ([DDZ_STATE.BIDDING, DDZ_STATE.GRABBING].includes(state)) return config.game.bidTimeoutMs
  if (state === DDZ_STATE.DOUBLING) return config.game.doubleTimeoutMs
  return config.game.playTimeoutMs
}

function afterChange(room) {
  clearTimeout(room.timers.ai)
  clearTimeout(room.timers.turn)
  const engine = room.engine
  if (!engine) return
  broadcastStates(room)

  if (isTerminal(room)) return
  const seat = engine.current
  const p = engine.players[seat]
  if (!p) return

  if (!p.isHuman || p.trust) {
    room.timers.ai = setTimeout(() => {
      if (room.engine !== engine || isTerminal(room)) return
      // autoStep 内部的引擎方法会 emit('change') 自动回调 afterChange，此处不再手动调用
      engine.autoStep(engine.current)
    }, aiThinkMs())
  } else {
    room.timers.turn = setTimeout(() => {
      if (room.engine !== engine || isTerminal(room)) return
      if (p.trust) return
      p.trust = true
      ioRef.to(room.id).emit('game:system', { text: `${p.name} 超时，已自动托管`, seat })
      // autoStep 内部会 emit('change') 自动回调 afterChange
      engine.autoStep(engine.current)
    }, turnTimeoutMs(room))
  }
}

function startGame(room) {
  if (!room) return
  if (room.engine && !isTerminal(room)) return
  clearTimeout(room.timers.restart)

  const players = resolvePlayers(room)
  let engine
  if (room.game === 'mahjong') {
    engine = new MahjongEngine({
      players, baseScore: room.baseScore, roomId: room.id, options: room.options,
    })
  } else {
    engine = new GameEngine({ players, baseScore: room.baseScore, roomId: room.id })
  }
  room.engine = engine
  room.status = 'playing'

  engine.on('change', () => afterChange(room))
  engine.on('system', (payload) => ioRef.to(room.id).emit('game:system', payload))
  engine.on('finish', (result) => handleFinish(room, result))
  engine.emit('system', { text: `${room.game === 'mahjong' ? '内蒙麻将' : '斗地主'}对局开始` })

  if (room.game === 'mahjong') {
    // 麻将先定庄家（房主坐庄），start 内部会发牌
    engine.start(0)
  } else {
    engine.start()
  }
  ioRef.to(room.id).emit('game:started', { roomId: room.id, game: room.game })
}

function handleFinish(room, result) {
  clearTimeout(room.timers.ai)
  clearTimeout(room.timers.turn)
  const engine = room.engine
  const isMJ = room.game === 'mahjong'
  const details = []

  for (const ep of engine.players) {
    if (!ep.isHuman) continue
    const user = findUserById(ep.id)
    if (!user) continue
    const delta = (result.deltas?.[ep.seat]) || 0
    let win
    if (isMJ) win = !result.draw && result.winner === ep.seat
    else win = result.landlordWin === (ep.seat === result.landlord)

    const bombs = !isMJ && win ? result.bombCount : 0
    const exp = Math.min(300, Math.max(20, Math.round(Math.abs(delta) / 20)))
    applyGameResult(user.id, { delta, win, bombs, exp })
    syncProgress(user.id)
    details.push({
      id: user.id,
      name: ep.name,
      seat: ep.seat,
      delta,
      win,
      isLandlord: !isMJ && ep.seat === result.landlord,
      isDealer: isMJ && ep.seat === result.dealer,
    })
  }

  const record = {
    roomId: room.id,
    game: room.game,
    players: details,
  }
  if (isMJ) {
    Object.assign(record, {
      winner: result.winner ?? null,
      draw: !!result.draw,
      patterns: result.patterns || [],
      fanScore: result.fanScore || 0,
      method: result.method || '',
      dealer: result.dealer,
    })
  } else {
    Object.assign(record, {
      landlord: result.landlord,
      landlordWin: result.landlordWin,
      spring: result.spring,
      multiplier: result.multiplier,
      baseScore: result.baseScore,
      bombCount: result.bombCount,
    })
  }
  addRecord(record)

  broadcastStates(room)
  ioRef.to(room.id).emit('game:finish', result)
  for (const p of room.players) {
    const u = findUserById(p.id)
    if (u) {
      ioRef.to(`user:${p.id}`).emit('user:updated', {
        coins: u.coins, diamonds: u.diamonds, exp: u.exp, level: u.level,
      })
    }
  }

  // 麻将按引擎给出的 nextDealer 轮庄
  const nextDealer = isMJ ? result.nextDealer : null
  room.timers.restart = setTimeout(() => {
    if (!getRoom(room.id) || room.engine !== engine || !isTerminal(room)) return
    if (isMJ) {
      const players = resolvePlayers(room)
      const newEngine = new MahjongEngine({
        players, baseScore: room.baseScore, roomId: room.id, options: room.options,
      })
      room.engine = newEngine
      newEngine.on('change', () => afterChange(room))
      newEngine.on('system', (payload) => ioRef.to(room.id).emit('game:system', payload))
      newEngine.on('finish', (r) => handleFinish(room, r))
      newEngine.start(nextDealer ?? 0)
    } else {
      startGame(room)
    }
  }, 12000)
}

function handleConnection(socket) {
  const userId = socket.user.id
  const user = findUserById(userId)
  if (!user || user.status === 'banned') {
    socket.emit('game:error', { message: '账号状态异常' })
    return socket.disconnect(true)
  }

  addOnline(userId, socket.id)
  socketIndex.set(socket.id, { userId, roomId: null })
  socket.join(`user:${userId}`)

  for (const f of friendList(userId)) {
    ioRef.to(`user:${f.id}`).emit('friend:online', { id: userId, online: true })
  }

  socket.on('room:join', ({ roomId } = {}) => {
    const room = getRoom(String(roomId || ''))
    if (!room) return socket.emit('game:error', { message: '房间不存在' })
    const prev = socketIndex.get(socket.id)?.roomId
    if (prev && prev !== room.id) socket.leave(prev)
    socket.join(room.id)
    socketIndex.set(socket.id, { userId, roomId: room.id })

    if (room.engine) {
      const ep = room.engine.players.find((p) => p.id === userId)
      if (ep) ep.connected = true
      socket.emit('game:state', room.engine.snapshot(ep ? ep.seat : null))
    }
    ioRef.to(room.id).emit('room:players', publicRoom(room).players)

    // 人机房：房主进桌即用机器人补位并开局，避免单人玩家无对手可等
    if (room.mode === 'ai' && room.ownerId === userId && !room.engine) {
      setTimeout(() => {
        const fresh = getRoom(room.id)
        if (!fresh || fresh.engine || fresh.ownerId !== userId) return
        startGame(fresh)
      }, 120)
    }
  })

  socket.on('room:leave', () => {
    const info = socketIndex.get(socket.id)
    if (!info?.roomId) return
    const room = getRoom(info.roomId)
    socket.leave(info.roomId)
    socketIndex.set(socket.id, { userId, roomId: null })
    if (room?.engine && isTerminal(room)) {
      const meta = leaveRoom(info.roomId, userId)
      if (!meta) destroyRoom(info.roomId)
      ioRef.to(info.roomId).emit('room:players', meta?.players || [])
    } else {
      socket.emit('game:error', { message: '对局进行中，已为你开启托管' })
      if (room?.engine) {
        const ep = room.engine.players.find((p) => p.id === userId)
        if (ep) { ep.trust = true; afterChange(room) }
      }
    }
  })

  socket.on('game:start', () => {
    const roomId = socketIndex.get(socket.id)?.roomId
    const room = getRoom(roomId)
    if (!room) return socket.emit('game:error', { message: '请先进入房间' })
    if (room.ownerId !== userId) return socket.emit('game:error', { message: '只有房主可以开始游戏' })
    startGame(room)
  })

  socket.on('game:action', ({ type, data = {} } = {}) => {
    const roomId = socketIndex.get(socket.id)?.roomId
    const room = getRoom(roomId)
    const engine = room?.engine
    if (!engine) return socket.emit('game:error', { message: '当前不在对局中' })
    const seat = engine.players.findIndex((p) => p.id === userId)
    if (seat < 0) return socket.emit('game:error', { message: '你不在此对局中' })

    let result = null
    if (room.game === 'mahjong') {
      switch (type) {
        case 'draw': result = engine.draw(seat); break
        case 'discard': result = engine.discard(seat, data.tileId); break
        case 'selfwin': result = engine.selfWin(seat); break
        case 'claim': result = engine.claim(seat, data.claimType); break
        case 'passall': result = engine.passAll(); break
        case 'kong': result = engine.concealedKong(seat, data.key); break
        default: result = { ok: false, msg: '未知操作' }
      }
    } else {
      switch (type) {
        case 'bid': result = engine.bid(seat, Number(data.score)); break
        case 'grab': result = engine.grab(seat, !!data.yes); break
        case 'double': result = engine.double(seat, !!data.yes); break
        case 'play': result = engine.play(seat, data.ids); break
        case 'pass': result = engine.pass(seat); break
        case 'ming': result = engine.mingpai(seat); break
        default: result = { ok: false, msg: '未知操作' }
      }
    }
    if (result && result.ok === false) socket.emit('game:error', { message: result.msg })
  })

  socket.on('game:trust', ({ value } = {}) => {
    const room = getRoom(socketIndex.get(socket.id)?.roomId)
    const engine = room?.engine
    if (!engine) return
    const seat = engine.players.findIndex((p) => p.id === userId)
    if (seat < 0) return
    if (room.game === 'mahjong') engine.players[seat].trust = !!value
    else engine.setTrust(seat, !!value)
    afterChange(room)
  })

  socket.on('chat:room', ({ text } = {}) => {
    const roomId = socketIndex.get(socket.id)?.roomId
    if (!roomId) return
    ioRef.to(roomId).emit('chat:room', {
      fromId: userId,
      from: user.nickname,
      text: String(text || '').slice(0, 200),
      at: Date.now(),
    })
  })

  socket.on('chat:private', ({ toId, text } = {}) => {
    if (!toId) return
    const msg = saveChat(userId, toId, text)
    ioRef.to(`user:${userId}`).emit('chat:private', msg)
    ioRef.to(`user:${toId}`).emit('chat:private', msg)
  })

  socket.on('disconnect', () => {
    removeOnline(userId, socket.id)
    const info = socketIndex.get(socket.id)
    if (info?.roomId) {
      const room = getRoom(info.roomId)
      if (room?.engine && !isTerminal(room)) {
        const ep = room.engine.players.find((p) => p.id === userId)
        if (ep) {
          ep.connected = false
          ep.trust = true
          ioRef.to(room.id).emit('game:system', { text: `${ep.name} 掉线，已自动托管`, seat: ep.seat })
          afterChange(room)
        }
      }
    }
    socketIndex.delete(socket.id)
    for (const f of friendList(userId)) {
      ioRef.to(`user:${f.id}`).emit('friend:online', { id: userId, online: false })
    }
  })
}
