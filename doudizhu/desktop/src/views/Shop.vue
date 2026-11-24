<script setup>
import { ref, onMounted } from 'vue'
import { shop as shopApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const tab = ref('shop')
const items = ref([])
const bag = ref([])
const loading = ref(false)
const payTypes = { coins: '🪙 金币', diamond: '💎 钻石' }

async function loadShop() {
  loading.value = true
  try { items.value = await shopApi.list() }
  catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}
async function loadBag() {
  try { bag.value = await shopApi.bag() }
  catch (e) { emit('toast', e.message, 'error') }
}
function switchTab(t) {
  tab.value = t
  if (t === 'bag') loadBag()
}

async function buy(item, payType) {
  try {
    await shopApi.buy(item.id, payType)
    emit('toast', `购买「${item.name}」成功`, 'success')
    store.fetchProfile().catch(() => {})
    if (tab.value === 'bag') loadBag()
  } catch (e) { emit('toast', e.message, 'error') }
}
async function equip(item) {
  try {
    await shopApi.equip(item.itemId)
    emit('toast', '装备成功', 'success')
    store.fetchProfile().catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}
async function use(item) {
  try {
    await shopApi.use(item.itemId)
    emit('toast', `使用「${item.name}」成功`, 'success')
    loadBag()
  } catch (e) { emit('toast', e.message, 'error') }
}

function typeLabel(t) {
  return { tool: '道具', avatar: '头像框', title: '称号' }[t] || '商品'
}

onMounted(loadShop)
</script>

<template>
  <div class="shop-page">
    <div class="page-head flex-between">
      <div><h1 class="page-title">🛒 商城</h1><p class="page-sub">好物加持，牌运亨通</p></div>
      <div class="wallet-mini card">
        <span>🪙 {{ store.coins.toLocaleString() }}</span>
        <span>💎 {{ store.diamonds.toLocaleString() }}</span>
      </div>
    </div>

    <div class="tabs card">
      <button :class="{ active: tab === 'shop' }" @click="switchTab('shop')">🏬 商城</button>
      <button :class="{ active: tab === 'bag' }" @click="switchTab('bag')">🎒 我的背包</button>
    </div>

    <!-- 商城 -->
    <div v-if="tab === 'shop'">
      <div v-if="loading" class="tcenter" style="padding:50px"><span class="spinner"></span></div>
      <div class="goods-grid" v-else>
        <div v-for="item in items" :key="item.id" class="card goods">
          <div class="goods-icon">{{ item.icon || '🎁' }}</div>
          <div class="goods-type"><span class="badge badge-gray">{{ typeLabel(item.type) }}</span></div>
          <h3 class="goods-name">{{ item.name }}</h3>
          <p class="goods-desc muted">{{ item.desc }}</p>
          <div class="goods-prices">
            <button class="price-btn coin" @click="buy(item, 'coins')" v-if="typeof item.price === 'number'">🪙 {{ item.price.toLocaleString() }}</button>
            <button class="price-btn diamond" @click="buy(item, 'diamond')" v-if="typeof item.diamondPrice === 'number'">💎 {{ item.diamondPrice }}</button>
          </div>
        </div>
      </div>
      <div v-if="!loading && !items.length" class="empty card"><span class="emoji">📦</span>商品正在备货中</div>
    </div>

    <!-- 背包 -->
    <div v-else class="card bag-card">
      <div v-if="!bag.length" class="empty"><span class="emoji">🎒</span>背包空空的，去商城逛逛吧</div>
      <div v-for="b in bag" :key="b.id" class="bag-row">
        <span class="bag-icon">{{ b.icon || '🎁' }}</span>
        <div class="bag-info">
          <b>{{ b.name }}</b>
          <span class="muted">{{ typeLabel(b.type) }} · 拥有 {{ b.quantity }}</span>
        </div>
        <div class="bag-actions">
          <button class="btn btn-gold btn-sm" v-if="b.type === 'tool'" @click="use(b)">使用</button>
          <button class="btn btn-green btn-sm" v-else @click="equip(b)">装备</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop-page { max-width: 1080px; margin: 0 auto; }
.page-head { margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.wallet-mini { display: flex; gap: 16px; padding: 10px 18px; font-weight: 700; font-size: 14px; }
.wallet-mini span:first-child { color: var(--gold-300); }
.wallet-mini span:last-child { color: #8fd8ff; }
.tabs { display: flex; gap: 6px; padding: 8px; margin-bottom: 18px; }
.tabs button { flex: 1; padding: 10px; border: none; border-radius: 9px; background: transparent; color: var(--ink-soft); font-size: 14px; font-weight: 700; cursor: pointer; }
.tabs button.active { background: linear-gradient(135deg, var(--gold-400), var(--gold-600)); color: #3a2a06; }
.goods-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.goods { padding: 18px 14px; text-align: center; transition: transform .2s, border-color .2s; }
.goods:hover { transform: translateY(-4px); border-color: var(--line-strong); }
.goods-icon { font-size: 52px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.4)); }
.goods-type { margin-top: 6px; }
.goods-name { font-size: 16px; margin: 10px 0 6px; }
.goods-desc { font-size: 12px; line-height: 1.5; min-height: 36px; }
.goods-prices { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.price-btn { padding: 8px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; border: 1px solid; transition: filter .16s; }
.price-btn:hover { filter: brightness(1.15); }
.price-btn.coin { background: rgba(238,203,106,.14); border-color: var(--gold-500); color: var(--gold-300); }
.price-btn.diamond { background: rgba(143,216,255,.12); border-color: rgba(143,216,255,.5); color: #8fd8ff; }
.bag-card { padding: 12px; }
.bag-row { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 10px; background: rgba(30, 122, 224, 0.05); margin-bottom: 8px; }
.bag-icon { font-size: 34px; }
.bag-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.bag-info b { font-size: 14px; }
.bag-info span { font-size: 12px; }
@media (max-width: 900px) { .goods-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .goods-grid { grid-template-columns: 1fr; } }
</style>
