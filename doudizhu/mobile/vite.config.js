import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '..', 'desktop')
const outDir = path.resolve(here, 'dist')

export default defineConfig({
  root: desktopRoot,
  base: './',
  plugins: [vue()],
  define: {
    __VUE_PROD_DEVTOOLS__: false,
  },
  resolve: {
    alias: {
      '@': path.join(desktopRoot, 'src'),
    },
    // 依赖实际安装在 mobile/node_modules，而构建 root 是 desktop/，
    // 显式声明模块搜索目录，保证 CI 与本地都能解析 vue 等依赖
    modules: [path.resolve(here, 'node_modules'), 'node_modules'],
    dedupe: ['vue', 'vue-router', 'pinia', 'axios', 'socket.io-client', '@capacitor/core'],
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2018',
    chunkSizeWarningLimit: 1500,
  },
})
