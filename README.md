# iOS 网络验证 / 卡密激活 / 会员授权系统

一套完整的 `IPA 插件注入 + 网络验证授权 + 会员注册管理` 解决方案。上传 IPA 到管理端，自动注入授权插件并内置密钥，用户通过激活码激活后即可使用；配套远程公告、卡密冻结、会员套餐与超级功能权益体系。

---

## 一、系统组成

| 模块 | 目录 | 作用 |
| :--- | :--- | :--- |
| 验证服务端 + 管理后台 | `server/` | Node.js 后端、卡密/设备/公告/会员 API、Web 管理端 |
| **授权壳 App** | `shell-app/` | iOS 端 App：用户在手机里选 IPA → 本地注入授权插件 → 自动签名 → 一键安装 |
| **自动编译配置** | `.github/workflows/` | 上传 GitHub 后云端 macOS 自动编译壳 IPA，无需自有 Mac |
| IPA 注入工具 | `ipa-injector/` | Python：服务端注入引擎（命令行批量路径） |
| 插件源码 | `tweak/` | dylib：激活校验、设备绑定、公告弹窗、心跳 |
| 文档 | `docs/` | 部署、API、插件集成、**壳 App 使用说明** |

> 🔑 **两种使用形态**：① **壳 App 形态（主推）**：客户在手机上的壳 App 里给 IPA 加壳 → 自动签名安装 → 输激活码，全程不碰证书，见 `docs/壳App使用说明.md`；② **服务端命令行**：作者用 `ipa-injector/` 批量注入后分发。

---

## 二、快速启动

```bash
# 1. 进入服务端
cd server

# 2. 安装依赖（纯 JS，无原生编译）
npm install

# 3. 启动（首次会自动创建管理员 admin/admin123 和 5 个默认会员套餐）
node app.js

# 打开管理后台
浏览器访问 http://localhost:8080/
```

- 管理后台：`http://localhost:8080/`
- 会员中心（前台）：`http://localhost:8080/member.html`
- 健康检查：`http://localhost:8080/health`
- 验证接口：`POST http://localhost:8080/api/verify`

生产部署务必修改密钥与管理员密码：
```bash
SESSION_SECRET=你的随机密钥 ADMIN_USER=admin ADMIN_PASS=强密码 node app.js
```

---

## 三、完整使用流程（IPA 自动套授权插件）

**1）创建应用**：管理后台 → 应用管理 → 新建，得到 `AppKey` 和 `AppSecret`。

**2）生成激活码**：卡密管理 → 选择类型（永久/年/季/月/周/试用/自定义）→ 设置数量、到期方式（按天数 / 指定年月日时分 / 永久）、设备上限、前缀、批次 → 生成并可批量导出 CSV/TXT。

**3）编译插件 dylib**：见 `tweak/README.md`，用 Theos 编译 `VerifyPlugin.dylib`。

**4）注入 IPA**：
```bash
cd ipa-injector
python inject.py \
  --ipa 原始.ipa \
  --dylib VerifyPlugin.dylib \
  --app-key AK_你的AppKey \
  --app-secret 你的AppSecret \
  --server https://你的服务器 \
  --output 成品.ipa
```
工具会自动：写入 `IPAVerifyConfig.plist` → 注入 `LC_LOAD_DYLIB` → 打包。macOS 上可加 `--identity "证书名"` 直接重签名。

**5）用户使用**：安装成品 IPA → 打开 App → 输入激活码 → 验证通过放行 → 同时使用远程公告弹窗、心跳保活、设备绑定。

---

## 四、核心功能清单

### 验证系统
- ✅ 卡密 / 激活码网络验证，HMAC-SHA256 签名 + 时间戳 + nonce 三重防伪造/防重放
- ✅ 设备 UDID 绑定、设备数上限、冻结卡密、过期卡密
- ✅ 远程公告：后台发布，客户端验证成功即弹窗，按版本去重
- ✅ 心跳保活、验证日志、多应用隔离

### 卡密系统（增强）
- ✅ 7 种卡密类型预设：永久 / 年 / 季 / 月 / 周 / 试用 / 自定义
- ✅ 到期方式：按天数、指定年月日时分、永久
- ✅ 批量生成（1-1000）、自定义前缀、批次号、售价、备注
- ✅ 批量冻结/解冻/删除、按类型/状态/应用/批次筛选
- ✅ 批量导出 CSV（Excel）/ TXT

### 会员系统（超级功能）
- ✅ 会员注册 / 登录（前台 `member.html`）、会话管理
- ✅ 四级体系：普通 / VIP / SVIP / 超级会员
- ✅ 9 项超级功能权益，按等级逐级解锁：批量注册、批量导出、开放 API、无限设备、白标定制、超级数据面板、优先支持等
- ✅ 批量注册会员（含随机密码）、批量导出账号密码
- ✅ 会员套餐管理（价格、时长、权益、推荐标记）、批量升降级/续费/冻结/删除
- ✅ 会员维度统计（总数、等级分布、营收）

---

## 五、测试

```bash
cd server
node test/smoke.js          # 验证主链路：登录→签名验证→防重放→心跳→公告
node test/cards_enhanced.js # 卡密：类型生成→年月日到期→筛选→导出
node test/members.js        # 会员：注册→批量注册→升级权益→统计→导出
cd ../ipa-injector
python test_inject.py       # IPA 注入引擎：Mach-O 注入→配置→打包
```

---

## 六、技术栈与目录树

```
ipachajian/
├── README.md
├── server/
│   ├── app.js               # 入口
│   ├── config.js            # 配置
│   ├── lib/
│   │   ├── store.js         # JSON 数据存储（原子落盘）
│   │   ├── util.js          # 卡密/签名/哈希工具
│   │   ├── auth.js          # 管理端鉴权
│   │   ├── cardtypes.js     # 卡密类型预设
│   │   └── memberconfig.js  # 会员等级/权益预设
│   ├── routes/
│   │   ├── verify.js        # 验证 API
│   │   ├── admin.js         # 管理 API
│   │   └── members.js       # 会员 API
│   ├── public/
│   │   ├── index.html       # 管理后台 SPA
│   │   ├── member.html      # 会员中心
│   │   ├── app.js / style.css
│   ├── data/                # 运行时数据（JSON）
│   └── test/                # 端到端测试
├── ipa-injector/
│   ├── inject.py            # 注入引擎
│   ├── test_inject.py
│   └── README.md
├── tweak/
│   ├── VerifyPlugin.m       # dylib 源码
│   ├── Makefile / control
│   └── README.md
└── docs/
```
