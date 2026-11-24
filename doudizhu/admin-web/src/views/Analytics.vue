<template>
  <div class="analytics-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">数据报表</h2>
        <p class="page-subtitle">多维度运营数据分析 · 活跃、留存、对局与经济</p>
      </div>
      <div class="toolbar">
        <el-radio-group v-model="days" size="small" @change="loadData">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="14">近 14 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
        </el-radio-group>
        <el-button :icon="Download" size="small" type="primary" @click="exportReport">导出报表</el-button>
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
        <div class="section-title">活跃用户趋势 <span class="sub">日活跃账号数</span></div>
        <EChart :option="activeOption" height="285px" />
      </div>
      <div class="section-card">
        <div class="section-title">对局量趋势 <span class="sub">每日对局场数</span></div>
        <EChart :option="gameOption" height="285px" />
      </div>
    </div>

    <div class="chart-row" style="margin-top: 16px">
      <div class="section-card">
        <div class="section-title">用户留存率 <span class="sub">次日 / 3日 / 7日留存</span></div>
        <EChart :option="retentionOption" height="285px" />
      </div>
      <div class="section-card">
        <div class="section-title">收入与金币流通 <span class="sub">双轴对比</span></div>
        <EChart :option="revenueOption" height="285px" />
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">每日数据明细 <span class="sub">共 {{ daily.length }} 天</span></div>
      <el-table :data="daily" stripe style="width: 100%" max-height="420">
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="games" label="对局数" width="120" align="right" sortable>
          <template #default="{ row }"><span class="mono">{{ numberFormat(row.games) }}</span></template>
        </el-table-column>
        <el-table-column prop="newUsers" label="新增用户" width="120" align="right" sortable>
          <template #default="{ row }"><span class="text-cyan mono">+{{ row.newUsers }}</span></template>
        </el-table-column>
        <el-table-column prop="activeUsers" label="活跃用户" width="120" align="right" sortable>
          <template #default="{ row }"><span class="mono">{{ numberFormat(row.activeUsers) }}</span></template>
        </el-table-column>
        <el-table-column prop="coinFlow" label="金币流通" width="140" align="right" sortable>
          <template #default="{ row }"><span class="text-gold mono">{{ numberFormat(row.coinFlow) }}</span></template>
        </el-table-column>
        <el-table-column prop="revenue" label="平台收入" min-width="130" align="right" sortable>
          <template #default="{ row }"><span class="text-success mono">¥ {{ numberFormat(row.revenue) }}</span></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import { api, safeCall } from '../api'
import { mockAnalyticsOverview, mockRetention } from '../api/mock'
import { CHART_COLORS, baseGrid, baseTooltip, baseLegend, categoryAxis, valueAxis, numberFormat } from '../utils/theme'

const loading = ref(false)
const days = ref(7)
const overview = ref(mockAnalyticsOverview(7))
const retention = ref(mockRetention())

const daily = computed(() => overview.value.daily || [])
const summary = computed(() => overview.value.summary || {})

const summaryCards = computed(() => [
  { label: '累计对局数', value: numberFormat(summary.value.totalGames), icon: 'TrendCharts', trend: '统计周期内', cyan: false },
  { label: '新增用户', value: numberFormat(summary.value.totalNewUsers), icon: 'UserFilled', trend: '统计周期内', cyan: true },
  { label: '日均活跃', value: numberFormat(summary.value.avgActive), icon: 'Connection', trend: '活跃账号', cyan: false },
  { label: '平台总收入', value: `¥ ${numberFormat(summary.value.totalRevenue)}`, icon: 'Money', trend: '统计周期内', cyan: true }
])

const dates = computed(() => daily.value.map((d) => String(d.date).slice(5)))

const activeOption = computed(() => ({
  color: [CHART_COLORS[1]],
  tooltip: baseTooltip(),
  grid: baseGrid(),
  xAxis: categoryAxis(dates.value),
  yAxis: valueAxis(),
  series: [
    {
      name: '活跃用户',
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 3 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(53,208,224,0.32)' },
          { offset: 1, color: 'rgba(53,208,224,0.01)' }
        ])
      },
      data: daily.value.map((d) => d.activeUsers)
    }
  ]
}))

const gameOption = computed(() => ({
  color: [CHART_COLORS[0]],
  tooltip: baseTooltip(),
  grid: baseGrid(),
  xAxis: categoryAxis(dates.value, { boundaryGap: true }),
  yAxis: valueAxis(),
  series: [
    {
      name: '对局数',
      type: 'bar',
      barMaxWidth: 26,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: daily.value.map((d) => d.games)
    }
  ]
}))

const retentionOption = computed(() => ({
  color: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]],
  tooltip: baseTooltip({ valueFormatter: (v) => `${v}%` }),
  legend: baseLegend(),
  grid: baseGrid(),
  xAxis: categoryAxis(retention.value.slice(-days.value).map((d) => String(d.date).slice(5))),
  yAxis: valueAxis({ max: 100, axisLabel: { color: '#8496ae', fontSize: 11, formatter: '{value}%' } }),
  series: [
    { name: '次日留存', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5 }, data: retention.value.slice(-days.value).map((d) => d.day1) },
    { name: '3日留存', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5 }, data: retention.value.slice(-days.value).map((d) => d.day3) },
    { name: '7日留存', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 2.5 }, data: retention.value.slice(-days.value).map((d) => d.day7) }
  ]
}))

const revenueOption = computed(() => ({
  color: [CHART_COLORS[3], CHART_COLORS[0]],
  tooltip: baseTooltip(),
  legend: baseLegend(),
  grid: baseGrid(),
  xAxis: categoryAxis(dates.value, { boundaryGap: true }),
  yAxis: [
    valueAxis({ name: '收入(元)', nameTextStyle: { color: '#7f90a8', fontSize: 11 } }),
    valueAxis({ name: '金币流通', splitLine: { show: false }, nameTextStyle: { color: '#7f90a8', fontSize: 11 }, axisLabel: { color: '#8496ae', fontSize: 11, formatter: (v) => `${Math.round(v / 10000)}万` } })
  ],
  series: [
    {
      name: '平台收入',
      type: 'bar',
      barMaxWidth: 20,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: daily.value.map((d) => d.revenue)
    },
    {
      name: '金币流通',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.5 },
      data: daily.value.map((d) => d.coinFlow)
    }
  ]
}))

async function loadData() {
  loading.value = true
  const [overviewData, retentionData] = await Promise.all([
    safeCall(() => api.getAnalyticsOverview(days.value), mockAnalyticsOverview(days.value)),
    safeCall(() => api.getRetention(), mockRetention())
  ])
  overview.value = overviewData
  retention.value = Array.isArray(retentionData) && retentionData.length ? retentionData : mockRetention()
  loading.value = false
}

function exportReport() {
  const header = ['日期', '对局数', '新增用户', '活跃用户', '金币流通', '平台收入']
  const body = daily.value.map((d) => [d.date, d.games, d.newUsers, d.activeUsers, d.coinFlow, d.revenue])
  const csv = `\ufeff${[header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `运营数据报表_近${days.value}天.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('数据报表已导出')
}

onMounted(loadData)
</script>

<style scoped>
.analytics-page :deep(.el-radio-button__inner) {
  min-width: 78px;
}
</style>
