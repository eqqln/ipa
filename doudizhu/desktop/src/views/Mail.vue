<script setup>
import { ref, computed, onMounted } from 'vue'
import { mail as mailApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const store = useUserStore()

const mails = ref([])
const loading = ref(false)

const unreadCount = computed(() => mails.value.filter((m) => !m.read).length)

async function load() {
  loading.value = true
  try {
    mails.value = await mailApi.list()
    store.setUnread(unreadCount.value)
  } catch (e) { emit('toast', e.message, 'error') }
  finally { loading.value = false }
}

async function openMail(m) {
  if (!m.read) {
    try {
      await mailApi.read(m.id)
      m.read = true
      store.setUnread(unreadCount.value)
    } catch (e) { emit('toast', e.message, 'error') }
  }
}

async function claim(m) {
  try {
    const r = await mailApi.claim(m.id)
    m.claimed = true
    emit('toast', `领取成功 +${r?.coins || 0} 金币${r?.diamonds ? ` +${r.diamonds} 钻石` : ''}`, 'success')
    store.fetchProfile().catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}

async function remove(m) {
  try {
    await mailApi.delete(m.id)
    mails.value = mails.value.filter((x) => x.id !== m.id)
    store.setUnread(unreadCount.value)
    emit('toast', '邮件已删除', 'success')
  } catch (e) { emit('toast', e.message, 'error') }
}

function rewardText(m) {
  const r = m.rewards || {}
  const parts = []
  if (r.coins) parts.push(`🪙${r.coins}`)
  if (r.diamonds) parts.push(`💎${r.diamonds}`)
  return parts.join('  ') || '无奖励'
}
function fmt(ts) { return new Date(ts).toLocaleString('zh-CN', { hour12: false }) }

onMounted(load)
</script>

<template>
  <div class="mail-page">
    <div class="page-head flex-between">
      <div><h1 class="page-title">📮 我的邮件</h1><p class="page-sub">未读 {{ unreadCount }} 封 · 记得领取奖励哦</p></div>
      <button class="btn btn-ghost btn-sm" @click="load">🔄 刷新</button>
    </div>

    <div class="card mail-card">
      <div v-if="loading" class="tcenter" style="padding:50px"><span class="spinner"></span></div>
      <div v-if="!loading && !mails.length" class="empty"><span class="emoji">📭</span>暂时没有邮件</div>
      <div v-for="m in mails" :key="m.id" class="mail-row" :class="{ unread: !m.read }" @click="openMail(m)">
        <div class="mail-icon">{{ m.claimed ? '📭' : (m.read ? '📬' : '📩') }}</div>
        <div class="mail-body">
          <div class="mail-title">
            {{ m.title }}
            <span v-if="!m.read" class="badge badge-red">未读</span>
            <span v-if="m.claimed" class="badge badge-green">已领取</span>
          </div>
          <div class="mail-content soft">{{ m.content }}</div>
          <div class="mail-foot">
            <span class="reward">🎁 {{ rewardText(m) }}</span>
            <span class="muted">{{ fmt(m.createdAt) }}</span>
          </div>
        </div>
        <div class="mail-actions">
          <button v-if="!m.claimed" class="btn btn-gold btn-sm" @click.stop="claim(m)">领取</button>
          <button class="btn btn-ghost btn-sm" @click.stop="remove(m)">🗑️</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mail-page { max-width: 900px; margin: 0 auto; }
.page-head { margin-bottom: 16px; }
.mail-card { padding: 10px; }
.mail-row { display: flex; gap: 14px; align-items: flex-start; padding: 14px; border-radius: 12px; margin-bottom: 8px; background: rgba(30, 122, 224, 0.05); cursor: pointer; border: 1px solid transparent; transition: all .18s; }
.mail-row.unread { background: rgba(238,203,106,.07); border-color: var(--line); }
.mail-row:hover { border-color: var(--line-strong); }
.mail-icon { font-size: 30px; }
.mail-body { flex: 1; min-width: 0; }
.mail-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mail-content { font-size: 13px; margin: 6px 0; line-height: 1.6; }
.mail-foot { display: flex; gap: 16px; align-items: center; font-size: 12px; }
.reward { color: var(--gold-300); font-weight: 700; }
.mail-actions { display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 560px) { .mail-actions { flex-direction: row; } }
</style>
