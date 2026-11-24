<template>
  <div class="rbac-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">管理员与权限</h2>
        <p class="page-subtitle">RBAC 角色权限体系 · 管理员账号管理与权限矩阵</p>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" size="small" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="Plus" size="small" @click="openAdminDialog">添加管理员</el-button>
      </div>
    </div>

    <div class="stat-grid-4">
      <div class="stat-card">
        <div class="stat-icon"><el-icon><UserFilled /></el-icon></div>
        <div class="stat-label">角色数量</div>
        <div class="stat-value">{{ roles.length }}</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-icon"><el-icon><User /></el-icon></div>
        <div class="stat-label">管理员数量</div>
        <div class="stat-value">{{ admins.length }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><el-icon><Key /></el-icon></div>
        <div class="stat-label">权限点总数</div>
        <div class="stat-value">{{ totalPermissions }}</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-icon"><el-icon><Lock /></el-icon></div>
        <div class="stat-label">超级管理员</div>
        <div class="stat-value">1</div>
        <div class="stat-trend">不可删除</div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">角色列表 <span class="sub">点击角色可在权限矩阵中高亮查看</span></div>
      <el-table :data="roles" stripe style="width: 100%" highlight-current-row @current-change="selectRole">
        <el-table-column prop="name" label="角色名称" min-width="150">
          <template #default="{ row }">
            <div class="role-name">
              <el-tag type="warning" size="small" effect="dark" v-if="row.code === 'super_admin'">SUPER</el-tag>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="code" label="角色标识" width="150">
          <template #default="{ row }"><span class="mono text-sub">{{ row.code }}</span></template>
        </el-table-column>
        <el-table-column prop="description" label="角色说明" min-width="230">
          <template #default="{ row }"><span class="text-sub">{{ row.description }}</span></template>
        </el-table-column>
        <el-table-column prop="memberCount" label="成员数" width="90" align="center" />
        <el-table-column label="权限数" width="100" align="center">
          <template #default="{ row }"><b class="text-gold">{{ row.permissions.length }}</b></template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="selectRole(row)">查看权限</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">管理员列表 <span class="sub">共 {{ admins.length }} 人</span></div>
      <el-table :data="admins" stripe style="width: 100%" max-height="400">
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="username" label="登录账号" width="150">
          <template #default="{ row }"><span class="mono text-gold">{{ row.username }}</span></template>
        </el-table-column>
        <el-table-column prop="nickname" label="显示名称" min-width="140" />
        <el-table-column prop="role" label="所属角色" width="150">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === '超级管理员' ? 'warning' : 'info'" effect="plain">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default><el-tag type="success" size="small" effect="plain">正常</el-tag></template>
        </el-table-column>
        <el-table-column prop="lastLogin" label="最后登录" width="165">
          <template #default="{ row }"><span class="text-sub">{{ row.lastLogin }}</span></template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="165">
          <template #default="{ row }"><span class="text-sub">{{ row.createdAt }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="danger" size="small" :disabled="row.username === 'admin'" @click="deleteAdminAccount(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        权限矩阵
        <span class="sub" v-if="selectedRole">当前高亮：{{ selectedRole.name }}</span>
        <span class="sub" v-else>未选择角色</span>
      </div>
      <el-table :data="matrixRows" stripe style="width: 100%" max-height="560" :row-class-name="rowClass">
        <el-table-column label="权限组" width="90" align="center">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.group }}</el-tag></template>
        </el-table-column>
        <el-table-column label="权限名称" min-width="180">
          <template #default="{ row }"><span>{{ row.name }}</span><span class="mono text-sub perm-key">{{ row.key }}</span></template>
        </el-table-column>
        <el-table-column v-for="role in roles" :key="role.code" :label="role.name" width="120" align="center">
          <template #default="{ row }">
            <el-icon v-if="row.perms[role.code]" class="perm-yes"><CircleCheckFilled /></el-icon>
            <el-icon v-else class="perm-no"><CircleClose /></el-icon>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="adminVisible" title="添加管理员" width="460px" destroy-on-close>
      <el-form :model="adminForm" label-width="90px">
        <el-form-item label="登录账号">
          <el-input v-model="adminForm.username" placeholder="请输入登录账号" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="adminForm.nickname" placeholder="请输入显示名称" />
        </el-form-item>
        <el-form-item label="所属角色">
          <el-select v-model="adminForm.role" style="width: 100%">
            <el-option v-for="r in roles.filter((x) => x.code !== 'super_admin')" :key="r.code" :label="r.name" :value="r.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="初始状态">
          <el-tag type="success" size="small" effect="plain">正常</el-tag>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adminVisible = false">取消</el-button>
        <el-button type="primary" :loading="adminLoading" @click="submitAdmin">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, UserFilled, User, Key, Lock, CircleCheckFilled, CircleClose } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockRoles, mockAdmins, PERMISSION_TREE } from '../api/mock'

const PERM_NAMES = {
  'dash.view': '查看数据概览',
  'analytics.view': '查看数据报表',
  'analytics.export': '导出报表',
  'user.view': '查看用户列表',
  'user.ban': '封禁/解封用户',
  'user.grant': '发放金币钻石',
  'user.export': '导出用户数据',
  'finance.view': '查看财务数据',
  'finance.grant': '财务发放',
  'finance.export': '导出财务流水',
  'game.view': '查看房间监控',
  'game.dissolve': '强制解散房间',
  'game.query': '查询对局记录',
  'risk.view': '查看风控事件',
  'risk.handle': '处理风控事件',
  'risk.rule': '配置风控规则',
  'content.view': '查看内容管理',
  'content.publish': '发布公告邮件',
  'config.view': '查看系统配置',
  'config.edit': '修改系统配置',
  'rbac.view': '查看角色权限',
  'rbac.edit': '管理管理员',
  'audit.view': '查看审计日志'
}

const roles = ref(mockRoles())
const admins = ref(mockAdmins())
const selectedRole = ref(null)

const adminVisible = ref(false)
const adminLoading = ref(false)
const adminForm = ref({ username: '', nickname: '', role: '运营管理员' })

const totalPermissions = computed(() => Object.keys(PERM_NAMES).length)

const matrixRows = computed(() =>
  PERMISSION_TREE.flatMap((group) =>
    group.keys.map((key) => ({
      key,
      group: group.group,
      name: PERM_NAMES[key] || key,
      perms: Object.fromEntries(roles.value.map((r) => [r.code, r.permissions.includes(key)]))
    }))
  )
)

function selectRole(row) {
  selectedRole.value = row
}

function rowClass({ row }) {
  return selectedRole.value && row.perms[selectedRole.value.code] ? 'highlight-row' : ''
}

function openAdminDialog() {
  adminForm.value = { username: '', nickname: '', role: '运营管理员' }
  adminVisible.value = true
}

async function submitAdmin() {
  if (!adminForm.value.username.trim() || !adminForm.value.nickname.trim()) {
    ElMessage.warning('请填写账号与显示名称')
    return
  }
  if (admins.value.some((a) => a.username === adminForm.value.username.trim())) {
    ElMessage.warning('该登录账号已存在')
    return
  }
  adminLoading.value = true
  const result = await safeCall(
    () =>
      api.createAdmin({
        username: adminForm.value.username.trim(),
        nickname: adminForm.value.nickname.trim(),
        role: adminForm.value.role
      }),
    null
  )
  admins.value.push({
    id: result?.id || Date.now(),
    username: adminForm.value.username.trim(),
    nickname: adminForm.value.nickname.trim(),
    role: adminForm.value.role,
    status: 'active',
    lastLogin: '—',
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
  })
  const role = roles.value.find((r) => r.name === adminForm.value.role)
  if (role) role.memberCount += 1
  adminLoading.value = false
  adminVisible.value = false
  ElMessage.success('管理员添加成功')
}

async function deleteAdminAccount(row) {
  try {
    await ElMessageBox.confirm(`确认删除管理员「${row.nickname}」？其权限将立即失效。`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await safeCall(() => api.deleteAdmin(row.id), null)
  admins.value = admins.value.filter((a) => a.id !== row.id)
  const role = roles.value.find((r) => r.name === row.role)
  if (role && role.memberCount > 0) role.memberCount -= 1
  ElMessage.success('管理员已删除')
}

async function loadAll() {
  const [roleData, adminData] = await Promise.all([
    safeCall(() => api.getRoles(), mockRoles()),
    safeCall(() => api.getAdmins(), mockAdmins())
  ])
  roles.value = Array.isArray(roleData) && roleData.length ? roleData : mockRoles()
  admins.value = Array.isArray(adminData) && adminData.length ? adminData : mockAdmins()
}

onMounted(loadAll)
</script>

<style scoped>
.role-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.perm-key {
  display: block;
  font-size: 10px;
  margin-top: 2px;
}

.perm-yes {
  color: #34d399;
  font-size: 17px;
}

.perm-no {
  color: #3c4b60;
  font-size: 15px;
}

:deep(.highlight-row) {
  --el-table-tr-bg-color: rgba(233, 185, 73, 0.07) !important;
}
</style>
