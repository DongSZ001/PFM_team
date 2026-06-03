# PFM2 WebUI - 相场模拟智能助手

> **PFM2-Agent** 的 Web 用户界面
> 北京理工大学黄厚兵课题组 · OpenClaw 驱动的相场模拟智能对话系统

[![Status](https://img.shields.io/badge/status-running-brightgreen)](http://47.93.53.231:3000/app/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

---

## 📑 目录

- [项目简介](#-项目简介)
- [核心特性](#-核心特性)
- [架构设计](#-架构设计)
- [目录结构](#-目录结构)
- [快速开始](#-快速开始)
- [功能说明](#-功能说明)
- [REST API 文档](#-rest-api-文档)
- [数据库结构](#-数据库结构)
- [开发与扩展](#-开发与扩展)
- [部署说明](#-部署说明)
- [常见问题](#-常见问题)
- [升级历史](#-升级历史)

---

## 🎯 项目简介

PFM2 WebUI 是 PFM2-Agent 的**网页前端**和**服务端桥接层**，为相场模拟研究者提供：

- 🔐 **用户系统** — 注册/登录、个人会话隔离
- 💬 **多会话聊天** — 每个会话持久保存，跨刷新恢复
- 🤖 **AI 助手** — 通过 OpenClaw Gateway 调用 PFM2-Agent
- 📚 **历史记录** — 所有对话永久保存到 SQLite
- 🌙 **深色模式** — 一键切换，自动记忆偏好
- 🎨 **原生 JavaScript** — 无框架依赖，启动快速

> **访问地址**：[http://47.93.53.231:3000/app/](http://47.93.53.231:3000/app/)

---

## ✨ 核心特性

### 1. 用户系统
- **注册**：邮箱 + 密码 + 单位（可选）
- **登录**：bcrypt 加密校验，Cookie 持久会话
- **会话管理**：HttpOnly Cookie，7 天自动过期

### 2. 聊天持久化
- **多会话**：每个用户可创建无限个独立会话
- **历史消息**：所有用户/AI 消息写入 SQLite
- **会话切换**：侧边栏点击切换，自动加载历史
- **会话管理**：重命名（双击）、删除（×按钮）
- **时间显示**：刚刚 / N分钟前 / N小时前 / 日期

### 3. AI 对接
- **WebSocket 通信**：实时双向流式响应
- **自动会话创建**：每次连接自动创建 OpenClaw session
- **消息自动保存**：收发消息自动写入数据库
- **打字机动画**：AI 思考时显示跳动圆点

### 4. UI/UX
- **深色/浅色主题**：CSS 变量切换，localStorage 记忆
- **响应式设计**：适配桌面/移动端
- **Markdown 渲染**：代码块、粗体、斜体、列表
- **快捷键**：Enter 发送，Shift+Enter 换行

---

## 🏗️ 架构设计

### 数据流

```
┌──────────────────────────────────────────────────────┐
│ Browser (custom-webui/)                              │
│   - js/app.js    前端逻辑                            │
│   - css/styles.css 样式                              │
│   - index.html   入口                                │
└──────────────────┬───────────────────────────────────┘
                   │ HTTP (REST API) + WebSocket
                   ↓
┌──────────────────────────────────────────────────────┐
│ serve.js  (Node.js, port 3000)                       │
│   ┌──────────────────────────────────────────┐      │
│   │ 启动/编排入口                              │      │
│   │  src/server/runtime-routes.js             │      │
│   │  src/server/auth-chat-routes.js           │      │
│   │  src/server/material-routes.js            │      │
│   │  src/server/static-proxy-routes.js        │      │
│   └──────────────────────────────────────────┘      │
│   ┌──────────────────────────────────────────┐      │
│   │ WebSocket 代理                             │      │
│   │  浏览器 ←→ serve.js ←→ OpenClaw Gateway  │      │
│   │           (携带 device identity 认证)     │      │
│   └──────────────────────────────────────────┘      │
└──────────────────┬───────────────────────────────────┘
                   │ SQL
                   ↓
┌──────────────────────────────────────────────────────┐
│ SQLite Database (data/app.db)                        │
│   users / chat_sessions / chat_messages              │
└──────────────────────────────────────────────────────┘
                   │
                   │ WebSocket (with device identity)
                   ↓
┌──────────────────────────────────────────────────────┐
│ OpenClaw Gateway (port 18789)                        │
│   - 设备配对认证 (Ed25519)                          │
│   - operator.admin 权限                             │
│   - 路由到 PFM2-Agent                                │
└──────────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 原因 |
|---|---|
| **device identity 认证** | Gateway 拒绝 `token`/`password` 单独认证（仅 `operator.read`），需要 Ed25519 设备配对签名才能获取 `operator.write` |
| **每个 chat session 配独立 OpenClaw session** | OpenClaw WebSocket 是有状态的单连接，每次切换聊天需新建 session（DB 记录 key 用于审计） |
| **bcrypt 加密** | 不存明文密码，SALT_ROUNDS=12 |
| **SQLite** | 轻量、零配置、适合单机部署 |
| **原生 JS** | 无构建步骤，刷新即更新 |
| **Cookie 而非 Header 鉴权** | 浏览器自动携带，REST 调用无需显式传 token |

---

## 📂 目录结构

> 开发入口提示：修改代码前建议先阅读 [docs/PROJECT_NAVIGATION.md](docs/PROJECT_NAVIGATION.md)，其中记录了当前目录职责、模块边界、常见改动入口和验证基线。
> 后端目录分类：如果要判断 `pf_assistant/` 下哪些是运行入口、业务模块、兼容入口或运行态目录，请查看 [docs/PF_ASSISTANT_DIRECTORY.md](docs/PF_ASSISTANT_DIRECTORY.md)。
> 清理审计记录：已确认删除或待清理资源记录在 [docs/PF_ASSISTANT_CLEANUP_AUDIT.md](docs/PF_ASSISTANT_CLEANUP_AUDIT.md)。

```
pf-assistant-webui/                    (项目根, ~20MB)
│
├── README.md                          本文档
├── docs/history/UPGRADE-v2-user-chat.md 历史升级记录（v2 用户系统 + 聊天持久化）
│
├── domain-assets/                    非运行态领域资源骨架
│   ├── parameters/                     铁磁/铁电/压电/介电参数资源
│   ├── examples/                       示例脚本资源
│   └── scales/                         铁磁/铁电 scale 资源
│
├── custom-webui/                      定制前端 (3个文件, 37KB)
│   ├── index.html                     登录/聊天页面结构
│   ├── css/styles.css                 主题、布局、组件样式
│   ├── js/chat-renderer.js            聊天内容渲染器
│   ├── js/app.js                      前端逻辑 (auth/chat/gateway)
│   └── assets/images/                 首页与 UI 图片资源
│
└── pf_assistant/                      后端服务 (~20MB)
    │
    ├── serve.js                       HTTP/WebSocket 启动与编排入口
    ├── auth.js                        认证/会话 API
    ├── database.js                    SQLite 封装
    ├── schema.sql                     建表 SQL (参考)
    ├── package.json                   依赖声明
    ├── package-lock.json              锁文件
    │
    ├── src/                           后端模块化准备层
    │   ├── config/paths.js            统一路径配置
    │   ├── server/                    Gateway / runtime / HTTP route 模块
    │   │   ├── runtime-routes.js        健康检查与 Gateway 状态 route 分发
    │   │   ├── auth-chat-routes.js      认证与聊天 API route 分发
    │   │   ├── static-proxy-routes.js    静态页面与 bridge proxy route 分发
    │   │   └── material-routes.js       材料参数 HTTP API route 分发与路径清单
    │   └── materials/                 材料领域模块
    │       ├── definitions/           参数定义
    │       ├── converters/            单位换算
    │       ├── resolvers/             参数解析与模拟 profile
    │       └── repositories/          材料参数仓库层；material-parameters-repository.js 为兼容聚合出口
    │           ├── shared.js          仓库共享 DB/helper
    │           ├── material-records.js materials 表访问
    │           ├── source-records.js   sources 表访问
    │           ├── parameter-definition-records.js 参数定义表访问
    │           ├── parameter-set-records.js parameter_sets 表访问
    │           ├── parameter-value-records.js parameter_values 表访问
    │           ├── import-batch-records.js import_batches/import_warnings 表访问
    │           └── material-parameter-queries.js API 查询结果组装
    │
    │   说明：具体 HTTP route 分发位于 src/server/*-routes.js；serve.js 负责注入共享 helper 与启动服务。
    │   说明：material-parameters-repository.js 保留为兼容聚合出口；实际表级 SQL 位于同级 *-records.js 模块。
    │
    ├── scripts/                       导入、seed、派生与 smoke-check 脚本（见 scripts/README.md）
    ├── data/                          SQLite 数据库
    │   └── app.db                     (运行时生成)
    │
    ├── logs/                          运行日志
    │   └── app.log
    │
    ├── nanobot/                       nanobot 静态资源 (fallback)
    │   └── web/dist/                  (Vite 编译产物)
    │
    ├── node_modules/                  第三方依赖
    │   ├── bcrypt                     密码加密
    │   └── better-sqlite3             SQLite 驱动
    │
    └── UPGRADE.md                     v1→v2 升级文档
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **OpenClaw Gateway** 在 127.0.0.1:18789 运行
- **设备已配对**（如未配对，运行 `openclaw-tui` 完成）

### 安装

```bash
# 1. 进入后端目录
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant

# 2. 安装依赖
npm install

# 3. 启动服务
node serve.js
```

### 测试数据库路径

默认数据库仍然是 `pf_assistant/data/app.db`。

仅在测试或隔离开发时，可以设置临时 SQLite 路径：

```bash
PF_ASSISTANT_DB_PATH=/tmp/pfm-material-test.db node --test test/gateway-ui.test.js
```

生产服务不需要设置该变量；systemd 和 `start.sh` 继续使用默认数据库路径。
启动后会看到：

```
[db] Database initialized at: .../data/app.db
[identity] Loaded device identity: 3895db50...
✅ PF_assistant WebUI: http://47.93.53.231:3000
   Custom WebUI: /app/*
   Auth API: /auth/*
   Chat API: /chat/*
   Device Identity: ✅ Loaded
```

### 访问

打开浏览器访问：**`http://47.93.53.231:3000/app/`**

### 默认账户

| 邮箱 | 密码 | 用途 |
|---|---|---|
| `liyuanbo2@bit.edu.cn` | `pfm2test` | 测试账户 |

也可以在前端点击"立即注册"创建新账户。

### 后台运行

```bash
nohup node serve.js > logs/app.log 2>&1 &
```

查看日志：

```bash
tail -f logs/app.log
```

---

## 📖 功能说明

### 1. 用户系统

**注册**
- 邮箱 + 密码 + 单位（可选）
- 密码至少 6 位
- 邮箱唯一约束

**登录**
- 邮箱 + 密码
- 成功后 7 天内免登录（Cookie 持久化）

**登出**
- 点击右上角 🚪 按钮
- 清除服务端 session token

### 2. 会话管理

**新建会话**
- 左侧"+ 新对话"按钮
- 自动在数据库创建记录

**切换会话**
- 左侧列表点击
- 自动加载历史消息

**重命名会话**
- **双击**会话标题
- 输入新名字，Enter 保存

**删除会话**
- 鼠标悬停显示 × 按钮
- 点击确认删除

### 3. AI 对话

**发送消息**
- 在底部输入框输入
- Enter 发送，Shift+Enter 换行

**AI 响应**
- 流式接收（逐步显示）
- 完成后自动保存到数据库
- 打字机动画在响应时显示

**OpenClaw Session 机制**
- 每次 WebSocket 连接创建新的 OpenClaw session
- 切换聊天时**也创建新 session**（OpenClaw session 不能跨连接复用）
- DB 记录 session key 用于审计（当前不用于恢复上下文）

### 4. 主题切换
- 右上角 🌙/☀️ 按钮
- 自动保存到 localStorage
- CSS 变量实现，0 闪烁

---

## 📡 REST API 文档

所有 `/auth/*` 和 `/chat/*` 接口均通过 **Cookie 中的 `session_token`** 认证（`HttpOnly`）。

### 认证接口

#### `POST /auth/register` — 注册

**请求体**
```json
{
  "organization": "北京理工大学",   // 可选
  "email": "user@bit.edu.cn",      // 必填
  "password": "mypassword"          // 必填，至少6位
}
```

**响应 200**
```json
{
  "success": true,
  "user": {
    "id": "mDdehdYBFyWu6tDP",
    "email": "user@bit.edu.cn",
    "organization": "北京理工大学"
  }
}
```

**错误**
- `400` 邮箱已注册 / 参数缺失
- `400` 密码少于 6 位
- `400` 邮箱格式不正确

#### `POST /auth/login` — 登录

**请求体**
```json
{
  "email": "user@bit.edu.cn",
  "password": "mypassword"
}
```

**响应 200** — 同 register，并设置 `Set-Cookie: session_token=...`

#### `GET /auth/me` — 当前用户

**响应 200**
```json
{
  "id": "mDdehdYBFyWu6tDP",
  "email": "user@bit.edu.cn",
  "organization": "北京理工大学"
}
```

#### `POST /auth/logout` — 登出

清空 Cookie 中的 session_token。

### 会话接口

#### `GET /chat/sessions` — 获取所有会话

**响应 200**
```json
[
  {
    "id": "ALsHDRGvTMQwEpke",
    "title": "MUMAX3学习",
    "openclaw_session_key": null,
    "created_at": 1780281705044,
    "updated_at": 1780281712972
  }
]
```

#### `POST /chat/sessions` — 新建会话

**请求体**（可空）
```json
{
  "openclaw_session_key": "agent:main:dashboard:..."   // 可选
}
```

**响应 200**
```json
{
  "session_id": "ALsHDRGvTMQwEpke"
}
```

#### `GET /chat/sessions/:id/messages` — 获取会话消息

**响应 200**
```json
[
  { "role": "user", "content": "你好" },
  { "role": "assistant", "content": "你好！我是 PFM2-Agent..." }
]
```

#### `PATCH /chat/sessions/:id` — 重命名会话

**请求体**
```json
{ "title": "MUMAX3 学习笔记" }
```

#### `DELETE /chat/sessions/:id` — 删除会话

同时删除该会话的所有消息（CASCADE）。

#### `POST /chat/sessions/:id/openclaw-key` — 绑定 OpenClaw session

**请求体**
```json
{
  "session_id": "ALsHDRGvTMQwEpke",
  "openclaw_session_key": "agent:main:dashboard:..."
}
```

#### `POST /chat/save-message` — 保存单条消息

**请求体**
```json
{
  "session_id": "ALsHDRGvTMQwEpke",
  "role": "user",          // 或 "assistant"
  "content": "消息内容"
}
```

**响应 200**
```json
{
  "id": "mAXLz3L7g4f6hNJN",
  "created_at": 1780281712876
}
```

### WebSocket 接口

#### 端点：`ws://47.93.53.231:3000/`

**认证**：serve.js 携带 device identity 与 Gateway 握手，浏览器无需额外认证。

**请求格式**
```json
{
  "type": "req",
  "id": "1",
  "method": "sessions.create",  // 或 "chat.send"
  "params": {}
}
```

**响应格式**（参考 OpenClaw 协议）
```json
// 成功
{
  "type": "res",
  "id": "1",
  "ok": true,
  "payload": { "key": "agent:main:dashboard:..." }
}

// 错误
{
  "type": "res",
  "id": "1",
  "ok": false,
  "error": { "code": "INVALID_REQUEST", "message": "..." }
}

// 流式事件
{
  "type": "event",
  "event": "chat",
  "payload": {
    "state": "final",
    "message": { "role": "assistant", "content": [{"type": "text", "text": "..."}] }
  }
}
```

---

## 🗄️ 数据库结构

SQLite 3 数据库，文件位置：`pf_assistant/data/app.db`

### ER 图

```
users
├── id (TEXT PK)
├── organization (TEXT)
├── email (TEXT UNIQUE)
├── password_hash (TEXT) — bcrypt
└── created_at (INTEGER, ms timestamp)
    ↓
chat_sessions
├── id (TEXT PK)
├── user_id (TEXT FK → users.id)
├── title (TEXT)
├── openclaw_session_key (TEXT, nullable)
├── created_at (INTEGER)
└── updated_at (INTEGER)
    ↓
chat_messages
├── id (TEXT PK)
├── session_id (TEXT FK → chat_sessions.id)
├── role (TEXT: 'user' | 'assistant')
├── content (TEXT)
└── created_at (INTEGER)
```

### 索引

- `idx_users_email` — 加速登录查询
- `idx_sessions_user_id` — 加速按用户过滤
- `idx_messages_session_id` — 加速按会话查询

### 完整 SQL

见 `pf_assistant/schema.sql`。

---

## 🛠️ 开发与扩展

### 添加新 API 端点

在 `auth.js` 的 `route()` 函数中添加：

```javascript
if (pathParts[0] === 'myapi' && method === 'GET') {
  handleMyApi(req, res);
  return true;
}
```

然后实现 handler：

```javascript
function handleMyApi(req, res) {
  if (!requireAuth(req, res)) return;
  // ... 你的逻辑 ...
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ result: 'ok' }));
}
```

### 添加新数据库表

在 `database.js` 的 `initDb()` 中添加：

```javascript
database.exec(`
  CREATE TABLE IF NOT EXISTS my_table (
    id TEXT PRIMARY KEY,
    data TEXT,
    created_at INTEGER NOT NULL
  )
`);

// 添加操作函数
function getMyData(id) {
  const stmt = getDb().prepare('SELECT * FROM my_table WHERE id = ?');
  return stmt.get(id);
}

// 在 module.exports 中导出
module.exports = { ..., getMyData };
```

### 调试技巧

**前端调试**
- 浏览器 Console（F12）查看 `[ws]` `[session]` `[save]` 日志
- Network 标签查看 HTTP 请求

**后端调试**
- 实时日志：`tail -f pf_assistant/logs/app.log`
- 数据库查询：`sqlite3 data/app.db "SELECT * FROM users;"`
- WebSocket 测试：`node -e "..."` （参考历史测试脚本）

**常见 API 测试**

```bash
# 登录
curl -X POST http://47.93.53.231:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"x@y.com","password":"123456"}' \
  -c cookies.txt

# 带 cookie 访问
curl http://47.93.53.231:3000/chat/sessions -b cookies.txt
```

---

## 🚢 部署说明

### 当前部署

- **环境**：Alibaba Cloud ECS (47.93.53.231)
- **系统**：Linux 5.10.134
- **Node.js**：v22.22.2
- **OpenClaw Gateway**：18789 端口（独立进程）
- **Web 服务**：3000 端口

### 开机自启动

仓库内提供了正式 systemd 模板：

```text
deploy/pf-assistant-webui.service
```

该模板通过 `pf_assistant/start.sh` 启动服务，确保 `pf_assistant/start.env` 中的 SMTP、`PUBLIC_ORIGIN`、OpenClaw Gateway token 等运行时配置会被加载。不要把 token 或 SMTP 授权码写进 service 文件。

安装示例：

```bash
sudo cp deploy/pf-assistant-webui.service /etc/systemd/system/pf-assistant-webui.service
sudo systemctl daemon-reload
sudo systemctl enable pf-assistant-webui
sudo systemctl restart pf-assistant-webui
```

运行状态检查：

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/api/gateway-status
systemctl status pf-assistant-webui --no-pager
```

### 反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name pfm2.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;  # WebSocket 长连接
    }
}
```

### HTTPS

使用 Let's Encrypt + Certbot：

```bash
sudo certbot --nginx -d pfm2.example.com
```

### 备份数据库

```bash
# 备份
sqlite3 data/app.db ".backup '/backup/app-$(date +%Y%m%d).db'"

# 恢复
sqlite3 data/app.db ".restore '/backup/app-20260601.db'"
```

---

## ❓ 常见问题

### Q1: 登录后显示"未连接"

**原因**：WebSocket 连接到 Gateway 失败（认证、Gateway 宕机等）

**解决**：
```bash
# 检查 Gateway 状态
ss -tlnp | grep 18789

# 检查 serve.js 日志
tail -f logs/app.log

# 测试 Gateway challenge
timeout 5 node -e "
  const WebSocket = require('/usr/lib/node_modules/openclaw/node_modules/ws');
  const ws = new WebSocket('ws://127.0.0.1:18789/');
  ws.on('message', m => { console.log(m.toString().substring(0, 100)); process.exit(0); });
  setTimeout(() => process.exit(1), 3000);
"
```

### Q2: AI 不回复

**可能原因**：
- `chat.send` 缺少 `idempotencyKey` 字段 → 服务端校验失败
- OpenClaw session 失效 → 重新登录
- 网络中断 → 刷新页面

**解决**：检查 Console（F12）的 `[ws] ← from Gateway` 日志，定位错误。

### Q3: 数据库占用越来越大

清理策略：

```bash
# 删除 30 天前的消息
sqlite3 data/app.db "DELETE FROM chat_messages WHERE created_at < strftime('%s', 'now', '-30 days') * 1000;"

# 压缩
sqlite3 data/app.db "VACUUM;"
```

### Q4: 如何重置数据

```bash
# 停止服务
kill <PID>

# 删除数据库
rm data/app.db

# 重启（自动重建）
node serve.js
```

### Q5: 如何添加新用户

**方法 A**：通过前端注册
**方法 B**：直接 SQL

```bash
# 生成密码哈希
node -e "
  const bcrypt = require('bcrypt');
  console.log(bcrypt.hashSync('mypassword', 12));
"

# 插入用户
sqlite3 data/app.db "
  INSERT INTO users (id, organization, email, password_hash, created_at)
  VALUES ('USR_001', '北京理工', 'new@bit.edu.cn', '上面生成的hash', strftime('%s', 'now') * 1000);
"
```

---

## 📜 升级历史

### v2.0 (2026-06-01) — 用户系统 + 聊天持久化

**新增**：
- 🔐 用户注册/登录（bcrypt 加密）
- 💬 聊天记录永久保存到 SQLite
- 📚 多会话侧边栏管理
- 🗄️ 三表数据库结构（users/chat_sessions/chat_messages）
- 🌐 REST API（`/auth/*` 和 `/chat/*`）
- 📝 详细升级文档 `UPGRADE.md`

**修改**：
- 前端增加登录/注册模态框
- 前端增加会话列表侧边栏
- serve.js 集成 auth + database 模块
- 保留原有 WebSocket Gateway 通信逻辑

**清理**：
- 项目从 ~570MB 缩减到 20MB
- 删除未使用的 webui/、case/、tests/、docs/、.git/ 等

### v1.0 — 初始版本

简单的 WebSocket 聊天界面，单用户、无持久化。

---

## 👥 维护团队

- **董守哲、许可、唐诗雨、李源博** — 系统搭建和维护
- **所属**：北京理工大学黄厚兵课题组
- **研究**：相场模拟（Phase Field Modeling）

---

## 📄 许可证

仅限课题组内部使用。

---

## 🔗 相关链接

- **OpenClaw 文档**：`/usr/lib/node_modules/openclaw/docs`
- **PFM2-Agent 文档**：见 OpenClaw 内部 skill 目录
- **项目目录**：`/home/admin/.openclaw/workspace/pf-assistant-webui`
- **服务地址**：`http://47.93.53.231:3000/app/`
- **升级文档**：`docs/history/UPGRADE-v2-user-chat.md`

---

_最后更新：2026-06-01_
