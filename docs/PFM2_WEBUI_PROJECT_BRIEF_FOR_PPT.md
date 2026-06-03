# PFM2 WebUI Project Brief for PPT / ChatGPT

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## 使用说明

本文用于复制给 ChatGPT、PPT 生成工具或汇报材料生成工具。内容基于当前项目目录、README、docs、源码、数据库 schema、脚本和 worklog 自动梳理。

整理时忽略运行日志、缓存、node_modules 内容、SQLite 运行数据和无关临时文件。

---

## 1. 项目总体介绍

### 项目名称

PFM² 相场模拟智能助手 / PFM2 WebUI

### 项目背景

PFM2 WebUI 是面向相场模拟和材料模拟研究的网页交互系统。项目将 Web 前端、用户系统、聊天持久化、材料参数数据库和 OpenClaw Gateway 调用能力整合在一起，帮助研究者通过网页方式完成模型咨询、参数建议、代码辅助、结果解释和材料参数查询。

传统相场模拟工作通常存在以下问题：

- 材料参数分散在论文、表格和历史脚本中；
- 单位换算和模拟参数准备容易出错；
- 用户需要手工编写或修改模拟脚本；
- 模拟结果解释依赖大量经验；
- 多轮对话、历史记录和参数来源不易追踪。

本项目试图把这些流程整合为一个可登录、可追踪、可扩展的科研 Web 工作台。

### 项目目标

- 提供美观、可用的网页登录和聊天入口。
- 将用户问题发送到 OpenClaw / PFM2-Agent 处理并返回答案。
- 持久化用户、会话和聊天历史。
- 建立材料参数数据库，支持材料、文献、参数集和参数值管理。
- 支持材料参数导入、单位换算、参数解析和模拟 profile 校验。
- 为后续铁磁、铁电、压电、介电等模拟模块扩展打基础。

### 核心方向

- 科研 WebUI
- OpenClaw Gateway 桥接
- 相场模拟智能助手
- 材料参数数据库
- 参数解析与单位换算
- 可维护模块化后端
- 可追踪 worklog 迭代记录

---

## 2. 项目架构

### 总体分层

| 层级 | 路径 | 作用 |
|---|---|---|
| 前端页面 | `custom-webui/` | 登录封面、认证弹窗、聊天界面、Markdown/表格渲染 |
| 服务入口 | `pf_assistant/serve.js` | HTTP 服务、WebSocket 桥接、启动编排、共享 helper 注入 |
| HTTP 路由模块 | `pf_assistant/src/server/` | runtime、auth/chat、material、static/proxy route 分发 |
| 材料领域模块 | `pf_assistant/src/materials/` | 参数定义、单位换算、参数解析、材料仓库 |
| 数据库 | `pf_assistant/data/app.db` | SQLite 运行数据库 |
| 脚本工具 | `pf_assistant/scripts/` | Excel 导入、seed、派生计算、smoke-check |
| 文档导航 | `docs/` | 项目导航、目录分类、清理审计、历史升级记录 |
| 迭代记录 | `worklog/` | 每轮修改记录和主题索引 |

### 架构图建议

```text
Browser / custom-webui
        |
        | HTTP REST + WebSocket
        v
pf_assistant/serve.js
        |
        +--> src/server/runtime-routes.js
        +--> src/server/auth-chat-routes.js
        +--> src/server/material-routes.js
        +--> src/server/static-proxy-routes.js
        |
        +--> SQLite app.db
        |
        +--> OpenClaw Gateway :18789
                    |
                    v
              PFM2-Agent / OpenClaw
```

### 模块关系

| 模块 | 依赖/交互对象 | 说明 |
|---|---|---|
| `custom-webui/js/app.js` | REST API、WebSocket | 控制登录、注册、会话、消息发送、Gateway 状态 |
| `custom-webui/js/chat-renderer.js` | 聊天消息内容 | 渲染 Markdown、参数表、warning、代码块 |
| `serve.js` | `src/server/*`、OpenClaw Gateway、SQLite | 作为启动与编排入口，不承载具体业务 route |
| `auth-chat-routes.js` | `auth.js` | 认证与聊天 API route 委托 |
| `material-routes.js` | `src/materials/*` | 材料 API 和参数解析 API |
| `runtime-routes.js` | `runtime-status.js` | 健康检查和 Gateway 状态 |
| `static-proxy-routes.js` | custom UI / control UI / bridge proxy | 静态页面和 bridge proxy 分发 |
| `src/materials/repositories/*` | SQLite | 材料参数表级访问 |
| `scripts/*` | SQLite、repositories | 导入、seed、派生和 smoke-check |

---

## 3. 项目流程

### 3.1 用户登录与聊天流程

输入：用户邮箱、密码、聊天问题。  
输出：登录态、聊天会话、OpenClaw 返回的助手回复、持久化聊天记录。

```text
访问 /app
 -> 未登录显示科技封面
 -> 用户点击登录/注册
 -> 调用 /api/auth/login 或 /api/auth/register
 -> 写入或读取 users 表
 -> 设置 HttpOnly session cookie
 -> 进入主聊天界面
 -> 加载 /chat/sessions
 -> 创建或恢复 chat session
 -> 建立 WebSocket 到 serve.js
 -> serve.js 连接 OpenClaw Gateway
 -> sessions.create 获取 OpenClaw session key
 -> chat.send 发送用户问题
 -> 接收 assistant response
 -> 渲染为 Markdown/表格/代码块
 -> 保存 chat_messages
```

### 3.2 OpenClaw Gateway 通信流程

输入：用户消息、当前 WebUI chat session、OpenClaw session key。  
输出：assistant 回复或 Gateway 状态错误。

```text
前端 connectGateway()
 -> WebSocket ws://host/
 -> serve.js 与 OpenClaw Gateway 握手
 -> hello-ok
 -> sessions.create
 -> bind openclaw_session_key 到 chat_sessions
 -> chat.send
 -> 接收 streaming/final response
 -> 前端显示并保存消息
```

### 3.3 材料参数导入流程

输入：Excel 参数表或 seed 脚本内置数据。  
输出：材料、来源、参数集、参数值、导入 warning。

```text
Excel / seed script
 -> import-magnetic-parameters.js 或 seed-*.js
 -> unit-converter 转换 SI 单位
 -> upsert materials
 -> upsert sources
 -> upsert parameter_sets
 -> write parameter_values
 -> record import_batches
 -> record import_warnings
 -> 生成 import report
```

### 3.4 参数解析与模拟 readiness 流程

输入：parameterSetId、simulationType、targetEngine。  
输出：解析后的 SI 参数、missing 参数、warning、profile 信息。

```text
POST /api/resolve-parameters
 -> material-routes.js
 -> resolver.resolveParameterSet()
 -> 读取 parameter set detail
 -> 按 simulation profile 检查 required/recommended 参数
 -> 输出 resolvedParameters / missingParameters / warnings
```

### 3.5 前端回答渲染流程

输入：OpenClaw / assistant 返回文本。  
输出：结构化科研回答视图。

```text
assistant text
 -> chat-renderer.formatContent()
 -> HTML escape
 -> Markdown headings/lists/paragraphs
 -> Markdown tables
 -> 参数表识别
 -> warning box / unit conversion box
 -> code block + copy button
 -> 插入聊天消息 DOM
```

---

## 4. 项目特点或优势

### 功能优势

- 支持用户注册、登录、退出、密码重置。
- 支持多会话聊天和历史记录持久化。
- 支持 OpenClaw Gateway 实时通信。
- 支持材料参数数据库和参数集查询。
- 支持 Excel 参数导入、单位换算、导入 warning 记录。
- 支持模拟 profile 参数检查。
- 支持 Markdown、参数表、代码块等科研输出格式。

### 技术优势

- 原生 JavaScript 前端，无复杂构建依赖。
- Node.js 单服务承载 HTTP + WebSocket 桥接。
- SQLite 轻量持久化，适合单机部署。
- 后端 route 已模块化，`serve.js` 仅作为启动编排入口。
- 材料领域模块拆分清晰：definitions / converters / resolvers / repositories。
- 有系统化 worklog 和文档导航，方便持续迭代。

### 可靠性优势

- `/health` 运行健康检查。
- `/api/gateway-status` Gateway 状态检查。
- `smoke-check-webui.js` 可检查部署后 HTTP/WebSocket/Gateway 流程。
- 测试覆盖路由契约、兼容 facade、渲染器、材料仓库、文档结构。

---

## 5. 数据库信息

### 数据库类型

SQLite 3

### 数据库驱动

`better-sqlite3`

### 数据库位置

`pf_assistant/data/app.db`

### Schema 参考文件

`pf_assistant/schema.sql`

### 数据库用途

- 保存用户账号和登录状态相关数据。
- 保存密码重置 token hash。
- 保存聊天会话和聊天消息。
- 保存材料参数数据库。
- 保存 Excel 导入批次和导入 warning。

### 关键表

| 表 | 用途 |
|---|---|
| `users` | 用户账号、机构信息、邮箱分类、状态、登录时间 |
| `password_reset_tokens` | 密码重置 token hash、过期时间、使用状态 |
| `chat_sessions` | 用户聊天会话、标题、OpenClaw session key |
| `chat_messages` | 聊天消息内容、角色、时间 |
| `materials` | 材料或材料结构 |
| `sources` | 文献来源、作者、期刊、年份、DOI |
| `parameter_sets` | 某材料的一组参数集合 |
| `parameter_definitions` | 参数定义、类别、默认单位、说明 |
| `parameter_values` | 参数值、范围、文本值、SI 值、导入 warning |
| `import_batches` | 每次导入任务记录 |
| `import_warnings` | 导入时的逐行/逐列 warning |

### 数据库关系图建议

```text
users
  └── chat_sessions
        └── chat_messages

materials
  └── parameter_sets
        ├── parameter_values
        └── sources

import_batches
  └── import_warnings
```

---

## 6. 配置文件、参数说明及依赖

### 主要配置文件

| 文件 | 用途 |
|---|---|
| `pf_assistant/start.env.example` | SMTP、PUBLIC_ORIGIN、OpenClaw token 示例 |
| `pf_assistant/start.env` | 本机运行密钥和真实配置，不应提交 |
| `deploy/pf-assistant-webui.service` | systemd 服务配置 |
| `pf_assistant/package.json` | Node 依赖声明 |
| `pf_assistant/package-lock.json` | 依赖锁定文件 |
| `pf_assistant/src/config/paths.js` | 项目路径集中配置 |
| `pf_assistant/schema.sql` | 数据库结构参考 |

### 关键环境变量

| 参数 | 说明 |
|---|---|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口 |
| `SMTP_SECURE` | 是否使用 SSL/TLS |
| `SMTP_USER` | SMTP 用户 |
| `SMTP_PASS` | SMTP 授权码或密码 |
| `SMTP_FROM` | 发件人邮箱 |
| `ADMIN_NOTIFY_EMAIL` | 管理员通知收件人列表 |
| `PUBLIC_ORIGIN` | 生成密码重置链接和前端访问地址 |
| `OC_GATEWAY_TOKEN` | OpenClaw Gateway token，推荐使用 |
| `OC_DEVICE_TOKEN` | 旧版兼容 token |
| `OC_GATEWAY_PASSWORD` | Gateway password |
| `PF_ASSISTANT_DB_PATH` | 可选数据库路径覆盖，用于测试或隔离运行 |
| `PF_WEBUI_BASE` | smoke-check 目标服务地址 |
| `PF_SMOKE_TIMEOUT_MS` | smoke-check 超时时间 |

### 主要依赖

| 依赖 | 用途 |
|---|---|
| `bcrypt` | 密码加密 |
| `better-sqlite3` | SQLite 数据库访问 |
| `nodemailer` | 注册通知和密码重置邮件 |
| `xlsx` | Excel 参数导入 |
| `playwright` | 前端/布局测试 |
| `ws` | WebSocket，来自 OpenClaw 依赖路径 |

---

## 7. 关键文件与资源路径

### 前端

- `custom-webui/index.html`
- `custom-webui/css/styles.css`
- `custom-webui/js/app.js`
- `custom-webui/js/chat-renderer.js`
- `custom-webui/assets/images/`

### 后端入口与模块

- `pf_assistant/serve.js`
- `pf_assistant/auth.js`
- `pf_assistant/database.js`
- `pf_assistant/mailer.js`
- `pf_assistant/email-classifier.js`
- `pf_assistant/src/server/`
- `pf_assistant/src/materials/`

### 数据库和参数资源

- `pf_assistant/data/app.db`
- `pf_assistant/schema.sql`
- `domain-assets/`
- `pf_assistant/data/import-reports/magnetic-parameters-import-report.json`

### 脚本

- `pf_assistant/scripts/import-magnetic-parameters.js`
- `pf_assistant/scripts/seed-canonical-materials.js`
- `pf_assistant/scripts/seed-tdf-materials.js`
- `pf_assistant/scripts/derive-magnetoelastic.js`
- `pf_assistant/scripts/smoke-check-webui.js`

### 文档

- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `docs/PF_ASSISTANT_DIRECTORY.md`
- `docs/PF_ASSISTANT_CLEANUP_AUDIT.md`
- `docs/history/UPGRADE-v2-user-chat.md`
- `worklog/modefiy.md`

---

## 8. 可用于 PPT 的页面大纲和图示建议

### 第 1 页：标题页

标题：PFM² 相场模拟智能助手  
副标题：面向复杂材料体系的智能模拟与分析平台  
图示建议：科技感背景 + WebUI 截图 + OpenClaw / Materials / Simulation 三个关键词。

### 第 2 页：项目背景与痛点

内容：

- 材料模拟参数来源分散。
- 单位换算和参数准备容易出错。
- 模拟脚本编写门槛高。
- 多轮问答和历史记录难以追踪。
- 模拟结果解释依赖经验。

图示建议：传统流程痛点图，左侧论文/Excel/脚本碎片，右侧统一 Web 工作台。

### 第 3 页：项目目标

内容：

- Web 化交互入口。
- OpenClaw 智能处理。
- 材料参数数据库。
- 会话和结果持久化。
- 参数解析与模拟 readiness 检查。

图示建议：五目标环形图。

### 第 4 页：总体架构

内容：

- Browser / custom-webui
- serve.js
- src/server routes
- SQLite
- OpenClaw Gateway
- PFM2-Agent

图示建议：分层架构图或系统拓扑图。

### 第 5 页：前端交互体验

内容：

- 科技感封面页。
- 登录/注册/密码重置。
- 多会话聊天。
- Markdown、表格、代码块、warning 面板。
- 深色/浅色主题。

图示建议：用户旅程图或 WebUI 页面流转图。

### 第 6 页：OpenClaw 通信流程

内容：

- WebSocket 建连。
- Gateway hello-ok。
- sessions.create。
- chat.send。
- assistant response。
- 消息保存。

图示建议：时序图。

### 第 7 页：材料参数数据库

内容：

- materials
- sources
- parameter_sets
- parameter_definitions
- parameter_values
- import_batches
- import_warnings

图示建议：ER 图。

### 第 8 页：参数导入和单位换算

内容：

- Excel 输入。
- xlsx 解析。
- header map。
- unit-converter。
- repository upsert。
- import report。

图示建议：数据管道图。

### 第 9 页：参数解析与模拟 readiness

内容：

- 输入 parameterSetId + simulationType。
- 读取参数集。
- 匹配 required / recommended 参数。
- 输出 missingParameters、warnings、resolvedParameters。

图示建议：决策树或流程图。

### 第 10 页：系统可靠性与运维

内容：

- /health
- /api/gateway-status
- smoke-check-webui.js
- systemd service
- worklog 可追踪记录

图示建议：运维闭环图。

### 第 11 页：项目优势

内容：

- 科研场景定制。
- 模块化后端。
- SQLite 轻量部署。
- 材料参数可复现。
- OpenClaw 智能能力接入。
- 文档和测试驱动迭代。

图示建议：能力雷达图或 2x3 优势卡片。

### 第 12 页：后续规划

内容：

- 完善铁磁、铁电、压电、介电材料参数资源。
- 增加模拟脚本生成和校验能力。
- 增强数据可视化和结果解释面板。
- 优化目录结构和部署可观测性。
- 逐步迁移兼容 facade 到 src 直连。

图示建议：Roadmap 时间轴。

### 第 13 页：总结页

内容：

PFM² WebUI 正在从一个聊天入口，演进为集 Web 交互、OpenClaw 智能处理、材料参数数据库、模拟 readiness 检查和科研结果展示于一体的相场模拟科研工作台。

图示建议：三角闭环图：WebUI / Materials DB / OpenClaw Agent。

---

## 9. 可复制给 PPT 工具的简短提示词

请基于以下项目内容生成一套科研项目汇报 PPT：

- 项目名称：PFM² 相场模拟智能助手。
- 项目定位：面向复杂材料体系的智能模拟与分析平台。
- 核心架构：Browser custom-webui → Node serve.js → src/server route modules → SQLite / OpenClaw Gateway → PFM2-Agent。
- 核心能力：用户系统、多会话聊天、OpenClaw 智能问答、材料参数数据库、Excel 参数导入、单位换算、参数解析、模拟 readiness 检查、Markdown 科研输出。
- 数据库：SQLite，位置 `pf_assistant/data/app.db`，关键表包括 users、chat_sessions、chat_messages、materials、sources、parameter_sets、parameter_definitions、parameter_values、import_batches、import_warnings。
- 风格：高端科研计算平台、深蓝科技感、材料晶格、相场模拟、多物理场、智能计算。
- 输出：12-13 页 PPT，每页包含标题、要点和图示建议。
