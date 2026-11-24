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
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2018',
    chunkSizeWarningLimit: 1500,
  },
})
