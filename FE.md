# PFM2 WebUI 前端架构说明

更新时间：2026-06-04

本文档记录当前 `pf-assistant-webui` 的前端架构、前后端协作边界，以及聊天式计算模块的状态流。当前 WebUI 的核心定位不是传统 dashboard，而是“聊天协作式计算入口”：前端负责意图路由、会话状态、结构化卡片渲染和用户操作回传；计算参数解析、作业执行、结果索引和材料数据库逻辑都在后端模块完成。

## 1. 总体分层

~~~text
Browser / custom-webui
  |
  | same-origin HTTP + WebSocket
  v
pf_assistant/serve.js
  |
  +-- src/server/runtime-routes.js       /health, /api/gateway-status
  +-- src/server/auth-chat-routes.js     auth + chat persistence
  +-- src/server/material-routes.js      通用材料参数 API
  +-- src/server/efffield-routes.js      有效场模块 API
  +-- src/server/ferro-routes.js         铁电模块 API
  +-- src/server/static-proxy-routes.js  /app 静态页面与代理
  |
  +-- OpenClaw Gateway WebSocket bridge
~~~

主要责任边界：

- `custom-webui/`：浏览器页面、聊天交互、局部状态、结构化卡片渲染。
- `pf_assistant/serve.js`：服务启动、共享 helper 注入、CORS/security headers、OpenClaw Gateway WebSocket 桥接。
- `pf_assistant/src/server/*-routes.js`：HTTP route 分发和 handler 组合。
- `pf_assistant/src/efffield/`：有效场参数向导、作业服务、Python runner、结果索引。
- `pf_assistant/src/ferro/`：铁电参数向导、材料模型、Landau 参数库、作业服务、极化图可视化、结果索引。

## 2. 前端文件职责

| 文件 | 职责 |
|---|---|
| `custom-webui/index.html` | 页面 DOM 骨架、脚本和样式加载顺序 |
| `custom-webui/css/styles.css` | 主题 token、聊天布局、结构化结果卡片、ferro/efffield 卡片样式 |
| `custom-webui/js/app.js` | 登录注册、会话准备、Gateway WebSocket、消息发送路由、draft 缓存、按钮事件 |
| `custom-webui/js/chat-renderer.js` | Markdown 渲染、表格/代码块渲染、efffield/ferro 结构化卡片渲染 |
| `custom-webui/assets/images/` | landing 和本地 UI 图片资产 |

前端不直接运行计算，也不维护材料模型系数。材料参数、默认值、预设和结果结构都以后端返回为准。

## 3. 消息发送路由

`sendMessage()` 是前端消息入口，当前按优先级路由：

1. `shouldRouteToFerroDialogue(content)`
   - 匹配 `/ferro`、铁电/畴结构/极化分布等中文意图。
   - `parseFerroCommand()` 会同时提取显式材料过滤词，例如 `BFO`、`BFO 10004`、`BTO`、`PZT`。
   - 如果当前有 active ferro draft，也继续走 ferro。
   - 如果已有最近 ferro 结果，用户说“继续、再跑、改网格、角度、箭头、对比、报告”等，也继续走 ferro。
2. `shouldRouteToEfffieldDialogue(content)`
   - 匹配 `/eff`、`/effective`、介电、热传导、扩散、电导等有效场意图。
   - 如果有效场 draft 仍 active，也继续走 efffield。
3. 普通聊天
   - 通过 WebSocket 调用 OpenClaw Gateway 的 `chat.send`。

~~~text
用户输入
  |
  +-- ferro 意图或 ferro 上下文 -> POST /api/ferro/dialogue 或 /api/ferro/jobs
  |
  +-- efffield 意图或 efffield 上下文 -> POST /api/efffield/dialogue 或 /api/efffield/jobs
  |
  +-- 普通聊天 -> Gateway WebSocket chat.send
~~~

## 4. 会话、认证和持久化

认证使用后端设置的 HttpOnly cookie，前端所有 API 请求使用：

~~~js
credentials: 'include'
~~~

前端不会读取或保存 session token。

聊天消息持久化通过：

~~~http
POST /chat/save-message
~~~

`app.js` 内部使用 `saveQueue` 串行保存消息，保存后刷新会话列表。Gateway 会话使用 `currentSessionKey`；`isCurrentSessionPayload()` 会严格检查 `originSessionKey`、`sessionKey`、`chatSessionId` 或 `sessionId`，跨会话消息只记录 warning 并忽略。

Gateway bridge 也在服务端按浏览器连接的 sessionKey 过滤推送，避免其他用户或其他会话的 agent/chat event 被广播到当前前端。

## 5. 结构化渲染器

`custom-webui/js/chat-renderer.js` 是无依赖渲染模块，同时暴露给浏览器和 Node 测试：

~~~js
window.PFMChatRenderer
globalThis.PFMChatRenderer
module.exports
~~~

它负责：

- 安全转义 HTML。
- 渲染轻量 Markdown、代码块、Markdown 表格。
- 将单位换算、参数表、警告文本渲染成更易读的数据面板。
- 渲染 `efffield_result`。
- 渲染 `ferro_material_recommendations`、`ferro_draft`、`ferro_diff`、`ferro_result`。

图片 URL 只允许以下前缀，避免任意链接注入：

~~~text
/api/efffield/assets/
/api/ferro/assets/
~~~

## 6. 有效场模块前端流程

触发示例：

~~~text
计算介电有效场
/eff thermal
二维热传导模拟
扩散有效场
~~~

前端流程：

1. `looksLikeEfffieldDialogueIntent()` 判断意图。
2. `runEfffieldDialogue()` 调用：

~~~http
POST /api/efffield/dialogue
~~~

3. 后端 `efffield/dialogue-service.js` 收集参数：
   - system：dielectric、magnetic、thermal、diffusion、electrical_conduction、elastic、piezoelectric、piezomagnetic、magnetoelectric
   - dimension、grid、realdim、structure、phases、load、outdist、solver
4. draft ready 后用户确认，后端可直接从 dialogue 创建作业并返回 `efffield_result`。
5. 前端用 `renderEfffieldResultCard()` 展示 tensor 文本和结果图片。

有效场也保留旧的直接 job 入口：

~~~http
POST /api/efffield/jobs
GET  /api/efffield/jobs/:jobId
GET  /api/efffield/jobs/:jobId/results
GET  /api/efffield/assets/:jobId/:filename
~~~

## 7. 铁电模块前端流程

触发示例：

~~~text
我想做铁电畴结构计算
/ferro
BFO 10004，64×1×64，跑10000步，每2000步输出，看面内角度
~~~

前端关键状态：

~~~js
activeFerroDialogue
currentFerroDraft
lastFerroResult
ferroRunHistory
ferroMaterialModelsCache
~~~

draft 存储：

- `sessionStorage["ferroDraft:<chatSessionId>"]` 保存当前会话 draft。
- `localStorage["pf-assistant.ferro.lastPreset"]` 保存最近 ready draft 的偏好，包括 grid、run、visualization、materialId、presetId。
- 结果返回后不清空 draft，而是把 `draftSnapshot` 合并为当前 draft，保留 `lastJobId` 和 `parentJobId` 上下文。

### 7.1 铁电材料推荐和材料族 catalog

首次识别 ferro 意图时，前端额外调用：

~~~http
GET /api/ferro/materials
~~~

该接口由后端从数据库/材料仓库读取可用模型，并通过两层结构生成前端材料卡：

- `material-models.js`：把数据库参数模型增强为可运行 material model，负责默认温度、默认 composition、preset 和默认 visualization。
- `material-card-catalog.json`：只定义 UI 分组和推荐卡结构，不保存物理系数真值。
- `material-card-catalog.js`：把可用 material model 映射成材料族卡，并保留旧 `materials` 兼容列表。

前端不维护材料白名单，也不保存 Landau 系数。接口支持材料过滤：

~~~http
GET /api/ferro/materials?filter=BFO
GET /api/ferro/materials?filter=BFO%2010004
~~~

当前材料推荐卡以材料族展示：

| 材料族卡 | 变体按钮 | 来源 |
|---|---|---|
| BFO | 四阶 / 六阶 / 八阶 Landau 参数 | ferro Landau 数据库 source set |
| PMN-PT | xPT = 0.30 / 0.42 / 0.70 | ferro Landau 数据库 source set |

`/api/ferro/materials` 返回：

~~~js
{
  type: 'ferro_material_recommendations',
  cards: [
    {
      cardType: 'material_family',
      familyId: 'bfo',
      title: 'BFO',
      defaultVisualization: { mode: 'variant_111', component: null, overlay: { arrows: true } },
      variants: [
        {
          variantId: 'bfo_hsieh2016_sixth',
          materialModelId: 'landau:BFO_Hsieh2016_sixth',
          orderLabel: '六阶 Landau 参数'
        }
      ]
    }
  ],
  materials: []
}
~~~

`cards` 是新聊天 UI 首选结构；`materials` 是旧 renderer 和旧流程兼容结构。catalog 不是白名单，最终 cards 来自：

~~~text
configured catalog family cards + fallback active material family cards
~~~

因此 BFO/PMN-PT 保持手工合并卡，PTO/PZT/BTO/KNN/HZO 等未写入 catalog 的 active material 会自动 fallback 成 family card。

当前内置或可回退模型包括但不限于：

- `pmn_pt_default`
- `bto_generate_input`
- `pzt_haun_1989`
- `bfo_bens_coefficients`
- `bfo_10004`

注意：

- 用户只输入“模拟铁电畴”时，后端返回材料选择消息和材料卡，不直接生成 draft。
- 用户输入“模拟 BFO 铁电畴”时，如果匹配多套 BFO 模型，只返回 BFO 材料卡。
- 用户输入“模拟 BTO 铁电畴”或“模拟 BFO 10004 铁电畴”这类只匹配一套模型的请求时，后端可直接生成 ready draft。
- 用户输入“模拟 BFO 六阶”或“PMN-PT 0.42 快速预览”这类明确变体时，后端跳过材料卡，直接应用对应 `variantId` 生成 ready draft。
- 用户输入“模拟 PTO 铁电畴”时，即使 PTO 不在 catalog 中，也会显示 PTO fallback 单卡或按单模型策略生成 draft。
- 材料族卡按钮只触发 `apply_material_preset`，并携带 `materialGroupId`、`variantId`、`materialId`、`presetId`；前端不自行拼系数。
- BFO 默认温度为 `298 K`。
- BFO/BTO/HZO/PTO 这类非组分材料不在卡片和 draft 主信息里展示 `xf`。
- PMN-PT/PZT/KNN 等组分材料才展示 composition，例如 `xf`。
- 内部 input 兼容仍可保留 `xf` 字段，但 UI 不把非组分材料的 `xf` 当作材料组分展示。

### 7.2 铁电 draft 更新

用户选择材料、点击预设、修改网格/步数/可视化，都会回到同一个后端 dialogue：

~~~http
POST /api/ferro/dialogue
~~~

常见 action：

- `apply_material_preset`
- `patch_draft`
- `reset_draft`
- `continue_from_result`

前端按钮只构造 action/patch，不直接修改材料系数。后端 `ferro/dialogue-service.js` 负责解析自然语言、应用 patch、校验 draft 并返回：

- `ferro_dialogue`
- `ferro_draft`
- `ferro_diff`
- `ferro_result`
- `not_ferro`

新会话进入时前端会调用 `initializeFerroModuleState(chatSessionId)`，把当前 ferro draft 初始化为：

~~~text
sessionStorage["ferroDraft:<chatSessionId>"] = null
activeFerroDialogue = false
~~~

新用户首次输入 ferro 意图时，前端会先显示：

~~~text
正在初始化 ferro 会话，请稍候…
~~~

然后再展示材料选择卡或 ready draft，避免等待期间没有反馈。

### 7.3 铁电启动计算

用户输入“开始计算”或点击“开始计算”按钮时，如果当前 draft 为 ready，前端调用：

~~~http
POST /api/ferro/jobs
~~~

请求体来自当前 draft：

- `grid`
- `material`
- `run`
- `initial`
- `field`
- `visualization`
- `parentJobId`，如果是从上一次结果继续
- `chatSessionId`

后端 `ferro/job-service.js` 会：

1. 校验并归一化请求。
2. 在用户隔离目录中创建独立 job/case/logs 目录。
3. 从 ferro 模板目录复制 Fortran 输入文件。
4. 写入 `input.in`。
5. 执行 `make clean`、`make`、`./main.exe`。
6. 调用 `polar-visualizer.py` 生成图片。
7. 索引 `Polar.*******.dat`、PNG assets、legend。
8. 保存材料参数快照。
9. 返回 `ferro_result`、`draftSnapshot`、`result`、`followupChips`。

job 默认不再写入公共 `pf_assistant/data/ferro/jobs/<jobId>`，而是写入用户工作区。旧目录仍作为只读兼容 fallback，用于读取历史 job。

### 7.4 铁电结果持久化和历史恢复

铁电计算结果不能只存在于当前 DOM 或前端内存。计算完成后，前端会把结果保存为结构化 assistant message：

~~~js
{
  role: 'assistant',
  type: 'ferro_result',
  content: '铁电相场计算完成，已生成极化分布图片。',
  metadata: {
    type: 'ferro_result',
    jobId,
    chatSessionId,
    draftSnapshot,
    result: {
      timesteps,
      visualizations,
      legend,
      warnings
    },
    followupChips
  }
}
~~~

数据库层在 `chat_messages` 中保存 `metadata_json`，读历史消息时 `auth.js` 会同时返回：

~~~js
message.metadata
message.structuredPayload
~~~

前端恢复流程：

1. `switchToSession(sessionId)` 加载历史消息。
2. `hydrateSavedChatMessages()` 检查每条消息。
3. 如果 `metadata.type === 'ferro_result'` 且已有 `result.visualizations`，直接渲染结果卡。
4. 如果只有 `jobId`，调用：

~~~http
GET /api/ferro/jobs/:jobId/results
~~~

5. `renderSavedChatMessage()` 对 `ferro_result` 调用 `renderFerroResultCard()`，普通消息仍按文本渲染。
6. `rehydrateFerroStateFromMessages(sessionId, messages)` 从最近的 `ferro_result` 恢复：
   - `lastFerroResult`
   - `currentFerroDraft`
   - `ferroRunHistory`
   - `activeFerroDialogue`

如果当前会话没有 `ferro_result`，再从 `sessionStorage["ferroDraft:<sessionId>"]` 恢复 draft。

跨会话防护：

- 启动 job 时记录 `sourceChatSessionId` 和 `sourceSessionKey`。
- job 返回后先保存到 `sourceChatSessionId` 的聊天历史。
- 只有当前会话仍等于 source 会话时才直接渲染结果卡。
- 如果用户已经切到其他聊天，只标记源会话有更新，不把结果插入当前聊天。

### 7.5 铁电可视化模式

主界面只保留五个显示按钮：

~~~text
Px / Py / Pz / 面内 / R相变体
~~~

箭头不再是独立按钮，而是默认 overlay。结果卡角落显示：

~~~text
箭头：默认显示
~~~

当前结构化模式：

| UI 按钮 | mode | component | overlay |
|---|---|---|---|
| Px | `component` | `px` | `{ arrows: true }` |
| Py | `component` | `py` | `{ arrows: true }` |
| Pz | `component` | `pz` | `{ arrows: true }` |
| 面内 | `inplane_angle` | `null` | `{ arrows: true }` |
| R相变体 | `variant_111` | `null` | `{ arrows: true }` |

旧 mode 兼容规则：

| 旧 mode | 新 mode | 处理 |
|---|---|---|
| `angle_arrow` | `inplane_angle` | `overlay.arrows = true` |
| `inplane_angle_arrow` | `inplane_angle` | `overlay.arrows = true` |
| `variant_111_arrow` | `variant_111` | `overlay.arrows = true` |

前端筛选规则在 `selectVisibleFerroImages(result, activeViewMode)` 中实现：

~~~js
if (activeViewMode.mode === 'component') {
  return img.mode === 'component' && img.component === activeViewMode.component;
}
return img.mode === activeViewMode.mode;
~~~

也就是说：

- 点击 `Pz` 只显示 `mode="component"` 且 `component="pz"` 的图片。
- 点击 `面内` 只显示 `mode="inplane_angle"` 的图片。
- 点击 `R相变体` 只显示 `mode="variant_111"` 的图片。
- 后端 `result.visualizations` 可以缓存多个模式，但前端不会平铺所有图片。

如果同一 mode 同时存在无箭头和带箭头图片，主界面默认优先显示 `overlay.arrows === true` 的版本。

结果结构示例：

~~~js
{
  result: {
    timesteps: [2000, 4000, 6000, 8000, 10000],
    visualizations: [
      {
        timestep: 2000,
        mode: 'variant_111',
        component: null,
        components: ['px', 'py', 'pz'],
        projectionComponents: ['px', 'pz'],
        overlay: {
          arrows: true,
          projectionComponents: ['px', 'pz']
        },
        label: 'R相变体 kt=2000',
        url: '/api/ferro/assets/<jobId>/Polar.0002000_variant_111_arrow.png'
      }
    ],
    legend: {
      mode: 'variant_111',
      label: 'R相 <111> 变体',
      url: '/api/ferro/assets/<jobId>/polar_variant_111_legend.png'
    }
  }
}
~~~

前端结果卡 `renderFerroResultCard()` 展示：

- job 元信息和 parent job。
- mode tabs：Px、Py、Pz、面内、R相变体。
- “箭头：默认显示”状态。
- timestep badges。
- 当前模式对应 legend。
- 紧凑图片 gallery。
- follow-up chips：切换模式、切换分量、网格加密再跑、增加步数、对比上一次、生成报告。

### 7.6 R-BFO `<111>` 八变体图

R 相 BFO 默认可视化为：

~~~js
{
  mode: 'variant_111',
  component: null,
  overlay: { arrows: true }
}
~~~

UI 文案显示为：

~~~text
R相变体
~~~

不再显示“BFO八变体+箭头”或“面内+箭头”作为主按钮。

后端 `polar-visualizer.py` 中实现 `<111>` 最近方向分类，而不是简单使用 `sign(Px/Py/Pz)`：

~~~text
V1 = [ 1,  1,  1]
V2 = [ 1, -1,  1]
V3 = [-1,  1,  1]
V4 = [-1, -1,  1]
V5 = [ 1,  1, -1]
V6 = [ 1, -1, -1]
V7 = [-1,  1, -1]
V8 = [-1, -1, -1]
~~~

分类步骤：

1. 使用 `Px/Py/Pz` 组成极化向量。
2. 归一化到单位向量。
3. 和八个归一化 `<111>` 方向做点积。
4. 选择点积最大的变体。
5. 低极化强度或低置信度区域标记为 invalid。

离散颜色表：

| 变体 | 颜色 |
|---|---|
| `[1,1,1]` | `#D55E00` |
| `[1,-1,1]` | `#E69F00` |
| `[-1,1,1]` | `#F0E442` |
| `[-1,-1,1]` | `#CC79A7` |
| `[1,1,-1]` | `#0072B2` |
| `[1,-1,-1]` | `#009E73` |
| `[-1,1,-1]` | `#56B4E9` |
| `[-1,-1,-1]` | `#6A3D9A` |
| invalid | `#BDBDBD` |

箭头投影规则：

- `Nx×1×Nz`：显示 x-z 截面，箭头使用 `Px-Pz`。
- `Nx×Ny×1`：箭头使用 `Px-Py`。
- `1×Ny×Nz`：箭头使用 `Py-Pz`。
- 颜色分类仍尽量使用完整 `Px/Py/Pz` 三个分量。
- 如果 Polar 数据缺少 `Py`，结果卡显示 warning：

~~~text
当前数据缺少 Py，无法完整区分 R-BFO 八个 <111> 变体，只能显示投影分类。
~~~

### 7.7 图片 gallery 和后处理

结果图片使用紧凑 gallery：

- 1 张：中等图，最大宽度约 480px。
- 2 张：一行 2 张。
- 3-4 张：一行最多 4 张。
- 5 张及以上：每行最多 4 张。
- 超过 8 张折叠到“查看更多”。
- 小屏幕自动收缩为 1-2 列。
- 缩略图点击后打开原图链接。

点击 mode tab 不重新运行 Fortran。流程为：

1. 前端先检查 `result.visualizations` 中是否已有对应 mode/component。
2. 如果已有，只更新当前结果卡显示。
3. 如果没有，但 job 的 Polar 数据还在，调用后处理接口：

~~~http
POST /api/ferro/jobs/:jobId/visualizations
~~~

请求体：

~~~js
{
  mode: 'variant_111',
  component: null,
  timesteps: [2000, 4000, 6000, 8000, 10000]
}
~~~

后端不会重跑 `main.exe`，只基于已有 `Polar.*******.dat` 生成新 PNG，并把新增图片合并进 `result.visualizations`。

### 7.8 后端铁电模块内部结构

`pf_assistant/src/ferro/` 主要文件：

| 文件 | 职责 |
|---|---|
| `dialogue-service.js` | 聊天式参数向导、材料选择、draft patch、ready 校验 |
| `job-service.js` | 请求归一化、job 目录、Fortran 执行、可视化调用、结果持久化 |
| `material-models.js` | 内置模型和数据库模型的 UI preset/default 适配 |
| `material-card-catalog.json` | BFO/PMN-PT 等材料族推荐卡配置，不保存物理系数 |
| `material-card-catalog.js` | catalog 分组、fallback active material cards、filter、variant 匹配、旧 materials 兼容展开 |
| `material-repository.js` | ferro 参数模型、计算快照等数据库访问 |
| `landau-repository.js` | Landau 参数 markdown 导入、source set/coefficients 查询 |
| `landau-model-adapter.js` | 将 Landau 参数库映射为可运行 ferro material model |
| `result-indexer.js` | `Polar.*.dat` 和 PNG assets 索引为结构化 result |
| `polar-visualizer.py` | 极化分量、面内角度、R 相变体、legend 和 overlay 图片输出 |
| `process-runner.js` | 子进程执行封装 |

后端可视化策略：

- draft 默认 `visualization.outputPolicy = 'selected_only'`。
- 用户切换模式时默认只生成当前模式图片。
- 高级场景可以传 `outputPolicy = 'all_modes'` 缓存全部模式。
- 前端即使拿到全部模式，也只显示当前 active mode。

资产访问权限：

- `GET /api/ferro/jobs/:jobId/results` 校验当前登录用户。
- `GET /api/ferro/assets/:jobId/:filename` 校验 job 归属和文件名白名单。
- 不允许跨用户读取 job result 或 PNG assets。

### 7.9 用户隔离存储结构

铁电模块的持久化入口位于 `pf_assistant/src/storage/user-workspace.js`。默认根目录：

~~~text
pf_assistant_data/users
~~~

生产环境可用环境变量覆盖：

~~~bash
PFM_USER_DATA_ROOT=/data/pf-assistant/users
~~~

用户目录使用稳定哈希 key，不直接使用邮箱或用户名：

~~~text
u_<sha256(userId).slice(0, 24)>
~~~

单个用户目录结构：

~~~text
pf_assistant_data/users/
  u_<hash>/
    user-manifest.json
    chat-history/
      <chatSessionId>/
        session.json
        messages.jsonl
        messages.snapshot.json
    ferroelectric-simulation/
      <chatSessionId>/
        <jobId>/
          manifest.json
          request.json
          input.in
          result-index.json
          result.json
          executable/
            main.exe
          source/
            main.f90
            Makefile
            copied-files-manifest.json
          materials/
            material_snapshot.json
            landau_coefficients_snapshot.json
            card_variant_snapshot.json
          outputs/
            Polar.0000002.dat
          visualizations/
            Polar.0000002_pz.png
            Polar.0000002_variant_111_arrow.png
            polar_variant_111_legend.png
          logs/
            build-clean.log
            build.log
            run.log
            visualize.log
~~~

存储职责：

- SQLite `chat_messages` 仍是聊天历史主存储。
- `chat-history/<chatSessionId>/messages.jsonl` 是逐条追加镜像，方便审计和灾难恢复。
- `messages.snapshot.json` 是该会话最近消息快照。
- `manifest.json` 记录 jobId、chatSessionId、userKey、模板路径和代码版本。
- `request.json` 保存后端归一化后的请求。
- `materials/material_snapshot.json` 保存本次计算实际使用的材料输入和计算系数。
- `result-index.json` 是图片索引。
- `result.json` 是可恢复的结构化 `ferro_result`，历史消息只有 jobId 时可通过 `/api/ferro/jobs/:jobId/results` 重新拉取。

路径安全规则：

- `chatSessionId` 和 `jobId` 必须通过安全 segment 校验，拒绝 `/`、`\`、`..` 等路径穿越。
- asset 访问只允许白名单文件名，例如 `Polar.0000002_pz.png`、`polar_variant_111_legend.png`、`.json/.log/.txt`。
- `resolveFerroAssetPath()` 会检查 realpath 必须仍位于当前 job 目录内。
- `assertJobBelongsToUser()` 只在当前用户目录下查找 job，跨用户读取返回 404。

### 7.10 本地材料卡片编辑器

后端维护人员可使用本地编辑器修改 `material-card-catalog.json`：

~~~bash
tools/ferro-card-editor/start-ferro-card-editor.sh
~~~

Windows：

~~~bat
tools\ferro-card-editor\start-ferro-card-editor.bat
~~~

默认地址：

~~~text
http://127.0.0.1:4317
~~~

编辑器只绑定 `127.0.0.1`，启动脚本设置 `PFM_ENABLE_FERRO_CARD_EDITOR=1`。它只允许读写：

~~~text
pf_assistant/src/ferro/material-card-catalog.json
pf_assistant/src/ferro/catalog-backups/
tools/ferro-card-editor/logs/editor-audit.log
~~~

保存流程：

1. 解析并校验 JSON。
2. 生成 `material-card-catalog.YYYYMMDD-HHMMSS.json` 备份。
3. 写入 tmp 文件。
4. 再次 JSON 解析。
5. atomic rename 替换原文件。
6. 写 audit log。
7. 可调用 `POST /api/ferro/admin/reload-material-catalog` 刷新主服务 catalog 缓存。

该 admin reload endpoint 只在 `PFM_ENABLE_FERRO_CARD_EDITOR=1` 时启用，普通用户看不到入口。

## 8. 后端 API 总览

### Runtime

~~~http
GET /health
GET /api/gateway-status
~~~

### Auth / Chat

~~~http
POST /api/auth/*
POST /chat/save-message
GET  /chat/*
~~~

### Efffield

~~~http
POST /api/efffield/dialogue
POST /api/efffield/jobs
GET  /api/efffield/jobs/:jobId
GET  /api/efffield/jobs/:jobId/results
GET  /api/efffield/assets/:jobId/:filename
~~~

### Ferro

~~~http
GET  /api/ferro/materials
GET  /api/ferro/materials?filter=<material query>
POST /api/ferro/dialogue
POST /api/ferro/jobs
GET  /api/ferro/jobs/:jobId
GET  /api/ferro/jobs/:jobId/results
POST /api/ferro/jobs/:jobId/visualizations
GET  /api/ferro/assets/:jobId/:filename
GET  /api/ferro/landau/source-sets
GET  /api/ferro/landau/source-sets/:setKey/coefficients
~~~

`/api/ferro/jobs/:jobId/visualizations` 是后处理接口，只基于已有 Polar 数据生成新图片，不重新运行 Fortran 主程序。

### Materials

通用材料参数和解析 API 位于 `pf_assistant/src/server/material-routes.js`，前端普通材料查询应从这里或对应领域模块读取，不应在浏览器硬编码材料数据。

## 9. 前端扩展原则

新增计算模块时，推荐沿用当前模式：

1. 在 `app.js` 增加轻量意图判断和 active draft 状态。
2. 新建或复用后端 `/api/<module>/dialogue`，让后端维护 draft。
3. 新建或复用 `/api/<module>/jobs`，让后端运行计算并返回结构化结果。
4. 在 `chat-renderer.js` 增加结构化 card renderer。
5. 在 `styles.css` 增加内联聊天卡样式，避免把模块做成独立 dashboard。
6. 图片 asset URL 必须通过后端白名单路由，并在 renderer 中做前缀校验。
7. 前端只缓存用户协作上下文，不缓存物理模型真值。

## 10. 验证基线

前端或 route 改动后至少运行：

~~~bash
node --check custom-webui/js/app.js
node --check custom-webui/js/chat-renderer.js
node --test test/gateway-ui.test.js
~~~

铁电模块改动后运行：

~~~bash
node --test test/ferro-dialogue.test.js
node --test test/ferro-routes.test.js
node --test test/ferro-service.test.js
python3 -m py_compile pf_assistant/src/ferro/polar-visualizer.py
~~~

有效场模块改动后运行：

~~~bash
node --test test/efffield-dialogue.test.js
node --test test/efffield-routes.test.js
node --test test/efffield-service.test.js
~~~

完整回归：

~~~bash
node --test test/*.test.js
~~~

服务验证：

~~~bash
systemctl restart pf-assistant-webui
systemctl is-active pf-assistant-webui
curl --noproxy '*' -fsS http://127.0.0.1:3000/health
curl --noproxy '*' -fsS -I http://127.0.0.1:3000/app/
~~~
