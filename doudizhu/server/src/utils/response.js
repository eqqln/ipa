/**
 * 统一 API 响应格式
 * { code: 0 成功 / 非0 失败, message, data }
 */
export function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data })
}

export function fail(res, message = '请求失败', code = 400, data = null) {
  return res.status(code >= 400 && code < 600 ? code : 400).json({ code, message, data })
}

export function unauthorized(res, message = '登录已失效，请重新登录') {
  return res.status(401).json({ code: 401, message, data: null })
}

export function forbidden(res, message = '没有权限执行此操作') {
  return res.status(403).json({ code: 403, message, data: null })
}

/** 异步路由错误捕获 */
export function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

/** 简化路由包装：业务异常统一转成 { code, message } */
export function route(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next)
    } catch (err) {
      fail(res, err?.message || '服务器内部错误', 400)
    }
  }
}
