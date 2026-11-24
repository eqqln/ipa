/**
 * 内蒙麻将牌库
 * 万/筒/条 各 1-9 各 4 张 = 108，中/发/白 各 4 张 = 12，共 120 张
 * 牌 id: `${suit}-${rank}`   suit: wan/tong/tiao/zhong/fa/bai
 */
export const SUITS = {
  WAN: 'wan', TONG: 'tong', TIAO: 'tiao',
  ZHONG: 'zhong', FA: 'fa', BAI: 'bai',
}

export const SUIT_SYMBOL = { wan: '萬', tong: '筒', tiao: '條' }
export const HONOR_LABEL = { zhong: '中', fa: '發', bai: '白' }
export const NUMERIC_SUITS = ['wan', 'tong', 'tiao']

/** 牌的排序权重：数字牌按 suit*10+rank，字牌固定高位 */
export function tileWeight(t) {
  if (NUMERIC_SUITS.includes(t.suit)) {
    const base = { wan: 0, tong: 100, tiao: 200 }[t.suit]
    return base + t.rank
  }
  return { zhong: 300, fa: 301, bai: 302 }[t.suit]
}

/** 创建 120 张牌 */
export function createMahjongDeck() {
  const deck = []
  for (const suit of NUMERIC_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        deck.push({
          id: `${suit}-${rank}-${copy}`,
          suit,
          rank,
          label: suit === 'wan' ? `${rank}萬` : suit === 'tong' ? `${rank}筒` : `${rank}條`,
          weight: tileWeight({ suit, rank }),
        })
      }
    }
  }
  for (const suit of ['zhong', 'fa', 'bai']) {
    for (let copy = 0; copy < 4; copy++) {
      deck.push({
        id: `${suit}-0-${copy}`,
        suit,
        rank: 0,
        label: HONOR_LABEL[suit],
        weight: tileWeight({ suit, rank: 0 }),
      })
    }
  }
  return deck
}

/** Fisher-Yates 洗牌 */
export function shuffleTiles(deck, random = Math.random) {
  const arr = deck.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 按权重排序 */
export function sortTiles(tiles) {
  return tiles.slice().sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id))
}

/**
 * 把牌转成计数 key（用于胡牌判定），忽略 copy
 * 数字牌: `w1..w9` `t1..t9` `s1..s9`；字牌: `z1`(中) `z2`(发) `z3`(白)
 */
export function tileKey(tile) {
  if (tile.suit === 'wan') return `w${tile.rank}`
  if (tile.suit === 'tong') return `t${tile.rank}`
  if (tile.suit === 'tiao') return `s${tile.rank}`
  if (tile.suit === 'zhong') return 'z1'
  if (tile.suit === 'fa') return 'z2'
  if (tile.suit === 'bai') return 'z3'
  return '?'
}

/** 从 key 还原展示信息 */
export function keyLabel(key) {
  const suit = key[0]
  const n = Number(key.slice(1))
  if (suit === 'w') return `${n}萬`
  if (suit === 't') return `${n}筒`
  if (suit === 's') return `${n}條`
  if (suit === 'z') return ['', '中', '发', '白'][n] || '?'
  return key
}

/** key 转权重（用于听牌排序） */
export function keyWeight(key) {
  const suit = key[0]
  const n = Number(key.slice(1))
  if (suit === 'w') return n
  if (suit === 't') return n + 10
  if (suit === 's') return n + 20
  if (suit === 'z') return n + 30
  return 99
}

/** 从一手牌构建计数表 {key: count} */
export function buildCounts(tiles) {
  const counts = {}
  for (const t of tiles) {
    const k = tileKey(t)
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

/** 计数表转牌数 */
export function countTotal(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

/** 从 key 构造一张虚拟牌（用于听牌提示、胡牌测试） */
export function tileFromKey(key, copy = 0) {
  const n = Number(key.slice(1))
  const map = {
    w: 'wan', t: 'tong', s: 'tiao',
  }
  if (map[key[0]]) {
    const suit = map[key[0]]
    return {
      id: `${suit}-${n}-${copy}`,
      suit,
      rank: n,
      label: keyLabel(key),
      weight: tileWeight({ suit, rank: n }),
    }
  }
  const suit = ['', 'zhong', 'fa', 'bai'][n]
  return {
    id: `${suit}-0-${copy}`,
    suit,
    rank: 0,
    label: keyLabel(key),
    weight: tileWeight({ suit, rank: 0 }),
  }
}

export const ALL_TILE_KEYS = [
  ...['w', 't', 's'].flatMap((p) => Array.from({ length: 9 }, (_, i) => `${p}${i + 1}`)),
  'z1', 'z2', 'z3',
]
