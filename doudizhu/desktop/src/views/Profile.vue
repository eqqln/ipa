<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { user as userApi, auth as authApi, rank as rankApi } from '@/api'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const router = useRouter()
const store = useUserStore()

const stats = ref(null)
const myRankData = ref(null)
const editForm = ref({ nickname: '', signature: '', avatar: '', title: '' })
const passForm = ref({ oldPassword: '', newPassword: '', confirm: '' })

const winRate = computed(() => stats.value?.winRate ?? 0)
const levelInfo = computed(() => store.profile?.levelInfo)

async function load() {
  try {
    await store.fetchProfile()
    stats.value = await store.fetchStats()
    editForm.value = {
      nickname: store.user?.nickname || '',
      signature: store.user?.signature || '',
      avatar: store.user?.avatar || '',
      title: store.user?.title || '',
    }
    rankApi.me('coins').then((r) => { myRankData.value = r }).catch(() => {})
  } catch (e) { emit('toast', e.message, 'error') }
}

async function saveProfile() {
  try {
    await store.updateProfile(editForm.value)
    emit('toast', '资料已更新', 'success')
  } catch (e) { emit('toast', e.message, 'error') }
}

async function changePassword() {
  if (passForm.value.newPassword !== passForm.value.confirm) {
    return emit('toast', '两次新密码不一致', 'error')
  }
  try {
    await authApi.password({ oldPassword: passForm.value.oldPassword, newPassword: passForm.value.newPassword })
    emit('toast', '密码修改成功', 'success')
    passForm.value = { oldPassword: '', newPassword: '', confirm: '' }
  } catch (e) { emit('toast', e.message, 'error') }
}

onMounted(load)
</script>

<template>
  <div class="profile-page">
    <div class="profile-head card">
      <div class="avatar huge">{{ store.user?.avatar || '😎' }}</div>
      <div class="profile-id">
        <h1>{{ store.nickname }} <span class="badge badge-green">Lv.{{ store.level }}</span></h1>
        <p class="soft">账号：{{ store.user?.username }} · ID：{{ store.user?.id }}</p>
        <p class="signature">{{ store.user?.signature || '这个人很懒，什么都没写~' }}</p>
      </div>
      <div class="profile-coins">
        <span>🪙 {{ store.coins.toLocaleString() }}</span>
        <span>💎 {{ store.diamonds.toLocaleString() }}</span>
      </div>
    </div>

    <div class="profile-grid">
      <div class="card section">
        <h3 class="section-title">📊 数据统计</h3>
        <div class="stats-grid">
          <div class="stat-box"><b>{{ stats?.games || 0 }}</b><span>总对局</span></div>
          <div class="stat-box"><b class="green">{{ stats?.wins || 0 }}</b><span>胜场</span></div>
          <div class="stat-box"><b class="red">{{ stats?.losses || 0 }}</b><span>负场</span></div>
          <div class="stat-box"><b class="gold">{{ winRate }}%</b><span>胜率</span></div>
          <div class="stat-box"><b>💣 {{ stats?.totalBombs || 0 }}</b><span>炸弹</span></div>
          <div class="stat-box"><b>⭐ {{ stats?.exp || 0 }}</b><span>经验</span></div>
        </div>
        <div class="exp-section" v-if="levelInfo">
          <div class="flex-between" style="font-size:12px;margin-bottom:6px"><span class="soft">等级进度</span><span class="muted">{{ levelInfo.currentExp }}/{{ levelInfo.nextExp }}</span></div>
          <div class="progress"><i :style="{ width: (levelInfo.currentExp / levelInfo.nextExp * 100) + '%' }"></i></div>
        </div>
        <div class="my-rank-line" v-if="myRankData">
          🏆 金币榜排名：<b class="gold">第 {{ myRankData.rank }} 名</b> / {{ myRankData.total }} 人
        </div>
      </div>

      <div class="card section">
        <h3 class="section-title">✏️ 编辑资料</h3>
        <div class="field"><label>昵称</label><input v-model="editForm.nickname" class="input" /></div>
        <div class="field"><label>头像 Emoji</label><input v-model="editForm.avatar" class="input" placeholder="例如 😎 🦊 🐯" /></div>
        <div class="field"><label>称号</label><input v-model="editForm.title" class="input" placeholder="选填" /></div>
        <div class="field"><label>个性签名</label><textarea v-model="editForm.signature" class="textarea" rows="2"></textarea></div>
        <button class="btn btn-gold btn-block" @click="saveProfile">保存资料</button>
      </div>

      <div class="card section">
        <h3 class="section-title">🔐 修改密码</h3>
        <div class="field"><label>原密码</label><input v-model="passForm.oldPassword" type="password" class="input" /></div>
        <div class="field"><label>新密码</label><input v-model="passForm.newPassword" type="password" class="input" /></div>
        <div class="field"><label>确认新密码</label><input v-model="passForm.confirm" type="password" class="input" /></div>
        <button class="btn btn-green btn-block" @click="changePassword">修改密码</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page { max-width: 1000px; margin: 0 auto; }
.profile-head { display: flex; align-items: center; gap: 20px; padding: 24px; margin-bottom: 18px; }
.avatar.huge { width: 88px; height: 88px; font-size: 44px; }
.profile-id { flex: 1; min-width: 0; }
.profile-id h1 { font-size: 24px; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
.profile-id p { margin: 3px 0; font-size: 12px; }
.signature { color: var(--gold-300); font-style: italic; }
.profile-coins { display: flex; flex-direction: column; gap: 8px; font-weight: 700; font-size: 15px; }
.profile-coins span:first-child { color: var(--gold-300); }
.profile-coins span:last-child { color: #8fd8ff; }
.profile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.section { padding: 20px; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stat-box { text-align: center; padding: 12px 6px; border-radius: 10px; background: rgba(0,0,0,.24); }
.stat-box b { display: block; font-size: 20px; margin-bottom: 3px; }
.stat-box span { font-size: 11px; color: var(--ink-mute); }
.exp-section { margin-top: 16px; }
.my-rank-line { margin-top: 14px; font-size: 13px; color: var(--ink-soft); }
@media (max-width: 760px) { .profile-grid { grid-template-columns: 1fr; } .profile-head { flex-wrap: wrap; } }
</style>
