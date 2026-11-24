/**
 * 内蒙麻将对局状态机
 * 4 人局：庄家 14 张起手，闲家 13 张；只碰不杠吃（明杠/暗杠/补杠）；胡牌判定
 */
import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import {
  createMahjongDeck, shuffleTiles, sortTiles, tileKey, buildCounts,
} from './tiles.js'
import { canWin, canWinTiles, scoreHand, getTingTiles, canPung, canKong } from './pattern.js'

export const MJ_STATE = {
  WAITING: 'waiting',
  DEALING: 'dealing',
  PLAYING: 'playing',
  CLAIM: 'claim', // 等待碰杠胡响应
  FINISHED: 'finished',
}

export class MahjongEngine extends EventEmitter {
  constructor({ players, baseScore = 10, roomId = '', options = {} } = {}) {
    super()
    this.roomId = roomId
    this.baseScore = baseScore
    this.options = {
      allowSevenPairs: options.allowSevenPairs !== false,
      allowPiao: options.allowPiao !== false,
      allowOneShotThree: !!options.allowOneShotThree,
      allowBrightKong: options.allowBrightKong !== false,
      allowConcealedKong: options.allowConcealedKong !== false,
    }
    this.players = players.map((p, i) => ({
      seat: i,
      id: p.id,
      name: p.name || `玩家${i + 1}`,
      avatar: p.avatar || '',
      isHuman: p.isHuman !== false,
      hand: [],
      melds: [],        // 已碰/杠的牌组 {type:'pung'|'kong', key, from}
      discarded: [],    // 自己打出的牌
      score: 0,
      trust: false,
      connected: true,
    }))
    this._reset()
  }

  _reset() {
    this.state = MJ_STATE.WAITING
    this.dealer = 0             // 庄家座位
    this.current = 0
    this.wall = []
    this.lastDiscard = null     // {seat, tile}
    this.pendingClaims = []     // [{seat, type:'pung'|'kong'|'win'}]
    this.result = null
    this.round = 0
    this.kongScores = []        // 杠分记录
    this.afterGang = false
    this.passWinMap = {}        // 过胡限制
  }

  _changed() {
    this.emit('change')
  }

  start(firstDealer = null) {
    this._reset()
    this.round++
    if (firstDealer !== null) this.dealer = firstDealer
    this.wall = shuffleTiles(createMahjongDeck())
    for (const p of this.players) {
      p.hand = []
      p.melds = []
      p.discarded = []
      p.score = 0
      p.trust = false
    }
    // 庄家 14 张，其余 13 张
    for (let i = 0; i < 14; i++) this.players[0].hand.push(this.wall.pop())
    for (let s = 1; s < this.players.length; s++) {
      for (let i = 0; i < 13; i++) this.players[s].hand.push(this.wall.pop())
    }
    for (const p of this.players) p.hand = sortTiles(p.hand)
    this.state = MJ_STATE.PLAYING
    this.current = this.dealer
    this.lastDiscard = null
    this.emit('system', { text: `第 ${this.round} 局开始，庄家：${this.players[this.dealer].name}` })
    this._changed()
    return { ok: true }
  }

  /** 手牌计数（含已碰杠的牌组，杠算刻子） */
  _handCounts(seat) {
    const p = this.players[seat]
    const counts = buildCounts(p.hand)
    for (const m of p.melds) {
      const key = m.key
      // 碰 3 张、杠 4 张但胡牌判定中杠按刻子（3 张）计算
      counts[key] = (counts[key] || 0) + (m.type === 'kong' ? 3 : 3)
    }
    // 移除自身手牌中已被用于碰杠的牌
    return counts
  }

  /** 完整手牌数（含副露）：用于胡牌判定需 14 张 */
  _fullTileCount(seat) {
    const p = this.players[seat]
    let n = p.hand.length
    for (const m of p.melds) n += m.type === 'kong' ? 3 : 3
    return n
  }

  /** 自摸胡牌判定 */
  canSelfWin(seat) {
    if (this._fullTileCount(seat) !== 14) return false
    const counts = this._handCounts(seat)
    return !!canWin(counts, { allowSevenPairs: this.options.allowSevenPairs })
  }

  /** 点炮胡牌判定：手牌 13 张 + 目标牌 */
  canWinOn(seat, tile) {
    if (this._fullTileCount(seat) !== 13) return false
    const key = tileKey(tile)
    if (this.passWinMap[seat] === key) return false // 过胡限制
    const counts = this._handCounts(seat)
    counts[key] = (counts[key] || 0) + 1
    return !!canWin(counts, { allowSevenPairs: this.options.allowSevenPairs })
  }

  /** 摸牌 */
  draw(seat) {
    if (this.state !== MJ_STATE.PLAYING || this.current !== seat) return { ok: false, msg: '还没轮到你摸牌' }
    if (!this.wall.length) return this._drawGame()
    const tile = this.wall.pop()
    this.players[seat].hand.push(tile)
    this.players[seat].hand = sortTiles(this.players[seat].hand)
    this.afterGang = false
    this._changed()
    return { ok: true, tile }
  }

  /** 摸牌后自摸胡 */
  selfWin(seat) {
    if (this.state !== MJ_STATE.PLAYING || this.current !== seat) return { ok: false, msg: '现在不能胡牌' }
    if (!this.canSelfWin(seat)) return { ok: false, msg: '牌型不满足胡牌条件' }
    const counts = this._handCounts(seat)
    const winInfo = canWin(counts, { allowSevenPairs: this.options.allowSevenPairs })
    const score = scoreHand(winInfo, counts, {
      selfDraw: true,
      afterGang: this.afterGang,
      isDealer: seat === this.dealer,
      options: this.options,
    })
    this._finish(seat, null, score, 'selfDraw')
    return { ok: true }
  }

  /** 出牌 */
  discard(seat, tileId) {
    if (this.state !== MJ_STATE.PLAYING || this.current !== seat) return { ok: false, msg: '还没轮到你出牌' }
    const p = this.players[seat]
    const idx = p.hand.findIndex((t) => t.id === tileId)
    if (idx < 0) return { ok: false, msg: '手牌中没有这张牌' }
    const [tile] = p.hand.splice(idx, 1)
    p.discarded.push(tile)
    this.lastDiscard = { seat, tile }
    this.afterGang = false
    this.emit('action', { seat, type: 'discard', tile: { id: tile.id, label: tile.label } })

    // 检查其他玩家能否碰杠胡
    const claims = []
    for (let s = 0; s < this.players.length; s++) {
      if (s === seat) continue
      const canWinThis = this.canWinOn(s, tile)
      const canPungThis = this.options.allowBrightKong !== false && canPung(p.hand, tileKey(tile)) === false &&
        buildCounts(this.players[s].hand)[tileKey(tile)] >= 2
      const canKongThis = buildCounts(this.players[s].hand)[tileKey(tile)] >= 3
      if (canWinThis || canPungThis || canKongThis) {
        claims.push({
          seat: s,
          options: {
            win: canWinThis,
            pung: !!canPungThis,
            kong: !!canKongThis,
          },
        })
      }
    }
    if (claims.length && this._anyRealHumanClaim(claims)) {
      this.state = MJ_STATE.CLAIM
      this.pendingClaims = claims
      this._changed()
      return { ok: true, pending: claims }
    }
    // 无人响应，自动跳过
    this._nextTurn(seat)
    return { ok: true }
  }

  _anyRealHumanClaim(claims) {
    return claims.some((c) => this.players[c.seat].isHuman && !this.players[c.seat].trust)
  }

  /** 玩家响应碰/杠/胡/过 */
  claim(seat, type) {
    if (this.state !== MJ_STATE.CLAIM) return { ok: false, msg: '当前不是响应阶段' }
    const pending = this.pendingClaims.find((c) => c.seat === seat)
    if (!pending) return { ok: false, msg: '你没有可响应的操作' }
    if (!pending.options[type]) return { ok: false, msg: '该操作不可用' }

    const discardInfo = this.lastDiscard
    if (type === 'win') {
      const counts = this._handCounts(seat)
      counts[tileKey(discardInfo.tile)] = (counts[tileKey(discardInfo.tile)] || 0) + 1
      const winInfo = canWin(counts, { allowSevenPairs: this.options.allowSevenPairs })
      const score = scoreHand(winInfo, counts, {
        selfDraw: false,
        afterGang: false,
        isDealer: seat === this.dealer,
        options: this.options,
      })
      this._finish(seat, discardInfo.seat, score, 'discard')
      return { ok: true }
    }

    if (type === 'pung' || type === 'kong') {
      const key = tileKey(discardInfo.tile)
      const p = this.players[seat]
      const need = type === 'pung' ? 2 : 3
      let removed = 0
      p.hand = p.hand.filter((t) => {
        if (tileKey(t) === key && removed < need) { removed++; return false }
        return true
      })
      p.melds.push({ type: type === 'pung' ? 'pung' : 'kong', key, from: discardInfo.seat })
      // 明杠计分
      if (type === 'kong') {
        this._recordKongScore(seat, 'bright', discardInfo.seat)
        // 杠后摸一张
        if (this.wall.length) {
          const tile = this.wall.pop()
          p.hand.push(tile)
          p.hand = sortTiles(p.hand)
        }
        this.afterGang = true
      }
      this.state = MJ_STATE.PLAYING
      this.pendingClaims = []
      this.current = seat
      this.emit('action', { seat, type, key, from: discardInfo.seat })
      this._changed()
      return { ok: true }
    }
    return { ok: false, msg: '无效操作' }
  }

  /** 暗杠（自己摸齐 4 张） */
  concealedKong(seat, key) {
    if (this.state !== MJ_STATE.PLAYING || this.current !== seat) return { ok: false, msg: '还没轮到你' }
    if (!this.options.allowConcealedKong) return { ok: false, msg: '本局不允许暗杠' }
    const p = this.players[seat]
    const matches = p.hand.filter((t) => tileKey(t) === key)
    if (matches.length !== 4) return { ok: false, msg: '手牌中没有 4 张相同的牌' }
    const ids = new Set(matches.map((t) => t.id))
    p.hand = p.hand.filter((t) => !ids.has(t.id))
    p.melds.push({ type: 'kong', key, from: seat, concealed: true })
    this._recordKongScore(seat, 'concealed', seat)
    if (this.wall.length) {
      const tile = this.wall.pop()
      p.hand.push(tile)
      p.hand = sortTiles(p.hand)
    }
    this.afterGang = true
    this.emit('action', { seat, type: 'concealedKong', key })
    this._changed()
    return { ok: true }
  }

  /** 全部玩家过牌 */
  passAll() {
    if (this.state !== MJ_STATE.CLAIM) return { ok: false, msg: '当前不是响应阶段' }
    const from = this.lastDiscard.seat
    this.state = MJ_STATE.PLAYING
    this.pendingClaims = []
    this._nextTurn(from)
    return { ok: true }
  }

  _recordKongScore(seat, kind, fromSeat) {
    const per = kind === 'concealed' ? 2 : 1
    for (let s = 0; s < this.players.length; s++) {
      if (s === seat) continue
      this.kongScores.push({ seat, from: s, points: per, kind })
    }
    this.emit('system', {
      text: `${this.players[seat].name} ${kind === 'concealed' ? '暗杠' : '明杠'} ${per} 分`,
    })
  }

  _nextTurn(fromSeat) {
    let next = (fromSeat + 1) % this.players.length
    // 如果是庄家胡牌连庄，否则轮庄 —— 这里先按普通轮转，结算时处理连庄
    let guard = 0
    while (this.players[next].trust && guard < 8) {
      next = (next + 1) % this.players.length
      guard++
    }
    this.current = next
    if (!this.wall.length) return this._drawGame()
    this._changed()
  }

  _drawGame() {
    this.state = MJ_STATE.FINISHED
    // 荒庄：杠分仍然结算（荒庄后杠分不再计算的话，这里全部置 0 即可）
    const deltas = [0, 0, 0, 0]
    for (const ks of this.kongScores) {
      deltas[ks.seat] += ks.points * this.baseScore
      deltas[ks.from] -= ks.points * this.baseScore
    }
    this.result = {
      draw: true,
      reason: '荒庄',
      deltas,
      scores: this.kongScores,
      finishedAt: Date.now(),
    }
    this.emit('finish', this.result)
    this._changed()
    return { ok: true, draw: true }
  }

  _finish(winnerSeat, fromSeat, score, method) {
    this.state = MJ_STATE.FINISHED
    const excluded = [winnerSeat]
    if (method === 'discard' && fromSeat !== null) excluded.push(fromSeat)

    const unit = this.baseScore * score.score
    const deltas = [0, 0, 0, 0]
    if (method === 'selfDraw') {
      for (let s = 0; s < this.players.length; s++) {
        if (s === winnerSeat) continue
        deltas[winnerSeat] += unit
        deltas[s] -= unit
      }
    } else {
      deltas[fromSeat] -= unit
      deltas[winnerSeat] += unit
    }
    // 杠分单独结算
    for (const ks of this.kongScores) {
      deltas[ks.seat] += ks.points * this.baseScore
      deltas[ks.from] -= ks.points * this.baseScore
    }
    // 连庄：庄家胡牌继续坐庄
    const nextDealer = (winnerSeat === this.dealer) ? this.dealer : (this.dealer + 1) % this.players.length

    this.result = {
      draw: false,
      winner: winnerSeat,
      from: fromSeat,
      method,
      patterns: score.patterns,
      fanScore: score.score,
      unit,
      deltas,
      dealer: this.dealer,
      nextDealer,
      kongScores: this.kongScores,
      finishedAt: Date.now(),
    }
    this.emit('finish', this.result)
    this._changed()
  }

  /** AI 自动执行当前玩家的一步 */
  autoStep(seat = this.current) {
    const p = this.players[seat]
    if (!p || [MJ_STATE.WAITING, MJ_STATE.FINISHED].includes(this.state)) return null

    if (this.state === MJ_STATE.CLAIM) {
      const pending = this.pendingClaims.find((c) => c.seat === seat)
      if (!pending) {
        // 所有真人已过，自动过
        return this.passAll()
      }
      if (pending.options.win) return this.claim(seat, 'win')
      if (pending.options.kong) return this.claim(seat, 'kong')
      if (pending.options.pung) return this.claim(seat, 'pung')
      return this.passAll()
    }

    if (this.state === MJ_STATE.PLAYING) {
      // 轮到摸牌（手牌数不满 14 或刚轮到且没摸）
      const needDraw = p.hand.length + p.melds.length * 3 === 13
      if (needDraw) {
        const drawResult = this.draw(seat)
        if (drawResult?.ok && this.canSelfWin(seat)) return this.selfWin(seat)
      }
      // 尝试暗杠
      const counts = buildCounts(p.hand)
      for (const [key, count] of Object.entries(counts)) {
        if (count === 4) return this.concealedKong(seat, key)
      }
      // 简单 AI：打出最孤立的牌（出现次数最少、权重最大）
      if (!p.hand.length) return null
      let best = p.hand[0]
      let bestScore = Infinity
      for (const tile of p.hand) {
        const key = tileKey(tile)
        const cnt = counts[key] || 0
        const sc = cnt * 100 - tile.weight
        if (sc < bestScore) { bestScore = sc; best = tile }
      }
      return this.discard(seat, best.id)
    }
    return null
  }

  /** 给指定座位生成快照 */
  snapshot(forSeat = null) {
    return {
      roomId: this.roomId,
      state: this.state,
      current: this.current,
      dealer: this.dealer,
      wallCount: this.wall.length,
      baseScore: this.baseScore,
      options: this.options,
      lastDiscard: this.lastDiscard ? {
        seat: this.lastDiscard.seat,
        id: this.lastDiscard.tile.id,
        label: this.lastDiscard.tile.label,
        key: tileKey(this.lastDiscard.tile),
      } : null,
      pendingClaims: this.pendingClaims.map((c) => ({ seat: c.seat, options: c.options })),
      players: this.players.map((p) => ({
        seat: p.seat,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHuman: p.isHuman,
        isDealer: p.seat === this.dealer,
        handCount: p.hand.length,
        hand: forSeat === p.seat ? p.hand : null,
        melds: p.melds,
        discarded: p.discarded.map((t) => ({ id: t.id, label: t.label, key: tileKey(t) })),
        trust: p.trust,
        connected: p.connected,
        ting: forSeat === p.seat && p.hand.length === 13 ? getTingTiles(p.hand, { allowSevenPairs: this.options.allowSevenPairs }) : [],
      })),
      result: this.state === MJ_STATE.FINISHED ? this.result : null,
      selfSeat: forSeat,
    }
  }
}
