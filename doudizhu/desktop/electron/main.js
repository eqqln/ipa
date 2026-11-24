/**
 * 极跃棋牌 · Electron 主进程
 * 负责：窗口管理、自定义标题栏 IPC、托盘、单例锁、生命周期、优雅断开 Socket
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const rootDir = path.join(__dirname, '..')
const DEV_URL = 'http://localhost:5175'

/**
 * 判断是否为开发模式：
 * - 开发：npm run dev，未打包且无 PRODUCTION 标记 → 加载 dev server
 * - 手动绿色版：未打包但有 PRODUCTION 标记 → 加载本地页面
 * - electron-builder 正式包：app.isPackaged=true → 加载本地页面
 */
const hasProdMarker = fs.existsSync(path.join(__dirname, 'PRODUCTION'))
const isDev = !app.isPackaged && !hasProdMarker

/** 解析本地入口页面，兼容多种目录布局 */
function resolveEntry() {
  const candidates = [
    path.join(__dirname, 'index.html'),          // main.js 与 dist 同级
    path.join(__dirname, 'dist', 'index.html'),  // electron/dist 布局
    path.join(rootDir, 'index.html'),            // 手动绿色版：dist 内容复制到 app 根
    path.join(rootDir, 'dist', 'index.html'),    // electron-builder 项目 dist 布局
  ]
  for (const file of candidates) {
    try { if (fs.existsSync(file)) return file } catch (_) { /* ignore */ }
  }
  return null
}
const localEntry = resolveEntry()

// 16x16 绿色 PNG，作为托盘图标兜底，避免依赖外部文件导致路径问题
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGNQror4TwlmGDVg1IBRA4aLAQCmevQQNN/xxQAAAABJRU5ErkJggg=='

let mainWindow = null
let tray = null

/** 解析窗口图标：优先 build/icon.ico，其次 electron/tray.png，缺失则用默认 */
function resolveIcon() {
  const candidates = [
    path.join(rootDir, 'build', 'icon.ico'),
    path.join(rootDir, 'electron', 'tray.png'),
  ]
  for (const file of candidates) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 0) return file
    } catch (_) {
      /* 忽略不可读文件 */
    }
  }
  return undefined
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: false, // 关闭原生边框，使用自定义标题栏
    show: false,
    title: '极跃棋牌',
    backgroundColor: '#061a14',
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要完整 Node 能力，页面仍由 contextIsolation 隔离
      spellcheck: false,
    },
  })

  // 无原生菜单栏
  Menu.setApplicationMenu(null)

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    // 生产环境加载本地入口；兼容 electron-builder 与手动绿色版目录布局
    if (!localEntry) {
      throw new Error('未找到生产环境入口 index.html，请检查 dist 是否已构建并复制')
    }
    mainWindow.loadFile(localEntry)
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 关闭前通知渲染层优雅断开 Socket（渲染层另有 beforeunload 兜底）
  mainWindow.on('close', () => {
    try {
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('app:shutdown')
      }
    } catch (_) {
      /* 忽略 */
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

function createTray() {
  try {
    const iconPath = path.join(rootDir, 'electron', 'tray.png')
    let icon
    if (fs.existsSync(iconPath) && fs.statSync(iconPath).size > 0) {
      icon = nativeImage.createFromPath(iconPath)
    } else {
      icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
    }
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('极跃棋牌')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => {
            if (!mainWindow) createWindow()
            else {
              mainWindow.show()
              mainWindow.focus()
            }
          },
        },
        { label: '重新加载', click: () => mainWindow && !mainWindow.isDestroyed() && mainWindow.reload() },
        { type: 'separator' },
        { label: '退出极跃棋牌', click: () => app.quit() },
      ]),
    )
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (err) {
    // 托盘失败不影响主程序
    console.warn('[tray] 创建托盘失败:', err && err.message)
  }
}

/* ---------------- IPC：自定义标题栏窗口控制 ---------------- */
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.handle('window:isMaximized', () => (mainWindow ? mainWindow.isMaximized() : false))

ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
  await shell.openExternal(url)
  return true
})

/* ---------------- 单例锁 ---------------- */
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    createTray()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('before-quit', () => {
    try {
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('app:shutdown')
      }
    } catch (_) {
      /* 忽略 */
    }
  })
}
