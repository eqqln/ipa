<template>
  <div class="risk-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">风控中心</h2>
        <p class="page-subtitle">异常行为识别、风险事件处置与风控规则配置</p>
      </div>
      <div class="toolbar">
        <el-tag type="danger" effect="dark" size="small">高风险 {{ highCount }}</el-tag>
        <el-tag type="warning" effect="dark" size="small">待处理 {{ pendingCount }}</el-tag>
        <el-button :icon="Refresh" size="small" @click="loadEvents">刷新</el-button>
      </div>
    </div>

    <div class="stat-grid-4">
      <div class="stat-card">
        <div class="stat-icon"><el-icon><Warning /></el-icon></div>
        <div class="stat-label">高风险事件</div>
        <div class="stat-value text-danger">{{ highCount }}</div>
        <div class="stat-trend down">需优先处理</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-icon"><el-icon><Timer /></el-icon></div>
        <div class="stat-label">待处理事件</div>
        <div class="stat-value text-cyan">{{ pendingCount }}</div>
        <div class="stat-trend">实时队列</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><el-icon><CircleCheck /></el-icon></div>
        <div class="stat-label">已处理事件</div>
        <div class="stat-value text-success">{{ handledCount }}</div>
        <div class="stat-trend">处置完成</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-icon"><el-icon><DataLine /></el-icon></div>
        <div class="stat-label">启用规则数</div>
        <div class="stat-value">{{ enabledRules }}<span class="text-sub" style="font-size: 13px"> / {{ rules.length }}</span></div>
        <div class="stat-trend">自动拦截中</div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        异常事件列表
        <span class="sub">共 {{ filteredEvents.length }} 条</span>
      </div>
      <div class="toolbar">
        <el-select v-model="levelFilter" placeholder="风险等级" clearable style="width: 120px">
          <el-option label="高" value="高" />
          <el-option label="中" value="中" />
          <el-option label="低" value="低" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="处理状态" clearable style="width: 130px">
          <el-option label="待处理" value="pending" />
          <el-option label="已处理" value="handled" />
        </el-select>
        <el-select v-model="typeFilter" placeholder="事件类型" clearable style="width: 160px">
          <el-option v-for="t in types" :key="t" :label="t" :value="t" />
        </el-select>
        <el-input v-model="keyword" placeholder="搜索用户 / 事件ID" :prefix-icon="Search" clearable style="width: 200px" />
        <div class="toolbar-right">
          <el-button :icon="Refresh" @click="loadEvents">刷新</el-button>
        </div>
      </div>

      <el-table :data="pagedEvents" stripe v-loading="loading" style="width: 100%" max-height="500">
        <el-table-column prop="id" label="事件ID" width="130">
          <template #default="{ row }"><span class="mono text-sub">{{ row.id }}</span></template>
        </el-table-column>
        <el-table-column label="玩家" min-width="150">
          <template #default="{ row }">
            <div>{{ row.nickname }}</div>
            <div class="mono text-sub" style="font-size: 10px">ID {{ row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="事件类型" width="130" />
        <el-table-column label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)" size="small" effect="dark">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="异常详情" min-width="230">
          <template #default="{ row }"><span class="text-sub">{{ row.detail }}</span></template>
        </el-table-column>
        <el-table-column prop="ip" label="IP 地址" width="130">
          <template #default="{ row }"><span class="mono text-sub">{{ row.ip }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'handled' ? 'success' : 'warning'" size="small" effect="plain">
              {{ row.status === 'handled' ? '已处理' : '待处理' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="at" label="触发时间" width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" link type="primary" size="small" @click="handleEvent(row)">处理</el-button>
            <span v-else class="text-sub" style="font-size: 11px">{{ row.handler }}</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredEvents.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        风控规则开关
        <span class="sub">规则变更即时生效</span>
      </div>
      <div class="rule-grid">
        <div v-for="rule in rules" :key="rule.key" class="rule-card" :class="{ off: !rule.enabled }">
          <div class="rule-head">
            <div class="rule-name">{{ rule.name }}</div>
            <el-switch v-model="rule.enabled" @change="onRuleChange(rule)" />
          </div>
          <div class="rule-desc">{{ rule.desc }}</div>
          <div class="rule-meta">
            <el-tag size="small" :type="rule.level === '高' ? 'danger' : rule.level === '中' ? 'warning' : 'info'" effect="plain">
              拦截等级 {{ rule.level }}
            </el-tag>
            <span class="text-sub">今日触发 {{ rule.hits }} 次</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, Warning, Timer, CircleCheck, DataLine } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockRiskEvents } from '../api/mock'

const loading = ref(false)
const events = ref([])

const levelFilter = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)

const types = ['异常赢率', '多账号同IP', '高频对局', '疑似脚本', '异常金币流动', '设备指纹重复', '异常登录地']

const rules = ref([
  { key: 'winrate', name: '异常胜率检测', desc: '24 小时胜率超过 85% 自动标记并限制匹配', level: '高', enabled: true, hits: 23 },
  { key: 'multiip', name: '多账号同 IP', desc: '同一 IP 登录超过 5 个账号触发关联审查', level: '中', enabled: true, hits: 41 },
  { key: 'frequency', name: '高频对局拦截', desc: '连续对局超过 100 场强制休息 30 分钟', level: '中', enabled: true, hits: 18 },
  { key: 'script', name: '自动化脚本识别', desc: '检测固定间隔出牌等行为特征并封禁', level: '高', enabled: true, hits: 9 },
  { key: 'coinflow', name: '金币异常流动', desc: '单日金币流入超过 300 万触发人工复核', level: '高', enabled: false, hits: 6 },
  { key: 'device', name: '设备指纹去重', desc: '同设备多账号注册自动进入观察名单', level: '低', enabled: true, hits: 57 }
])

const highCount = computed(() => events.value.filter((e) => e.level === '高').length)
const pendingCount = computed(() => events.value.filter((e) => e.status === 'pending').length)
const handledCount = computed(() => events.value.filter((e) => e.status === 'handled').length)
const enabledRules = computed(() => rules.value.filter((r) => r.enabled).length)

const filteredEvents = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return events.value.filter((e) => {
    if (levelFilter.value && e.level !== levelFilter.value) return false
    if (statusFilter.value && e.status !== statusFilter.value) return false
    if (typeFilter.value && e.type !== typeFilter.value) return false
    if (kw && !`${e.nickname}${e.id}${e.userId}`.toLowerCase().includes(kw)) return false
    return true
  })
})

const pagedEvents = computed(() => filteredEvents.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

function levelType(level) {
  return { 高: 'danger', 中: 'warning', 低: 'info' }[level] || 'info'
}

async function handleEvent(row) {
  let result = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `处理事件「${row.type}」· 玩家 ${row.nickname}`,
      '风险事件处理',
      {
        confirmButtonText: '确认处理',
        cancelButtonText: '取消',
        inputPlaceholder: '请输入处理结果，如：已封禁账号',
        inputValidator: (v) => (v && v.trim() ? true : '请输入处理结果')
      }
    )
    result = value
  } catch {
    return
  }
  await safeCall(() => api.handleRiskEvent(row.id, 'handled'), null)
  row.status = 'handled'
  row.handler = '当前管理员'
  ElMessage.success(`事件已处理：${result || '已处置'}`)
}

function onRuleChange(rule) {
  ElMessage.success(`风控规则「${rule.name}」已${rule.enabled ? '启用' : '关闭'}`)
}

async function loadEvents() {
  loading.value = true
  const data = await safeCall(() => api.getRiskEvents(), mockRiskEvents())
  events.value = Array.isArray(data) && data.length ? data : mockRiskEvents()
  loading.value = false
}

onMounted(loadEvents)
</script>

<style scoped>
.rule-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.rule-card {
  padding: 16px;
  border-radius: 10px;
  background: linear-gradient(145deg, #182334, #131c2a);
  border: 1px solid #2a3a50;
}

.rule-card.off {
  opacity: 0.62;
}

.rule-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rule-name {
  font-size: 13px;
  font-weight: 600;
  color: #e7edf7;
}

.rule-desc {
  font-size: 11px;
  color: #8192ab;
  line-height: 1.7;
  margin: 10px 0 14px;
  min-height: 38px;
}

.rule-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

@media (max-width: 1200px) {
  .rule-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
