import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(__filename, '../../..')

export const config = {
  name: '极跃斗地主',
  version: '1.0.0',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'jiyue-doudizhu-secret-2026-change-me',
  jwtExpires: '30d',
  dataDir: path.join(ROOT, 'data'),
  dbFile: path.join(ROOT, 'data', 'db.json'),
  economy: {
    registerCoins: 10000,
    registerDiamonds: 100,
    signinCoins: 500,
    signinStreakBonus: 200,
    bankruptcyThreshold: 200,
    bankruptcyCoins: 3000,
    bankruptcyCooldownHours: 2,
  },
  room: {
    baseScores: [1, 5, 10, 50, 100],
    maxPlayers: 3,
    defaultBaseScore: 10,
  },
  game: {
    playTimeoutMs: 30000,
    bidTimeoutMs: 20000,
    doubleTimeoutMs: 15000,
    maxMultiplier: 512,
  },
  admin: {
    username: 'admin',
    password: 'admin123456',
  },
}
