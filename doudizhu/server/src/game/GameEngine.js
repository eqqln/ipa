/**
 * 斗地主对局状态机
 * 流程：发牌 → 明牌 → 叫地主 → 抢地主 → 加倍 → 出牌 → 结算
 */
import { EventEmitter } from 'node:events'
import { deal, sortCards } from './cards.js'
import { analyze, isBomb } from './pattern.js'
import { validatePlay } from './validator.js'
import { choosePlay, evaluateBid, shouldGrab, shouldDouble, trustPlay } from './ai.js'
import { config } from '../config/index.js'

export const STATE = {
  WAITING: 'waiting',
  BIDDING: 'bidding',
  GRABBING: 'grabbing',
  DOUBLING: 'doubling',
  PLAYING: 'playing',
  FINISHED: 'finished',
}

export class GameEngine extends EventEmitter {
  constructor({ players, baseScore = config.room.defaultBaseScore, roomId = '' } = {}) {
    super()
    this.roomId = roomId
    this.baseScore = baseScore
    this.players = players.map((p, i) => ({
      seat: i,
      id: p.id,
      name: p.name || `玩家${i + 1}`,
      avatar: p.avatar || '',
      isHuman: p.isHuman !== false,
      hand: [],
      isLandlord: false,
      playedCount: 0,
      trust: false,
      doubled: false,
      ming: false,
      connected: true,
      bidScore: 0,
    }))
    this._resetRuntime()
  }

  _resetRuntime() {
    this.state = STATE.WAITING
    this.landlord = -1
    this.current = -1
    this.bottom = []
    this.lastPlay = null
    this.passCount = 0
    this.multiplier = 1
    this.bidTurns = 0
    this.grabTurns = 0
    this.bidCandidate = -1
    this.bombCount = 0
    this.doubleTurns = 0
    this.result = null
    this.finishedSeat = -1
  }

  _changed() {
    this.emit('change')
  }

  /** 开局发牌 */
  start() {
    this._resetRuntime()
    for (const p of this.players) {
      p.hand = []
      p.isLandlord = false
      p.playedCount = 0
      p.trust = false
      p.doubled = false
      p.ming = false
      p.bidScore = 0
      p.connected = p.isHuman ? p.connected !== false : true
    }
    const { hands, bottom } = deal()
    this.players.forEach((p, i) => { p.hand = hands[i] })
    this.bottom = bottom
    this.state = STATE.BIDDING
    this.current = Math.floor(Math.random() * 3)
    this.emit('system', { text: '牌已发完，开始叫地主' })
    this._changed()
    return { ok: true }
  }

  /** 明牌：发牌后、确定地主前可亮牌，倍数 ×2 */
  mingpai(seat) {
    if (this.state !== STATE.BIDDING) return { ok: false, msg: '现在不能明牌' }
    const p = this.players[seat]
    if (!p || p.ming) return { ok: false, msg: '已经明牌过了' }
    p.ming = true
    this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
    this.emit('system', { text: `${p.name} 选择明牌，倍数翻倍！`, seat })
    this._changed()
    return { ok: true }
  }

  /** 叫地主：score 0=不叫, 1/2/3 */
  bid(seat, score) {
    if (this.state !== STATE.BIDDING || this.current !== seat) {
      return { ok: false, msg: '现在不是你的叫牌回合' }
    }
    if (![0, 1, 2, 3].includes(score)) return { ok: false, msg: '无效的叫分' }
    const p = this.players[seat]
    p.bidScore = score
    this.emit('action', { seat, type: 'bid', score })

    if (score > 0) {
      this.bidCandidate = seat
      this.multiplier = Math.min(this.multiplier * score, config.game.maxMultiplier)
      this.state = STATE.GRABBING
      this.current = (seat + 1) % 3
      this.grabTurns = 0
      this.emit('system', { text: `${p.name} 叫了 ${score} 分，进入抢地主阶段`, seat })
    } else {
      this.bidTurns++
      if (this.bidTurns >= 3) {
        this.emit('system', { text: '三家都不叫，重新发牌' })
        this._changed()
        return this.start()
      }
      this.current = (seat + 1) % 3
    }
    this._changed()
    return { ok: true }
  }

  /** 抢地主：每人一次机会 */
  grab(seat, yes) {
    if (this.state !== STATE.GRABBING || this.current !== seat) {
      return { ok: false, msg: '现在不是你的抢地主回合' }
    }
    if (yes) {
      this.landlord = seat
      this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
      this.emit('action', { seat, type: 'grab' })
      this.emit('system', { text: `${this.players[seat].name} 抢地主，倍数 ×2！`, seat })
    } else {
      this.emit('action', { seat, type: 'pass_grab' })
    }
    this.grabTurns++
    if (this.grabTurns >= 3) {
      if (this.landlord < 0) this.landlord = this.bidCandidate
      this._enterDoubling()
    } else {
      this.current = (seat + 1) % 3
    }
    this._changed()
    return { ok: true }
  }

  _enterDoubling() {
    const lp = this.players[this.landlord]
    lp.isLandlord = true
    lp.hand = sortCards([...lp.hand, ...this.bottom])
    this.state = STATE.DOUBLING
    this.current = this.landlord
    this.doubleTurns = 0
    this.emit('system', { text: `${lp.name} 成为地主，底牌已亮出`, seat: this.landlord })
  }

  /** 加倍 */
  double(seat, yes) {
    if (this.state !== STATE.DOUBLING || this.current !== seat) {
      return { ok: false, msg: '现在不是你的加倍回合' }
    }
    if (yes) {
      this.players[seat].doubled = true
      this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
      this.emit('system', { text: `${this.players[seat].name} 加倍，倍数 ×2！`, seat })
    }
    this.doubleTurns++
    if (this.doubleTurns >= 3) {
      this.state = STATE.PLAYING
      this.current = this.landlord
      this.lastPlay = null
      this.passCount = 0
      this.emit('system', { text: '加倍结束，地主先出牌' })
    } else {
      this.current = (seat + 1) % 3
    }
    this._changed()
    return { ok: true }
  }

  /** 出牌 */
  play(seat, ids) {
    if (this.state !== STATE.PLAYING || this.current !== seat) {
      return { ok: false, msg: '还没轮到你出牌' }
    }
    const p = this.players[seat]
    const lastPattern = this.lastPlay?.pattern || null
    const v = validatePlay(p.hand, ids, lastPattern)
    if (!v.valid) return { ok: false, msg: v.reason }

    p.hand = sortCards(v.remain)
    p.playedCount++
    this.lastPlay = { seat, cards: v.picked, pattern: v.pattern }
    this.passCount = 0

    if (isBomb(v.pattern)) {
      this.bombCount++
      this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
      this.emit('system', { text: `${p.name} 打出${v.pattern.type === 'rocket' ? '王炸' : '炸弹'}，倍数 ×2！`, seat })
    }
    this.emit('action', { seat, type: 'play', cards: v.picked, pattern: v.pattern })

    if (p.hand.length === 0) {
      this._finish(seat)
      return { ok: true }
    }
    this.current = (seat + 1) % 3
    this._changed()
    return { ok: true }
  }

  /** 不出 */
  pass(seat) {
    if (this.state !== STATE.PLAYING || this.current !== seat) {
      return { ok: false, msg: '还没轮到你' }
    }
    if (!this.lastPlay || this.lastPlay.seat === seat) {
      return { ok: false, msg: '当前不能不出' }
    }
    this.passCount++
    this.emit('action', { seat, type: 'pass' })
    if (this.passCount >= 2) {
      const leader = this.lastPlay.seat
      this.lastPlay = null
      this.passCount = 0
      this.current = leader
    } else {
      this.current = (seat + 1) % 3
    }
    this._changed()
    return { ok: true }
  }

  /** 托管开关 */
  setTrust(seat, value) {
    const p = this.players[seat]
    if (!p) return { ok: false, msg: '玩家不存在' }
    p.trust = !!value
    this._changed()
    return { ok: true }
  }

  /** 结算 */
  _finish(seat) {
    this.state = STATE.FINISHED
    this.finishedSeat = seat
    const landlordWin = seat === this.landlord
    let spring = ''
    const farmers = this.players.filter((p) => p.seat !== this.landlord)
    if (landlordWin && farmers.every((p) => p.playedCount === 0)) {
      spring = '春天'
      this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
    }
    if (!landlordWin && this.players[this.landlord].playedCount === 1) {
      spring = '反春'
      this.multiplier = Math.min(this.multiplier * 2, config.game.maxMultiplier)
    }

    const unit = this.baseScore * this.multiplier
    const deltas = [0, 0, 0]
    if (landlordWin) {
      deltas[this.landlord] = unit * 2
      farmers.forEach((p) => { deltas[p.seat] = -unit })
    } else {
      deltas[this.landlord] = -unit * 2
      farmers.forEach((p) => { deltas[p.seat] = unit })
    }

    this.result = {
      winner: seat,
      landlordWin,
      landlord: this.landlord,
      spring,
      multiplier: this.multiplier,
      baseScore: this.baseScore,
      unit,
      bombCount: this.bombCount,
      deltas,
      hands: this.players.map((p) => p.hand.map((c) => c.id)),
      bottom: this.bottom.map((c) => c.id),
      finishedAt: Date.now(),
    }
    this.emit('finish', this.result)
    this._changed()
  }

  /** AI / 托管自动执行当前玩家的一步 */
  autoStep(seat = this.current) {
    const p = this.players[seat]
    if (!p || this.state === STATE.WAITING || this.state === STATE.FINISHED) return null

    if (this.state === STATE.BIDDING) return this.bid(seat, evaluateBid(p.hand))
    if (this.state === STATE.GRABBING) return this.grab(seat, shouldGrab(p.hand, this.multiplier))
    if (this.state === STATE.DOUBLING) return this.double(seat, shouldDouble(p.hand))

    if (this.state === STATE.PLAYING) {
      const lastPattern = this.lastPlay?.pattern || null
      const enemies = this.players.filter((x) =>
        this.landlord < 0 ? x.seat !== seat : (x.seat === this.landlord) !== (seat === this.landlord),
      )
      const enemyCardCount = enemies.length ? Math.min(...enemies.map((x) => x.hand.length)) : 10
      const isTeammateLast = !!this.lastPlay && this.landlord >= 0 &&
        seat !== this.landlord && this.lastPlay.seat !== this.landlord
      const ids = (p.trust ? trustPlay : choosePlay)(p.hand, lastPattern, { enemyCardCount, isTeammateLast })
      return ids ? this.play(seat, ids) : this.pass(seat)
    }
    return null
  }

  /** 给指定座位生成状态快照（只暴露自己的手牌） */
  snapshot(forSeat = null) {
    const revealBottom = this.landlord >= 0
    return {
      roomId: this.roomId,
      state: this.state,
      current: this.current,
      landlord: this.landlord,
      bottom: revealBottom ? this.bottom.map((c) => c.id) : ['?', '?', '?'],
      multiplier: this.multiplier,
      baseScore: this.baseScore,
      bombCount: this.bombCount,
      passCount: this.passCount,
      lastPlay: this.lastPlay ? {
        seat: this.lastPlay.seat,
        cards: this.lastPlay.cards.map((c) => c.id),
        pattern: { type: this.lastPlay.pattern.type, count: this.lastPlay.pattern.count, weight: this.lastPlay.pattern.weight },
      } : null,
      players: this.players.map((p) => ({
        seat: p.seat,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isLandlord: p.isLandlord,
        handCount: p.hand.length,
        hand: forSeat === p.seat ? p.hand : null,
        trust: p.trust,
        doubled: p.doubled,
        ming: p.ming,
        connected: p.connected,
        playedCount: p.playedCount,
        bidScore: p.bidScore,
      })),
      result: this.state === STATE.FINISHED ? this.result : null,
      selfSeat: forSeat,
    }
  }
}
