'use strict';
const express = require('express');
const router = express.Router();
const config = require('../config');
const util = require('../lib/util');

/** 错误码表（插件端据此弹出对应提示） */
const ERR = {
  OK: 0,
  PARAM: 1001,       // 参数不完整
  SIGN: 1002,        // 签名错误或已过期
  APP: 1003,         // 应用无效
  CARD_NOT_FOUND: 1004,
  CARD_BANNED: 1005,
  CARD_EXPIRED: 1006,
  DEVICE_LIMIT: 1007,
  CARD_APP_MISMATCH: 1008,
  SERVER: 2001
};

// nonce 防重放缓存（进程内，重启即清空，足够抵御简单重放）
const usedNonce = new Map();

function cleanNonce() {
  const t = Date.now();
  for (const [k, exp] of usedNonce) {
    if (exp < t) usedNonce.delete(k);
  }
}
setInterval(cleanNonce, 60 * 1000).unref();

function fail(res, code, msg, extra = {}) {
  return res.json(Object.assign({ code, msg, data: { valid: false } }, extra));
}

function logAction(store, doc) {
  try {
    store.logs.insert(Object.assign({ action: 'verify', result: 'fail' }, doc));
  } catch (e) { /* 日志失败不影响主流程 */ }
}

/** 从请求中提取并校验签名，返回 { app, err } */
function authenticate(req, store) {
  const appKey = req.headers['x-app-key'] || req.body.app_key;
  const timestamp = Number(req.headers['x-timestamp'] || req.body.timestamp);
  const nonce = req.headers['x-nonce'] || req.body.nonce;
  const sign = req.headers['x-sign'] || req.body.sign;

  if (!appKey || !timestamp || !nonce || !sign) {
    return { err: { code: ERR.PARAM, msg: '验证参数不完整' } };
  }

  const app = store.apps.findOne({ app_key: appKey });
  if (!app || app.status !== 'active') {
    return { err: { code: ERR.APP, msg: '应用无效或未启用' } };
  }

  // 时间戳容差（防重放）
  if (Math.abs(Date.now() - timestamp) > config.signTolerance * 1000) {
    return { err: { code: ERR.SIGN, msg: '请求已过期' } };
  }

  // nonce 一次性
  if (usedNonce.has(nonce)) {
    return { err: { code: ERR.SIGN, msg: '重复请求' } };
  }

  const raw = [appKey, String(req.body.card || ''), String(req.body.udid || ''), String(timestamp), String(nonce)].join('|');
  const expected = util.hmac(app.app_secret, raw);
  usedNonce.set(nonce, Date.now() + config.signTolerance * 1000);

  if (!util.timingSafeEqual(sign, expected)) {
    return { err: { code: ERR.SIGN, msg: '签名校验失败' } };
  }

  return { app };
}

/** 校验卡密主体状态，返回 { card, err } */
function checkCard(store, app, cardCode) {
  const card = store.cards.findOne({ code: String(cardCode || '').trim().toUpperCase() });
  if (!card) {
    return { err: { code: ERR.CARD_NOT_FOUND, msg: '激活码不存在' } };
  }
  if (card.app_id !== app.id) {
    return { err: { code: ERR.CARD_APP_MISMATCH, msg: '激活码与当前应用不匹配' } };
  }
  if (card.status === 'banned' || card.status === 'frozen') {
    return { err: { code: ERR.CARD_BANNED, msg: '激活码已被冻结' } };
  }
  if (card.expire_at && card.expire_at < Date.now()) {
    return { err: { code: ERR.CARD_EXPIRED, msg: '激活码已过期' } };
  }
  return { card };
}

/** 最新有效公告 */
function currentAnnouncement(store, appId) {
  const list = store.announcements.find({ app_id: appId, status: 'active' });
  if (!list.length) return null;
  list.sort((a, b) => b.created_at - a.created_at);
  const a = list[0];
  return { title: a.title || '', content: a.content || '', updated_at: a.created_at };
}

/**
 * POST /api/verify —— 激活验证（核心接口）
 * headers: X-App-Key, X-Timestamp, X-Nonce, X-Sign
 * body: card, udid, model, device_name, bundle_id, version, platform
 */
router.post('/verify', (req, res) => {
  const store = req.app.locals.store;
  const { app, err } = authenticate(req, store);
  if (err) {
    logAction(store, { app_key: req.headers['x-app-key'] || '', ip: util.clientIp(req), detail: err.msg });
    return fail(res, err.code, err.msg);
  }

  const cardCode = String(req.body.card || '').trim().toUpperCase();
  const udid = String(req.body.udid || '').trim();
  if (!cardCode || !udid) {
    return fail(res, ERR.PARAM, '缺少激活码或设备标识');
  }

  const checked = checkCard(store, app, cardCode);
  if (checked.err) {
    logAction(store, { app_id: app.id, card: cardCode, udid, ip: util.clientIp(req), detail: checked.err.msg });
    return fail(res, checked.err.code, checked.err.msg);
  }
  const card = checked.card;

  // 设备绑定：UDID 唯一，超出上限则拒绝
  let device = store.devices.findOne({ card_id: card.id, udid });
  if (!device) {
    const used = store.devices.count({ card_id: card.id, status: 'active' });
    if (used >= (card.device_limit || 1)) {
      logAction(store, { app_id: app.id, card: cardCode, udid, ip: util.clientIp(req), detail: '设备数超限' });
      return fail(res, ERR.DEVICE_LIMIT, '激活码设备绑定数已达上限');
    }
    device = store.devices.insert({
      card_id: card.id,
      app_id: app.id,
      udid,
      model: req.body.model || '',
      device_name: req.body.device_name || '',
      bundle_id: req.body.bundle_id || '',
      app_version: req.body.version || '',
      status: 'active',
      last_active: Date.now()
    });
    store.cards.updateById(card.id, { device_count: (card.device_count || 0) + 1, used_at: Date.now() });
  } else {
    if (device.status === 'banned') {
      return fail(res, ERR.CARD_BANNED, '设备已被禁用');
    }
    device = store.devices.updateById(device.id, { last_active: Date.now() });
  }

  logAction(store, {
    app_id: app.id, card_id: card.id, card: cardCode, udid,
    device_id: device.id, ip: util.clientIp(req), result: 'success', detail: '验证通过'
  });

  return res.json({
    code: ERR.OK,
    msg: '验证成功',
    data: {
      valid: true,
      expire_at: card.expire_at || 0,
      device_limit: card.device_limit || 1,
      device_count: store.devices.count({ card_id: card.id, status: 'active' }),
      server_time: Date.now(),
      announcement: currentAnnouncement(store, app.id)
    }
  });
});

/**
 * POST /api/heartbeat —— 心跳保活
 * body: card, udid（同验证接口签名规则）
 */
router.post('/heartbeat', (req, res) => {
  const store = req.app.locals.store;
  const { app, err } = authenticate(req, store);
  if (err) return fail(res, err.code, err.msg);

  const cardCode = String(req.body.card || '').trim().toUpperCase();
  const udid = String(req.body.udid || '').trim();
  const checked = checkCard(store, app, cardCode);
  if (checked.err) return fail(res, checked.err.code, checked.err.msg);

  const device = store.devices.findOne({ card_id: checked.card.id, udid });
  if (device) store.devices.updateById(device.id, { last_active: Date.now() });

  return res.json({
    code: ERR.OK,
    msg: 'ok',
    data: {
      valid: true,
      expire_at: checked.card.expire_at || 0,
      server_time: Date.now(),
      announcement: currentAnnouncement(store, app.id)
    }
  });
});

/**
 * GET /api/announcement?app_key=xxx —— 远程公告（公开读取）
 */
router.get('/announcement', (req, res) => {
  const store = req.app.locals.store;
  const app = store.apps.findOne({ app_key: String(req.query.app_key || '') });
  if (!app) return fail(res, ERR.APP, '应用无效');
  const a = currentAnnouncement(store, app.id);
  return res.json({ code: ERR.OK, msg: 'ok', data: { announcement: a } });
});

router.ERR = ERR;
module.exports = router;
