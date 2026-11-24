<template>
  <div class="config-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">系统配置</h2>
        <p class="page-subtitle">游戏规则、倍率、底分档位与运营奖励参数集中管理</p>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" @click="loadConfig">还原</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="saveConfig">保存配置</el-button>
      </div>
    </div>

    <div class="config-banner">
      <div class="banner-icon"><el-icon><InfoFilled /></el-icon></div>
      <div>
        <div class="banner-title">配置变更说明</div>
        <div class="banner-desc">修改游戏规则与倍率将即时影响新创建的对局，已有房间保持原配置。请谨慎调整维护模式开关。</div>
      </div>
    </div>

    <div class="config-grid">
      <div class="section-card">
        <div class="section-title">游戏规则开关</div>
        <div class="switch-list">
          <div v-for="r in ruleSwitches" :key="r.key" class="switch-row">
            <div>
              <div class="switch-name">{{ r.label }}</div>
              <div class="switch-desc">{{ r.desc }}</div>
            </div>
            <el-switch v-model="config.gameRules[r.key]" />
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">倍率配置</div>
        <el-form :model="config.multipliers" label-width="130px" class="config-form">
          <el-form-item label="斗地主基础倍数">
            <el-input-number v-model="config.multipliers.doudizhuBase" :min="1" :max="100" style="width: 100%" />
          </el-form-item>
          <el-form-item label="炸弹翻倍">
            <el-switch v-model="config.multipliers.bombDouble" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="春天翻倍">
            <el-switch v-model="config.multipliers.springDouble" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="麻将番数倍率">
            <el-input-number v-model="config.multipliers.mahjongFan" :min="1" :max="20" style="width: 100%" />
          </el-form-item>
          <el-form-item label="单局最大倍数">
            <el-input-number v-model="config.multipliers.maxMultiplier" :min="8" :max="1024" :step="8" style="width: 100%" />
          </el-form-item>
        </el-form>
      </div>

      <div class="section-card">
        <div class="section-title">底分档位</div>
        <div class="score-desc">玩家创建房间时可选的底分档位，至少保留一档。</div>
        <el-checkbox-group v-model="config.baseScores" class="score-group">
          <el-checkbox-button v-for="s in [1, 2, 5, 10, 20, 50, 100, 200]" :key="s" :value="s">
            {{ s }} 分
          </el-checkbox-button>
        </el-checkbox-group>
        <div class="score-preview">
          当前已启用 <b class="text-gold">{{ config.baseScores.length }}</b> 档：
          <span class="mono">{{ config.baseScores.slice().sort((a, b) => a - b).join(' / ') }}</span>
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">注册赠送</div>
        <el-form :model="config.registerGift" label-width="110px" class="config-form">
          <el-form-item label="启用注册赠送">
            <el-switch v-model="config.registerGift.enabled" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="赠送金币">
            <el-input-number v-model="config.registerGift.coins" :min="0" :max="1000000" :step="1000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="赠送钻石">
            <el-input-number v-model="config.registerGift.diamonds" :min="0" :max="100000" :step="10" style="width: 100%" />
          </el-form-item>
        </el-form>
        <div class="gift-hint">
          新用户注册成功后自动发放至账号，发放记录可在财务管理中查看。
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-top: 16px">
      <div class="section-title">
        签到奖励
        <span class="sub">连续签到 7 天循环</span>
      </div>
      <el-table :data="config.signInRewards" style="width: 100%">
        <el-table-column label="签到天数" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="warning" size="small" effect="dark">第 {{ row.day }} 天</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="奖励金币" min-width="220">
          <template #default="{ row }">
            <el-input-number v-model="row.coins" :min="0" :step="500" controls-position="right" style="width: 190px" />
          </template>
        </el-table-column>
        <el-table-column label="奖励钻石" min-width="220">
          <template #default="{ row }">
            <el-input-number v-model="row.diamonds" :min="0" :step="5" controls-position="right" style="width: 190px" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="removeReward(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button :icon="Plus" style="margin-top: 14px" @click="addReward">新增签到档位</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Check, InfoFilled, Plus } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockConfig } from '../api/mock'

const saving = ref(false)
const config = ref(mockConfig())

const ruleSwitches = [
  { key: 'doudizhuEnabled', label: '开放斗地主游戏', desc: '关闭后玩家无法创建或加入斗地主房间' },
  { key: 'mahjongEnabled', label: '开放内蒙麻将游戏', desc: '关闭后玩家无法创建或加入麻将房间' },
  { key: 'antiCheat', label: '实时反作弊检测', desc: '自动识别异常出牌行为并拦截' },
  { key: 'allowSpectate', label: '允许旁观对局', desc: '玩家可进入房间观战，不参与牌局' },
  { key: 'allowChat', label: '允许房间聊天', desc: '对局中可使用快捷短语与表情' },
  { key: 'autoStart', label: '满员自动开局', desc: '房间人数达到上限后自动开始' },
  { key: 'maintenanceMode', label: '维护模式', desc: '开启后禁止所有玩家登录与对局，请谨慎操作' }
]

function addReward() {
  const day = config.value.signInRewards.length + 1
  config.value.signInRewards.push({ day, coins: day * 1000, diamonds: day * 5 })
  ElMessage.success(`已新增第 ${day} 天签到档位`)
}

function removeReward(row) {
  config.value.signInRewards = config.value.signInRewards.filter((r) => r !== row)
}

async function saveConfig() {
  if (!config.value.baseScores.length) {
    ElMessage.warning('请至少保留一个底分档位')
    return
  }
  if (config.value.gameRules.maintenanceMode) {
    try {
      await ElMessageBox.confirm('维护模式开启后玩家将无法进入游戏，确认保存？', '维护模式警告', {
        type: 'warning',
        confirmButtonText: '确认保存',
        cancelButtonText: '再想想'
      })
    } catch {
      return
    }
  }
  saving.value = true
  await safeCall(() => api.saveConfig(config.value), null)
  saving.value = false
  ElMessage.success('系统配置已保存并生效')
}

async function loadConfig() {
  const data = await safeCall(() => api.getConfig(), null)
  config.value = data && typeof data === 'object' ? reactive({ ...mockConfig(), ...data }) : reactive(mockConfig())
}

onMounted(loadConfig)
</script>

<style scoped>
.config-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(233, 185, 73, 0.1), rgba(233, 185, 73, 0.02));
  border: 1px solid rgba(233, 185, 73, 0.2);
  margin-bottom: 16px;
}

.banner-icon {
  font-size: 19px;
  color: var(--app-gold);
}

.banner-title {
  font-size: 13px;
  font-weight: 600;
  color: #f0c85f;
  margin-bottom: 4px;
}

.banner-desc {
  font-size: 11px;
  color: #93a3ba;
  line-height: 1.6;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.switch-list {
  display: flex;
  flex-direction: column;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid #1e293b;
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-name {
  font-size: 12px;
  color: #e7edf7;
}

.switch-desc {
  font-size: 10px;
  color: #7f90a8;
  margin-top: 3px;
}

.config-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.score-desc {
  font-size: 11px;
  color: #8192ab;
  margin-bottom: 14px;
}

.score-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.score-preview {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #121b29;
  border: 1px solid #243247;
  font-size: 12px;
  color: #93a3ba;
}

.gift-hint {
  margin-top: 10px;
  font-size: 11px;
  color: #7f90a8;
  padding: 10px 12px;
  border-left: 2px solid #35d0e0;
  background: rgba(53, 208, 224, 0.05);
}

@media (max-width: 1100px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
