<template>
  <div class="user-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">用户管理</h2>
        <p class="page-subtitle">管理平台全部玩家账号、资产状态与封禁操作</p>
      </div>
      <div class="header-stats">
        <span>总用户 <b class="text-gold">{{ filtered.length }}</b></span>
        <span>正常 <b class="text-success">{{ activeCount }}</b></span>
        <span>封禁 <b class="text-danger">{{ bannedCount }}</b></span>
      </div>
    </div>

    <div class="section-card">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索昵称 / 账号 / 手机号"
          :prefix-icon="Search"
          clearable
          style="width: 260px"
        />
        <el-select v-model="statusFilter" placeholder="账号状态" clearable style="width: 130px">
          <el-option label="正常" value="active" />
          <el-option label="已封禁" value="banned" />
        </el-select>
        <el-select v-model="gameFilter" placeholder="资产范围" clearable style="width: 140px">
          <el-option label="金币 > 10万" value="rich" />
          <el-option label="钻石 > 5000" value="diamond" />
          <el-option label="高胜率 > 60%" value="winner" />
        </el-select>
        <el-button :icon="Search" type="primary" @click="page = 1">搜索</el-button>
        <el-button @click="resetFilter">重置</el-button>
        <div class="toolbar-right">
          <el-button :icon="Download" @click="exportCsv">导出数据</el-button>
          <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
        </div>
      </div>

      <el-table :data="pagedUsers" stripe v-loading="loading" style="width: 100%" max-height="620">
        <el-table-column label="玩家" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar" :style="{ background: row.avatar }">{{ row.nickname.slice(0, 1) }}</div>
              <div>
                <div class="nickname">{{ row.nickname }}</div>
                <div class="account mono">{{ row.account }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140">
          <template #default="{ row }"><span class="mono text-sub">{{ row.phone }}</span></template>
        </el-table-column>
        <el-table-column prop="coins" label="金币" width="120" align="right" sortable>
          <template #default="{ row }"><span class="text-gold mono">{{ numberFormat(row.coins) }}</span></template>
        </el-table-column>
        <el-table-column prop="diamonds" label="钻石" width="100" align="right" sortable>
          <template #default="{ row }"><span class="text-cyan mono">{{ numberFormat(row.diamonds) }}</span></template>
        </el-table-column>
        <el-table-column label="等级" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level >= 50 ? 'warning' : row.level >= 25 ? 'primary' : 'info'" effect="dark">
              Lv.{{ row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="winRate" label="胜率" width="90" align="center">
          <template #default="{ row }">
            <span :class="row.winRate > 60 ? 'text-danger' : row.winRate > 45 ? 'text-success' : 'text-sub'">{{ row.winRate }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'banned' ? 'danger' : 'success'" size="small" effect="plain">
              {{ row.status === 'banned' ? '已封禁' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="registeredAt" label="注册时间" width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.registeredAt }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :icon="Coin" @click="openGrant(row)">发放</el-button>
            <el-button
              link
              size="small"
              :type="row.status === 'banned' ? 'success' : 'danger'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'banned' ? '解封' : '封禁' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="filtered.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>

    <el-dialog v-model="grantVisible" title="发放金币 / 钻石" width="460px" destroy-on-close>
      <div class="grant-target">
        <div class="user-avatar" :style="{ background: grantForm.avatar }">{{ grantForm.nickname?.slice(0, 1) }}</div>
        <div>
          <div class="nickname">{{ grantForm.nickname }}</div>
          <div class="account mono">{{ grantForm.account }}</div>
        </div>
      </div>
      <el-form :model="grantForm" label-width="82px" style="margin-top: 18px">
        <el-form-item label="金币数量">
          <el-input-number v-model="grantForm.coins" :min="0" :max="100000000" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="钻石数量">
          <el-input-number v-model="grantForm.diamonds" :min="0" :max="1000000" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发放原因">
          <el-input v-model="grantForm.reason" placeholder="如：运营活动奖励" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantLoading" @click="submitGrant">确认发放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Download, Coin } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockUsers } from '../api/mock'
import { numberFormat } from '../utils/theme'

const loading = ref(false)
const keyword = ref('')
const statusFilter = ref('')
const gameFilter = ref('')
const page = ref(1)
const pageSize = ref(10)
const allUsers = ref([])

const grantVisible = ref(false)
const grantLoading = ref(false)
const grantForm = reactive({ userId: null, nickname: '', account: '', avatar: '#e9b949', coins: 10000, diamonds: 100, reason: '运营活动奖励' })

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allUsers.value.filter((u) => {
    if (kw && !`${u.nickname}${u.account}${u.phone}`.toLowerCase().includes(kw)) return false
    if (statusFilter.value && u.status !== statusFilter.value) return false
    if (gameFilter.value === 'rich' && u.coins <= 100000) return false
    if (gameFilter.value === 'diamond' && u.diamonds <= 5000) return false
    if (gameFilter.value === 'winner' && Number(u.winRate) <= 60) return false
    return true
  })
})

const pagedUsers = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const activeCount = computed(() => allUsers.value.filter((u) => u.status === 'active').length)
const bannedCount = computed(() => allUsers.value.filter((u) => u.status === 'banned').length)

async function loadUsers() {
  loading.value = true
  const res = await safeCall(() => api.getUsers({ page: 1, pageSize: 1000 }), null)
  const list = res && Array.isArray(res.list) ? res.list : mockUsers(136).list
  allUsers.value = list
  loading.value = false
}

function resetFilter() {
  keyword.value = ''
  statusFilter.value = ''
  gameFilter.value = ''
  page.value = 1
}

async function toggleStatus(row) {
  const next = row.status === 'banned' ? 'active' : 'banned'
  const label = next === 'banned' ? '封禁' : '解封'
  try {
    await ElMessageBox.confirm(`确认${label}玩家「${row.nickname}」？`, `${label}确认`, {
      type: 'warning',
      confirmButtonText: `确认${label}`,
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await safeCall(() => api.setUserStatus(row.id, next), null)
  row.status = next
  ElMessage.success(`已${label}玩家 ${row.nickname}`)
}

function openGrant(row) {
  grantForm.userId = row.id
  grantForm.nickname = row.nickname
  grantForm.account = row.account
  grantForm.avatar = row.avatar
  grantForm.coins = 10000
  grantForm.diamonds = 100
  grantForm.reason = '运营活动奖励'
  grantVisible.value = true
}

async function submitGrant() {
  if (!grantForm.coins && !grantForm.diamonds) {
    ElMessage.warning('请至少填写一种发放数量')
    return
  }
  grantLoading.value = true
  await safeCall(
    () => api.grantUser(grantForm.userId, { coins: Number(grantForm.coins), diamonds: Number(grantForm.diamonds), reason: grantForm.reason }),
    null
  )
  const user = allUsers.value.find((u) => u.id === grantForm.userId)
  if (user) {
    user.coins += Number(grantForm.coins) || 0
    user.diamonds += Number(grantForm.diamonds) || 0
  }
  grantLoading.value = false
  grantVisible.value = false
  ElMessage.success(`发放成功：${numberFormat(grantForm.coins)} 金币 / ${grantForm.diamonds} 钻石`)
}

function exportCsv() {
  const header = ['ID', '昵称', '账号', '手机号', '金币', '钻石', '等级', '胜率', '状态', '注册时间']
  const body = filtered.value.map((u) => [
    u.id,
    u.nickname,
    u.account,
    u.phone,
    u.coins,
    u.diamonds,
    u.level,
    `${u.winRate}%`,
    u.status === 'banned' ? '已封禁' : '正常',
    u.registeredAt
  ])
  const csv = `\ufeff${[header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = '用户列表.csv'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${filtered.value.length} 条用户数据`)
}

onMounted(loadUsers)
</script>

<style scoped>
.header-stats {
  display: flex;
  gap: 22px;
  font-size: 12px;
  color: var(--app-text-sub);
  padding-top: 6px;
}

.header-stats b {
  font-size: 15px;
  margin-left: 4px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 50%;
  color: #101722;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nickname {
  font-size: 12px;
  color: #e7edf7;
  font-weight: 600;
}

.account {
  font-size: 10px;
  color: #7f90a8;
  margin-top: 2px;
}

.grant-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  background: #121b29;
  border: 1px solid #243247;
}
</style>
