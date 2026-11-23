# API 接口文档

Base URL：`http://localhost:8080`（生产为你的 HTTPS 域名）

统一响应格式：
```json
{ "code": 0, "msg": "ok", "data": {} }
```
`code = 0` 为成功，非 0 为失败。

---

## 一、验证接口（插件调用）

### POST /api/verify —— 激活验证
请求头：
| Header | 说明 |
| :--- | :--- |
| X-App-Key | 应用 AppKey |
| X-Timestamp | Unix 秒时间戳（与服务器相差 <300s） |
| X-Nonce | 一次性随机串（防重放） |
| X-Sign | HMAC-SHA256 签名 |

签名原文：`AppKey|激活码|UDID|Timestamp|Nonce`，密钥为 `AppSecret`。

请求体：
```json
{ "card": "VIP-XXXX-XXXX", "udid": "设备标识", "model": "iPhone16,2", "bundle_id": "com.demo.app", "version": "1.0" }
```

成功响应：
```json
{
  "code": 0, "msg": "验证成功",
  "data": {
    "valid": true, "expire_at": 0, "device_limit": 3, "device_count": 1,
    "server_time": 1795419046000,
    "announcement": { "title": "公告标题", "content": "公告内容", "updated_at": 1795419046000 }
  }
}
```

主要错误码：`1001` 参数不完整、`1002` 签名错误/过期/重放、`1003` 应用无效、`1004` 激活码不存在、`1005` 已冻结、`1006` 已过期、`1007` 设备数超限、`1008` 应用不匹配。

### POST /api/heartbeat —— 心跳
同 verify 的签名规则，body：`{ "card", "udid" }`。返回 validity 与公告。

### GET /api/announcement?app_key=xxx —— 公开公告
返回 `{ code:0, data:{ announcement } }`。

---

## 二、管理端接口（需 admin Cookie）

登录：`POST /api/admin/login` `{username,password}` → Set-Cookie。

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | /api/admin/stats | 统计概览 |
| GET/POST | /api/admin/apps | 应用列表/创建 |
| PUT/DELETE | /api/admin/apps/:id | 编辑/删除应用 |
| POST | /api/admin/apps/:id/regenerate | 重置 AppKey/Secret |
| GET | /api/admin/card-types | 卡密类型预设 |
| GET | /api/admin/cards?type=&status=&app_id=&batch=&keyword= | 卡密列表 |
| POST | /api/admin/cards | 生成卡密（支持 type/expire_mode/expire_date/count/prefix/batch 等） |
| PUT/DELETE | /api/admin/cards/:id | 编辑/删除卡密 |
| POST | /api/admin/cards/batch | 批量冻结/解冻/删除 |
| POST | /api/admin/cards/export | 导出 CSV/TXT（body: format, ids 或 filters） |
| GET/DELETE | /api/admin/devices | 设备列表/解绑 |
| GET/POST/PUT/DELETE | /api/admin/announcements | 公告管理 |
| GET | /api/admin/logs | 验证日志 |

---

## 三、会员接口

### 前台（公开 / 会员会话）
| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| POST | /api/member/register | 注册 `{username,password,email,phone}` |
| POST | /api/member/login | 登录 → Set-Cookie（mem session） |
| POST | /api/member/logout | 退出 |
| GET | /api/member/me | 当前会员信息（含等级、权益） |
| GET | /api/member/catalog | 等级/能力/套餐目录 |

### 管理端（需 admin Cookie）
| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| GET | /api/member/admin/list | 会员列表（level/status/keyword 筛选） |
| POST | /api/member/admin/create | 单个创建会员 |
| POST | /api/member/admin/batch | 批量注册（count/prefix/level/days） |
| POST | /api/member/admin/export | 导出会员 CSV/TXT |
| PUT/DELETE | /api/member/admin/:id | 编辑/删除会员 |
| POST | /api/member/admin/batch-action | 批量冻结/解冻/升级/续费/删除 |
| GET | /api/member/admin/stats | 会员统计 |
| GET | /api/member/admin/levels | 等级与能力定义 |
| GET/POST | /api/member/admin/plans | 套餐列表/创建 |
| PUT/DELETE | /api/member/admin/plans/:id | 编辑/删除套餐 |

### 会员等级与权益
- `level`：0 普通 / 1 VIP / 2 SVIP / 3 超级会员
- 能力按 `minLevel` 解锁：激活码生成(0)、批量注册/导出/前缀(1)、开放API/无限设备(2)、白标/超级面板/优先支持(3)

完整请求/响应示例可参照 `server/test/` 下的测试脚本。
