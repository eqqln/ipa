/**
 * 桌面客户端服务端地址配置
 * - 开发环境：走 Vite 代理（相对路径）
 * - 生产环境（file://）：直连配置的服务器地址
 * 可通过构建时环境变量 VITE_SERVER_URL 覆盖，默认生产域名
 */
export const PROD_SERVER = 'https://game.shengka.net'

// 构建时可用 VITE_SERVER_URL 覆盖默认生产地址
const configured = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_URL) || PROD_SERVER

/** API 基础地址：开发走代理，生产直连服务器 */
export const API_BASE = import.meta.env.PROD ? `${configured}/api` : '/api'

/** Socket 服务地址：开发走代理(undefined)，生产直连服务器 */
export const SOCKET_URL = import.meta.env.PROD ? configured : undefined

export default { API_BASE, SOCKET_URL, PROD_SERVER }
