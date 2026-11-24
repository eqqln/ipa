/**
 * 桌面能力封装
 * 在浏览器中运行时自动降级为 noop，保证同一份代码可被 Vite 预览调试
 */

/** 每次调用时读取，避免 preload 注入时机差异 */
function getAPI() {
  return typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null
}

/** 是否运行在 Electron 桌面客户端中 */
export const isElectron = !!getAPI()

/** 最小化窗口 */
export function minimize() {
  const api = getAPI()
  if (api && typeof api.minimize === 'function') api.minimize()
}

/** 最大化 / 还原窗口 */
export function maximize() {
  const api = getAPI()
  if (api && typeof api.maximize === 'function') return api.maximize()
  return undefined
}

/** 查询当前是否最大化 */
export function isMaximized() {
  const api = getAPI()
  if (api && typeof api.isMaximized === 'function') {
    return Promise.resolve(api.isMaximized())
  }
  return Promise.resolve(false)
}

/** 关闭窗口 */
export function close() {
  const api = getAPI()
  if (api && typeof api.close === 'function') api.close()
}

/** 获取客户端版本号 */
export async function getVersion() {
  const api = getAPI()
  if (!api || typeof api.getVersion !== 'function') return ''
  try {
    return (await api.getVersion()) || ''
  } catch (_) {
    return ''
  }
}

/** 获取运行平台 */
export function getPlatform() {
  const api = getAPI()
  if (api && api.platform) return api.platform
  return typeof navigator !== 'undefined' ? navigator.platform : 'browser'
}

/** 用系统默认浏览器打开外部链接 */
export async function openExternal(url) {
  const api = getAPI()
  if (api && typeof api.openExternal === 'function') return api.openExternal(url)
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
  return false
}

/** 监听应用退出信号，返回取消订阅函数 */
export function onBeforeQuit(callback) {
  const api = getAPI()
  if (api && typeof api.onBeforeQuit === 'function') return api.onBeforeQuit(callback)
  return () => {}
}

export default {
  isElectron,
  minimize,
  maximize,
  isMaximized,
  close,
  getVersion,
  getPlatform,
  openExternal,
  onBeforeQuit,
}
