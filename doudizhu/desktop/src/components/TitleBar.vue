<script setup>
import { onMounted, ref } from 'vue'
import { close, getVersion, isMaximized, maximize, minimize } from '@/utils/electron'

const version = ref('')
const maximized = ref(false)

onMounted(async () => {
  version.value = await getVersion()
  maximized.value = await isMaximized()
})

async function onMaximize() {
  await maximize()
  maximized.value = await isMaximized()
}
</script>

<template>
  <header class="titlebar">
    <div class="tb-left">
      <span class="tb-logo">🃏</span>
      <span class="tb-title">极跃棋牌 · 桌面版</span>
    </div>

    <div class="tb-drag"></div>

    <div class="tb-right">
      <span v-if="version" class="tb-version">v{{ version }}</span>
      <button class="tb-btn" title="最小化" @click="minimize">
        <svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg>
      </button>
      <button class="tb-btn" :title="maximized ? '还原' : '最大化'" @click="onMaximize">
        <svg v-if="!maximized" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" /></svg>
        <svg v-else viewBox="0 0 12 12">
          <path d="M4.2 2.5h5.3v5.3" />
          <path d="M7.8 9.5H2.5V4.2" />
        </svg>
      </button>
      <button class="tb-btn tb-close" title="关闭" @click="close">
        <svg viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: 38px;
  min-height: 38px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  background: linear-gradient(180deg, #ffffff, #f4f8fd);
  border-bottom: 1px solid rgba(21, 101, 192, 0.12);
  box-shadow: 0 2px 10px rgba(24, 45, 80, 0.08);
  color: var(--ink);
  user-select: none;
  z-index: 3000;
}

.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  height: 100%;
}

.tb-left {
  padding-left: 12px;
  gap: 8px;
  -webkit-app-region: drag;
}

.tb-logo {
  font-size: 16px;
  filter: drop-shadow(0 1px 4px rgba(21,101,192,.35));
}

.tb-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--gold-300);
}

/* 中间整条为拖拽区 */
.tb-drag {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

.tb-right {
  -webkit-app-region: no-drag;
}

.tb-version {
  font-size: 10px;
  color: var(--ink-mute);
  margin-right: 8px;
}

.tb-btn {
  width: 40px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--ink-soft);
  -webkit-app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease;
}

.tb-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tb-close:hover {
  background: var(--red);
  color: #fff;
}

.tb-btn svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
}
</style>
