<script setup>
import { ref, computed, onMounted } from 'vue'
import { task as taskApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const tab = ref('daily')
const tasks = ref([])
const loading = ref(false)

const filtered = computed(() => tasks.value.filter((t) => t.type === tab.value))
const doneCount = computed(() => filtered.value.filter((t) => t.claimed).length)

async function load() {
  loading.value = true
  try { tasks.value = await taskApi.list() }
  catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}

async function claim(t) {
  try {
    const r = await taskApi.claim(t.id)
    t.claimed = true
    emit('toast', `领取成功 +${r?.coins || 0} 金币 +${r?.exp || 0} 经验`, 'success')
    store.fetchProfile().catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}

function rewardText(t) {
  const p = []
  if (t.rewardCoins) p.push(`🪙${t.rewardCoins}`)
  if (t.rewardDiamonds) p.push(`💎${t.rewardDiamonds}`)
  if (t.rewardExp) p.push(`⭐${t.rewardExp}`)
  return p.join(' ')
}
function pct(t) { return Math.min(100, Math.round((t.progress / t.target) * 100)) }

onMounted(load)
</script>

<template>
  <div class="task-page">
    <div class="page-head">
      <h1 class="page-title">📜 任务中心</h1>
      <p class="page-sub">完成任务领奖励，每日坚持有惊喜</p>
    </div>

    <div class="tabs card">
      <button :class="{ active: tab === 'daily' }" @click="tab = 'daily'">☀️ 每日任务</button>
      <button :class="{ active: tab === 'achievement' }" @click="tab = 'achievement'">🏅 成就任务</button>
      <span class="progress-text">已完成 {{ doneCount }}/{{ filtered.length }}</span>
    </div>

    <div class="card task-card">
      <div v-if="loading" class="tcenter" style="padding:50px"><span class="spinner"></span></div>
      <div v-if="!loading && !filtered.length" class="empty"><span class="emoji">🎯</span>暂无任务</div>
      <div v-for="t in filtered" :key="t.id" class="task-row">
        <div class="task-icon">{{ t.claimed ? '✅' : (t.completed ? '🎁' : '🎯') }}</div>
        <div class="task-main">
          <div class="task-title">{{ t.name }}</div>
          <div class="task-desc muted">{{ t.desc }}</div>
          <div class="task-progress">
            <div class="progress"><i :style="{ width: pct(t) + '%' }"></i></div>
            <span class="muted">{{ t.progress }}/{{ t.target }}</span>
          </div>
        </div>
        <div class="task-right">
          <div class="task-reward">{{ rewardText(t) }}</div>
          <button class="btn btn-sm" :class="t.claimed ? 'btn-ghost' : (t.completed ? 'btn-gold' : 'btn-ghost')" :disabled="t.claimed || !t.completed" @click="claim(t)">
            {{ t.claimed ? '已领取' : (t.completed ? '领取' : '进行中') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-page { max-width: 860px; margin: 0 auto; }
.page-head { margin-bottom: 16px; }
.tabs { display: flex; gap: 6px; padding: 8px; margin-bottom: 16px; align-items: center; }
.tabs button { padding: 9px 20px; border: none; border-radius: 9px; background: transparent; color: var(--ink-soft); font-size: 14px; font-weight: 700; cursor: pointer; }
.tabs button.active { background: linear-gradient(135deg, var(--green-500), var(--green-700)); color: var(--gold-300); }
.progress-text { margin-left: auto; font-size: 12px; color: var(--ink-mute); padding-right: 10px; }
.task-card { padding: 12px; }
.task-row { display: flex; gap: 14px; align-items: center; padding: 14px; border-radius: 12px; background: rgba(0,0,0,.2); margin-bottom: 8px; }
.task-icon { font-size: 30px; }
.task-main { flex: 1; min-width: 0; }
.task-title { font-weight: 700; font-size: 15px; }
.task-desc { font-size: 12px; margin: 3px 0 8px; }
.task-progress { display: flex; align-items: center; gap: 10px; }
.task-progress .progress { flex: 1; }
.task-progress span { font-size: 11px; }
.task-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.task-reward { font-size: 13px; color: var(--gold-300); font-weight: 700; }
@media (max-width: 560px) { .task-row { flex-wrap: wrap; } }
</style>
