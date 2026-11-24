/**
 * 内蒙麻将胡牌判定与算番
 * 基本牌型: 一对将 + 若干顺子/刻子（杠算刻子）
 * 特殊: 七对 / 豪华七对 / 超豪华七对 / 一条龙 / 飘胡 / 夹胡 / 屁胡
 */
import { buildCounts, countTotal, keyWeight, ALL_TILE_KEYS } from './tiles.js'

const NUMBER_PREFIXES = ['w', 't', 's']

/** 判断是否基本胡牌型（一对将 + n 组顺子/刻子），返回拆法或 null */
function basicWin(counts) {
  const total = countTotal(counts)
  if (total === 0 || total % 3 !== 2) return null

  const keys = Object.keys(counts).sort((a, b) => keyWeight(a) - keyWeight(b))
  // 枚举将牌
  for (const pairKey of keys) {
    if (counts[pairKey] < 2) continue
    const trial = { ...counts }
    trial[pairKey] -= 2
    const groups = tryDecompose(trial)
    if (groups) return { pair: pairKey, groups }
  }
  return null
}

/** 递归拆成顺子/刻子 */
function tryDecompose(counts) {
  const keys = Object.keys(counts).filter((k) => counts[k] > 0)
  if (keys.length === 0) return []
  const first = keys[0]

  // 刻子
  if (counts[first] >= 3) {
    const trial = { ...counts }
    trial[first] -= 3
    const rest = tryDecompose(trial)
    if (rest) return [{ type: 'pung', key: first }, ...rest]
  }
  // 顺子（仅同花色数字牌，且不含字牌）
  if (NUMBER_PREFIXES.includes(first[0])) {
    const prefix = first[0]
    const rank = Number(first.slice(1))
    if (rank <= 7) {
      const k2 = `${prefix}${rank + 1}`
      const k3 = `${prefix}${rank + 2}`
      if (counts[k2] > 0 && counts[k3] > 0) {
        const trial = { ...counts }
        trial[first] -= 1
        trial[k2] -= 1
        trial[k3] -= 1
        const rest = tryDecompose(trial)
        if (rest) return [{ type: 'chow', key: first, keys: [first, k2, k3] }, ...rest]
      }
    }
  }
  return null
}

/** 判断是否七对（含豪华/超豪华七对） */
function sevenPairs(counts) {
  const total = countTotal(counts)
  if (total !== 14) return null
  let quadruples = 0
  let pairEquivalents = 0
  for (const [, c] of Object.entries(counts)) {
    if (c === 2) pairEquivalents += 1
    else if (c === 4) { quadruples += 1; pairEquivalents += 2 }
    else return null
  }
  // 七对 = 7 组对子；豪华七对用 1 个四张顶 2 对（共 6 个 key），超豪华用 2 个四张（共 5 个 key）
  if (pairEquivalents !== 7) return null
  return { pairCount: 7, quadruples }
}

/**
 * 判断是否能胡牌
 * @param {object} counts 计数表 {key:count}
 * @param {object} opts { allowSevenPairs:true, allowPiao:true }
 * @returns {null|object} 胡牌信息
 */
export function canWin(counts, opts = {}) {
  const { allowSevenPairs = true } = opts
  const total = countTotal(counts)
  if (total !== 14 && total !== 11 && total !== 8 && total !== 5 && total !== 2) return null

  // 七对优先判定，避免被基础顺子拆法吃掉
  if (allowSevenPairs && total === 14) {
    const sp = sevenPairs(counts)
    if (sp) {
      if (sp.quadruples >= 2) return { kind: 'superLuxurySeven', ...sp }
      if (sp.quadruples === 1) return { kind: 'luxurySeven', ...sp }
      return { kind: 'sevenPairs', ...sp }
    }
  }

  const basic = basicWin(counts)
  if (basic) return { kind: 'basic', ...basic }
  return null
}

/**
 * 从牌数组判断是否胡牌（便捷函数）
 */
export function canWinTiles(tiles, opts = {}) {
  return canWin(buildCounts(tiles), opts)
}

/**
 * 计算胡牌番型与分数
 * @param {object} winInfo canWin 的结果
 * @param {object} counts 手牌计数
 * @param {object} ctx { selfDraw, afterGang, isDealer, options:{allowSevenPairs,allowPiao,allowOneShotThree} }
 */
export function scoreHand(winInfo, counts, ctx = {}) {
  const options = ctx.options || {}
  const patterns = []
  let score = 0

  const isPiao = winInfo.kind === 'basic' &&
    winInfo.groups.every((g) => g.type === 'pung')

  if (winInfo.kind === 'sevenPairs') {
    patterns.push('七对')
    score += options.allowSevenPairs === false ? 2 : 10
  } else if (winInfo.kind === 'luxurySeven') {
    patterns.push('豪华七对')
    score += 20
  } else if (winInfo.kind === 'superLuxurySeven') {
    patterns.push('超豪华七对')
    score += 40
  } else if (isPiao) {
    patterns.push('飘胡')
    score += options.allowPiao === false ? 2 : 6
  } else {
    // 判断是否夹胡
    const isJia = hasJiaHu(winInfo, counts)
    if (isJia) {
      patterns.push('夹胡')
      score += 4
    } else {
      patterns.push('屁胡')
      score += 2
    }
  }

  // 一条龙：任一花色 1-9 齐全
  if (hasDragon(counts)) {
    patterns.push('一条龙')
    score += 10
  }
  // 清一色：只有一种花色（字牌可与单一花色共存）
  if (isPureSuit(counts)) {
    patterns.push('清一色')
    score *= 2
  }
  // 杠上开花
  if (ctx.afterGang && ctx.selfDraw) {
    patterns.push('杠上开花')
    score *= 2
  }
  // 庄家翻倍
  if (ctx.isDealer) {
    patterns.push('庄家')
    score *= 2
  }

  return { patterns, score }
}

/** 夹胡判定（边张/坎张/单钓） */
function hasJiaHu(winInfo, counts) {
  if (winInfo.kind !== 'basic') return false
  // 单钓将：将牌只出现 2 张且没有其他组合能解释 —— 简化为检查将牌是否唯一对子
  const pairKey = winInfo.pair
  // 顺子首张为 n 且是 7/8（边张 7-8-9 算 89 夹 7），或顺子中间张（坎张）
  for (const g of winInfo.groups) {
    if (g.type !== 'chow') continue
    const rank = Number(g.key.slice(1))
    if (rank >= 7) return true // 边张 789 胡 7 或 9
    // 坎张：胡的是中间张（简化：若将牌恰好是顺子的中间 rank）
    if (pairKey[0] === g.key[0]) {
      const pr = Number(pairKey.slice(1))
      if (pr === rank + 1) return true
    }
  }
  return false
}

/** 一条龙：任一数字花色 1-9 都有牌 */
function hasDragon(counts) {
  for (const prefix of ['w', 't', 's']) {
    let complete = true
    for (let n = 1; n <= 9; n++) {
      if (!counts[`${prefix}${n}`]) { complete = false; break }
    }
    if (complete) return true
  }
  return false
}

/** 清一色：所有牌属于同一种数字花色（允许字牌混搭仍按内蒙规则算清一色） */
function isPureSuit(counts) {
  const suits = new Set()
  for (const key of Object.keys(counts)) {
    if (counts[key] <= 0) continue
    if (key[0] === 'z') continue // 字牌不破坏清一色
    suits.add(key[0])
  }
  return suits.size === 1 && suits.has !== null
}

/**
 * 听牌提示：给定 13 张手牌，返回所有能胡的牌 key
 */
export function getTingTiles(tiles, opts = {}) {
  const counts = buildCounts(tiles)
  const total = countTotal(counts)
  if (total !== 13) return []
  const results = []
  for (const key of ALL_TILE_KEYS) {
    if ((counts[key] || 0) >= 4) continue
    const trial = { ...counts }
    trial[key] = (trial[key] || 0) + 1
    if (canWin(trial, opts)) results.push(key)
  }
  return results.sort((a, b) => keyWeight(a) - keyWeight(b))
}

/**
 * 判断玩家是否可以碰牌：手牌里有 2 张与目标 key 相同
 */
export function canPung(tiles, targetKey) {
  const counts = buildCounts(tiles)
  return (counts[targetKey] || 0) >= 2
}

/**
 * 判断是否可杠：手牌里已有 3 张（暗杠/补杠）或别人打出时自己有 3 张（明杠）
 */
export function canKong(tiles, targetKey) {
  const counts = buildCounts(tiles)
  return (counts[targetKey] || 0) >= 3
}
