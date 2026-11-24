import { nanoid } from 'nanoid'
import { store } from '../db/store.js'
import { findUserById } from './userService.js'

export function shopList() {
  return store.data.shopItems
}

export function userItems(userId) {
  return store.filter('userItems', (i) => i.userId === userId)
}

export function buyItem(userId, itemId, payType = 'coins') {
  const item = store.data.shopItems.find((i) => i.id === itemId)
  if (!item) throw new Error('商品不存在')
  const user = findUserById(userId)
  if (!user) throw new Error('用户不存在')

  const price = payType === 'diamond' ? item.diamondPrice : item.price
  if (typeof price !== 'number') throw new Error('该商品不支持此支付方式')
  if (payType === 'diamond') {
    if (user.diamonds < price) throw new Error('钻石不足')
    user.diamonds -= price
  } else {
    if (user.coins < price) throw new Error('金币不足')
    user.coins -= price
  }

  let owned = store.find('userItems', (i) => i.userId === userId && i.itemId === itemId)
  if (item.type === 'tool' && owned) {
    owned.quantity = (owned.quantity || 1) + 1
  } else if (!owned) {
    owned = {
      id: nanoid(10),
      userId,
      itemId,
      name: item.name,
      type: item.type,
      icon: item.icon,
      quantity: 1,
      acquiredAt: Date.now(),
    }
    store.insert('userItems', owned)
  }

  if (item.type === 'avatar') user.avatarFrame = itemId
  if (item.type === 'title') user.title = itemId
  store.save()
  return { item: owned, coins: user.coins, diamonds: user.diamonds }
}

export function equipItem(userId, itemId) {
  const user = findUserById(userId)
  const owned = store.find('userItems', (i) => i.userId === userId && i.itemId === itemId)
  if (!user || !owned) throw new Error('未拥有该物品')
  if (owned.type === 'avatar') user.avatarFrame = itemId
  else if (owned.type === 'title') user.title = itemId
  else throw new Error('该物品不可装备')
  store.save()
  return { avatarFrame: user.avatarFrame, title: user.title }
}

export function consumeItem(userId, itemId) {
  const owned = store.find('userItems', (i) => i.userId === userId && i.itemId === itemId)
  if (!owned || owned.quantity < 1) throw new Error('道具数量不足')
  owned.quantity -= 1
  store.save()
  return { remaining: owned.quantity }
}
