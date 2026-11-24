import test from 'node:test'
import assert from 'node:assert/strict'
import { GameEngine, STATE } from '../GameEngine.js'

function makeEngine() {
  return new GameEngine({
    players: [0, 1, 2].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isHuman: false })),
    baseScore: 10,
    roomId: 'test-room',
  })
}

test('纯 AI 对局可完整跑完且金币守恒', () => {
  const engine = makeEngine()
  let finished = false
  engine.on('finish', () => { finished = true })
  engine.start()

  let steps = 0
  while (!finished && steps < 5000) {
    const r = engine.autoStep()
    assert.equal(r?.ok !== false, true, `AI 动作失败: ${r?.msg} (state=${engine.state})`)
    steps++
  }

  assert.equal(finished, true, '对局应在 5000 步内结束')
  const res = engine.result
  assert.ok(res.landlord >= 0 && res.landlord <= 2)
  assert.equal(res.deltas.reduce((a, b) => a + b, 0), 0, '三家金币变化之和应为 0')
  assert.equal(engine.players[res.winner].hand.length, 0, '获胜者应出完手牌')
  assert.ok(res.multiplier >= 1)
  console.log(`  ↳ 对局步数 ${steps}，地主 seat=${res.landlord}，胜方 seat=${res.winner}，倍数=${res.multiplier}，春天=${res.spring || '无'}`)
})

test('连续 30 局稳定性压测', () => {
  for (let round = 0; round < 30; round++) {
    const engine = makeEngine()
    let finished = false
    engine.on('finish', () => { finished = true })
    engine.start()
    let steps = 0
    while (!finished && steps < 3000) {
      engine.autoStep()
      steps++
    }
    assert.equal(finished, true, `第 ${round + 1} 局未结束`)
    assert.equal(engine.result.deltas.reduce((a, b) => a + b, 0), 0)
  }
  console.log('  ↳ 30 局全部正常结算')
})

test('快照不泄露他人手牌', () => {
  const engine = makeEngine()
  engine.start()
  const snap0 = engine.snapshot(0)
  const snap1 = engine.snapshot(1)
  assert.equal(snap0.players[0].hand.length > 0, true)
  assert.equal(snap0.players[1].hand, null)
  assert.equal(snap1.players[0].hand, null)
  assert.equal(snap0.bottom.every((x) => x === '?'), true, '未定地主前底牌应隐藏')
})
