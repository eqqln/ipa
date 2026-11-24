import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '../stores/admin'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true, title: '管理员登录' }
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard.vue'),
        meta: { title: '数据概览', group: '概览', icon: 'DataLine' }
      },
      {
        path: 'analytics',
        name: 'Analytics',
        component: () => import('../views/Analytics.vue'),
        meta: { title: '数据报表', group: '概览', icon: 'TrendCharts' }
      },
      {
        path: 'users',
        name: 'UserManage',
        component: () => import('../views/UserManage.vue'),
        meta: { title: '用户管理', group: '用户', icon: 'User' }
      },
      {
        path: 'finance',
        name: 'Finance',
        component: () => import('../views/Finance.vue'),
        meta: { title: '财务管理', group: '财务', icon: 'Wallet' }
      },
      {
        path: 'game',
        name: 'GameControl',
        component: () => import('../views/GameControl.vue'),
        meta: { title: '游戏管控', group: '游戏', icon: 'Monitor' }
      },
      {
        path: 'risk',
        name: 'RiskCenter',
        component: () => import('../views/RiskCenter.vue'),
        meta: { title: '风控中心', group: '风控', icon: 'Warning' }
      },
      {
        path: 'audit',
        name: 'AuditLog',
        component: () => import('../views/AuditLog.vue'),
        meta: { title: '操作审计', group: '系统', icon: 'Document' }
      },
      {
        path: 'content',
        name: 'ContentManage',
        component: () => import('../views/ContentManage.vue'),
        meta: { title: '内容管理', group: '系统', icon: 'Bell' }
      },
      {
        path: 'config',
        name: 'ConfigCenter',
        component: () => import('../views/ConfigCenter.vue'),
        meta: { title: '系统配置', group: '系统', icon: 'Setting' }
      },
      {
        path: 'rbac',
        name: 'Rbac',
        component: () => import('../views/Rbac.vue'),
        meta: { title: '管理员与权限', group: '系统', icon: 'Lock' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach((to, _from, next) => {
  const store = useAdminStore()
  document.title = to.meta.title ? `${to.meta.title} · 运营管理后台` : '运营管理后台'
  if (to.meta.public) {
    if (to.path === '/login' && store.token) return next('/dashboard')
    return next()
  }
  if (!store.token) return next({ path: '/login', query: { redirect: to.fullPath } })
  next()
})

export default router
