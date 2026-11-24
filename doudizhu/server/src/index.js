import { config } from './config/index.js'
import { createApp } from './app.js'
import { store } from './db/store.js'

const { httpServer } = createApp()

httpServer.listen(config.port, config.host, () => {
  console.log('')
  console.log(`  🃏 ${config.name} 服务器已启动`)
  console.log(`  ➜  HTTP   http://localhost:${config.port}`)
  console.log(`  ➜  health http://localhost:${config.port}/health`)
  console.log(`  ➜  API    http://localhost:${config.port}/api`)
  console.log('')
})

function shutdown() {
  store.flush()
  console.log('[server] 数据已落盘，退出')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
