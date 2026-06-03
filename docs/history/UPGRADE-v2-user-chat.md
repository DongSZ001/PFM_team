# PFM2 WebUI 升级文档

> 当前状态：本文是历史升级记录，主要记录 v2.0 用户系统与聊天持久化改造。项目目录和模块边界已在后续迭代中调整；新开发请优先阅读根目录 README.md 和 ../PROJECT_NAVIGATION.md。

## 版本：v2.0 — 用户系统 + 聊天记录持久化

---

## 一、项目目录结构

```
pf-assistant-webui/
├── custom-webui/                 ← 定制前端（本次修改）
│   ├── index.html    (112行)     ← 登录注册弹窗 + 会话列表侧边栏
│   ├── styles.css   (649行)     ← 新增 auth/session 相关样式
│   └── app.js       (767行)     ← 全部前端逻辑重写
│
├── pf_assistant/                 ← 后端服务
│   ├── serve.js      (11492字节) ← 新增 /auth/* /chat/* REST API 路由
│   ├── database.js   (7437字节)  ← 新增：SQLite + 用户/会话/消息操作
│   ├── auth.js       (13042字节) ← 新增：认证中间件 + REST API 处理器
│   ├── schema.sql    (新增)     ← 建表 SQL（参考）
│   └── data/                      ← SQLite 数据库文件（自动创建）
│       └── app.db                ← 实际数据库（运行时生成）
│
└── bridge/                        ← Bridge 服务（不受影响）
```

---

## 二、数据库设计

### 数据表

**users（用户表）**
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 用户 ID（16位随机字符串） |
| organization | TEXT | 单位 |
| email | TEXT UNIQUE | 邮箱（唯一索引） |
| password_hash | TEXT | bcrypt 加密后的密码 |
| created_at | INTEGER | 创建时间（毫秒时间戳） |

**chat_sessions（会话表）**
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 会话 ID（16位随机字符串） |
| user_id | TEXT FK | 所属用户 ID |
| title | TEXT | 会话标题（默认"新对话"） |
| openclaw_session_key | TEXT | OpenClaw Session Key（用于恢复） |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 最后更新时间 |

**chat_messages（消息表）**
| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PRIMARY KEY | 消息 ID |
| session_id | TEXT FK | 所属会话 ID |
| role | TEXT | 角色：user / assistant |
| content | TEXT | 消息内容 |
| created_at | INTEGER | 创建时间 |

---

## 三、REST API 清单

所有接口均需通过 Cookie 中的 `session_token` 认证。

### 认证接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录 |
| GET | `/auth/me` | 获取当前用户信息 |
| POST | `/auth/logout` | 登出 |

### 会话接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/chat/sessions` | 获取当前用户所有会话列表 |
| POST | `/chat/sessions` | 创建新会话 |
| GET | `/chat/sessions/:id/messages` | 获取指定会话的全部消息 |
| PATCH | `/chat/sessions/:id` | 更新会话标题 |
| DELETE | `/chat/sessions/:id` | 删除会话 |
| POST | `/chat/sessions/:id/openclaw-key` | 绑定 OpenClaw Session Key |
| POST | `/chat/save-message` | 保存单条消息 |

---

## 四、关键设计决策

### 1. OpenClaw Session Key 恢复机制

用户在数据库中保存 `openclaw_session_key`，登录后：
1. 加载会话列表，获取各会话的 `openclaw_session_key`
2. 切换到某会话时，自动用该 key 恢复 OpenClaw 会话
3. 若无 key，则创建新 OpenClaw 会话

### 2. 消息保存时机

- **用户发消息**：先显示到界面 → 同时写入数据库
- **AI 回消息**：收到 `chat.state=final` 时 → 显示并保存

### 3. 密码安全

- bcrypt 加密（SALT_ROUNDS = 12）
- 不保存明文密码
- 会话 Token 为 64位随机十六进制字符串
- 会话 7 天过期

### 4. SQL 注入防护

全部使用 `better-sqlite3` 的参数化查询：
```javascript
const stmt = database.prepare('SELECT * FROM users WHERE email = ?');
const user = stmt.get(email);
```

---

## 五、serve.js 改动说明

### 新增导入
```javascript
const db = require('./database');
const { handleAuthRoute } = require('./auth');
db.initDb(); // 启动时初始化数据库
```

### 新增 HTTP 路由
```javascript
// 所有 /auth/* 和 /chat/* 请求由 auth.js 处理
if (urlPath.startsWith('/auth/') || urlPath.startsWith('/chat/')) {
  handleAuthRoute(req, res);
  return;
}
```

### CORS 配置
```javascript
res.setHeader('Access-Control-Allow-Origin', 'http://47.93.53.231:3000');
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

### 保持不变的内容
- WebSocket Gateway 通信链路完全未修改
- 所有 nanobot / bridge 代理逻辑不变
- 静态文件服务不变

---

## 六、前端改动说明

### index.html 改动
- 新增登录/注册表单（`loginForm`）
- 新增组织机构输入框（`orgGroup`，注册时显示）
- 侧边栏（`sidebar`）默认 `display:none`，登录后显示
- 退出按钮（`logoutBtn`）
- 错误提示区（`authError`）
- 登录/注册切换链接（`switchAuthMode`）

### styles.css 改动
新增以下样式（追加到文件末尾）：
- `.auth-switch` — 登录/注册切换链接
- `.form-error` — 错误提示文字（红色）
- `.session-item` — 会话列表项
- `.session-item-delete` — 删除会话按钮
- `.session-time` — 会话时间戳
- `.session-item-title-input` — 内联重命名输入框

### app.js 改动（完全重写）
**新增功能：**
- `checkAuth()` — 启动时检查登录状态
- `handleAuthSubmit()` — 处理登录/注册
- `loadChatSessions()` — 加载会话列表
- `renderSessionList()` — 渲染会话列表（含删除按钮）
- `switchToSession()` — 切换会话，加载历史消息
- `createNewChat()` — 新建聊天会话
- `recoverSession()` — 恢复最近会话
- `saveMessage()` — 消息持久化（含队列机制）
- `bindOpenClawSession()` — 绑定 OpenClaw Session Key
- `handleLogout()` — 登出

**保持不变：**
- `connectGateway()` / `handleMessage()` — Gateway 通信
- `sendMessage()` — 发送消息（仅新增 saveMessage 调用）
- `displayMessage()` / `formatContent()` — 渲染逻辑

---

## 七、启动与部署

### 依赖安装（已完成）
```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant
npm install better-sqlite3 bcrypt
```

### 启动
```bash
node serve.js
# 或后台运行
nohup node serve.js > logs/app.log 2>&1 &
```

### 访问地址
- 定制前端：`http://47.93.53.231:3000/app/`
- 控制台：`http://47.93.53.231:3000/control/`

### 数据库文件
自动创建于：`pf_assistant/data/app.db`

---

## 八、文件差异总结

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `custom-webui/index.html` | 重写 | 新增登录注册表单 |
| `custom-webui/styles.css` | 追加 | 新增 auth/session 样式 |
| `custom-webui/app.js` | 重写 | 集成用户系统 + 持久化 |
| `pf_assistant/serve.js` | 修改 | 新增 REST API 路由 |
| `pf_assistant/database.js` | 新增 | SQLite 操作封装 |
| `pf_assistant/auth.js` | 新增 | 认证 API + 中间件 |
| `pf_assistant/schema.sql` | 新增 | 建表 SQL（参考） |
| `pf_assistant/package.json` | 修改 | 添加 bcrypt/better-sqlite3 |

---

## 九、注意事项

1. **Cookie vs Header Token**：API 认证使用 Cookie（`session_token`），WebSocket 认证使用 URL 参数
2. **Session Key 绑定时机**：在 `hello-ok` 握手完成后，根据当前 chatSessionId 决定是否绑定
3. **消息保存队列**：防止高频保存造成数据库压力，使用队列串行处理
4. **CORS**：当前允许 `http://47.93.53.231:3000`，如更换域名需同步修改
5. **原 nanobot 兼容**：`/webui/*` 路径仍代理到 bridge (port 8765)，完全不受影响
