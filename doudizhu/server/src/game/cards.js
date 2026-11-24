/**
 * 扑克牌模型
 * 牌 id 格式: `${rank}-${suit}`，如 3-S、10-H、16-J(小王)、17-J(大王)
 * 权重(rank): 3..10, J=11, Q=12, K=13, A=14, 2=15, 小王=16, 大王=17
 */

export const SUITS = ['S', 'H', 'C', 'D']
export const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦', J: '' }
export const RANK_LABEL = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王',
}
export const JOKER = { SMALL: 16, BIG: 17 }

/** 创建一副 54 张牌 */
export function createDeck() {
  const deck = []
  for (let rank = 3; rank <= 15; rank++) {
    for (const suit of SUITS) {
      deck.push({
        id: `${rank}-${suit}`,
        rank,
        suit,
        weight: rank,
        label: `${SUIT_SYMBOL[suit]}${RANK_LABEL[rank]}`,
      })
    }
  }
  deck.push({ id: '16-J', rank: 16, suit: 'J', weight: 16, label: '小王' })
  deck.push({ id: '17-J', rank: 17, suit: 'J', weight: 17, label: '大王' })
  return deck
}

/** Fisher-Yates 洗牌 */
export function shuffle(deck, random = Math.random) {
  const cards = deck.slice()
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

/** 牌排序：权重降序，同权重按花色固定顺序 */
const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3, J: 4 }
export function sortCards(cards) {
  return cards.slice().sort((a, b) =>
    b.weight - a.weight || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit],
  )
}

/** 发牌：3 家各 17 张 + 3 张底牌 */
export function deal(deck = createDeck(), random = Math.random) {
  const shuffled = shuffle(deck, random)
  const hands = [[], [], []]
  for (let i = 0; i < 51; i++) hands[i % 3].push(shuffled[i])
  const bottom = shuffled.slice(51, 54)
  return {
    hands: hands.map(sortCards),
    bottom: sortCards(bottom),
  }
}

/** 按 rank 分组，返回 [{rank, cards:[...]}]，权重降序 */
export function groupByRank(cards) {
  const map = new Map()
  for (const c of cards) {
    if (!map.has(c.rank)) map.set(c.rank, [])
    map.get(c.rank).push(c)
  }
  return [...map.entries()]
    .map(([rank, grouped]) => ({ rank, cards: grouped }))
    .sort((a, b) => b.rank - a.rank)
}

/** 从手牌中按 id 移除指定牌，返回 { remain, picked, valid } */
export function pickCards(hand, ids) {
  const idSet = new Set(ids)
  const pool = new Map(hand.map((c) => [c.id, c]))
  const picked = []
  for (const id of ids) {
    const card = pool.get(id)
    if (!card) return { remain: hand, picked: [], valid: false }
    picked.push(card)
    pool.delete(id)
  }
  return { remain: hand.filter((c) => !idSet.has(c.id)), picked, valid: true }
}

export function cardIds(cards) {
  return cards.map((c) => c.id)
}

/** 统计各 rank 的数量 */
export function rankCounts(cards) {
  const counts = {}
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1
  return counts
}
