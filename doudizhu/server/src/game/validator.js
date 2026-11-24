import { analyze, canBeat } from './pattern.js'
import { pickCards } from './cards.js'

/**
 * 校验一次出牌
 * @param {Array} hand 当前手牌
 * @param {Array<string>} ids 选中的牌 id
 * @param {object|null} lastPattern 上家牌型（null 表示自由出牌）
 */
export function validatePlay(hand, ids, lastPattern = null) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { valid: false, reason: '请选择要出的牌' }
  }
  if (new Set(ids).size !== ids.length) {
    return { valid: false, reason: '不能重复选择同一张牌' }
  }
  const pickedResult = pickCards(hand, ids)
  if (!pickedResult.valid) {
    return { valid: false, reason: '手牌中不存在所选的牌' }
  }
  const pattern = analyze(pickedResult.picked)
  if (!pattern) {
    return { valid: false, reason: '不是合法的斗地主牌型' }
  }
  if (!canBeat(pattern, lastPattern)) {
    return { valid: false, reason: lastPattern ? '牌型或点数压不过上家' : '无法出牌' }
  }
  return {
    valid: true,
    pattern,
    picked: pickedResult.picked,
    remain: pickedResult.remain,
  }
}
