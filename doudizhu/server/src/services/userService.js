import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { store } from '../db/store.js'
import { config } from '../config/index.js'
import { signToken } from '../utils/auth.js'

export function publicUser(u) {
  if (!u) return null
  const { passwordHash, ...rest } = u
  return rest
}

export function findUserById(id) {
  return store.find('users', (u) => u.id === id)
}

export function findUserByUsername(username) {
  return store.find('users', (u) => u.username === username.toLowerCase())
}

export function levelInfo(exp = 0) {
  let level = 1
  let need = 200
  let rest = exp
  while (rest >= need) {
    rest -= need
    level++
    need = Math.floor(need * 1.35)
  }
  return { level, currentExp: rest, nextExp: need }
}

export function register({ username, password, nickname }) {
  const name = String(username || '').trim().toLowerCase()
  const pass = String(password || '')
  if (!/^[a-z0-9_]{3,20}$/.test(name)) throw new Error('账号需为 3-20 位字母、数字或下划线')
  if (pass.length < 6 || pass.length > 32) throw new Error('密码需为 6-32 位')
  if (findUserByUsername(name)) throw new Error('该账号已被注册')

  const now = Date.now()
  const exp = 0
  const user = {
    id: nanoid(12),
    username: name,
    nickname: String(nickname || `牌友${name.slice(0, 4)}`).slice(0, 16),
    passwordHash: bcrypt.hashSync(pass, 8),
    role: 'user',
    coins: config.economy.registerCoins,
    diamonds: config.economy.registerDiamonds,
    avatar: '',
    avatarFrame: '',
    title: '',
    signature: '这个人很懒，什么都没写~',
    exp,
    level: levelInfo(exp).level,
    games: 0,
    wins: 0,
    losses: 0,
    totalBombs: 0,
    status: 'active',
    createdAt: now,
    lastLoginAt: now,
  }
  store.insert('users', user)

  store.insert('mails', {
    id: nanoid(10),
    toUserId: user.id,
    title: '欢迎礼包',
    content: `欢迎来到${config.name}！这是你的新手见面礼，请查收。`,
    rewards: { coins: 2000, diamonds: 50 },
    readBy: [],
    claimedBy: [],
    createdAt: now,
  })

  return { user: publicUser(user), token: signToken(user) }
}

export function login({ username, password }) {
  const user = findUserByUsername(String(username || '').trim().toLowerCase())
  if (!user) throw new Error('账号或密码错误')
  if (user.status === 'banned') throw new Error('账号已被封禁')
  if (!bcrypt.compareSync(String(password || ''), user.passwordHash)) throw new Error('账号或密码错误')
  user.lastLoginAt = Date.now()
  store.save()
  return { user: publicUser(user), token: signToken(user) }
}

export function updateProfile(userId, patch) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  const allowed = ['nickname', 'avatar', 'signature', 'avatarFrame', 'title']
  for (const key of allowed) {
    if (patch[key] !== undefined) user[key] = String(patch[key]).slice(0, 100)
  }
  store.save()
  return publicUser(user)
}

export function changePassword(userId, oldPass, newPass) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  if (!bcrypt.compareSync(String(oldPass || ''), user.passwordHash)) throw new Error('原密码错误')
  if (String(newPass || '').length < 6) throw new Error('新密码至少 6 位')
  user.passwordHash = bcrypt.hashSync(String(newPass), 8)
  store.save()
  return true
}

export function signin(userId) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  const today = new Date().toISOString().slice(0, 10)
  let record = store.find('signins', (s) => s.userId === userId)
  if (record?.lastDate === today) throw new Error('今天已经签到过了')

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const streak = record && record.lastDate === yesterday ? (record.streak || 0) + 1 : 1
  const coins = config.economy.signinCoins + Math.min(streak, 7) * config.economy.signinStreakBonus
  const diamonds = streak % 7 === 0 ? 20 : 0

  if (record) {
    Object.assign(record, { lastDate: today, streak, total: (record.total || 0) + 1 })
  } else {
    record = { userId, lastDate: today, streak, total: 1 }
    store.insert('signins', record)
  }
  user.coins += coins
  user.diamonds += diamonds
  store.save()
  return { coins, diamonds, streak }
}

export function bankruptcy(userId) {
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')
  if (user.coins >= config.economy.bankruptcyThreshold) throw new Error('金币充足，暂不能领取补助')
  const last = store.find('bankruptcy', (b) => b.userId === userId)
  const cooldown = config.economy.bankruptcyCooldownHours * 3600 * 1000
  if (last && Date.now() - last.at < cooldown) throw new Error('补助冷却中，请稍后再试')
  if (last) last.at = Date.now()
  else store.insert('bankruptcy', { userId, at: Date.now() })
  user.coins += config.economy.bankruptcyCoins
  store.save()
  return { coins: config.economy.bankruptcyCoins }
}

export function addCoins(userId, delta, reason = '') {
  const user = findUserById(userId)
  if (!user) return null
  user.coins = Math.max(0, user.coins + delta)
  store.collection('coinLogs').push({ userId, delta, reason, at: Date.now() })
  store.save()
  return user.coins
}

export function addExp(userId, amount) {
  const user = findUserById(userId)
  if (!user) return null
  const before = levelInfo(user.exp).level
  user.exp += Math.max(0, Math.round(amount))
  const info = levelInfo(user.exp)
  user.level = info.level
  store.save()
  return { exp: user.exp, level: user.level, levelUp: info.level > before }
}

export function applyGameResult(userId, { delta, win, bombs, exp }) {
  const user = findUserById(userId)
  if (!user) return
  user.coins = Math.max(0, user.coins + delta)
  user.games = (user.games || 0) + 1
  if (win) user.wins = (user.wins || 0) + 1
  else user.losses = (user.losses || 0) + 1
  user.totalBombs = (user.totalBombs || 0) + bombs
  const before = levelInfo(user.exp).level
  user.exp += exp
  user.level = levelInfo(user.exp).level
  store.collection('coinLogs').push({ userId, delta, reason: '对局结算', at: Date.now() })
  store.save()
  return { levelUp: user.level > before }
}

export function ensureAdminAccount() {
  let admin = findUserByUsername(config.admin.username)
  if (!admin) {
    admin = {
      id: 'admin-root',
      username: config.admin.username,
      nickname: '系统管理员',
      passwordHash: bcrypt.hashSync(config.admin.password, 8),
      role: 'admin',
      coins: 0,
      diamonds: 0,
      exp: 0,
      level: 1,
      games: 0,
      wins: 0,
      losses: 0,
      totalBombs: 0,
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    }
    store.insert('users', admin)
  }
  return admin
}

export function listUsers() {
  return store.filter('users', () => true).map(publicUser)
}
