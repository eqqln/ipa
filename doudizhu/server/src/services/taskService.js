import { store } from '../db/store.js'
import { findUserById, addCoins, addExp } from './userService.js'

export function tasksForUser(userId) {
  const progressList = store.filter('taskProgress', (p) => p.userId === userId)
  return store.data.taskDefs.map((def) => {
    const p = progressList.find((x) => x.taskId === def.id)
    return {
      ...def,
      progress: Math.min(p?.progress || 0, def.target),
      claimed: !!p?.claimed,
      completed: (p?.progress || 0) >= def.target,
    }
  })
}

/** 根据当前用户数据统计任务进度（在对局结算 / 签到后调用） */
export function syncProgress(userId) {
  const user = findUserById(userId)
  if (!user) return
  const signin = store.find('signins', (s) => s.userId === userId)
  const values = {
    games: user.games || 0,
    wins: user.wins || 0,
    bombs: user.totalBombs || 0,
    streak: signin?.streak || 0,
    totalWins: user.wins || 0,
  }
  for (const def of store.data.taskDefs) {
    let p = store.find('taskProgress', (x) => x.userId === userId && x.taskId === def.id)
    const current = values[def.metric] || 0
    if (!p) {
      p = { userId, taskId: def.id, progress: current, claimed: false }
      store.insert('taskProgress', p)
    } else if (p.progress < current) {
      p.progress = current
      store.save()
    }
  }
}

export function claimTask(userId, taskId) {
  const def = store.data.taskDefs.find((d) => d.id === taskId)
  if (!def) throw new Error('任务不存在')
  let p = store.find('taskProgress', (x) => x.userId === userId && x.taskId === taskId)
  if (!p) throw new Error('任务进度不存在')
  if (p.claimed) throw new Error('奖励已领取')
  if (p.progress < def.target) throw new Error('任务尚未完成')

  p.claimed = true
  const user = findUserById(userId)
  if (def.rewardCoins) user.coins += def.rewardCoins
  if (def.rewardDiamonds) user.diamonds += def.rewardDiamonds
  if (def.rewardExp) addExp(userId, def.rewardExp)
  store.collection('coinLogs').push({ userId, delta: def.rewardCoins || 0, reason: `任务奖励:${def.name}`, at: Date.now() })
  store.save()
  return {
    coins: def.rewardCoins || 0,
    diamonds: def.rewardDiamonds || 0,
    exp: def.rewardExp || 0,
  }
}
