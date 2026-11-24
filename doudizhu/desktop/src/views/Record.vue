<script setup>
import { ref, onMounted } from 'vue'
import { record as recordApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const detail = ref(null)
const filter = ref('all')

const filtered = () => {
  if (filter.value === 'win') return list.value.filter((r) => r.players?.find((p) => p.id === store.user?.id)?.win)
  if (filter.value === 'lose') return list.value.filter((r) => !r.players?.find((p) => p.id === store.user?.id)?.win)
  return list.value
}

async function load() {
  loading.value = true
  try {
    const data = await recordApi.list(page.value, pageSize)
    list.value = data?.list || []
    total.value = data?.total || 0
  } catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}

function go(p) {
  if (p < 1 || p > Math.ceil(total.value / pageSize)) return
  page.value = p
  load()
}

async function openDetail(id) {
  try { detail.value = await recordApi.detail(id) }
  catch (e) { emit('toast', e.message, 'error') }
}

function myResult(r) { return r.players?.find((p) => p.id === store.user?.id) }
function fmt(ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }) }

onMounted(load)
</script>

<template>
  <div class="record-page">
    <div class="page-head flex-between">
      <div><h1 class="page-title">📊 战绩</h1><p class="page-sub">共 {{ total }} 场对局记录</p></div>
      <div class="filters">
        <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ active: filter === 'win' }" @click="filter = 'win'">胜</button>
        <button :class="{ active: filter === 'lose' }" @click="filter = 'lose'">负</button>
      </div>
    </div>

    <div class="card record-card">
      <div v-if="loading" class="tcenter" style="padding:50px"><span class="spinner"></span></div>
      <div v-if="!loading && !filtered().length" class="empty"><span class="emoji">📋</span>暂无战绩，快去牌桌大展身手</div>

      <div v-for="r in filtered()" :key="r.id" class="record-row" @click="openDetail(r.id)">
        <div class="result-tag" :class="myResult(r)?.win ? 'win' : 'lose'">{{ myResult(r)?.win ? '胜' : '负' }}</div>
        <div class="record-main">
          <div class="record-top">
            <b>房间 {{ r.roomId }}</b>
            <span class="badge badge-gray">{{ r.landlord === myResult(r)?.seat ? '地主' : '农民' }}</span>
            <span v-if="r.spring" class="badge">{{ r.spring }}</span>
            <span class="muted">{{ fmt(r.at) }}</span>
          </div>
          <div class="record-sub muted">倍数 ×{{ r.multiplier }} · 底分 {{ r.baseScore }} · 炸弹 {{ r.bombCount || 0 }}</div>
        </div>
        <div class="record-delta" :class="(myResult(r)?.delta || 0) >= 0 ? 'green' : 'red'">
          {{ (myResult(r)?.delta || 0) >= 0 ? '+' : '' }}{{ myResult(r)?.delta || 0 }}
        </div>
      </div>

      <div class="pagination" v-if="total > pageSize">
        <button class="btn btn-ghost btn-sm" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ Math.ceil(total / pageSize) }} 页</span>
        <button class="btn btn-ghost btn-sm" :disabled="page >= Math.ceil(total / pageSize)" @click="go(page + 1)">下一页</button>
      </div>
    </div>

    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <div class="modal">
        <h3 class="section-title">📋 对局详情</h3>
        <p class="soft">房间 {{ detail.roomId }} · {{ fmt(detail.at) }}</p>
        <div class="detail-meta">
          <span class="badge">{{ detail.landlordWin ? '地主胜' : '农民胜' }}</span>
          <span v-if="detail.spring" class="badge badge-red">{{ detail.spring }}</span>
          <span class="badge badge-green">×{{ detail.multiplier }}</span>
        </div>
        <div class="detail-list">
          <div v-for="p in detail.players" :key="p.seat" class="detail-row" :class="{ me: p.id === store.user?.id }">
            <span>{{ p.name }} {{ p.isLandlord ? '👑' : '🌾' }}</span>
            <span class="muted">{{ p.win ? '胜' : '负' }}</span>
            <b :class="p.delta >= 0 ? 'green' : 'red'">{{ p.delta >= 0 ? '+' : '' }}{{ p.delta }}</b>
          </div>
        </div>
        <button class="btn btn-gold btn-block mt-20" @click="detail = null">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.record-page { max-width: 900px; margin: 0 auto; }
.page-head { margin-bottom: 16px; }
.filters { display: flex; gap: 6px; background: rgba(0,0,0,.25); padding: 4px; border-radius: 10px; }
.filters button { padding: 7px 18px; border: none; border-radius: 7px; background: transparent; color: var(--ink-soft); font-weight: 600; cursor: pointer; }
.filters button.active { background: var(--green-600); color: var(--gold-300); }
.record-card { padding: 10px; }
.record-row { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.18); margin-bottom: 8px; cursor: pointer; transition: background .18s; }
.record-row:hover { background: rgba(238,203,106,.08); }
.result-tag { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; flex-shrink: 0; }
.result-tag.win { background: rgba(220,60,52,.2); color: #ff7a72; border: 1px solid rgba(220,60,52,.5); }
.result-tag.lose { background: rgba(100,120,110,.2); color: var(--ink-mute); border: 1px solid rgba(255,255,255,.1); }
.record-main { flex: 1; min-width: 0; }
.record-top { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
.record-top .muted { font-size: 11px; }
.record-sub { font-size: 11px; margin-top: 4px; }
.record-delta { font-size: 18px; font-weight: 900; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 16px; font-size: 13px; color: var(--ink-soft); }
.detail-meta { display: flex; gap: 8px; margin: 12px 0; }
.detail-list { display: flex; flex-direction: column; gap: 6px; }
.detail-row { display: flex; gap: 10px; padding: 9px 12px; border-radius: 8px; background: rgba(0,0,0,.25); font-size: 13px; }
.detail-row.me { border: 1px solid var(--line-strong); }
.detail-row > :first-child { flex: 1; }
</style>
