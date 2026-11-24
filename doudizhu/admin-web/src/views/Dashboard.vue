<template>
  <div class="dashboard-page" v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">数据概览</h2>
        <p class="page-subtitle">实时掌握平台运营核心指标与趋势 · {{ nowText }} 更新</p>
      </div>
      <div class="toolbar">
        <el-radio-group v-model="days" size="small" @change="loadOverview">
          <el-radio-button :value="1">今日</el-radio-button>
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
        </el-radio-group>
        <el-button size="small" :icon="Refresh" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div v-for="s in stats" :key="s.label" class="stat-card" :class="{ cyan: s.cyan }">
        <div class="flex-between">
          <div class="stat-icon"><el-icon><component :is="s.icon" /></el-icon></div>
          <span class="stat-trend" :class="{ down: s.down }">{{ s.trend }}</span>
        </div>
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">{{ s.value }}</div>
      </div>
    </div>

    <div class="chart-row" style="margin-top: 16px">
      <div class="section-card">
        <div class="section-title">
          对局与新用户趋势
          <span class="sub">近 {{ days }} 天</span>
        </div>
        <EChart :option="trendOption" height="300px" />
      </div>

      <div class="section-card">
        <div class="section-title">
          游戏类型占比
          <span class="sub">按对局数统计</span>
        </div>
        <EChart :option="pieOption" height="228px" />
        <div class="live-box">
          <div class="live-icon"><el-icon><Monitor /></el-icon></div>
          <div>
            <div class="live-label">实时活跃房间</div>
            <div class="live-value">{{ numberFormat(dash.activeRooms) }}<span> 间</span></div>
          </div>
          <div class="live-status"><span class="pulse"></span>实时</div>
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        最近对局
        <span class="sub">共 {{ games.length }} 场记录</span>
      </div>
      <el-table :data="recentGames" stripe style="width: 100%" max-height="380">
        <el-table-column prop="roomNo" label="房间号" width="120">
          <template #default="{ row }"><span class="mono text-gold">{{ row.roomNo }}</span></template>
        </el-table-column>
        <el-table-column prop="game" label="游戏类型" width="110">
          <template #default="{ row }">
            <el-tag :type="row.game === '斗地主' ? 'warning' : 'success'" size="small" effect="dark">{{ row.game }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mode" label="玩法模式" min-width="130" />
        <el-table-column prop="players" label="人数" width="70" align="center" />
        <el-table-column prop="bet" label="底分" width="80" align="center" />
        <el-table-column prop="pot" label="彩池" width="110" align="right">
          <template #default="{ row }"><span class="text-gold mono">{{ numberFormat(row.pot) }}</span></template>
        </el-table-column>
        <el-table-column prop="winner" label="赢家" min-width="120" />
        <el-table-column prop="at" label="结束时间" width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import * as echarts from 'echarts'
import { Refresh } from '@element-plus/icons-vue'
import EChart from '../components/EChart.vue'
import { api, safeCall } from '../api'
import {
  mockDashboard,
  mockAnalyticsOverview,
  mockGames,
  mockRooms
} from '../api/mock'
import {
  CHART_COLORS,
  baseGrid,
  baseTooltip,
  baseLegend,
  categoryAxis,
  valueAxis,
  numberFormat
} from '../utils/theme'

const loading = ref(false)
const days = ref(7)
const dash = ref(mockDashboard())
const overview = ref(mockAnalyticsOverview(7))
const games = ref([])
const rooms = ref([])

const nowText = computed(() => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const stats = computed(() => [
  { label: '注册用户总数', value: numberFormat(dash.value.totalUsers), icon: 'User', trend: '↑ 12.6% 较上周', cyan: false },
  { label: '当前在线用户', value: numberFormat(dash.value.onlineUsers), icon: 'Connection', trend: '实时在线', cyan: true },
  { label: '今日对局数', value: numberFormat(dash.value.todayGames), icon: 'TrendCharts', trend: '↑ 8.3% 较昨日', cyan: false },
  { label: '累计投注流水', value: numberFormat(dash.value.totalBetFlow), icon: 'Coin', trend: '↑ 5.2% 较上周', cyan: true },
  { label: '金币总量', value: numberFormat(dash.value.totalCoins), icon: 'Wallet', trend: '↑ 3.1% 较上周', cyan: false }
])

const recentGames = computed(() => games.value.slice(0, 8))

const trendOption = computed(() => {
  const list = overview.value.daily || []
  const dates = list.map((d) => String(d.date).slice(5))
  const gradient = (color) =>
    new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: color.replace(')', ', 0.32)').replace('rgb', 'rgba') },
      { offset: 1, color: color.replace(')', ', 0.01)').replace('rgb', 'rgba') }
    ])
  return {
    color: CHART_COLORS,
    tooltip: baseTooltip(),
    legend: baseLegend(),
    grid: baseGrid(),
    xAxis: categoryAxis(dates),
    yAxis: [
      valueAxis({ name: '对局数', nameTextStyle: { color: '#7f90a8', fontSize: 11 } }),
      valueAxis({ name: '新用户', splitLine: { show: false }, nameTextStyle: { color: '#7f90a8', fontSize: 11 } })
    ],
    series: [
      {
        name: '对局数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 3 },
        itemStyle: { color: CHART_COLORS[0] },
        areaStyle: { color: gradient('rgb(233,185,73)') },
        data: list.map((d) => d.games)
      },
      {
        name: '新用户',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        itemStyle: { color: CHART_COLORS[1] },
        areaStyle: { color: gradient('rgb(53,208,224)') },
        data: list.map((d) => d.newUsers)
      }
    ]
  }
})

const pieOption = computed(() => {
  const doudizhu = games.value.filter((g) => g.game === '斗地主').length
  const mahjong = games.value.length - doudizhu
  return {
    color: [CHART_COLORS[0], CHART_COLORS[1]],
    tooltip: baseTooltip({
      trigger: 'item',
      formatter: '{b}: {c} 场 ({d}%)',
      axisPointer: { show: false }
    }),
    legend: baseLegend({ bottom: 0, top: 'auto', right: 'center', left: 'center' }),
    series: [
      {
        name: '游戏占比',
        type: 'pie',
        radius: ['48%', '70%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#151e2c', borderWidth: 3, borderRadius: 6 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#e7edf7', formatter: '{b}\n{d}%' } },
        data: [
          { value: doudizhu, name: '斗地主' },
          { value: mahjong, name: '内蒙麻将' }
        ]
      }
    ]
  }
})

async function loadOverview() {
  overview.value = await safeCall(() => api.getAnalyticsOverview(days.value), mockAnalyticsOverview(days.value))
}

async function loadAll() {
  loading.value = true
  const [dashData, overviewData, gameData, roomData] = await Promise.all([
    safeCall(() => api.getDashboard(), mockDashboard()),
    safeCall(() => api.getAnalyticsOverview(days.value), mockAnalyticsOverview(days.value)),
    safeCall(() => api.getGames(100), mockGames(80)),
    safeCall(() => api.getLiveRooms(), mockRooms())
  ])
  dash.value = dashData
  overview.value = overviewData
  games.value = Array.isArray(gameData) ? gameData : []
  rooms.value = Array.isArray(roomData) ? roomData : []
  loading.value = false
}

onMounted(loadAll)
</script>

<style scoped>
.live-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(53, 208, 224, 0.1), rgba(53, 208, 224, 0.02));
  border: 1px solid rgba(53, 208, 224, 0.18);
}

.live-icon {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  background: rgba(53, 208, 224, 0.14);
  color: var(--app-cyan);
}

.live-label {
  font-size: 11px;
  color: #93a3ba;
}

.live-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--app-cyan);
  line-height: 1.3;
}

.live-value span {
  font-size: 12px;
  color: #7f90a8;
  font-weight: 400;
}

.live-status {
  margin-left: auto;
  font-size: 11px;
  color: #34d399;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.6);
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 8px rgba(52, 211, 153, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
  }
}
</style>
