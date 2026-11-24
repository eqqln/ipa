<template>
  <div class="audit-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">操作审计日志</h2>
        <p class="page-subtitle">记录所有管理员的关键操作，支持多维度检索与追溯</p>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" size="small" @click="loadLogs">刷新</el-button>
        <el-button :icon="Download" size="small" type="primary" @click="exportLogs">导出日志</el-button>
      </div>
    </div>

    <div class="audit-summary">
      <div><span>日志总数</span><b>{{ logs.length }}</b></div>
      <div><span>今日操作</span><b class="text-cyan">{{ todayCount }}</b></div>
      <div><span>活跃管理员</span><b class="text-gold">{{ adminCount }}</b></div>
      <div><span>敏感操作</span><b class="text-danger">{{ sensitiveCount }}</b></div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        日志明细
        <span class="sub">筛选结果 {{ filteredLogs.length }} 条</span>
      </div>
      <div class="toolbar">
        <el-select v-model="adminFilter" placeholder="操作管理员" clearable style="width: 170px">
          <el-option v-for="a in adminOptions" :key="a" :label="a" :value="a" />
        </el-select>
        <el-select v-model="actionFilter" placeholder="操作类型" clearable filterable style="width: 170px">
          <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 250px"
        />
        <el-input v-model="keyword" placeholder="搜索对象 / IP / 详情" :prefix-icon="Search" clearable style="width: 210px" />
        <el-button @click="resetFilter">重置</el-button>
      </div>

      <el-table :data="pagedLogs" stripe v-loading="loading" style="width: 100%" max-height="600">
        <el-table-column prop="id" label="日志ID" width="130">
          <template #default="{ row }"><span class="mono text-sub">{{ row.id }}</span></template>
        </el-table-column>
        <el-table-column prop="adminName" label="操作管理员" min-width="170">
          <template #default="{ row }">
            <div class="admin-cell">
              <span class="admin-avatar">{{ row.adminName.slice(0, 1) }}</span>
              <span>{{ row.adminName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作动作" width="130">
          <template #default="{ row }">
            <el-tag :type="actionType(row.action)" size="small" effect="plain">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target" label="操作对象" min-width="130" />
        <el-table-column prop="detail" label="操作详情" min-width="220">
          <template #default="{ row }"><span class="text-sub">{{ row.detail }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="来源 IP" width="140">
          <template #default="{ row }"><span class="mono text-sub">{{ row.ip }}</span></template>
        </el-table-column>
        <el-table-column prop="at" label="操作时间" width="165">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="filteredLogs.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Download, Search } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockAuditLogs } from '../api/mock'

const loading = ref(false)
const logs = ref([])

const adminFilter = ref('')
const actionFilter = ref('')
const dateRange = ref([])
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)

const adminOptions = computed(() => [...new Set(logs.value.map((l) => l.adminName))])
const actionOptions = computed(() => [...new Set(logs.value.map((l) => l.action))])

const todayStr = new Date().toISOString().slice(0, 10)
const todayCount = computed(() => logs.value.filter((l) => l.at.startsWith(todayStr)).length)
const adminCount = computed(() => new Set(logs.value.map((l) => l.adminName)).size)
const sensitiveCount = computed(() =>
  logs.value.filter((l) => ['封禁用户', '发放金币', '解散房间', '删除管理员', '处理风控事件'].includes(l.action)).length
)

const sensitiveActions = ['封禁用户', '解封用户', '发放金币', '发放钻石', '解散房间', '处理风控事件', '添加管理员', '删除管理员', '修改系统配置']

function actionType(action) {
  if (['封禁用户', '删除管理员', '解散房间'].includes(action)) return 'danger'
  if (sensitiveActions.includes(action)) return 'warning'
  if (action === '登录后台') return 'info'
  return 'success'
}

const filteredLogs = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return logs.value.filter((l) => {
    if (adminFilter.value && l.adminName !== adminFilter.value) return false
    if (actionFilter.value && l.action !== actionFilter.value) return false
    if (dateRange.value?.length === 2) {
      const day = String(l.at).slice(0, 10)
      if (day < dateRange.value[0] || day > dateRange.value[1]) return false
    }
    if (kw && !`${l.target}${l.ip}${l.detail}${l.id}`.toLowerCase().includes(kw)) return false
    return true
  })
})

const pagedLogs = computed(() => filteredLogs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

function resetFilter() {
  adminFilter.value = ''
  actionFilter.value = ''
  dateRange.value = []
  keyword.value = ''
  page.value = 1
}

function exportLogs() {
  const header = ['日志ID', '管理员', '操作动作', '操作对象', '操作详情', '来源IP', '操作时间']
  const body = filteredLogs.value.map((l) => [l.id, l.adminName, l.action, l.target, l.detail, l.ip, l.at])
  const csv = `\ufeff${[header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = '操作审计日志.csv'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${filteredLogs.value.length} 条审计日志`)
}

async function loadLogs() {
  loading.value = true
  const data = await safeCall(() => api.getAuditLogs({ limit: 200 }), mockAuditLogs(60))
  logs.value = Array.isArray(data) && data.length ? data : mockAuditLogs(60)
  loading.value = false
}

onMounted(loadLogs)
</script>

<style scoped>
.audit-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.audit-summary > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-radius: 10px;
  background: linear-gradient(145deg, #182334, #131c2a);
  border: 1px solid #26354a;
  font-size: 12px;
  color: #93a3ba;
}

.audit-summary b {
  font-size: 20px;
  color: #f5f8fd;
}

.admin-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.admin-avatar {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(53, 208, 224, 0.16);
  color: var(--app-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}
</style>
