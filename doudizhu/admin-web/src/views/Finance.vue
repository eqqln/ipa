<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">财务管理</h2>
        <p class="page-subtitle">平台经济体系监控 · 充值、消耗、金币钻石流通全链路</p>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" size="small" @click="loadAll">刷新数据</el-button>
        <el-button :icon="Download" size="small" type="primary" @click="exportFlow">导出流水</el-button>
      </div>
    </div>

    <div class="stat-grid-4">
      <div v-for="s in summaryCards" :key="s.label" class="stat-card" :class="{ cyan: s.cyan }">
        <div class="flex-between">
          <div class="stat-icon"><el-icon><component :is="s.icon" /></el-icon></div>
          <span class="stat-trend">{{ s.trend }}</span>
        </div>
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">{{ s.value }}</div>
      </div>
    </div>

    <div class="chart-row" style="margin-top: 16px">
      <div class="section-card">
        <div class="section-title">充值与消耗趋势 <span class="sub">近 30 天</span></div>
        <EChart :option="economyOption" height="290px" />
      </div>
      <div class="section-card">
        <div class="section-title">钻石经济构成 <span class="sub">累计流通</span></div>
        <EChart :option="diamondOption" height="220px" />
        <div class="diamond-stats">
          <div>
            <div class="ds-label">钻石总量</div>
            <div class="ds-value text-cyan">{{ numberFormat(summary.diamondBalance) }}</div>
          </div>
          <div>
            <div class="ds-label">累计流通</div>
            <div class="ds-value text-gold">{{ numberFormat(summary.totalDiamondFlow) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">金币流水 <span class="sub">共 {{ filteredLogs.length }} 条</span></div>
      <div class="toolbar">
        <el-input v-model="logKeyword" placeholder="搜索用户ID / 昵称" :prefix-icon="Search" clearable style="width: 220px" />
        <el-select v-model="reasonFilter" placeholder="全部原因" clearable style="width: 150px">
          <el-option v-for="r in reasons" :key="r" :label="r" :value="r" />
        </el-select>
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 120px">
          <el-option label="收入" value="in" />
          <el-option label="支出" value="out" />
        </el-select>
        <div class="toolbar-right">
          <el-tag type="info" size="small">今日流水 {{ numberFormat(summary.todayCoinFlow) }}</el-tag>
        </div>
      </div>
      <el-table :data="pagedLogs" stripe style="width: 100%" max-height="480" v-loading="loading">
        <el-table-column prop="id" label="流水号" width="130">
          <template #default="{ row }"><span class="mono text-sub">{{ row.id }}</span></template>
        </el-table-column>
        <el-table-column prop="userId" label="用户ID" width="100" align="center">
          <template #default="{ row }"><span class="mono">{{ row.userId }}</span></template>
        </el-table-column>
        <el-table-column prop="nickname" label="玩家昵称" min-width="130" />
        <el-table-column label="变动金币" width="130" align="right">
          <template #default="{ row }">
            <span class="mono" :class="row.delta >= 0 ? 'text-success' : 'text-danger'">
              {{ row.delta >= 0 ? '+' : '' }}{{ numberFormat(row.delta) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="变动原因" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="row.delta >= 0 ? 'success' : 'warning'">{{ row.reason }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="变动后余额" width="130" align="right">
          <template #default="{ row }"><span class="mono text-gold">{{ numberFormat(row.balance) }}</span></template>
        </el-table-column>
        <el-table-column prop="at" label="时间" min-width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredLogs.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">系统发放记录 <span class="sub">运营手动发放明细</span></div>
      <el-table :data="grantRecords" stripe style="width: 100%" max-height="320">
        <el-table-column prop="at" label="发放时间" width="165" />
        <el-table-column prop="userId" label="用户ID" width="100" />
        <el-table-column prop="nickname" label="玩家昵称" min-width="130" />
        <el-table-column prop="reason" label="发放事由" min-width="150" />
        <el-table-column label="发放金币" width="130" align="right">
          <template #default="{ row }"><span class="text-gold mono">+{{ numberFormat(row.delta) }}</span></template>
        </el-table-column>
        <el-table-column label="操作人" width="120">
          <template #default><span>运营管理员</span></template>
        </el-table-column>
      </el-table>
      <div v-if="!grantRecords.length" class="empty-hint">暂无系统发放记录</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Refresh, Download, Search } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import { api, safeCall } from '../api'
import { mockFinanceSummary, mockCoinLogs } from '../api/mock'
import { CHART_COLORS, baseGrid, baseTooltip, baseLegend, categoryAxis, valueAxis, numberFormat } from '../utils/theme'

const loading = ref(false)
const summary = ref(mockFinanceSummary())
const logs = ref(mockCoinLogs())

const logKeyword = ref('')
const reasonFilter = ref('')
const typeFilter = ref('')
const page = ref(1)
const pageSize = ref(10)

const reasons = ['对局结算', '签到奖励', '系统发放', '钻石兑换', '道具购买', '注册赠送', '活动奖励', '红包赠送']

const summaryCards = computed(() => [
  { label: '今日充值金额', value: `¥ ${numberFormat(summary.value.todayRecharge)}`, icon: 'Money', trend: '↑ 15.8% 较昨日', cyan: true },
  { label: '累计充值金额', value: `¥ ${numberFormat(summary.value.totalRecharge)}`, icon: 'Wallet', trend: '↑ 9.6% 本月', cyan: false },
  { label: '累计消耗金额', value: `¥ ${numberFormat(summary.value.totalConsume)}`, icon: 'ShoppingCart', trend: '消耗率 63.9%', cyan: false },
  { label: '平台金币余额', value: numberFormat(summary.value.coinBalance), icon: 'Coin', trend: '↑ 3.2% 本周', cyan: true }
])

const filteredLogs = computed(() => {
  const kw = logKeyword.value.trim().toLowerCase()
  return logs.value.filter((l) => {
    if (kw && !`${l.userId}${l.nickname}`.toLowerCase().includes(kw)) return false
    if (reasonFilter.value && l.reason !== reasonFilter.value) return false
    if (typeFilter.value === 'in' && l.delta < 0) return false
    if (typeFilter.value === 'out' && l.delta >= 0) return false
    return true
  })
})

const pagedLogs = computed(() => filteredLogs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const grantRecords = computed(() => logs.value.filter((l) => l.reason === '系统发放').slice(0, 8))

const economyOption = computed(() => {
  const trend = summary.value.trend || []
  const gradient = (r, g, b) =>
    new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: `rgba(${r},${g},${b},0.3)` },
      { offset: 1, color: `rgba(${r},${g},${b},0.01)` }
    ])
  return {
    color: CHART_COLORS,
    tooltip: baseTooltip({ valueFormatter: (v) => `¥ ${numberFormat(v)}` }),
    legend: baseLegend(),
    grid: baseGrid(),
    xAxis: categoryAxis(trend.map((t) => String(t.date).slice(5))),
    yAxis: valueAxis({ axisLabel: { ...valueAxis().axisLabel, formatter: (v) => `${v / 1000}k` } }),
    series: [
      {
        name: '充值',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3 },
        areaStyle: { color: gradient(233, 185, 73) },
        data: trend.map((t) => t.recharge)
      },
      {
        name: '消耗',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3 },
        areaStyle: { color: gradient(53, 208, 224) },
        data: trend.map((t) => t.consume)
      }
    ]
  }
})

const diamondOption = computed(() => ({
  color: [CHART_COLORS[1], CHART_COLORS[0], CHART_COLORS[2]],
  tooltip: baseTooltip({ trigger: 'item', formatter: '{b}: {d}%', axisPointer: { show: false } }),
  legend: baseLegend({ bottom: 0, top: 'auto', left: 'center', right: 'center' }),
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '42%'],
      itemStyle: { borderColor: '#151e2c', borderWidth: 3, borderRadius: 5 },
      label: { show: false },
      emphasis: { label: { show: true, color: '#e7edf7', fontSize: 13, formatter: '{b}\n{d}%' } },
      data: [
        { value: 46, name: '对局消耗' },
        { value: 32, name: '道具购买' },
        { value: 22, name: '活动发放' }
      ]
    }
  ]
}))

async function loadAll() {
  loading.value = true
  const [fin, flow] = await Promise.all([
    safeCall(() => api.getFinanceSummary(), mockFinanceSummary()),
    safeCall(() => api.getCoinLogs(200), mockCoinLogs())
  ])
  summary.value = fin
  logs.value = Array.isArray(flow) ? flow : []
  loading.value = false
}

function exportFlow() {
  const header = ['流水号', '用户ID', '昵称', '变动金币', '原因', '变动后余额', '时间']
  const body = filteredLogs.value.map((l) => [l.id, l.userId, l.nickname, l.delta, l.reason, l.balance, l.at])
  const csv = `\ufeff${[header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = '金币流水.csv'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${filteredLogs.value.length} 条流水记录`)
}

onMounted(loadAll)
</script>

<style scoped>
.diamond-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}

.diamond-stats > div {
  padding: 12px 14px;
  border-radius: 9px;
  background: #121b29;
  border: 1px solid #243247;
}

.ds-label {
  font-size: 11px;
  color: #7f90a8;
}

.ds-value {
  font-size: 20px;
  font-weight: 700;
  margin-top: 4px;
}
</style>
