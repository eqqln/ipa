/**
 * 极跃棋牌 · 预加载脚本
 * 通过 contextBridge 向渲染进程暴露受控的桌面能力，不暴露 Node 原语
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // 应用信息
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  platform: process.platform,

  // 用系统默认浏览器打开外部链接
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // 应用退出信号，供渲染层优雅断开 Socket；返回取消订阅函数
  onBeforeQuit: (callback) => {
    const listener = () => {
      if (typeof callback === 'function') callback()
    }
    ipcRenderer.on('app:shutdown', listener)
    return () => ipcRenderer.removeListener('app:shutdown', listener)
  },
})
