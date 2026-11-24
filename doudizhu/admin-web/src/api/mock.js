// 接口未就绪时的兜底数据：全部为确定性生成，避免图表/表格抖动

function seeded(seed) {
  let s = seed >>> 0
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const int = (min, max) => Math.floor(next() * (max - min + 1)) + min
  const pick = (arr) => arr[Math.floor(next() * arr.length)]
  return { next, int, pick }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateStr(s, offsetDays, hour = 10) {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, s.int(0, 59), s.int(0, 59), 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dayStr(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭']
const NICK_WORDS = ['欢乐', '雀神', '地主', '王炸', '牌王', '老K', '春风', '夜雨', '飞龙', '霸道', '小鱼', '大圣', '流浪', '追风', '孤星', '明月', '顺子', '金花']
const AVATAR_COLORS = ['#e9b949', '#35d0e0', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#4ade80']

export const PERMISSION_TREE = [
  { group: '概览', keys: ['dash.view', 'analytics.view', 'analytics.export'] },
  { group: '用户', keys: ['user.view', 'user.ban', 'user.grant', 'user.export'] },
  { group: '财务', keys: ['finance.view', 'finance.grant', 'finance.export'] },
  { group: '游戏', keys: ['game.view', 'game.dissolve', 'game.query'] },
  { group: '风控', keys: ['risk.view', 'risk.handle', 'risk.rule'] },
  { group: '系统', keys: ['content.view', 'content.publish', 'config.view', 'config.edit', 'rbac.view', 'rbac.edit', 'audit.view'] }
]

const ALL_PERMISSIONS = PERMISSION_TREE.flatMap((g) => g.keys)

export function mockDashboard() {
  return {
    totalUsers: 128456,
    onlineUsers: 3821,
    activeRooms: 286,
    totalCoins: 987654320,
    totalDiamonds: 12456780,
    totalGames: 3521890,
    todayGames: 12847,
    totalBetFlow: 5678901230
  }
}

export function mockAnalyticsOverview(days = 7) {
  const s = seeded(31 + Number(days))
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    daily.push({
      date: dayStr(i),
      games: s.int(9000, 15000),
      newUsers: s.int(320, 980),
      activeUsers: s.int(2600, 4200),
      coinFlow: s.int(1800000, 4200000),
      revenue: s.int(12000, 46000)
    })
  }
  return {
    daily,
    summary: {
      totalGames: daily.reduce((a, b) => a + b.games, 0),
      totalNewUsers: daily.reduce((a, b) => a + b.newUsers, 0),
      totalRevenue: daily.reduce((a, b) => a + b.revenue, 0),
      avgActive: Math.round(daily.reduce((a, b) => a + b.activeUsers, 0) / daily.length)
    }
  }
}

export function mockRetention() {
  const s = seeded(88)
  const list = []
  for (let i = 13; i >= 0; i--) {
    list.push({
      date: dayStr(i),
      day1: s.int(38, 58),
      day3: s.int(22, 38),
      day7: s.int(12, 26),
      rate: s.int(30, 52)
    })
  }
  return list
}

export function mockUsers(total = 136) {
  const s = seeded(2024)
  const list = []
  for (let i = 1; i <= total; i++) {
    const nickname = `${s.pick(SURNAMES)}${s.pick(NICK_WORDS)}${s.int(1, 99)}`
    list.push({
      id: 1000 + i,
      avatar: s.pick(AVATAR_COLORS),
      nickname,
      account: `player${String(10000 + i)}`,
      phone: `1${s.pick([3, 5, 7, 8, 9])}${'****'}${String(1000 + i).slice(-4)}`,
      coins: s.int(1200, 860000),
      diamonds: s.int(0, 9500),
      level: s.int(1, 68),
      winRate: (s.int(340, 730) / 10).toFixed(1),
      gameCount: s.int(12, 3200),
      status: i % 19 === 0 ? 'banned' : 'active',
      registeredAt: dateStr(s, s.int(0, 240), s.int(8, 23)),
      lastLogin: dateStr(s, s.int(0, 9), s.int(8, 23))
    })
  }
  return { total, page: 1, pageSize: 10, list }
}

export function mockCoinLogs(n = 90) {
  const s = seeded(77)
  const reasons = ['对局结算', '签到奖励', '系统发放', '钻石兑换', '道具购买', '注册赠送', '活动奖励', '红包赠送']
  const list = []
  for (let i = 0; i < n; i++) {
    const delta = s.int(1, 10) > 4 ? s.int(100, 50000) : -s.int(100, 20000)
    list.push({
      id: `C${20240000 + i}`,
      userId: 1000 + s.int(1, 136),
      nickname: `${s.pick(SURNAMES)}${s.pick(NICK_WORDS)}${s.int(1, 99)}`,
      delta,
      reason: s.pick(reasons),
      balance: s.int(10000, 900000),
      at: dateStr(s, s.int(0, 30), s.int(7, 24))
    })
  }
  return list
}

export function mockGames(n = 80) {
  const s = seeded(909)
  const list = []
  for (let i = 0; i < n; i++) {
    const game = s.next() > 0.48 ? '斗地主' : '内蒙麻将'
    list.push({
      id: `G${20240000 + i}`,
      roomNo: String(s.int(100000, 999999)),
      game,
      mode: game === '斗地主' ? s.pick(['经典斗地主', '焦点斗地主', '不洗牌']) : s.pick(['内蒙麻将', '血流成河', '血战到底']),
      players: game === '斗地主' ? 3 : 4,
      winner: `${s.pick(SURNAMES)}${s.pick(NICK_WORDS)}`,
      bet: s.int(2, 200),
      pot: s.int(200, 68000),
      rounds: s.int(3, 20),
      duration: `${s.int(3, 28)}分${s.int(0, 59)}秒`,
      at: dateStr(s, s.int(0, 15), s.int(8, 24)),
      status: 'finished'
    })
  }
  return list
}

export function mockRooms(n = 24) {
  const s = seeded(515)
  const list = []
  for (let i = 0; i < n; i++) {
    const game = s.next() > 0.5 ? '斗地主' : '内蒙麻将'
    const max = game === '斗地主' ? 3 : 4
    const players = s.int(1, max)
    list.push({
      id: `R${20240000 + i}`,
      roomNo: String(s.int(100000, 999999)),
      game,
      mode: game === '斗地主' ? s.pick(['经典斗地主', '焦点斗地主']) : s.pick(['内蒙麻将', '血流成河']),
      players,
      maxPlayers: max,
      baseScore: s.pick([1, 2, 5, 10, 20, 50]),
      pot: s.int(0, 32000),
      status: players === 0 ? 'waiting' : s.next() > 0.25 ? 'playing' : 'waiting',
      owner: `${s.pick(SURNAMES)}${s.pick(NICK_WORDS)}`,
      createdAt: dateStr(s, 0, s.int(8, 23))
    })
  }
  return list
}

export function mockAnnouncements() {
  const s = seeded(66)
  return [
    { id: 1, title: '🎉 新版本 v2.4.0 更新公告', content: '新增内蒙麻将血流成河玩法，优化斗地主匹配速度，修复若干已知问题。', pinned: true, at: dateStr(s, 0, 10), author: '超级管理员' },
    { id: 2, title: '周末狂欢活动开启', content: '本周末登录即送 10000 金币，对局赢牌额外获得 20% 金币奖励。', pinned: true, at: dateStr(s, 1, 9), author: '运营管理员' },
    { id: 3, title: '关于打击作弊行为的公告', content: '平台已升级反作弊系统，检测到异常行为将直接封禁账号。', pinned: false, at: dateStr(s, 3, 15), author: '超级管理员' },
    { id: 4, title: ' maintenance 维护通知', content: '每周二凌晨 2:00-4:00 进行例行维护，请提前下线。', pinned: false, at: dateStr(s, 6, 11), author: '系统' }
  ]
}

export function mockRoles() {
  return [
    { id: 1, name: '超级管理员', code: 'super_admin', description: '拥有全部权限，不可删除', memberCount: 1, permissions: [...ALL_PERMISSIONS] },
    { id: 2, name: '运营管理员', code: 'operator', description: '负责用户、内容、活动运营', memberCount: 4, permissions: ['dash.view', 'analytics.view', 'user.view', 'user.ban', 'user.grant', 'finance.view', 'game.view', 'game.query', 'risk.view', 'content.view', 'content.publish', 'audit.view'] },
    { id: 3, name: '财务专员', code: 'finance', description: '仅财务与经济数据权限', memberCount: 2, permissions: ['dash.view', 'finance.view', 'finance.export', 'analytics.view', 'audit.view'] },
    { id: 4, name: '风控专员', code: 'risk', description: '风控事件处理与规则配置', memberCount: 3, permissions: ['dash.view', 'user.view', 'game.view', 'risk.view', 'risk.handle', 'risk.rule', 'audit.view'] },
    { id: 5, name: '只读观察员', code: 'viewer', description: '仅查看数据，不可操作', memberCount: 6, permissions: ['dash.view', 'analytics.view', 'user.view', 'finance.view', 'game.view'] }
  ]
}

export function mockAdmins() {
  const s = seeded(321)
  const list = []
  const rows = [
    ['admin', '超级管理员', '超级管理员'],
    ['op_zhang', '张运营', '运营管理员'],
    ['op_li', '李运营', '运营管理员'],
    ['fin_wang', '王财务', '财务专员'],
    ['risk_zhao', '赵风控', '风控专员'],
    ['viewer01', '观察员小明', '只读观察员']
  ]
  rows.forEach((r, i) => {
    list.push({
      id: i + 1,
      username: r[0],
      nickname: r[1],
      role: r[2],
      roleId: i + 1,
      status: 'active',
      lastLogin: dateStr(s, i % 5, s.int(8, 23)),
      createdAt: dateStr(s, 120 + i * 10, 10)
    })
  })
  return list
}

export function mockAuditLogs(n = 60) {
  const s = seeded(404)
  const actions = ['登录后台', '封禁用户', '解封用户', '发放金币', '发放钻石', '发布公告', '删除公告', '发送全服邮件', '解散房间', '处理风控事件', '修改系统配置', '添加管理员', '删除管理员', '导出报表']
  const targets = ['—', '用户 1024', '用户 1088', '用户 1110', '公告 #3', '房间 582103', '风控事件 #12', '系统配置', '管理员 op_li']
  const admins = [['admin', '超级管理员'], ['op_zhang', '张运营'], ['op_li', '李运营'], ['fin_wang', '王财务'], ['risk_zhao', '赵风控']]
  const list = []
  for (let i = 0; i < n; i++) {
    const a = s.pick(admins)
    list.push({
      id: `A${20240000 + i}`,
      adminId: 100 + i % 5,
      adminName: `${a[1]} (${a[0]})`,
      action: s.pick(actions),
      target: s.pick(targets),
      detail: s.pick(['操作成功', '变更状态：active → banned', '发放金币 50000', '更新配置字段 gameRules', '请求来源：后台管理端']),
      at: dateStr(s, s.int(0, 20), s.int(8, 24)),
      ip: `192.168.${s.int(1, 20)}.${s.int(2, 250)}`
    })
  }
  return list
}

export function mockRiskEvents(n = 26) {
  const s = seeded(619)
  const types = ['异常赢率', '多账号同IP', '高频对局', '疑似脚本', '异常金币流动', '设备指纹重复', '异常登录地']
  const list = []
  for (let i = 0; i < n; i++) {
    list.push({
      id: `RK${20240000 + i}`,
      userId: 1000 + s.int(1, 136),
      nickname: `${s.pick(SURNAMES)}${s.pick(NICK_WORDS)}${s.int(1, 99)}`,
      type: s.pick(types),
      level: s.pick(['高', '高', '中', '中', '低']),
      detail: s.pick(['近 24 小时胜率 92%，远超正常区间', '同一 IP 登录 7 个账号', '连续对局 120 场无休息', '检测到自动化操作特征', '单日金币流入 380 万，异常集中']),
      status: i % 3 === 0 ? 'pending' : 'handled',
      at: dateStr(s, s.int(0, 12), s.int(8, 24)),
      ip: `10.${s.int(0, 20)}.${s.int(1, 250)}.${s.int(1, 250)}`,
      handler: i % 3 === 0 ? '—' : s.pick(['赵风控', '超级管理员'])
    })
  }
  return list
}

export function mockConfig() {
  return {
    gameRules: {
      doudizhuEnabled: true,
      mahjongEnabled: true,
      antiCheat: true,
      allowSpectate: false,
      allowChat: true,
      autoStart: true,
      maintenanceMode: false
    },
    multipliers: {
      doudizhuBase: 1,
      bombDouble: true,
      springDouble: true,
      mahjongFan: 2,
      maxMultiplier: 128
    },
    baseScores: [1, 2, 5, 10, 20, 50],
    registerGift: { enabled: true, coins: 10000, diamonds: 100 },
    signInRewards: [
      { day: 1, coins: 1000, diamonds: 5 },
      { day: 2, coins: 2000, diamonds: 10 },
      { day: 3, coins: 3000, diamonds: 15 },
      { day: 4, coins: 4000, diamonds: 20 },
      { day: 5, coins: 6000, diamonds: 30 },
      { day: 6, coins: 8000, diamonds: 40 },
      { day: 7, coins: 15000, diamonds: 100 }
    ]
  }
}

export function mockFinanceSummary() {
  const s = seeded(808)
  const trend = []
  for (let i = 29; i >= 0; i--) {
    trend.push({
      date: dayStr(i),
      coinFlow: s.int(1800000, 5200000),
      diamondFlow: s.int(12000, 68000),
      recharge: s.int(15000, 90000),
      consume: s.int(10000, 70000)
    })
  }
  return {
    totalCoinFlow: 5678901230,
    totalDiamondFlow: 1289670,
    totalRecharge: 3289670,
    totalConsume: 2101230,
    todayRecharge: 86240,
    todayCoinFlow: 3821670,
    orderCount: 128496,
    coinBalance: 987654320,
    diamondBalance: 12456780,
    trend
  }
}
