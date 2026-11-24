import test from 'node:test'
import assert from 'node:assert/strict'
import { MahjongEngine, MJ_STATE } from '../MahjongEngine.js'

function makeEngine() {
  return new MahjongEngine({
    players: [0, 1, 2, 3].map((i) => ({ id: `bot${i}`, name: `玩家${i + 1}`, isHuman: false })),
    baseScore: 10,
    roomId: 'mj-test',
  })
}

test('麻将 4 人 AI 对局可完整跑完', () => {
  const engine = makeEngine()
  let finished = false
  engine.on('finish', () => { finished = true })
  engine.start()

  let steps = 0
  while (!finished && steps < 3000) {
    const r = engine.autoStep()
    if (r && r.ok === false) {
      // 部分操作（如过）返回失败可忽略，避免误判
      assert.ok(['当前不是响应阶段', '现在不能胡牌'].includes(r.msg), `异常: ${r.msg}`)
    }
    steps++
  }
  assert.equal(finished, true, '对局应在 3000 步内结束')
  assert.ok(engine.result)
  assert.equal(engine.result.deltas.length, 4)
  console.log(`  ↳ 麻将步数 ${steps}，${engine.result.draw ? '荒庄' : `胡牌 seat=${engine.result.winner} 番型=${engine.result.patterns.join('/')}`}`)
})

test('连续 20 局麻将稳定性', () => {
  for (let round = 0; round < 20; round++) {
    const engine = makeEngine()
    let finished = false
    engine.on('finish', () => { finished = true })
    engine.start()
    let steps = 0
    while (!finished && steps < 2000) {
      engine.autoStep()
      steps++
    }
    assert.equal(finished, true, `第 ${round + 1} 局未结束`)
    assert.equal(engine.result.deltas.reduce((a, b) => a + b, 0), 0, '分数应守恒')
  }
  console.log('  ↳ 20 局麻将全部正常结算')
})

test('快照不泄露他人手牌，自己有听牌提示', () => {
  const engine = makeEngine()
  engine.start()
  const snap = engine.snapshot(0)
  assert.equal(snap.players[0].hand.length, 14)
  assert.equal(snap.players[1].hand, null)
  assert.equal(Array.isArray(snap.players[0].ting), true)
  assert.equal(snap.wallCount > 0, true)
})
