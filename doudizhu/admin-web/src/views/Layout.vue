<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" :class="{ 'is-collapsed': collapsed }">
      <div class="brand">
        <div class="brand-logo">极</div>
        <div v-show="!collapsed">
          <div class="brand-name">极跃运营后台</div>
          <div class="brand-sub">GAME ADMIN CONSOLE</div>
        </div>
      </div>

      <el-menu
        class="admin-menu"
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        unique-opened
      >
        <el-menu-item-group v-for="group in groups" :key="group">
          <template #title><span v-show="!collapsed">{{ group }}</span></template>
          <el-menu-item v-for="item in routesOf(group)" :key="item.path" :index="'/' + item.path">
            <el-icon><component :is="item.meta.icon" /></el-icon>
            <template #title>{{ item.meta.title }}</template>
          </el-menu-item>
        </el-menu-item-group>
      </el-menu>

      <div class="sidebar-footer" v-show="!collapsed">v2.4.0 · 极跃科技出品</div>
    </aside>

    <div class="admin-main">
      <header class="admin-header">
        <el-button text class="collapse-btn" @click="collapsed = !collapsed">
          <el-icon size="18"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
        </el-button>

        <div class="header-crumb">
          <el-icon><HomeFilled /></el-icon>
          <span>首页</span>
          <span class="text-sub">/</span>
          <span>{{ route.meta.group || '概览' }}</span>
          <span class="text-sub">/</span>
          <strong>{{ route.meta.title || '数据概览' }}</strong>
        </div>

        <div class="header-right">
          <el-tooltip content="刷新页面" placement="bottom">
            <el-button text circle class="header-icon-btn" @click="reloadPage">
              <el-icon size="17"><Refresh /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏显示'" placement="bottom">
            <el-button text circle class="header-icon-btn" @click="toggleFullscreen">
              <el-icon size="17"><FullScreen /></el-icon>
            </el-button>
          </el-tooltip>

          <el-popover placement="bottom-end" :width="330" trigger="click">
            <template #reference>
              <el-badge :value="notices.length" :hidden="!notices.length" :max="99">
                <el-button text circle class="header-icon-btn">
                  <el-icon size="17"><Bell /></el-icon>
                </el-button>
              </el-badge>
            </template>
            <div class="notice-popover">
              <div class="notice-head">
                <span>待处理通知</span>
                <el-tag type="warning" size="small">{{ notices.length }} 条</el-tag>
              </div>
              <div v-if="notices.length" class="notice-list">
                <div v-for="n in notices" :key="n.id" class="notice-item" @click="goRisk">
                  <span class="notice-dot" :class="n.level === '高' ? 'high' : n.level === '中' ? 'mid' : 'low'"></span>
                  <div class="notice-body">
                    <div class="notice-text">{{ n.text }}</div>
                    <div class="notice-time">{{ n.at }}</div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-hint">暂无待处理通知</div>
            </div>
          </el-popover>

          <el-divider direction="vertical" />

          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-chip">
              <div class="avatar">{{ store.avatarText }}</div>
              <div class="user-meta">
                <div class="name">{{ store.displayName }}</div>
                <div class="role">超级管理员</div>
              </div>
              <el-icon class="user-arrow"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon>修改密码
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="admin-tabs">
        <span class="tabs-label">标签页</span>
        <div
          v-for="tab in tabs"
          :key="tab.path"
          class="admin-tab"
          :class="{ active: route.path === tab.path }"
          @click="router.push(tab.path)"
        >
          <span>{{ tab.title }}</span>
          <el-icon v-if="tab.path !== '/dashboard'" class="tab-close" @click.stop="closeTab(tab.path)">
            <Close />
          </el-icon>
        </div>
      </div>

      <main class="admin-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" :key="routerKey" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Fold,
  Expand,
  Bell,
  ArrowDown,
  SwitchButton,
  FullScreen,
  HomeFilled,
  Refresh,
  User,
  Lock,
  Close
} from '@element-plus/icons-vue'
import { useAdminStore } from '../stores/admin'
import { api, safeCall } from '../api'
import { mockRiskEvents } from '../api/mock'

const route = useRoute()
const router = useRouter()
const store = useAdminStore()

const collapsed = ref(false)
const isFullscreen = ref(false)
const routerKey = ref(0)
const notices = ref([])

const allRoutes = router.options.routes.find((r) => r.path === '/')?.children || []
const menuRoutes = allRoutes.filter((r) => r.meta?.title)
const groups = [...new Set(menuRoutes.map((r) => r.meta.group))]

const routesOf = (group) => menuRoutes.filter((r) => r.meta.group === group)

const tabs = ref([{ path: '/dashboard', title: '数据概览' }])

watch(
  () => route.path,
  (path) => {
    if (!route.meta.title || path === '/login') return
    if (!tabs.value.some((t) => t.path === path)) {
      tabs.value.push({ path, title: route.meta.title })
    }
  },
  { immediate: true }
)

watch(
  () => store.token,
  (token) => {
    if (!token) router.push('/login')
  }
)

onMounted(async () => {
  const events = await safeCall(() => api.getRiskEvents(), mockRiskEvents())
  notices.value = events
    .filter((e) => e.status === 'pending')
    .slice(0, 6)
    .map((e) => ({ id: e.id, level: e.level, text: `${e.nickname} · ${e.type}`, at: e.at }))
})

function closeTab(path) {
  const idx = tabs.value.findIndex((t) => t.path === path)
  if (idx === -1 || tabs.value.length <= 1) return
  tabs.value.splice(idx, 1)
  if (route.path === path) {
    const next = tabs.value[Math.max(0, idx - 1)]
    router.push(next ? next.path : '/dashboard')
  }
}

function reloadPage() {
  routerKey.value += 1
  ElMessage.success('页面数据已刷新')
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch {
    ElMessage.warning('当前环境不支持全屏切换')
  }
}

function goRisk() {
  router.push('/risk')
}

function handleCommand(command) {
  if (command === 'logout') {
    ElMessageBox.confirm('确认退出运营管理后台？', '退出提示', {
      type: 'warning',
      confirmButtonText: '确认退出',
      cancelButtonText: '取消'
    })
      .then(() => {
        store.logout()
        ElMessage.success('已安全退出')
        router.push('/login')
      })
      .catch(() => {})
  } else if (command === 'profile') {
    ElMessageBox.alert(
      `<div style="line-height:2"><span style="color:#93a3ba">管理员账号：</span><b style="color:#e7edf7">${store.user?.username || 'admin'}</b><br/>` +
        `<span style="color:#93a3ba">显示名称：</span><b style="color:#e7edf7">${store.displayName}</b><br/>` +
        `<span style="color:#93a3ba">角色权限：</span><b style="color:#e9b949">超级管理员</b></div>`,
      '个人中心',
      { dangerouslyUseHTMLString: true, confirmButtonText: '知道了' }
    ).catch(() => {})
  } else if (command === 'password') {
    ElMessageBox.alert('演示环境已预设管理员账号 admin / admin123456，密码修改功能由企业统一身份认证接管。', '修改密码', {
      confirmButtonText: '知道了'
    }).catch(() => {})
  }
}
</script>

<style scoped>
.collapse-btn,
.header-icon-btn {
  color: #a9b8ce;
  margin: 0;
}

.collapse-btn:hover,
.header-icon-btn:hover {
  color: var(--app-gold);
  background: rgba(233, 185, 73, 0.1);
}

.tabs-label {
  font-size: 11px;
  color: #5f7189;
  margin-right: 6px;
  white-space: nowrap;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: background 0.15s;
}

.user-chip:hover {
  background: rgba(255, 255, 255, 0.05);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: linear-gradient(135deg, #f0c85f, #a97016);
  color: #101722;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-meta {
  line-height: 1.3;
}

.user-meta .name {
  font-size: 12px;
  color: #e7edf7;
  font-weight: 600;
}

.user-meta .role {
  font-size: 10px;
  color: #7f90a8;
}

.user-arrow {
  color: #7f90a8;
  font-size: 12px;
}

.notice-popover {
  margin: -6px -4px;
}

.notice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #e7edf7;
  padding-bottom: 10px;
  border-bottom: 1px solid #243247;
  margin-bottom: 6px;
}

.notice-list {
  max-height: 300px;
  overflow: auto;
}

.notice-item {
  display: flex;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid #1e293b;
  cursor: pointer;
}

.notice-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.notice-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-top: 5px;
  flex: 0 0 7px;
}

.notice-dot.high {
  background: #f87171;
}
.notice-dot.mid {
  background: #fb923c;
}
.notice-dot.low {
  background: #35d0e0;
}

.notice-text {
  font-size: 12px;
  color: #d4deec;
}

.notice-time {
  font-size: 10px;
  color: #6b7c95;
  margin-top: 4px;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
