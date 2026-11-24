import test from 'node:test'
import assert from 'node:assert/strict'
import { createMahjongDeck, shuffleTiles, buildCounts, tileFromKey } from '../tiles.js'
import { canWin, canWinTiles, scoreHand, getTingTiles, canPung, canKong } from '../pattern.js'

/** 用 key 数组构造一手牌（如 ['w1','w1','w2'...]） */
const hand = (keys) => keys.map((k, i) => tileFromKey(k, i))

test('牌库：120 张，各花色数量正确', () => {
  const deck = createMahjongDeck()
  assert.equal(deck.length, 120)
  assert.equal(deck.filter((t) => t.suit === 'wan').length, 36)
  assert.equal(deck.filter((t) => t.suit === 'tong').length, 36)
  assert.equal(deck.filter((t) => t.suit === 'tiao').length, 36)
  assert.equal(deck.filter((t) => ['zhong', 'fa', 'bai'].includes(t.suit)).length, 12)
  const ids = deck.map((t) => t.id)
  assert.equal(new Set(ids).size, 120)
})

test('洗牌可复现', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const a = shuffleTiles(createMahjongDeck(), rand).map((t) => t.id)
  seed = 7
  const b = shuffleTiles(createMahjongDeck(), rand).map((t) => t.id)
  assert.deepEqual(a, b)
})

test('基本胡牌：顺子 + 刻子 + 将', () => {
  const tiles = hand([
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
    't2', 't2', 't2', 's5', 's5',
  ])
  const result = canWinTiles(tiles)
  assert.ok(result, '标准牌型应能胡')
  assert.equal(result.kind, 'basic')
})

test('基本胡牌：全刻子（碰碰胡/飘胡）', () => {
  const tiles = hand([
    'w1', 'w1', 'w1', 'w3', 'w3', 'w3', 'w5', 'w5', 'w5',
    't7', 't7', 't7', 'bai', 'bai',
  ])
  const result = canWinTiles(tiles)
  assert.ok(result)
  const score = scoreHand(result, buildCounts(tiles), {})
  assert.ok(score.patterns.includes('飘胡'))
})

test('七对 / 豪华七对 / 超豪华七对', () => {
  const seven = hand(['w1', 'w1', 'w2', 'w2', 'w3', 'w3', 'w4', 'w4', 'w5', 'w5', 'w6', 'w6', 'w7', 'w7'])
  const r1 = canWinTiles(seven)
  assert.equal(r1.kind, 'sevenPairs')

  const luxury = hand(['w1', 'w1', 'w1', 'w1', 'w2', 'w2', 'w3', 'w3', 'w4', 'w4', 'w5', 'w5', 'w6', 'w6'])
  const r2 = canWinTiles(luxury)
  assert.equal(r2.kind, 'luxurySeven')

  const superLuxury = hand([
    'w1', 'w1', 'w1', 'w1', 'w2', 'w2', 'w2', 'w2',
    'w3', 'w3', 'w4', 'w4', 'w5', 'w5',
  ])
  const r3 = canWinTiles(superLuxury)
  assert.equal(r3.kind, 'superLuxurySeven')
})

test('字牌可以参与刻子与将', () => {
  const tiles = hand([
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
    'zhong', 'zhong', 'zhong', 'fa', 'fa',
  ])
  assert.ok(canWinTiles(tiles))
})

test('非胡牌牌型被拒绝', () => {
  const tiles = hand([
    'w1', 'w2', 'w4', 'w5', 'w7', 'w8',
    't1', 't3', 't5', 't7', 't9', 's1', 's3',
  ])
  assert.equal(canWinTiles(tiles), null)
})

test('听牌提示', () => {
  // 13 张：w1w2w3 w4w5w6 w7w8w9 t2t2t2 s5  → 单钓 s5
  const tiles = hand([
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
    't2', 't2', 't2', 's5',
  ])
  const ting = getTingTiles(tiles)
  assert.ok(ting.includes('s5'), `应听 s5，实际: ${ting.join(',')}`)
})

test('碰牌与杠牌判定', () => {
  const tiles = hand(['w1', 'w1', 'w2', 'w3', 't5'])
  assert.equal(canPung(tiles, 'w1'), true)
  assert.equal(canPung(tiles, 'w2'), false)
  const tiles3 = hand(['w1', 'w1', 'w1', 'w2', 't5'])
  assert.equal(canKong(tiles3, 'w1'), true)
  assert.equal(canKong(tiles, 'w1'), false)
})

test('算番：屁胡 2 分，夹胡 4 分，清一色翻倍', () => {
  const basic = hand([
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
    't2', 't3', 't4', 's5', 's5',
  ])
  const info = canWinTiles(basic)
  const score = scoreHand(info, buildCounts(basic), {})
  assert.ok(score.score >= 2)

  const pure = hand([
    'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9',
    'w1', 'w2', 'w3', 'w5', 'w5',
  ])
  const info2 = canWinTiles(pure)
  assert.ok(info2)
  const score2 = scoreHand(info2, buildCounts(pure), {})
  assert.ok(score2.patterns.includes('清一色'))
})
