<script setup>
import { ref, onMounted, watch } from 'vue'
import { rank as rankApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const types = [
  { key: 'coins', label: '金币榜', icon: '🪙' },
  { key: 'wins', label: '胜场榜', icon: '🏅' },
  { key: 'winRate', label: '胜率榜', icon: '📈' },
  { key: 'exp', label: '经验榜', icon: '⭐' },
  { key: 'bombs', label: '炸弹榜', icon: '💣' },
]
const type = ref('coins')
const list = ref([])
const myRankData = ref(null)
const loading = ref(false)

function valueOf(r) {
  if (type.value === 'winRate') return `${r.value}%`
  return Number(r.value || 0).toLocaleString()
}

function medal(i) {
  return ['🥇', '🥈', '🥉'][i] || ''
}

async function load() {
  loading.value = true
  try {
    const [l, m] = await Promise.all([rankApi.list(type.value, 50), rankApi.me(type.value)])
    list.value = l?.list || []
    myRankData.value = m
  } catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}

watch(type, load)
onMounted(load)
</script>

<template>
  <div class="rank-page">
    <div class="page-head flex-between">
      <div><h1 class="page-title">🏆 荣耀排行榜</h1><p class="page-sub">各路高手云集，看看你的位置</p></div>
      <div class="my-rank-chip card" v-if="myRankData">
        <span class="muted">我的排名</span>
        <b class="gold">第 {{ myRankData.rank }} 名</b>
        <span class="muted">/ {{ myRankData.total }} 人</span>
      </div>
    </div>

    <div class="tabs card">
      <button v-for="t in types" :key="t.key" :class="{ active: type === t.key }" @click="type = t.key">
        <span>{{ t.icon }}</span> {{ t.label }}
      </button>
    </div>

    <div class="card rank-card">
      <div class="rank-table">
        <div class="rank-row head">
          <span>排名</span><span>玩家</span><span>等级</span><span>战绩</span><span>{{ types.find(t => t.key === type)?.label }}</span>
        </div>
        <div v-if="loading" class="tcenter" style="padding:40px"><span class="spinner"></span></div>
        <div v-for="(r, i) in list" :key="r.id" class="rank-row" :class="{ me: r.id === store.user?.id, top3: i < 3 }">
          <span class="rank-cell">
            <b v-if="i < 3" class="medal">{{ medal(i) }}</b>
            <b v-else class="muted">{{ r.rank }}</b>
          </span>
          <span class="player-cell">
            <span class="avatar" style="width:36px;height:36px;font-size:18px;">{{ r.avatar || '😀' }}</span>
            <span class="player-name">{{ r.nickname }} <span v-if="r.title" class="badge">🏅</span></span>
            <span v-if="r.id === store.user?.id" class="badge badge-green">我</span>
          </span>
          <span>Lv.{{ r.level }}</span>
          <span class="muted">{{ r.wins }}胜 / {{ r.games }}场</span>
          <span class="value">{{ valueOf(r) }}</span>
        </div>
        <div v-if="!loading && !list.length" class="empty"><span class="emoji">🏜️</span>榜单空空如也</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rank-page { max-width: 960px; margin: 0 auto; }
.page-head { margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.my-rank-chip { display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-size: 13px; }
.tabs { display: flex; gap: 6px; padding: 8px; margin-bottom: 16px; overflow-x: auto; }
.tabs button {
  flex: 1; min-width: 90px; padding: 10px; border: none; border-radius: 9px;
  background: transparent; color: var(--ink-soft); font-size: 13px; font-weight: 700;
  cursor: pointer; white-space: nowrap; transition: all .18s;
}
.tabs button.active { background: linear-gradient(135deg, var(--gold-400), var(--gold-600)); color: #3a2a06; }
.rank-card { padding: 8px; }
.rank-row { display: grid; grid-template-columns: 70px 1fr 80px 120px 120px; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 9px; font-size: 13px; }
.rank-row.head { color: var(--ink-mute); font-size: 12px; font-weight: 700; }
.rank-row:not(.head):nth-child(even) { background: rgba(0,0,0,.16); }
.rank-row.me { background: rgba(238,203,106,.12); border: 1px solid var(--line-strong); }
.rank-row.top3 { background: rgba(238,203,106,.06); }
.medal { font-size: 22px; }
.player-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.player-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.value { color: var(--gold-300); font-weight: 900; font-size: 15px; text-align: right; }
@media (max-width: 640px) {
  .rank-row { grid-template-columns: 46px 1fr 70px; }
  .rank-row > :nth-child(3), .rank-row > :nth-child(4) { display: none; }
}
</style>
