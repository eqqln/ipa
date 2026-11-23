'use strict';
const config = require('../config');
const util = require('./util');

const COOKIE = 'ipa_admin_sess';

/** 签发管理会话 token：payload.signature */
function issueSession(uid) {
  const payload = Buffer.from(JSON.stringify({
    uid,
    exp: Date.now() + config.adminSessionTTL * 1000
  })).toString('base64url');
  const sig = util.hmac(config.sessionSecret, payload);
  return `${payload}.${sig}`;
}

/** 解析并校验会话 token */
function parseSession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!util.timingSafeEqual(sig, util.hmac(config.sessionSecret, payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** 管理端鉴权中间件 */
function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  const sess = parseSession(token);
  if (!sess) {
    return res.status(401).json({ code: 401, msg: '登录已过期，请重新登录' });
  }
  const admin = req.app.locals.store.admins.findById(sess.uid);
  if (!admin) {
    return res.status(401).json({ code: 401, msg: '账号不存在' });
  }
  req.admin = admin;
  next();
}

module.exports = { COOKIE, issueSession, parseSession, requireAdmin };
