'use strict';
const path = require('path');

/**
 * 全局配置。所有敏感项均支持环境变量覆盖，部署时务必修改默认密钥。
 */
const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',

  // 管理端会话签名密钥（部署后必须修改）
  sessionSecret: process.env.SESSION_SECRET || 'change-me-session-secret-2026',

  // 验证请求时间戳容差（秒），用于防重放
  signTolerance: 300,

  // 管理会话有效期（秒），默认 12 小时
  adminSessionTTL: 12 * 3600,

  // 数据存储目录
  dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),

  // 首次启动自动创建的管理员
  defaultAdmin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin123'
  },

  // 设为 1 时首次启动写入演示数据
  seedDemo: process.env.SEED_DEMO === '1'
};

module.exports = config;
