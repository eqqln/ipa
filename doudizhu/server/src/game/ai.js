/**
 * 斗地主 AI：叫地主评分、出牌枚举与决策
 */
import { groupByRank, rankCounts } from './cards.js'
import { analyze, canBeat, isBomb, TYPE } from './pattern.js'

/** 按权重升序取最小的 n 张 */
function takeSmallest(cards, n) {
  return cards.slice().sort((a, b) => a.weight - b.weight).slice(0, n)
}

/** 生成所有候选出牌组合（已做去重与合法性校验） */
export function generateCandidatePlays(hand) {
  const groups = groupByRank(hand)
  const byRank = new Map(groups.map((g) => [g.rank, g]))
  const seen = new Set()
  const result = []

  const push = (cards) => {
    if (!cards || !cards.length) return
    const key = cards.map((c) => c.id).sort().join('|')
    if (seen.has(key)) return
    seen.add(key)
    const pattern = analyze(cards)
    if (pattern) result.push({ cards, pattern })
  }

  // 单 / 对 / 三 / 炸弹
  for (const g of groups) {
    push([g.cards[0]])
    if (g.cards.length >= 2) push(g.cards.slice(0, 2))
    if (g.cards.length >= 3) push(g.cards.slice(0, 3))
    if (g.cards.length === 4) push(g.cards.slice(0, 4))
  }
  // 火箭
  if (byRank.has(16) && byRank.has(17)) push([byRank.get(16).cards[0], byRank.get(17).cards[0]])

  // 三带一 / 三带二
  for (const g of groups.filter((x) => x.cards.length >= 3)) {
    const main = g.cards.slice(0, 3)
    for (const other of groups) {
      if (other.rank === g.rank) continue
      push([...main, other.cards[0]])
      if (other.cards.length >= 2) push([...main, ...other.cards.slice(0, 2)])
    }
  }

  // 顺子(>=5) / 连对(>=3) / 三顺(>=2)
  for (let start = 3; start <= 14; start++) {
    for (let len = 5; start + len - 1 <= 14; len++) {
      const seq = []
      for (let r = start; r < start + len; r++) {
        const g = byRank.get(r)
        if (!g) break
        seq.push(g.cards[0])
      }
      if (seq.length === len) push(seq)
    }
    for (let len = 3; start + len - 1 <= 14; len++) {
      const seq = []
      for (let r = start; r < start + len; r++) {
        const g = byRank.get(r)
        if (!g || g.cards.length < 2) break
        seq.push(...g.cards.slice(0, 2))
      }
      if (seq.length === len * 2) push(seq)
    }
    for (let len = 2; start + len - 1 <= 14; len++) {
      const seq = []
      for (let r = start; r < start + len; r++) {
        const g = byRank.get(r)
        if (!g || g.cards.length < 3) break
        seq.push(...g.cards.slice(0, 3))
      }
      if (seq.length === len * 3) push(seq)
    }
  }

  // 飞机带翅膀
  for (let start = 3; start <= 14; start++) {
    for (let len = 2; start + len - 1 <= 14; len++) {
      const main = []
      let ok = true
      const used = new Set()
      for (let r = start; r < start + len; r++) {
        const g = byRank.get(r)
        if (!g || g.cards.length < 3) { ok = false; break }
        main.push(...g.cards.slice(0, 3))
        used.add(r)
      }
      if (!ok) continue
      const rest = hand.filter((c) => !used.has(c.rank))
      if (rest.length >= len) push([...main, ...takeSmallest(rest, len)])
      // 带对：主体每个 rank 只取 3 张，第 4 张也可参与带对
      const pairPool = groups.filter((g) => {
        if (used.has(g.rank)) return g.cards.length === 4
        return g.cards.length >= 2
      })
      if (pairPool.length >= len) {
        const wings = []
        for (const g of pairPool.slice(0, len)) {
          wings.push(...(used.has(g.rank) ? g.cards.slice(3, 5) : g.cards.slice(0, 2)))
        }
        if (wings.length === len * 2) push([...main, ...wings])
      }
    }
  }

  // 四带二 / 四带两对
  for (const b of groups.filter((g) => g.cards.length === 4)) {
    const rest = hand.filter((c) => c.rank !== b.rank)
    if (rest.length >= 2) push([...b.cards, ...takeSmallest(rest, 2)])
    const pairPool = groups.filter((g) => g.rank !== b.rank && g.cards.length >= 2)
    if (pairPool.length >= 2) {
      push([...b.cards, ...pairPool.slice(0, 2).flatMap((g) => g.cards.slice(0, 2))])
    }
  }

  return result
}

/** 找所有能压过上家的组合 */
export function findBeatingPlays(hand, lastPattern) {
  return generateCandidatePlays(hand).filter((p) => canBeat(p.pattern, lastPattern))
}

/** 出牌偏好评分：数值越小越优先出 */
function playScore(play, hand) {
  const { pattern } = play
  const bonus = {
    [TYPE.SINGLE]: 0,
    [TYPE.PAIR]: -6,
    [TYPE.TRIPLE]: -14,
    [TYPE.TRIPLE_ONE]: -10,
    [TYPE.TRIPLE_TWO]: -12,
    [TYPE.STRAIGHT]: -28,
    [TYPE.DOUBLE_STRAIGHT]: -34,
    [TYPE.TRIPLE_STRAIGHT]: -40,
    [TYPE.PLANE_ONE]: -36,
    [TYPE.PLANE_TWO]: -42,
    [TYPE.FOUR_TWO_SINGLE]: -20,
    [TYPE.FOUR_TWO_PAIR]: -26,
    [TYPE.BOMB]: 420,
    [TYPE.ROCKET]: 620,
  }
  return pattern.weight * 10 + pattern.count + (bonus[pattern.type] ?? 0)
}

/**
 * AI 选牌
 * @param {Array} hand 手牌
 * @param {object|null} lastPattern 上家牌型
 * @param {object} opts { enemyCardCount: 对手最少手牌数, isTeammateLast: 上家是否为队友 }
 * @returns {Array<string>|null} 要出的牌 id 数组；null 表示不出
 */
export function choosePlay(hand, lastPattern, opts = {}) {
  const candidates = findBeatingPlays(hand, lastPattern)
  if (!candidates.length) return null

  // 能一手出完就直接出
  const finishing = candidates.find((p) => p.cards.length === hand.length)
  if (finishing) return finishing.cards.map((c) => c.id)

  // 上家是队友且不是最后出牌权争夺，尽量不压
  if (opts.isTeammateLast && !isBomb(lastPattern)) {
    const nonBomb = candidates.filter((p) => !isBomb(p.pattern))
    if (nonBomb.length === 0) return null
    candidates.length = 0
    candidates.push(...nonBomb)
  }

  const scored = candidates
    .map((p) => ({ ...p, score: playScore(p, hand) }))
    .sort((a, b) => a.score - b.score)

  // 对手手牌很少时，允许用炸弹拦截
  const urgent = typeof opts.enemyCardCount === 'number' && opts.enemyCardCount <= 2
  const pick = urgent ? scored[0] : (scored.find((p) => !isBomb(p.pattern)) || scored[0])
  return pick ? pick.cards.map((c) => c.id) : null
}

/** 叫地主评分：0=不叫，1/2/3=叫分 */
export function evaluateBid(hand) {
  const counts = rankCounts(hand)
  let score = 0
  if (counts[17]) score += 4
  if (counts[16]) score += 3
  if (counts[16] && counts[17]) score += 3
  score += (counts[15] || 0) * 2
  score += Math.max(0, (counts[14] || 0) - 1)
  for (const [rank, count] of Object.entries(counts)) {
    if (count === 4) score += rank >= 15 ? 8 : 6
  }
  if (score >= 11) return 3
  if (score >= 8) return 2
  if (score >= 5) return 1
  return 0
}

/** 是否抢地主 */
export function shouldGrab(hand, currentMultiplier = 1) {
  return evaluateBid(hand) >= (currentMultiplier >= 4 ? 9 : 7)
}

/** 是否加倍 */
export function shouldDouble(hand) {
  return evaluateBid(hand) >= 7
}

/** 托管出牌：与 AI 相同，但更保守 */
export function trustPlay(hand, lastPattern, opts = {}) {
  return choosePlay(hand, lastPattern, { ...opts, enemyCardCount: 3 })
}
