<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'

const emit = defineEmits(['toast'])
const router = useRouter()
const route = useRoute()
const store = useUserStore()

const mode = ref('login')
const loading = ref(false)
const form = ref({ username: '', password: '', nickname: '', confirm: '' })

function switchMode(m) {
  mode.value = m
}

async function submit() {
  if (!form.value.username || !form.value.password) {
    emit('toast', '请填写账号和密码', 'error')
    return
  }
  if (mode.value === 'register' && form.value.password !== form.value.confirm) {
    emit('toast', '两次密码不一致', 'error')
    return
  }
  loading.value = true
  try {
    const payload = mode.value === 'register'
      ? { username: form.value.username, password: form.value.password, nickname: form.value.nickname }
      : { username: form.value.username, password: form.value.password }
    const data = mode.value === 'register'
      ? await store.register(payload)
      : await store.login(payload)
    emit('toast', mode.value === 'register' ? '注册成功，欢迎加入！' : `欢迎回来，${data?.user?.nickname || '牌友'}`, 'success')
    await store.fetchProfile().catch(() => {})
    router.replace(route.query.redirect || { name: 'lobby' })
  } catch (e) {
    emit('toast', e.message || '操作失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="bg-deco deco-1">🃏</div>
    <div class="bg-deco deco-2">♠</div>
    <div class="bg-deco deco-3">♥</div>
    <div class="bg-deco deco-4">♣</div>
    <div class="bg-deco deco-5">♦</div>

    <div class="login-wrap">
      <div class="hero">
        <div class="hero-logo float-gold">🃏</div>
        <h1>极跃斗地主</h1>
        <p>巅峰对决 · 王者之争 · 每日好礼送不停</p>
        <div class="hero-features">
          <span>🎁 注册送 8888 金币</span>
          <span>🤖 人机秒开局</span>
          <span>🏆 实时排行榜</span>
          <span>🛡️ 公平竞技</span>
        </div>
      </div>

      <div class="login-card card">
        <div class="tabs">
          <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
        </div>

        <h2 class="form-title">{{ mode === 'login' ? '欢迎回来 👋' : '创建账号 ✨' }}</h2>

        <form @submit.prevent="submit">
          <div class="field">
            <label>账号</label>
            <input v-model="form.username" class="input" placeholder="请输入账号（3-20位字母数字）" autocomplete="username" />
          </div>
          <div class="field" v-if="mode === 'register'">
            <label>昵称</label>
            <input v-model="form.nickname" class="input" placeholder="给自己起个响亮的名字" />
          </div>
          <div class="field">
            <label>密码</label>
            <input v-model="form.password" type="password" class="input" placeholder="请输入密码（6-32位）" autocomplete="current-password" />
          </div>
          <div class="field" v-if="mode === 'register'">
            <label>确认密码</label>
            <input v-model="form.confirm" type="password" class="input" placeholder="再次输入密码" autocomplete="new-password" />
          </div>

          <button class="btn btn-gold btn-lg btn-block submit-btn" :disabled="loading" type="submit">
            <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px;"></span>
            <span v-else>{{ mode === 'login' ? '🎮 进入牌桌' : '🚀 立即注册' }}</span>
          </button>
        </form>

        <p class="switch-tip">
          {{ mode === 'login' ? '还没有账号？' : '已有账号？' }}
          <a @click="switchMode(mode === 'login' ? 'register' : 'login')">
            {{ mode === 'login' ? '立即注册 →' : '返回登录 →' }}
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  padding: 30px 20px;
}
.bg-deco { position: absolute; font-size: 180px; opacity: .045; color: var(--gold-300); pointer-events: none; user-select: none; }
.deco-1 { top: -30px; left: -20px; transform: rotate(-18deg); }
.deco-2 { bottom: -40px; right: 4%; transform: rotate(12deg); }
.deco-3 { top: 12%; right: 8%; color: var(--red); transform: rotate(-8deg); }
.deco-4 { bottom: 8%; left: 6%; transform: rotate(20deg); }
.deco-5 { top: 40%; left: 46%; color: var(--red); transform: rotate(-25deg); }

.login-wrap {
  position: relative; z-index: 2;
  display: grid; grid-template-columns: 1.1fr .9fr;
  gap: 50px; align-items: center;
  width: 100%; max-width: 980px;
}

.hero { color: var(--ink); }
.hero-logo { font-size: 92px; filter: drop-shadow(0 10px 26px rgba(238,203,106,.45)); }
.hero h1 {
  font-size: 52px; font-weight: 900; letter-spacing: 3px; margin: 8px 0;
  background: linear-gradient(100deg, var(--gold-100), var(--gold-400), var(--gold-300));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero p { font-size: 17px; color: var(--ink-soft); margin: 0 0 28px; }
.hero-features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hero-features span {
  font-size: 13px; color: var(--gold-300);
  padding: 9px 14px; border-radius: 10px;
  background: rgba(238, 203, 106, .06);
  border: 1px solid var(--line);
}

.login-card { padding: 30px 32px; }
.tabs {
  display: flex; gap: 6px;
  background: rgba(0, 0, 0, .3);
  padding: 5px; border-radius: 12px; margin-bottom: 22px;
}
.tabs button {
  flex: 1; padding: 10px; border: none; border-radius: 9px;
  background: transparent; color: var(--ink-soft);
  font-size: 15px; font-weight: 700; cursor: pointer;
  transition: all .2s ease;
}
.tabs button.active {
  background: linear-gradient(135deg, var(--green-600), var(--green-700));
  color: var(--gold-300);
  box-shadow: var(--shadow);
}
.form-title { font-size: 20px; margin: 0 0 20px; color: var(--ink); }
.submit-btn { margin-top: 8px; }
.switch-tip { text-align: center; font-size: 13px; color: var(--ink-mute); margin: 18px 0 0; }
.switch-tip a { color: var(--gold-400); cursor: pointer; font-weight: 700; }
.switch-tip a:hover { text-decoration: underline; }

@media (max-width: 860px) {
  .login-wrap { grid-template-columns: 1fr; gap: 24px; max-width: 440px; }
  .hero { text-align: center; }
  .hero-logo { font-size: 64px; }
  .hero h1 { font-size: 36px; }
  .hero-features { grid-template-columns: 1fr 1fr; }
}
</style>
