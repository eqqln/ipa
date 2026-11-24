import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config/index.js'

const SHOP_ITEMS = [
  { id: 'item_cardcounter', name: '记牌器', type: 'tool', price: 500, diamondPrice: 30, icon: '🧮', desc: '对局中显示剩余牌数' },
  { id: 'item_doubleexp', name: '双倍经验卡', type: 'tool', price: 300, diamondPrice: 20, icon: '⚡', desc: '1小时内对局经验翻倍' },
  { id: 'item_luckycharm', name: '幸运符', type: 'tool', price: 800, diamondPrice: 50, icon: '🍀', desc: '下一局倍数+1' },
  { id: 'avatar_1', name: '霸气龙头像框', type: 'avatar', price: 1200, diamondPrice: 80, icon: '🐉', desc: '专属头像框' },
  { id: 'avatar_2', name: '梦幻星空头像框', type: 'avatar', price: 1200, diamondPrice: 80, icon: '✨', desc: '专属头像框' },
  { id: 'avatar_3', name: '王者皇冠头像框', type: 'avatar', price: 2000, diamondPrice: 150, icon: '👑', desc: '专属头像框' },
  { id: 'title_1', name: '牌坛新星称号', type: 'title', price: 600, diamondPrice: 40, icon: '🌟', desc: '昵称前缀称号' },
  { id: 'title_2', name: '斗地主大师称号', type: 'title', price: 1800, diamondPrice: 120, icon: '🏆', desc: '昵称前缀称号' },
]

const TASK_DEFS = [
  { id: 'task_play1', name: '初出茅庐', desc: '完成 1 局对局', type: 'daily', target: 1, rewardCoins: 200, rewardExp: 20, metric: 'games' },
  { id: 'task_play3', name: '牌桌常客', desc: '完成 3 局对局', type: 'daily', target: 3, rewardCoins: 500, rewardExp: 50, metric: 'games' },
  { id: 'task_win1', name: '旗开得胜', desc: '赢得 1 局对局', type: 'daily', target: 1, rewardCoins: 400, rewardExp: 30, metric: 'wins' },
  { id: 'task_bomb3', name: '炸弹专家', desc: '累计打出 3 个炸弹', type: 'daily', target: 3, rewardCoins: 600, rewardExp: 60, metric: 'bombs' },
  { id: 'task_signin7', name: '七日签到', desc: '连续签到 7 天', type: 'achievement', target: 7, rewardCoins: 2000, rewardDiamonds: 50, rewardExp: 100, metric: 'streak' },
  { id: 'task_win50', name: '常胜将军', desc: '累计赢得 50 局', type: 'achievement', target: 50, rewardCoins: 5000, rewardDiamonds: 100, rewardExp: 300, metric: 'totalWins' },
]

const DEFAULT_DB = () => ({
  meta: { version: 1, createdAt: Date.now() },
  users: [],
  records: [],
  mails: [],
  friends: [],
  chatMessages: [],
  announcements: [
    { id: 'a1', title: '欢迎来到极跃斗地主', content: '注册即送金币和钻石，每日签到领好礼！快去牌桌一展身手吧。', createdAt: Date.now(), pinned: true },
    { id: 'a2', title: '新版本上线公告', content: '新增人机对战、好友约战、私人房邀请码、商城道具与成就系统。', createdAt: Date.now(), pinned: false },
  ],
  shopItems: SHOP_ITEMS,
  taskDefs: TASK_DEFS,
  userItems: [],
  signins: [],
  bankruptcy: [],
  taskProgress: [],
})

class Store {
  constructor(file) {
    this.file = file
    this.data = this.load()
    this._saveTimer = null
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        return { ...DEFAULT_DB(), ...parsed }
      }
    } catch (e) {
      console.error('[store] 读取数据库失败，使用默认数据:', e.message)
    }
    const fresh = DEFAULT_DB()
    this.ensureDir()
    fs.writeFileSync(this.file, JSON.stringify(fresh, null, 2), 'utf8')
    return fresh
  }

  ensureDir() {
    if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true })
  }

  /** 同步落盘（数据量小，简单可靠）；可合并短时间内的多次写入 */
  save() {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      this.ensureDir()
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      fs.renameSync(tmp, this.file)
      this._saveTimer = null
    }, 20)
  }

  /** 立即落盘（退出前调用） */
  flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this.ensureDir()
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    this._saveTimer = null
  }

  collection(name) {
    if (!this.data[name]) this.data[name] = []
    return this.data[name]
  }

  find(name, predicate) {
    return this.collection(name).find(predicate)
  }

  filter(name, predicate) {
    return this.collection(name).filter(predicate)
  }

  insert(name, doc) {
    this.collection(name).push(doc)
    this.save()
    return doc
  }

  update(name, predicate, patch) {
    const doc = this.find(name, predicate)
    if (doc) {
      Object.assign(doc, patch)
      this.save()
    }
    return doc
  }

  remove(name, predicate) {
    const list = this.collection(name)
    const idx = list.findIndex(predicate)
    if (idx >= 0) {
      const [doc] = list.splice(idx, 1)
      this.save()
      return doc
    }
    return null
  }
}

export const store = new Store(config.dbFile)
