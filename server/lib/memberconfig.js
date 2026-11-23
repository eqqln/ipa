'use strict';
/**
 * 会员等级 / 套餐预设 / 超级功能权益定义。
 * level: 0 普通 1 VIP 2 SVIP 3 超级会员(至尊)
 * 超级功能 = 权限点，会员等级达标即解锁对应 capability。
 */
const LEVELS = [
  { level: 0, name: '普通会员', short: '普通', color: '#64748b', icon: '👤' },
  { level: 1, name: 'VIP 会员', short: 'VIP', color: '#2563eb', icon: '💎' },
  { level: 2, name: 'SVIP 会员', short: 'SVIP', color: '#7c3aed', icon: '👑' },
  { level: 3, name: '超级会员', short: '至尊', color: '#dc2626', icon: '🔥' }
];

/** 超级功能权益点：不同等级解锁不同能力 */
const CAPABILITIES = [
  { key: 'card_gen',      name: '激活码生成',      minLevel: 0, icon: '🎟️', desc: '生成与导出激活码' },
  { key: 'batch_register',name: '批量注册会员',    minLevel: 1, icon: '👥', desc: '一次批量导入会员账号' },
  { key: 'batch_export',  name: '批量导出激活码',  minLevel: 1, icon: '📤', desc: '导出 CSV/TXT 卡密' },
  { key: 'custom_prefix', name: '自定义卡密前缀',  minLevel: 1, icon: '🔤', desc: '自定义卡密前缀与批次' },
  { key: 'api_access',    name: '开放 API 接口',   minLevel: 2, icon: '🔌', desc: '调用对外 API 集成' },
  { key: 'unlimited_dev', name: '无限设备绑定',    minLevel: 2, icon: '📲', desc: '突破设备数上限' },
  { key: 'white_label',   name: '白标定制',        minLevel: 3, icon: '🎨', desc: '自定义品牌与 logo' },
  { key: 'super_panel',   name: '超级数据面板',    minLevel: 3, icon: '📊', desc: '全站数据与会员洞察' },
  { key: 'priority',      name: '优先技术支持',    minLevel: 3, icon: '🚀', desc: '专属客服通道' }
];

/** 默认套餐（首次启动自动写入 plans 集合） */
const DEFAULT_PLANS = [
  { name: '普通会员', level: 0, price: 0,   days: 0,   benefits: '基础激活码生成、设备绑定',   featured: false },
  { name: 'VIP 月卡',  level: 1, price: 30,  days: 30,  benefits: '批量注册、批量导出、自定义前缀', featured: false },
  { name: 'VIP 年卡',  level: 1, price: 288, days: 365, benefits: 'VIP 全部功能，超值年费',    featured: true  },
  { name: 'SVIP 年卡', level: 2, price: 688, days: 365, benefits: '开放API、无限设备、VIP全部',  featured: false },
  { name: '超级至尊',  level: 3, price: 1688,days: 365, benefits: '白标定制、超级面板、优先支持', featured: true  }
];

function levelInfo(level) {
  return LEVELS.find(l => l.level === Number(level)) || LEVELS[0];
}

/** 某等级拥有的能力 */
function capabilitiesOf(level) {
  return CAPABILITIES.filter(c => Number(level) >= c.minLevel);
}

/** 判断是否拥有某能力 */
function hasCapability(level, key) {
  const cap = CAPABILITIES.find(c => c.key === key);
  return cap ? Number(level) >= cap.minLevel : false;
}

module.exports = {
  LEVELS, CAPABILITIES, DEFAULT_PLANS, levelInfo, capabilitiesOf, hasCapability
};
