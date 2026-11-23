'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function now() {
  return Date.now();
}

function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** 生成卡密：ABCDEFGHJKLMNPQRSTUVWXYZ23456789，去掉易混淆的 I/O/0/1 */
function genCardCode(groups = 4, groupLen = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    for (let i = 0; i < groupLen; i++) {
      s += alphabet[crypto.randomInt(alphabet.length)];
    }
    parts.push(s);
  }
  return parts.join('-');
}

function genAppKey() {
  return 'AK_' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function genAppSecret() {
  return crypto.randomBytes(24).toString('hex');
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch (e) {
    return false;
  }
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** 验证请求签名: HMAC(appSecret, app_key|card|udid|timestamp|nonce) */
function signVerify(secret, fields) {
  const { app_key, card, udid, timestamp, nonce } = fields;
  return hmac(secret, [app_key, card, udid, timestamp, nonce].join('|'));
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.connection.remoteAddress || '';
}

module.exports = {
  now, fmtTime, randomToken, genCardCode, genAppKey, genAppSecret,
  hashPassword, verifyPassword, hmac, signVerify, timingSafeEqual, clientIp
};
