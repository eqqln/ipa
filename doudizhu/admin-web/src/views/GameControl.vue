<template>
  <div class="game-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">游戏管控</h2>
        <p class="page-subtitle">实时房间监控与对局记录查询 · 支持强制解散异常房间</p>
      </div>
      <div class="toolbar">
        <el-tag type="success" effect="dark" size="small">游戏中 {{ playingRooms }}</el-tag>
        <el-tag type="info" effect="dark" size="small">等待中 {{ waitingRooms }}</el-tag>
        <el-button :icon="Refresh" size="small" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        实时房间监控
        <span class="sub">共 {{ filteredRooms.length }} 个房间</span>
      </div>
      <div class="toolbar">
        <el-radio-group v-model="roomGame" size="small">
          <el-radio-button value="">全部游戏</el-radio-button>
          <el-radio-button value="斗地主">斗地主</el-radio-button>
          <el-radio-button value="内蒙麻将">内蒙麻将</el-radio-button>
        </el-radio-group>
        <el-select v-model="roomStatus" placeholder="全部状态" clearable size="small" style="width: 130px">
          <el-option label="游戏中" value="playing" />
          <el-option label="等待中" value="waiting" />
          <el-option label="已结束" value="ended" />
        </el-select>
        <el-input v-model="roomKeyword" placeholder="搜索房间号 / 房主" :prefix-icon="Search" clearable size="small" style="width: 210px" />
      </div>

      <el-table :data="pagedRooms" stripe v-loading="loading" style="width: 100%" max-height="440">
        <el-table-column prop="roomNo" label="房间号" width="120">
          <template #default="{ row }"><span class="mono text-gold">{{ row.roomNo }}</span></template>
        </el-table-column>
        <el-table-column prop="game" label="游戏类型" width="110">
          <template #default="{ row }">
            <el-tag :type="row.game === '斗地主' ? 'warning' : 'success'" size="small" effect="dark">{{ row.game }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mode" label="玩法模式" min-width="130" />
        <el-table-column label="人数" width="130">
          <template #default="{ row }">
            <div class="player-cell">
              <span>{{ row.players }}/{{ row.maxPlayers }}</span>
              <el-progress :percentage="Math.round((row.players / row.maxPlayers) * 100)" :show-text="false" :stroke-width="5" style="width: 56px" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="baseScore" label="底分" width="80" align="center" />
        <el-table-column prop="pot" label="当前彩池" width="110" align="right">
          <template #default="{ row }"><span class="mono text-gold">{{ numberFormat(row.pot) }}</span></template>
        </el-table-column>
        <el-table-column prop="owner" label="房主" min-width="120" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.createdAt }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" :disabled="row.status === 'ended'" @click="dissolve(row)">
              强制解散
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="roomPage"
        :page-size="8"
        :total="filteredRooms.length"
        layout="total, prev, pager, next"
        background
      />
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        对局记录查询
        <span class="sub">共 {{ filteredGames.length }} 场</span>
      </div>
      <div class="toolbar">
        <el-radio-group v-model="gameGame" size="small">
          <el-radio-button value="">全部游戏</el-radio-button>
          <el-radio-button value="斗地主">斗地主</el-radio-button>
          <el-radio-button value="内蒙麻将">内蒙麻将</el-radio-button>
        </el-radio-group>
        <el-input v-model="gameKeyword" placeholder="搜索房间号 / 赢家" :prefix-icon="Search" clearable size="small" style="width: 220px" />
        <div class="toolbar-right">
          <el-button size="small" :icon="Download" @click="exportGames">导出记录</el-button>
        </div>
      </div>

      <el-table :data="pagedGames" stripe style="width: 100%" max-height="460">
        <el-table-column prop="id" label="对局ID" width="130">
          <template #default="{ row }"><span class="mono text-sub">{{ row.id }}</span></template>
        </el-table-column>
        <el-table-column prop="roomNo" label="房间号" width="110">
          <template #default="{ row }"><span class="mono text-gold">{{ row.roomNo }}</span></template>
        </el-table-column>
        <el-table-column prop="game" label="游戏" width="105">
          <template #default="{ row }">
            <el-tag :type="row.game === '斗地主' ? 'warning' : 'success'" size="small">{{ row.game }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mode" label="玩法" min-width="120" />
        <el-table-column prop="players" label="人数" width="70" align="center" />
        <el-table-column prop="bet" label="底分" width="70" align="center" />
        <el-table-column prop="pot" label="彩池" width="110" align="right">
          <template #default="{ row }"><span class="text-gold mono">{{ numberFormat(row.pot) }}</span></template>
        </el-table-column>
        <el-table-column prop="winner" label="赢家" min-width="120" />
        <el-table-column prop="rounds" label="回合" width="70" align="center" />
        <el-table-column prop="duration" label="时长" width="100" />
        <el-table-column prop="at" label="结束时间" width="160">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="gamePage"
        v-model:page-size="gamePageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredGames.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, Download } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockRooms, mockGames } from '../api/mock'
import { numberFormat } from '../utils/theme'

const loading = ref(false)
const rooms = ref([])
const games = ref([])

const roomGame = ref('')
const roomStatus = ref('')
const roomKeyword = ref('')
const roomPage = ref(1)

const gameGame = ref('')
const gameKeyword = ref('')
const gamePage = ref(1)
const gamePageSize = ref(10)

const playingRooms = computed(() => rooms.value.filter((r) => r.status === 'playing').length)
const waitingRooms = computed(() => rooms.value.filter((r) => r.status === 'waiting').length)

const filteredRooms = computed(() => {
  const kw = roomKeyword.value.trim().toLowerCase()
  return rooms.value.filter((r) => {
    if (roomGame.value && r.game !== roomGame.value) return false
    if (roomStatus.value && r.status !== roomStatus.value) return false
    if (kw && !`${r.roomNo}${r.owner}`.toLowerCase().includes(kw)) return false
    return true
  })
})

const pagedRooms = computed(() => filteredRooms.value.slice((roomPage.value - 1) * 8, roomPage.value * 8))

const filteredGames = computed(() => {
  const kw = gameKeyword.value.trim().toLowerCase()
  return games.value.filter((g) => {
    if (gameGame.value && g.game !== gameGame.value) return false
    if (kw && !`${g.roomNo}${g.winner}${g.id}`.toLowerCase().includes(kw)) return false
    return true
  })
})

const pagedGames = computed(() => filteredGames.value.slice((gamePage.value - 1) * gamePageSize.value, gamePage.value * gamePageSize.value))

function statusText(status) {
  return { playing: '游戏中', waiting: '等待中', ended: '已解散' }[status] || '未知'
}

function statusType(status) {
  return { playing: 'success', waiting: 'info', ended: 'danger' }[status] || 'info'
}

async function dissolve(row) {
  try {
    await ElMessageBox.confirm(
      `强制解散房间「${row.roomNo}」（${row.game} · ${row.players}人）？该操作不可撤销。`,
      '强制解散确认',
      { type: 'warning', confirmButtonText: '确认解散', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await safeCall(() => api.dissolveRoom?.(row.id), null)
  row.status = 'ended'
  row.players = 0
  ElMessage.success(`房间 ${row.roomNo} 已强制解散`)
}

function exportGames() {
  const header = ['对局ID', '房间号', '游戏', '玩法', '人数', '底分', '彩池', '赢家', '回合', '时长', '结束时间']
  const body = filteredGames.value.map((g) => [g.id, g.roomNo, g.game, g.mode, g.players, g.bet, g.pot, g.winner, g.rounds, g.duration, g.at])
  const csv = `\ufeff${[header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = '对局记录.csv'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${filteredGames.value.length} 场对局记录`)
}

async function loadAll() {
  loading.value = true
  const [roomData, gameData] = await Promise.all([
    safeCall(() => api.getLiveRooms(), mockRooms()),
    safeCall(() => api.getGames(200), mockGames(80))
  ])
  rooms.value = Array.isArray(roomData) && roomData.length ? roomData : mockRooms()
  games.value = Array.isArray(gameData) && gameData.length ? gameData : mockGames(80)
  loading.value = false
}

onMounted(loadAll)
</script>

<style scoped>
.player-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
</style>
