<template>
  <div class="login-page">
    <div class="login-wrap">
      <div class="brand-panel">
        <div class="brand-logo-big">极</div>
        <h1>棋牌游戏运营管理平台</h1>
        <p class="brand-desc">斗地主 · 内蒙麻将 &nbsp;一站式运营管控</p>
        <div class="feature-list">
          <div class="feature" v-for="f in features" :key="f.title">
            <div class="feature-icon">
              <el-icon><component :is="f.icon" /></el-icon>
            </div>
            <div>
              <div class="feature-title">{{ f.title }}</div>
              <div class="feature-desc">{{ f.desc }}</div>
            </div>
          </div>
        </div>
        <div class="brand-footer">企业级 SaaS 运营后台 · v2.4.0</div>
      </div>

      <div class="login-card">
        <div class="login-card-head">
          <div class="login-kicker">ADMIN CONSOLE</div>
          <h2>欢迎回来</h2>
          <p>请使用管理员账号登录运营后台</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="login-form">
          <el-form-item label="管理员账号" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入管理员账号"
              size="large"
              :prefix-icon="User"
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          <el-form-item label="登录密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入登录密码"
              size="large"
              :prefix-icon="Lock"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <div class="form-options">
            <el-checkbox v-model="remember">记住账号</el-checkbox>
            <span class="tip">演示账号 admin / admin123456</span>
          </div>

          <el-button type="primary" class="login-btn" size="large" :loading="loading" @click="handleLogin">
            登 录
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <div class="login-foot">© 2024 极跃科技 · 运营管理后台</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, ArrowRight, DataAnalysis, UserFilled, CircleCheck } from '@element-plus/icons-vue'
import { api } from '../api'
import { useAdminStore } from '../stores/admin'

const REMEMBER_KEY = 'gd_remember_account'

const features = [
  { title: '实时数据大屏', desc: '核心指标与趋势一屏掌握', icon: DataAnalysis },
  { title: '精细化用户运营', desc: '封禁、发放、分层管理', icon: UserFilled },
  { title: '安全风控体系', desc: '异常行为识别与快速处置', icon: CircleCheck }
]

const router = useRouter()
const route = useRoute()
const store = useAdminStore()

const formRef = ref(null)
const loading = ref(false)
const remember = ref(false)
const form = reactive({ username: '', password: '' })

const rules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入登录密码', trigger: 'blur' }]
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null')
    if (saved) {
      form.username = saved.username || ''
      form.password = saved.password || ''
      remember.value = true
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY)
  }
})

async function handleLogin() {
  if (!formRef.value) return
  let valid = false
  try {
    valid = await formRef.value.validate()
  } catch {
    valid = false
  }
  if (!valid) return

  loading.value = true
  let result = null
  try {
    result = await api.login({ username: form.username.trim(), password: form.password })
  } catch {
    // 后端未就绪时使用本地演示账号，保证后台可完整查看
    if (form.username.trim() === 'admin' && form.password === 'admin123456') {
      result = {
        user: { id: 1, username: 'admin', nickname: '超级管理员', role: 'super_admin' },
        token: `demo-token-${Date.now()}`
      }
    }
  }
  loading.value = false

  if (!result) {
    ElMessage.error('账号或密码错误，请重试')
    return
  }

  if (remember.value) {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: form.username.trim(), password: form.password }))
  } else {
    localStorage.removeItem(REMEMBER_KEY)
  }

  store.setLogin(result.user || result.admin || null, result.token)
  ElMessage.success('登录成功，欢迎回来')
  router.push(route.query.redirect || '/dashboard')
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 18%, rgba(233, 185, 73, 0.13), transparent 38%),
    radial-gradient(circle at 88% 82%, rgba(53, 208, 224, 0.11), transparent 42%),
    #0a1220;
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size: 42px 42px;
}

.login-page::after {
  content: '';
  position: absolute;
  width: 460px;
  height: 460px;
  right: -140px;
  top: -160px;
  border-radius: 50%;
  border: 1px solid rgba(233, 185, 73, 0.09);
  box-shadow: 0 0 120px rgba(233, 185, 73, 0.05) inset;
}

.login-wrap {
  position: relative;
  z-index: 1;
  width: min(980px, 100%);
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  border: 1px solid #2a3a50;
  border-radius: 18px;
  overflow: hidden;
  background: #121b2a;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55);
}

.brand-panel {
  padding: 46px 42px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #243247;
  background: linear-gradient(160deg, rgba(233, 185, 73, 0.11), transparent 55%),
    linear-gradient(160deg, #17243a, #0e1725);
}

.brand-logo-big {
  width: 58px;
  height: 58px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f4d17a, #a97016);
  color: #101722;
  font-size: 28px;
  font-weight: 800;
  box-shadow: 0 8px 24px rgba(233, 185, 73, 0.3);
  margin-bottom: 30px;
}

.brand-panel h1 {
  font-size: 26px;
  font-weight: 700;
  color: #f5f8fd;
  margin: 0 0 10px;
  letter-spacing: 1px;
}

.brand-desc {
  font-size: 13px;
  color: #93a3ba;
  margin: 0 0 38px;
  letter-spacing: 0.5px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.feature-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--app-gold);
  background: rgba(233, 185, 73, 0.11);
  border: 1px solid rgba(233, 185, 73, 0.18);
}

.feature-title {
  font-size: 13px;
  color: #e7edf7;
  font-weight: 600;
  margin-bottom: 4px;
}

.feature-desc {
  font-size: 11px;
  color: #7f90a8;
}

.brand-footer {
  margin-top: auto;
  padding-top: 32px;
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.5px;
}

.login-card {
  padding: 46px 42px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: linear-gradient(180deg, #151f2e, #111925);
}

.login-kicker {
  font-size: 10px;
  letter-spacing: 2.5px;
  color: var(--app-gold);
  font-weight: 700;
  margin-bottom: 10px;
}

.login-card-head h2 {
  font-size: 25px;
  color: #f5f8fd;
  margin: 0 0 8px;
}

.login-card-head p {
  font-size: 12px;
  color: #8192ab;
  margin: 0 0 30px;
}

.login-form :deep(.el-form-item__label) {
  color: #b8c6db;
  font-size: 12px;
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 22px;
}

.form-options .tip {
  font-size: 11px;
  color: #6e8099;
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  letter-spacing: 3px;
  display: flex;
  gap: 8px;
}

.login-foot {
  margin-top: 28px;
  text-align: center;
  font-size: 11px;
  color: #5e6f88;
}

@media (max-width: 860px) {
  .login-wrap {
    grid-template-columns: 1fr;
  }
  .brand-panel {
    display: none;
  }
}
</style>
