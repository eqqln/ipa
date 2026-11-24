/**
 * 端到端测试：注册 → 建房 → Socket 连入 → 真人操作 → AI 补位 → 结算落库
 * 用法：node e2e-test.mjs [baseUrl]
 */
import { io } from 'socket.io-client'

const BASE = process.argv[2] || 'http://localhost:3100'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(`${path}: ${json.message}`)
  return json.data
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', (e) => reject(e))
  })
}

/** 同一个「阶段+回合+手牌数」只操作一次，避免重复响应广播 */
function dedupe() {
  let lastKey = ''
  return (key) => {
    if (key === lastKey) return false
    lastKey = key
    return true
  }
}

async function testDoudizhu(token) {
  console.log('\n🃏 === 斗地主端到端 ===')
  const data = await api('/room/quick', {
    method: 'POST', token,
    body: { mode: 'ai', baseScore: 10, game: 'doudizhu' },
  })
  const roomId = data.room.id
  console.log(`  建房: ${roomId} (${data.room.game}, ${data.room.maxPlayers}人)`)

  const socket = await connectSocket(token)
  const states = []
  let finished = null
  let heroPlays = 0
  let heroBids = 0
  const fresh = dedupe()

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('斗地主对局超时')), 90000)
    socket.on('game:state', (s) => {
      states.push(s.state)
      const seat = s.selfSeat
      const me = s.players[seat]
      const key = `${s.state}|${s.current}|${s.passCount}|${s.lastPlay?.seat ?? '-'}|${me?.handCount}`

      if (s.state === 'finished') {
        finished = s.result
        clearTimeout(timer)
        return resolve()
      }
      if (s.current !== seat || !fresh(key)) return

      if (s.state === 'bidding' && me?.hand) {
        heroBids++
        socket.emit('game:action', { type: 'bid', data: { score: 3 } })
      } else if (s.state === 'grabbing') {
        socket.emit('game:action', { type: 'grab', data: { yes: true } })
      } else if (s.state === 'doubling') {
        socket.emit('game:action', { type: 'double', data: { yes: true } })
      } else if (s.state === 'playing' && me?.hand?.length) {
        const last = s.lastPlay
        let playable = null
        if (!last || last.seat === seat) {
          playable = [...me.hand].sort((a, b) => a.weight - b.weight)[0]
        } else {
          // 尝试出一张点数更大的单张来压
          playable = [...me.hand].filter((c) => c.weight > last.pattern.weight && last.pattern.type === 'single')
            .sort((a, b) => a.weight - b.weight)[0]
        }
        if (playable) {
          heroPlays++
          socket.emit('game:action', { type: 'play', data: { ids: [playable.id] } })
        } else {
          socket.emit('game:action', { type: 'pass' })
        }
      }
    })
    socket.on('game:error', (e) => console.log(`  ⚠ game:error: ${e.message}`))
    socket.emit('room:join', { roomId })
    socket.emit('game:start')
  })

  console.log(`  对局结束: 地主seat=${finished.landlord}, 胜方=${finished.winner}, 倍数=${finished.multiplier}`)
  console.log(`  真人操作: 叫牌${heroBids}次, 出牌${heroPlays}次`)
  console.log(`  金币变化: [${finished.deltas.join(', ')}]`)
  const records = await api('/record', { token })
  console.log(`  战绩记录数: ${records.total}`)
  socket.disconnect()
  return { states, finished }
}

async function testMahjong(token) {
  console.log('\n🀄 === 内蒙麻将端到端 ===')
  const data = await api('/room/quick', {
    method: 'POST', token,
    body: { mode: 'ai', baseScore: 10, game: 'mahjong', allowSevenPairs: true, allowPiao: true },
  })
  const roomId = data.room.id
  console.log(`  建房: ${roomId} (${data.room.game}, ${data.room.maxPlayers}人)`)

  const socket = await connectSocket(token)
  let finished = null
  let heroDiscards = 0
  const fresh = dedupe()

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('麻将对局超时')), 90000)
    socket.on('game:state', (s) => {
      const seat = s.selfSeat
      const me = s.players[seat]
      if (s.state === 'finished') {
        finished = s.result
        clearTimeout(timer)
        return resolve()
      }
      const key = `${s.state}|${s.current}|${me?.handCount}|${s.pendingClaims?.length}`
      if (s.current !== seat && s.state !== 'claim') return
      if (!fresh(key)) return

      if (s.state === 'claim') {
        const mine = s.pendingClaims?.find((c) => c.seat === seat)
        if (mine) {
          socket.emit('game:action', {
            type: 'claim', data: { claimType: mine.options.win ? 'win' : 'pass' },
          })
        } else {
          socket.emit('game:action', { type: 'passall' })
        }
      } else if (s.state === 'playing' && me?.hand?.length) {
        if (me.hand.length + me.melds.length * 3 === 14) {
          socket.emit('game:action', { type: 'draw' })
          // 摸牌后判断是否自摸胡
          setTimeout(() => {
            socket.emit('game:action', { type: 'selfwin' })
          }, 60)
        } else {
          const smallest = [...me.hand].sort((a, b) => a.weight - b.weight)[0]
          if (smallest) {
            heroDiscards++
            socket.emit('game:action', { type: 'discard', data: { tileId: smallest.id } })
          }
        }
      }
    })
    socket.on('game:error', (e) => console.log(`  ⚠ game:error: ${e.message}`))
    socket.emit('room:join', { roomId })
    socket.emit('game:start')
  })

  console.log(`  对局结束: ${finished.draw ? '荒庄' : `胡牌seat=${finished.winner} 番型=${(finished.patterns || []).join('/')}`}`)
  console.log(`  真人出牌: ${heroDiscards} 次`)
  console.log(`  金币变化: [${finished.deltas.join(', ')}]`)
  const records = await api('/record', { token })
  console.log(`  战绩记录数: ${records.total}`)
  socket.disconnect()
  return { finished }
}

async function main() {
  console.log(`目标: ${BASE}`)
  const uname = `e2e_${Date.now().toString().slice(-8)}`
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { username: uname, password: '123456', nickname: 'E2E测试员' },
  })
  const token = reg.token
  console.log(`✅ 注册测试账号: ${uname}`)

  const ddz = await testDoudizhu(token)
  await sleep(500)
  const mj = await testMahjong(token)

  console.log('\n✅ === 端到端全部通过 ===')
  console.log(`  斗地主经历状态: ${[...new Set(ddz.states)].join(' → ')}`)
  console.log(`  麻将结算: ${mj.finished.draw ? '荒庄' : '胡牌'}`)
}

main().catch((e) => {
  console.error('\n❌ 端到端失败:', e.message)
  process.exit(1)
})
