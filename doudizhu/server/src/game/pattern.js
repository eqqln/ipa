/**
 * 斗地主牌型识别与比较（腾讯欢乐斗地主标准规则）
 */
import { groupByRank, rankCounts } from './cards.js'

export const TYPE = {
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  TRIPLE_ONE: 'triple_one',
  TRIPLE_TWO: 'triple_two',
  STRAIGHT: 'straight',
  DOUBLE_STRAIGHT: 'double_straight',
  TRIPLE_STRAIGHT: 'triple_straight',
  PLANE_ONE: 'plane_one',
  PLANE_TWO: 'plane_two',
  FOUR_TWO_SINGLE: 'four_two_single',
  FOUR_TWO_PAIR: 'four_two_pair',
  BOMB: 'bomb',
  ROCKET: 'rocket',
}

export const TYPE_NAME = {
  [TYPE.SINGLE]: '单张',
  [TYPE.PAIR]: '对子',
  [TYPE.TRIPLE]: '三张',
  [TYPE.TRIPLE_ONE]: '三带一',
  [TYPE.TRIPLE_TWO]: '三带二',
  [TYPE.STRAIGHT]: '顺子',
  [TYPE.DOUBLE_STRAIGHT]: '连对',
  [TYPE.TRIPLE_STRAIGHT]: '飞机',
  [TYPE.PLANE_ONE]: '飞机带单',
  [TYPE.PLANE_TWO]: '飞机带对',
  [TYPE.FOUR_TWO_SINGLE]: '四带二',
  [TYPE.FOUR_TWO_PAIR]: '四带两对',
  [TYPE.BOMB]: '炸弹',
  [TYPE.ROCKET]: '王炸',
}

function mk(type, weight, count, extra = {}) {
  return { type, weight, count, ...extra }
}

/** 连续且不含 2(15) 与双王(16,17) */
function isSequential(descRanks) {
  if (descRanks.some((r) => r > 14 || r < 3)) return false
  for (let i = 0; i < descRanks.length - 1; i++) {
    if (descRanks[i] - descRanks[i + 1] !== 1) return false
  }
  return true
}

/** 在 rank 分组里找长度为 k 的连续三张主体 */
function findTripleChains(tripleGroups, k) {
  const sorted = tripleGroups.slice().sort((a, b) => b.rank - a.rank)
  for (let i = 0; i + k <= sorted.length; i++) {
    const chain = sorted.slice(i, i + k)
    let ok = true
    for (let j = 0; j < chain.length - 1; j++) {
      if (chain[j].rank - chain[j + 1].rank !== 1) { ok = false; break }
    }
    if (ok) return chain
  }
  return null
}

/**
 * 识别牌型
 * @param {Array} cards 牌对象数组（需含 rank 字段）
 * @returns {null|{type, weight, count, ...}} 无法识别返回 null
 */
export function analyze(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null

  const n = cards.length
  const groups = groupByRank(cards) // [{rank, cards}] 按 rank 降序
  const counts = rankCounts(cards)
  const ranks = groups.map((g) => g.rank)

  // 火箭（双王）
  if (n === 2 && counts[16] === 1 && counts[17] === 1) return mk(TYPE.ROCKET, 17, n)
  // 炸弹
  if (n === 4 && groups.length === 1) return mk(TYPE.BOMB, ranks[0], n)
  // 基础牌型
  if (n === 1) return mk(TYPE.SINGLE, ranks[0], n)
  if (n === 2 && groups.length === 1) return mk(TYPE.PAIR, ranks[0], n)
  if (n === 3 && groups.length === 1) return mk(TYPE.TRIPLE, ranks[0], n)
  // 三带一
  if (n === 4) {
    const t = groups.find((g) => g.cards.length === 3)
    if (t) return mk(TYPE.TRIPLE_ONE, t.rank, n)
  }
  // 三带二
  if (n === 5) {
    const t = groups.find((g) => g.cards.length === 3)
    const p = groups.find((g) => g.cards.length === 2)
    if (t && p) return mk(TYPE.TRIPLE_TWO, t.rank, n)
  }
  // 顺子 >=5 张
  if (n >= 5 && groups.length === n && isSequential(ranks)) return mk(TYPE.STRAIGHT, ranks[0], n)
  // 连对 >=3 对
  if (n >= 6 && n % 2 === 0 && groups.length === n / 2 &&
      groups.every((g) => g.cards.length === 2) && isSequential(ranks)) {
    return mk(TYPE.DOUBLE_STRAIGHT, ranks[0], n)
  }
  // 纯三顺（飞机不带）>=2 组
  if (n >= 6 && n % 3 === 0 && groups.length === n / 3 &&
      groups.every((g) => g.cards.length === 3) && isSequential(ranks)) {
    return mk(TYPE.TRIPLE_STRAIGHT, ranks[0], n)
  }
  // 四带二（两张单牌）
  if (n === 6) {
    const f = groups.find((g) => g.cards.length === 4)
    if (f) return mk(TYPE.FOUR_TWO_SINGLE, f.rank, n)
  }
  // 四带两对
  if (n === 8) {
    const f = groups.find((g) => g.cards.length === 4)
    const pairs = groups.filter((g) => g.cards.length === 2)
    if (f && pairs.length === 2) return mk(TYPE.FOUR_TWO_PAIR, f.rank, n)
  }

  // 飞机带翅膀：主体为 k 组连续三张（k>=2，不含2和王）
  const eligibleTriples = groups.filter((g) => g.cards.length === 3 && g.rank <= 14)
  const planeSinglesK = n % 4 === 0 ? n / 4 : 0
  const planePairsK = n % 5 === 0 ? n / 5 : 0

  if (planeSinglesK >= 2) {
    const chain = findTripleChains(eligibleTriples, planeSinglesK)
    if (chain) {
      const usedRanks = new Set(chain.map((g) => g.rank))
      const restCount = cards.filter((c) => !usedRanks.has(c.rank)).length
      // 主体每个 rank 恰好取 3 张；剩余必须正好 k 张（可能含同 rank 的第4张）
      if (restCount === planeSinglesK) {
        return mk(TYPE.PLANE_ONE, chain[0].rank, n, { chainLength: planeSinglesK })
      }
    }
  }

  if (planePairsK >= 2) {
    const chain = findTripleChains(eligibleTriples, planePairsK)
    if (chain) {
      const usedRanks = new Set(chain.map((g) => g.rank))
      const rest = cards.filter((c) => !usedRanks.has(c.rank))
      const restCounts = rankCounts(rest)
      const allPairs = Object.values(restCounts).length === planePairsK &&
        Object.values(restCounts).every((v) => v === 2)
      if (allPairs) {
        return mk(TYPE.PLANE_TWO, chain[0].rank, n, { chainLength: planePairsK })
      }
    }
  }

  return null
}

/** 牌型中文名 */
export function typeName(cardsOrPattern) {
  const p = cardsOrPattern?.type ? cardsOrPattern : analyze(cardsOrPattern)
  return p ? TYPE_NAME[p.type] : '未知牌型'
}

/** 优先级：王炸 > 炸弹 > 普通牌型 */
function priority(p) {
  if (p.type === TYPE.ROCKET) return 100
  if (p.type === TYPE.BOMB) return 90
  return 10
}

/**
 * a 是否能压过 b
 * @param {object|null} a 出的牌型（analyze 结果）
 * @param {object|null} b 上家牌型（null 表示自由出牌）
 */
export function canBeat(a, b) {
  if (!a) return false
  if (!b) return true
  const pa = priority(a)
  const pb = priority(b)
  if (pa !== pb) return pa > pb
  if (a.type === TYPE.ROCKET) return false // 王炸压王炸不存在
  if (a.type === TYPE.BOMB) return a.weight > b.weight
  return a.type === b.type && a.count === b.count && a.weight > b.weight
}

/** isBombOrRocket */
export function isBomb(p) {
  return p && (p.type === TYPE.BOMB || p.type === TYPE.ROCKET)
}
