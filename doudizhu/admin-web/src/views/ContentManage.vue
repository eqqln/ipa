<template>
  <div class="content-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">内容管理</h2>
        <p class="page-subtitle">平台公告发布与全服邮件推送</p>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">
        公告管理
        <span class="sub">共 {{ announcements.length }} 条公告</span>
      </div>
      <div class="toolbar">
        <el-input v-model="annKeyword" placeholder="搜索公告标题" :prefix-icon="Search" clearable style="width: 240px" />
        <div class="toolbar-right">
          <el-button :icon="Refresh" @click="loadAnnouncements">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="openAnnDialog">发布公告</el-button>
        </div>
      </div>

      <el-table :data="filteredAnnouncements" stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="title" label="公告标题" min-width="240">
          <template #default="{ row }">
            <div class="ann-title">
              <el-tag v-if="row.pinned" type="warning" size="small" effect="dark">置顶</el-tag>
              <span>{{ row.title }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容摘要" min-width="280">
          <template #default="{ row }"><span class="text-sub">{{ row.content }}</span></template>
        </el-table-column>
        <el-table-column prop="author" label="发布人" width="130" />
        <el-table-column prop="at" label="发布时间" width="165">
          <template #default="{ row }"><span class="text-sub">{{ row.at }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="deleteAnn(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!filteredAnnouncements.length" class="empty-hint">暂无公告数据</div>
    </div>

    <div class="mail-layout" style="margin-top: 16px">
      <div class="section-card">
        <div class="section-title">全服邮件发送</div>
        <el-form :model="mailForm" label-width="92px" class="mail-form">
          <el-form-item label="邮件标题">
            <el-input v-model="mailForm.title" placeholder="如：周末狂欢福利发放" maxlength="40" show-word-limit />
          </el-form-item>
          <el-form-item label="邮件内容">
            <el-input v-model="mailForm.content" type="textarea" :rows="5" placeholder="请输入邮件正文内容" maxlength="300" show-word-limit />
          </el-form-item>
          <el-form-item label="金币奖励">
            <el-input-number v-model="mailForm.coins" :min="0" :max="1000000" :step="1000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="钻石奖励">
            <el-input-number v-model="mailForm.diamonds" :min="0" :max="100000" :step="10" style="width: 100%" />
          </el-form-item>
          <el-form-item label="接收范围">
            <el-select v-model="mailForm.scope" style="width: 100%">
              <el-option label="全服玩家" value="all" />
              <el-option label="近 7 日活跃玩家" value="active7" />
              <el-option label="VIP 玩家" value="vip" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :icon="Promotion" :loading="sending" style="width: 100%" @click="sendMail">
              确认发送全服邮件
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="section-card">
        <div class="section-title">
          发送历史
          <span class="sub">最近 {{ mailHistory.length }} 封</span>
        </div>
        <div v-if="mailHistory.length" class="mail-history">
          <div v-for="m in mailHistory" :key="m.id" class="mail-item">
            <div class="mail-item-head">
              <span class="mail-title">{{ m.title }}</span>
              <el-tag type="success" size="small" effect="plain">已发送</el-tag>
            </div>
            <div class="mail-content">{{ m.content }}</div>
            <div class="mail-meta">
              <span class="text-gold">金币 {{ numberFormat(m.coins) }}</span>
              <span class="text-cyan">钻石 {{ m.diamonds }}</span>
              <span class="text-sub">{{ m.at }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">
          <el-icon size="28"><Message /></el-icon>
          <div style="margin-top: 10px">暂无发送记录，快去发送第一封全服邮件吧</div>
        </div>
      </div>
    </div>

    <el-dialog v-model="annVisible" title="发布新公告" width="520px" destroy-on-close>
      <el-form :model="annForm" label-width="80px">
        <el-form-item label="公告标题">
          <el-input v-model="annForm.title" placeholder="请输入公告标题" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="公告内容">
          <el-input v-model="annForm.content" type="textarea" :rows="6" placeholder="请输入公告正文" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="置顶显示">
          <el-switch v-model="annForm.pinned" active-text="置顶" inactive-text="普通" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="annVisible = false">取消</el-button>
        <el-button type="primary" :loading="annLoading" @click="submitAnn">确认发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus, Promotion, Message } from '@element-plus/icons-vue'
import { api, safeCall } from '../api'
import { mockAnnouncements } from '../api/mock'
import { numberFormat } from '../utils/theme'

const loading = ref(false)
const announcements = ref([])
const annKeyword = ref('')

const annVisible = ref(false)
const annLoading = ref(false)
const annForm = reactive({ title: '', content: '', pinned: false })

const sending = ref(false)
const mailForm = reactive({ title: '', content: '', coins: 10000, diamonds: 100, scope: 'all' })
const mailHistory = ref([])

const filteredAnnouncements = computed(() => {
  const kw = annKeyword.value.trim().toLowerCase()
  return announcements.value.filter((a) => !kw || a.title.toLowerCase().includes(kw))
})

function nowText() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function openAnnDialog() {
  annForm.title = ''
  annForm.content = ''
  annForm.pinned = false
  annVisible.value = true
}

async function submitAnn() {
  if (!annForm.title.trim() || !annForm.content.trim()) {
    ElMessage.warning('请填写公告标题和内容')
    return
  }
  annLoading.value = true
  const result = await safeCall(
    () => api.createAnnouncement({ title: annForm.title, content: annForm.content, pinned: annForm.pinned }),
    null
  )
  announcements.value.unshift({
    id: result?.id || Date.now(),
    title: annForm.title,
    content: annForm.content,
    pinned: annForm.pinned,
    author: '超级管理员',
    at: nowText()
  })
  annLoading.value = false
  annVisible.value = false
  ElMessage.success('公告发布成功')
}

async function deleteAnn(row) {
  try {
    await ElMessageBox.confirm(`确认删除公告「${row.title}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await safeCall(() => api.deleteAnnouncement(row.id), null)
  announcements.value = announcements.value.filter((a) => a.id !== row.id)
  ElMessage.success('公告已删除')
}

async function sendMail() {
  if (!mailForm.title.trim() || !mailForm.content.trim()) {
    ElMessage.warning('请填写邮件标题和内容')
    return
  }
  sending.value = true
  await safeCall(
    () => api.broadcast({ title: mailForm.title, content: mailForm.content, rewards: { coins: mailForm.coins, diamonds: mailForm.diamonds }, scope: mailForm.scope }),
    null
  )
  mailHistory.value.unshift({
    id: Date.now(),
    title: mailForm.title,
    content: mailForm.content,
    coins: mailForm.coins,
    diamonds: mailForm.diamonds,
    at: nowText()
  })
  sending.value = false
  mailForm.title = ''
  mailForm.content = ''
  ElMessage.success('全服邮件已发送')
}

async function loadAnnouncements() {
  loading.value = true
  const data = await safeCall(() => api.getAnnouncements(), mockAnnouncements())
  announcements.value = Array.isArray(data) && data.length ? data : mockAnnouncements()
  loading.value = false
}

onMounted(loadAnnouncements)
</script>

<style scoped>
.ann-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e7edf7;
  font-weight: 600;
}

.mail-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.mail-form {
  padding-right: 6px;
}

.mail-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 480px;
  overflow: auto;
}

.mail-item {
  padding: 14px;
  border-radius: 9px;
  background: #121b29;
  border: 1px solid #243247;
}

.mail-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mail-title {
  font-size: 13px;
  font-weight: 600;
  color: #e7edf7;
}

.mail-content {
  font-size: 11px;
  color: #93a3ba;
  margin: 8px 0;
  line-height: 1.6;
}

.mail-meta {
  display: flex;
  gap: 14px;
  font-size: 11px;
}

@media (max-width: 1100px) {
  .mail-layout {
    grid-template-columns: 1fr;
  }
}
</style>
