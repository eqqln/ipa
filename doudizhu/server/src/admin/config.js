/**
 * 系统配置中心：可视化配置游戏参数，热更新
 */
import { config } from '../config/index.js'
import { store } from '../db/store.js'

const DEFAULTS = {
  registerCoins: { value: config.economy.registerCoins, desc: '注册赠送金币', group: '经济' },
  registerDiamonds: { value: config.economy.registerDiamonds, desc: '注册赠送钻石', group: '经济' },
  signinCoins: { value: config.economy.signinCoins, desc: '每日签到基础金币', group: '经济' },
  bankruptcyCoins: { value: config.economy.bankruptcyCoins, desc: '破产补助金币', group: '经济' },
  bankruptcyThreshold: { value: config.economy.bankruptcyThreshold, desc: '破产补助阈值', group: '经济' },
  baseScores: { value: config.room.baseScores, desc: '房间底分档位', group: '游戏' },
  defaultBaseScore: { value: config.room.defaultBaseScore, desc: '默认底分', group: '游戏' },
  maxMultiplier: { value: config.game.maxMultiplier, desc: '倍数封顶', group: '游戏' },
  playTimeoutMs: { value: config.game.playTimeoutMs, desc: '出牌超时(ms)', group: '游戏' },
  allowSevenPairs: { value: true, desc: '麻将允许七对', group: '麻将' },
  allowPiao: { value: true, desc: '麻将飘胡计分', group: '麻将' },
  allowOneShotThree: { value: false, desc: '麻将一炮多响', group: '麻将' },
  maintainMode: { value: false, desc: '维护模式（禁止新对局）', group: '系统' },
}

export function listConfig() {
  const saved = store.data.systemConfig || {}
  const result = {}
  for (const [key, def] of Object.entries(DEFAULTS)) {
    result[key] = {
      key,
      value: saved[key] !== undefined ? saved[key] : def.value,
      desc: def.desc,
      group: def.group,
    }
  }
  return result
}

export function getConfigValue(key) {
  const all = listConfig()
  return all[key]?.value
}

export function updateConfig(key, value) {
  if (!DEFAULTS[key]) throw new Error('未知配置项')
  if (!store.data.systemConfig) store.data.systemConfig = {}
  store.data.systemConfig[key] = value
  store.save()
  return listConfig()[key]
}

export function updateConfigBatch(updates = {}) {
  if (!store.data.systemConfig) store.data.systemConfig = {}
  for (const [key, value] of Object.entries(updates)) {
    if (DEFAULTS[key]) store.data.systemConfig[key] = value
  }
  store.save()
  return listConfig()
}
