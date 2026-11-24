import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeck, deal, shuffle, rankCounts } from '../cards.js'
import { analyze, canBeat, TYPE } from '../pattern.js'
import { validatePlay } from '../validator.js'

/** 用 rank 数组快速构造牌（王用 16/17，同 rank 自动分配花色） */
function c(ranks) {
  const suits = ['S', 'H', 'C', 'D']
  const used = {}
  return ranks.map((r) => {
    if (r >= 16) return { id: `${r}-J`, rank: r, weight: r, suit: 'J' }
    const i = used[r] || 0
    used[r] = i + 1
    return { id: `${r}-${suits[i]}`, rank: r, weight: r, suit: suits[i] }
  })
}

const t = (ranks) => analyze(c(ranks))

test('牌库与发牌：54 张 / 每人 17 / 底牌 3 且无重复', () => {
  const deck = createDeck()
  assert.equal(deck.length, 54)
  const { hands, bottom } = deal(deck)
  assert.equal(hands.length, 3)
  assert.equal(hands[0].length, 17)
  assert.equal(hands[1].length, 17)
  assert.equal(hands[2].length, 17)
  assert.equal(bottom.length, 3)
  const allIds = [...hands.flat(), ...bottom].map((x) => x.id)
  assert.equal(new Set(allIds).size, 54)
})

test('基础牌型识别', () => {
  assert.equal(t([3]).type, TYPE.SINGLE)
  assert.equal(t([7, 7]).type, TYPE.PAIR)
  assert.equal(t([13, 13, 13]).type, TYPE.TRIPLE)
  assert.equal(t([3, 3, 3, 6]).type, TYPE.TRIPLE_ONE)
  assert.equal(t([4, 4, 4, 9, 9]).type, TYPE.TRIPLE_TWO)
})

test('顺子 / 连对 / 飞机识别', () => {
  assert.equal(t([3, 4, 5, 6, 7]).type, TYPE.STRAIGHT)
  assert.equal(t([10, 11, 12, 13, 14]).type, TYPE.STRAIGHT)
  assert.equal(t([11, 12, 13, 14, 15]), null, '顺子不能包含 2')
  assert.equal(t([3, 3, 4, 4, 5, 5]).type, TYPE.DOUBLE_STRAIGHT)
  assert.equal(t([10, 10, 11, 11, 12, 12, 13, 13, 14, 14]).type, TYPE.DOUBLE_STRAIGHT)
  assert.equal(t([3, 3, 3, 4, 4, 4]).type, TYPE.TRIPLE_STRAIGHT)
  assert.equal(t([3, 3, 3, 4, 4, 4, 7, 9]).type, TYPE.PLANE_ONE)
  assert.equal(t([3, 3, 3, 4, 4, 4, 7, 7, 9, 9]).type, TYPE.PLANE_TWO)
})

test('四带二 / 炸弹 / 火箭识别', () => {
  assert.equal(t([5, 5, 5, 5, 3, 8]).type, TYPE.FOUR_TWO_SINGLE)
  assert.equal(t([4, 4, 4, 4, 5, 5, 7, 7]).type, TYPE.FOUR_TWO_PAIR)
  assert.equal(t([7, 7, 7, 7]).type, TYPE.BOMB)
  assert.equal(t([16, 17]).type, TYPE.ROCKET)
})

test('非法牌型', () => {
  assert.equal(t([3, 5, 7]), null)
  assert.equal(t([3, 3, 4, 4]), null)
  assert.equal(t([3, 4, 5, 6]), null, '顺子至少 5 张')
  assert.equal(t([3, 3, 4, 4, 5, 6]), null)
})

test('比牌规则', () => {
  const single3 = t([3])
  const single5 = t([5])
  const pair3 = t([3, 3])
  const straight = t([3, 4, 5, 6, 7])
  const straightBig = t([4, 5, 6, 7, 8])
  const bomb = t([9, 9, 9, 9])
  const rocket = t([16, 17])

  assert.equal(canBeat(single5, single3), true)
  assert.equal(canBeat(single3, single5), false)
  assert.equal(canBeat(pair3, single3), false, '牌型不同不能压')
  assert.equal(canBeat(straightBig, straight), true)
  assert.equal(canBeat(bomb, straight), true, '炸弹压顺子')
  assert.equal(canBeat(straight, bomb), false)
  assert.equal(canBeat(rocket, bomb), true, '火箭压炸弹')
  assert.equal(canBeat(bomb, rocket), false)
})

test('出牌校验：手牌存在性、合法性、压牌', () => {
  const hand = c([3, 3, 3, 6, 7, 7])
  const ok = validatePlay(hand, hand.filter((x) => x.rank === 3).map((x) => x.id), null)
  assert.equal(ok.valid, true)
  assert.equal(ok.remain.length, 3)

  const bad = validatePlay(hand, ['99-S'], null)
  assert.equal(bad.valid, false)

  const noPattern = validatePlay(hand, [hand[0].id, hand[3].id], null)
  assert.equal(noPattern.valid, false)

  const last = t([9, 9, 9, 9])
  const cannot = validatePlay(hand, hand.filter((x) => x.rank === 3).map((x) => x.id), last)
  assert.equal(cannot.valid, false, '三张压不过炸弹')
})

test('洗牌确定性：固定随机源结果可复现', () => {
  let seed = 42
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const a = shuffle(createDeck(), rand).map((x) => x.id)
  seed = 42
  const b = shuffle(createDeck(), rand).map((x) => x.id)
  assert.deepEqual(a, b)
})
