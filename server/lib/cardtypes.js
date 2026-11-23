'use strict';
/**
 * 卡密类型预设。后端生成卡密时按 type 自动计算有效期，
 * 前端通过 /api/admin/card-types 拉取同一份定义，保持两边一致。
 */
const CARD_TYPES = [
  { key: 'permanent', name: '永久卡',   days: 0,   device_limit: 1,  color: '#7c3aed', desc: '永不过期，适合买断用户' },
  { key: 'yearly',    name: '年卡',     days: 365, device_limit: 3,  color: '#2563eb', desc: '有效期 365 天' },
  { key: 'quarterly', name: '季卡',     days: 90,  device_limit: 3,  color: '#0891b2', desc: '有效期 90 天' },
  { key: 'monthly',   name: '月卡',     days: 30,  device_limit: 2,  color: '#16a34a', desc: '有效期 30 天' },
  { key: 'weekly',    name: '周卡',     days: 7,   device_limit: 1,  color: '#ca8a04', desc: '有效期 7 天' },
  { key: 'trial',     name: '试用卡',   days: 3,   device_limit: 1,  color: '#ea580c', desc: '有效期 3 天，拉新试用' },
  { key: 'custom',    name: '自定义',   days: 0,   device_limit: 1,  color: '#64748b', desc: '手动指定到期年月日或天数' }
];

/** 到期方式：按天数 / 指定日期 / 永久 */
const EXPIRE_MODES = [
  { key: 'days',   name: '按有效天数' },
  { key: 'date',   name: '指定到期日期（年月日时分）' },
  { key: 'forever', name: '永久有效' }
];

function getType(key) {
  return CARD_TYPES.find(t => t.key === key) || CARD_TYPES[0];
}

module.exports = { CARD_TYPES, EXPIRE_MODES, getType };
