# Modification Worklog Index

Date created: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Purpose

This file is the entry index for the `worklog/` directory.

Before searching through every round log, check this file first to see
whether a related issue, operation, or feature has already been recorded.

Each round entry lists:

- Main topic
- What changed
- Keywords to search for
- Direct log file
- Related files

## Quick Index

| Round | Log File | Main Topic | Best Keywords |
|-------|----------|------------|---------------|
| Round 1 | `round1_modify.md` | Welcome prompt update; backend crash repair; URL parsing fix | welcome, 欢迎语, webpage outage, 3000, ERR_INVALID_URL, Host header, getRequestBase |
| Round 2 | `round2_modify.md` | Registration email notifications; SMTP; admin recipients; startup env | email, SMTP, nodemailer, ADMIN_NOTIFY_EMAIL, PUBLIC_ORIGIN, start.env, password reset |
| Round 3 | `round3_modify.md` | Magnetic material parameter database; Excel import; API endpoints | material parameters, 磁性参数, Excel, xlsx, unit conversion, parameter sets, simulation profiles |
| Round 4 | `round4_modify.md` | Gateway token runtime fix; WebSocket connected state; send button repair | 未连接, Gateway token, OC_GATEWAY_TOKEN, hello-ok, WebSocket, chat.send, systemd-run |
| Round 5 | `round5_modify.md` | WebUI no-reply fix; terminal/WebUI event cross-talk isolation | no reply, 无回复, terminal cross-talk, sessionKey, agent:main:doz, chat.send message string, Gateway error handling |
| Round 6 | `round6_modify.md` | Runtime stability baseline; health checks; persistent service template | stability, 稳定性, /health, gateway-status, systemd service, 会话准备中, readiness, security headers |
| Round 7 | `round7_modify.md` | Persistent systemd service; reboot-safe startup; smoke check script | systemd, persistent service, enabled, smoke-check, hello-ok, sessions.create, chat.send accepted, reboot-safe |
| Round 8 | `round8_modify.md` | Frontend session-ready race fix; app.js cache busting | 会话未就绪, session-ready, currentSessionKey, recoverSession race, enterApp order, app.js cache, Cache-Control no-store |
| Round 9 | `round9_modify.md` | Landing cover redesign; unauthenticated login/register entry | landing page, 首页封面, 登录入口, register, Image/2.webp, hero, glassmorphism, auth modal hidden |
| Round 10 | `round10_modify.md` | Chat response Markdown/data-panel rendering | chat-markdown, data-table, parameter-table, warning-box, unit-conversion-box, code-block, copy code, material parameters |
| Round 11 | `round11_modify.md` | Chat theme tokens; dark-mode readability; data-panel polish | dark mode, 黑夜模式, chat theme tokens, assistant card, parameter-code, contrast, no horizontal overflow |
| Round 12 | `round12_modify.md` | Compact parameter tables; material note boxes; table density | compact-table, compact-table-wrapper, parameter-table, 参数表, material-note-box, 力学参数, wide-table-wrapper |
| Round 13 | `round13_modify.md` | Chat renderer modularization; renderer API; XSS escape test | chat-renderer.js, PFMChatRenderer, renderer module, formatContent, XSS escape, script order |
| Round 14 | `round14_modify.md` | Frontend directory structure cleanup; js/css/assets split | custom-webui/js, custom-webui/css, assets/images, app.js path, chat-renderer.js path, styles.css path |
| Round 15 | `round15_modify.md` | Backend directory structure preparation; src modules and path config | pf_assistant/src, paths.js, legacy require, backend structure, unit-converter, parameter-resolver |
| Round 16 | `round16_modify.md` | Materials domain structure split; definitions/converters/resolvers and domain assets | materials domain split, definitions, converters, resolvers, domain-assets, 铁磁, 铁电, 压电, 介电 |
| Round 17 | `round17_modify.md` | Material parameters repository split; SQL data-access moved under src | material-parameters-repository, repositories, SQL data access, legacy material-parameters, makeMaterialKey |
| Round 18 | `round18_modify.md` | Isolated material repository test database; configurable SQLite path | PF_ASSISTANT_DB_PATH, isolated sqlite, temporary database, getDbPath, closeDbForTests |
| Round 19 | `round19_modify.md` | Material records repository split; shared helpers and materials table access | material-records.js, shared.js, makeMaterialKey, upsertMaterial, listMaterials, materials table |
| Round 20 | `round20_modify.md` | Source records repository split; sources table access | source-records.js, splitAuthors, upsertSource, getSourceById, sources table |
| Round 21 | `round21_modify.md` | Parameter definition records repository split; parameter_definitions reads | parameter-definition-records.js, listParameterDefinitions, getParameterDefinitionByKey, parameter_definitions table |
| Round 22 | `round22_modify.md` | Parameter set records repository split; parameter_sets table access | parameter-set-records.js, upsertParameterSet, getParameterSetById, parameter_sets table |
| Round 23 | `round23_modify.md` | Parameter value records repository split; parameter_values table access | parameter-value-records.js, writeParameterValue, getValuesForSet, parameter_values table |
| Round 24 | `round24_modify.md` | Import batch records repository split; import_batches/import_warnings table access | import-batch-records.js, createImportBatch, recordImportWarning, import_warnings table |
| Round 25 | `round25_modify.md` | Material parameter query helpers split; API read composition | material-parameter-queries.js, toApiParameter, getMaterialSummary, getParameterSetDetail |
| Round 26 | `round26_modify.md` | Material repository aggregate contract; compatibility aggregator docs | aggregate export contract, compatibility aggregator, material-parameters-repository.js, export list |
| Round 27 | `round27_modify.md` | Material HTTP routes split from serve.js; server/material-routes.js | material-routes.js, createMaterialApiHandler, isMaterialApiPath, /api/materials |
| Round 28 | `round28_modify.md` | Material route handler unit tests; API path contract | MATERIAL_API_PATHS, createMaterialApiHandler, /api/materials, /api/resolve-parameters |
| Round 29 | `round29_modify.md` | Runtime HTTP routes split from serve.js; health/gateway route tests | runtime-routes.js, RUNTIME_API_PATHS, createRuntimeApiHandler, /health, /api/gateway-status |
| Round 30 | `round30_modify.md` | Auth/chat HTTP routes split from serve.js; legacy auth response preserved | auth-chat-routes.js, AUTH_CHAT_API_PATHS, createAuthChatApiHandler, /api/auth, /chat |
| Round 31 | `round31_modify.md` | Static/proxy routes split from serve.js; custom/control/webui/fallback dispatch | static-proxy-routes.js, STATIC_PROXY_ROUTE_LABELS, /app, /control, /webui, bridge proxy |
| Round 32 | `round32_modify.md` | serve.js bootstrap/orchestration contract; final route delegation cleanup | bootstrap/orchestration entry, route-specific dispatch, serve.js, handleStaticProxyRoute |
| Round 33 | `round33_modify.md` | Project navigation docs; README/UPGRADE/worklog calibration | PROJECT_NAVIGATION.md, 开发导航, module ownership, 历史升级记录, docs baseline |
| Round 34 | `round34_modify.md` | Root compatibility facade documentation; src implementation targets | Compatibility facade, gateway-config, runtime-status, unit-converter, parameter-resolver, material-parameters |
| Round 35 | `round35_modify.md` | Scripts navigation; import/seed/derive/smoke-check command map | scripts README, import-magnetic-parameters, seed scripts, derive-magnetoelastic, smoke-check-webui |
| Round 36 | `round36_modify.md` | Backend directory cleanup; moved historical UPGRADE doc out of pf_assistant | docs/history, UPGRADE-v2-user-chat.md, backend directory hygiene, historical upgrade record |
| Round 37 | `round37_modify.md` | pf_assistant top-level directory classification table | PF_ASSISTANT_DIRECTORY.md, Runtime Entry, Business Modules, Compatibility Facades, Runtime State, Dependencies |
| Round 38 | `round38_modify.md` | Cleanup audit; confirmed unused nanobot brand assets | PF_ASSISTANT_CLEANUP_AUDIT.md, nanobot brand assets, research_assistant_icon.svg, confirmed unused by user |
| Round 39 | `round39_modify.md` | Project brief for PPT/ChatGPT generation | PFM2_WEBUI_PROJECT_BRIEF_FOR_PPT.md, PPT outline, project architecture, database summary |
| Round 40 | `round40_modify.md` | Version 0.1.2 release metadata and Git upload | v0.1.2, release, package version, git tag, start.env ignore |
| Round 41 | `round41_modify.md` | Canonical magnetic reference materials and B1/B2 derivation | canonical materials, B1/B2, magnetoelastic, Young's modulus, Poisson's ratio |
| Round 42 | `round42_modify.md` | TDF/Terfenol-D material expansion and resolver synonyms | TDF, Terfenol-D, Tb-Dy-Fe, Galfenol, B1_from_lambda100, SAW_magnetoelastic |
| Round 43 | `round43_modify.md` | Ferro phase-field WebUI integration | ferro, 铁电, 畴结构, Polar, phase-field, /api/ferro, make clean, visualization |
| Round 44 | `round44_modify.md` | Ferro material recommendations in chat UI | ferro materials, material recommendations, /api/ferro/materials, BFO, PMN-PT, BTO, PZT |
| Round 45 | `round45_modify.md` | Ferroelectric Landau literature database import | Landau, ferroelectric coefficients, ferro_landau, Markdown import, source sets |
| Round 46 | `round46_modify.md` | Ferroelectric Landau query API | /api/ferro/landau, source sets, coefficient records, Landau API |
| Round 47 | `round47_modify.md` | Version 0.1.3 release upload | v0.1.3, release, security redaction, ferro webui, local editors |

## Round Details

## Round 1 — Welcome Prompt + Webpage Outage Repair

Log file:

```text
worklog/round1_modify.md
```

Main topics:

- Updated the custom WebUI welcome text.
- Fixed backend crash when requests arrived without a valid `Host` header.
- Added safer request URL parsing via `getRequestBase(req)`.
- Restored the WebUI service on port `3000`.

Related files:

- `custom-webui/index.html`
- `custom-webui/app.js`
- `pf_assistant/serve.js`
- `pf_assistant/auth.js`

Search keywords:

```text
welcome
欢迎使用
ERR_INVALID_URL
Invalid URL
Host header
getRequestBase
port 3000
webpage unavailable
```

Useful when:

- The WebUI page cannot open.
- Node crashes while handling HTTP requests.
- The welcome prompt looks wrong or inconsistent.
- `/app/` returns errors or port `3000` is not serving.

## Round 2 — Registration Email Notification + Runtime Env

Log file:

```text
worklog/round2_modify.md
```

Main topics:

- Added real SMTP email notifications for new user registrations.
- Added `nodemailer`.
- Added support for multiple admin recipients.
- Added `mailer.js` HTML + text notification generation.
- Added `start.sh`, `start.env`, and `start.env.example`.
- Fixed `PUBLIC_ORIGIN` semantics so password reset links do not duplicate
  `/app/app/`.

Related files:

- `pf_assistant/mailer.js`
- `pf_assistant/auth.js`
- `pf_assistant/package.json`
- `pf_assistant/package-lock.json`
- `pf_assistant/start.sh`
- `pf_assistant/start.env`
- `pf_assistant/start.env.example`

Search keywords:

```text
SMTP
nodemailer
QQ Mailbox
ADMIN_NOTIFY_EMAIL
new user notification
注册通知
PUBLIC_ORIGIN
password reset
start.env
start.sh
```

Useful when:

- New user registration emails are not sent.
- Admin recipient list needs to be changed.
- Password reset URL is malformed.
- SMTP credentials or startup environment variables need to be checked.

## Round 3 — Magnetic Material Parameter Database

Log file:

```text
worklog/round3_modify.md
```

Main topics:

- Added magnetic material parameter database tables.
- Added Excel import for `磁性参数-汇总.xlsx`.
- Added unit conversion from raw spreadsheet values to SI units.
- Added parameter definitions and simulation profiles.
- Added parameter resolver for simulation readiness.
- Added API endpoints for materials, parameter sets, and simulation profiles.

Related files:

- `pf_assistant/database.js`
- `pf_assistant/unit-converter.js`
- `pf_assistant/parameter-definitions-seed.js`
- `pf_assistant/material-parameters.js`
- `pf_assistant/parameter-resolver.js`
- `pf_assistant/scripts/import-magnetic-parameters.js`
- `pf_assistant/serve.js`
- `pf_assistant/package.json`
- `pf_assistant/data/import-reports/magnetic-parameters-import-report.json`
- `磁性参数-汇总.xlsx`

Search keywords:

```text
magnetic parameters
磁性参数
Excel import
xlsx
unit conversion
SI units
parameter_sets
parameter_values
resolve-parameters
simulation profiles
mumax3
SAW
DMI
```

Useful when:

- Material parameters need to be imported or re-imported.
- A simulation needs parameter lookup.
- API endpoints under `/api/materials` or `/api/resolve-parameters` are
  involved.
- Excel data issues, unit conversion, or missing parameters need review.

## Round 4 — Gateway Token + WebSocket Connected State

Log file:

```text
worklog/round4_modify.md
```

Main topics:

- Fixed the remaining runtime issue where the WebUI showed `未连接`.
- Added `OC_GATEWAY_TOKEN` to `pf_assistant/start.env` using the local
  OpenClaw operator token source.
- Kept Gateway token values redacted in logs and notes.
- Ensured the WebUI service starts through `start.sh`, so `start.env` is
  loaded.
- Recreated the transient `pf-assistant-webui.service` using `systemd-run`.
- Verified WebSocket handshake returns `hello-ok`.
- Confirmed targeted regression tests pass.

Related files:

- `pf_assistant/start.env`
- `pf_assistant/start.env.example`
- `pf_assistant/gateway-config.js`
- `pf_assistant/serve.js`
- `custom-webui/app.js`
- `test/gateway-ui.test.js`

Search keywords:

```text
未连接
已连接
Gateway token
gateway token missing
OC_GATEWAY_TOKEN
OC_DEVICE_TOKEN
hello-ok
WebSocket
chat.send
send button
systemd-run
pf-assistant-webui.service
```

Useful when:

- The top-right status shows `未连接`.
- The chat send button is disabled or messages cannot be sent.
- WebSocket logs show Gateway authentication errors.
- The WebUI service was started with `node serve.js` directly and did not
  load `start.env`.
- The transient systemd service needs to be checked or recreated.


## Round 5 — WebUI No-Reply + Terminal Event Cross-Talk Fix

Log file:

```text
worklog/round5_modify.md
```

Main topics:

- Fixed WebUI messages being rejected by Gateway because `chat.send.message`
  used the wrong shape.
- Changed `chat.send` payload back to the current Gateway requirement:
  `message` is a string.
- Added `sessionKey` filtering so terminal-side events such as
  `agent:main:doz` are ignored by the WebUI when the current WebUI session is
  different.
- Added visible Gateway error handling in the WebUI so failed requests stop the
  typing indicator and show an error message.
- Replaced fixed `sessions.create` request id `'1'` with a tracked generated
  request id.
- Added regression tests for string `chat.send` payloads and sessionKey
  filtering.
- Tried changing Gateway `client.id` to a WebUI-specific value, but Gateway
  rejected it due to its current schema, so that attempt was reverted.

Related files:

- `custom-webui/app.js`
- `test/gateway-ui.test.js`
- `pf_assistant/serve.js`

Search keywords:

```text
no reply
无回复
终端消息冒到网页
terminal cross-talk
sessionKey
agent:main:doz
chat.send
message must be string
Gateway 请求失败
typing indicator
pendingSessionCreateId
```

Useful when:

- WebUI shows `已连接` but messages get no reply.
- Terminal-side OpenClaw/TUI replies appear in the webpage chat.
- Logs show `invalid chat.send params: at /message: must be string`.
- The page keeps spinning after a failed Gateway request.
- You need to understand why WebUI still uses the Gateway-accepted
  `openclaw-tui` client id.

## Round 6 — Runtime Stability Baseline

Log file:

```text
worklog/round6_modify.md
```

Main topics:

- Added runtime health/status helper module.
- Added `GET /health` for WebUI service readiness.
- Added `GET /api/gateway-status` for Gateway TCP reachability and credential/device readiness state.
- Added frontend readiness distinction between `会话准备中` and `已连接`.
- Added basic security response headers.
- Added persistent systemd service template under `deploy/`.
- Updated README deployment instructions to use `start.sh` and `start.env`.
- Added tests for runtime status and frontend readiness labels.
- Restarted the current WebUI service and verified local endpoints with `--noproxy '*'`.

Related files:

- `pf_assistant/runtime-status.js`
- `pf_assistant/serve.js`
- `custom-webui/app.js`
- `test/gateway-ui.test.js`
- `deploy/pf-assistant-webui.service`
- `README.md`
- `docs/superpowers/plans/2026-06-02-runtime-stability-baseline.md`

Search keywords:

```text
stability
稳定性
/health
/api/gateway-status
gateway-status
systemd service
persistent service
transient service
会话准备中
readiness
security headers
X-Frame-Options
nosniff
--noproxy
```

Useful when:

- You need to check whether the WebUI service is healthy.
- You need to check whether OpenClaw Gateway port 18789 is reachable.
- The page shows `会话准备中` and the send button is still disabled.
- The service was started directly and may not have loaded `start.env`.
- You want to install a reboot-safe persistent systemd unit.
- Local curl checks return proxy-side `502 Bad Gateway` unless `--noproxy '*'` is used.

## Round 7 — Persistent Service + Smoke Check

Log file:

```text
worklog/round7_modify.md
```

Main topics:

- Installed `deploy/pf-assistant-webui.service` to `/etc/systemd/system/pf-assistant-webui.service`.
- Stopped the old transient unit and started the formal unit.
- Enabled `pf-assistant-webui.service` for boot startup.
- Added `pf_assistant/scripts/smoke-check-webui.js`.
- Verified `/health`, `/api/gateway-status`, WebSocket `hello-ok`, `sessions.create`, and `chat.send` acceptance.
- Confirmed service status is `loaded (/etc/systemd/system/...; enabled)`, no longer transient.

Related files:

- `pf_assistant/scripts/smoke-check-webui.js`
- `deploy/pf-assistant-webui.service`
- `worklog/round7_modify.md`
- `worklog/modefiy.md`

Search keywords:

```text
systemd
persistent service
reboot-safe
enabled
transient
smoke-check
hello-ok
sessions.create
chat.send accepted
PF_WEBUI_BASE
PF_SMOKE_TIMEOUT_MS
```

Useful when:

- You need to confirm the WebUI service survives reboot.
- `systemctl enable` complains about a transient/generated unit.
- You need a one-command runtime check for WebUI + OpenClaw Gateway.
- You need to test without triggering a model run, using `--skip-chat`.

## Round 8 — Session-Ready Race + Frontend Cache Fix

Log file:

```text
worklog/round8_modify.md
```

Main topics:

- Fixed repeated `错误：会话未就绪，请稍候...` messages.
- Found root cause in frontend startup order: Gateway connected before local chat session recovery finished.
- Changed app entry order to prepare chat session first, then connect Gateway.
- Added `resetOpenClawSessionState()` for switching / creating chats.
- Ensured new chats request a new OpenClaw session when Gateway is already connected.
- Added `app.js` cache-busting query in `index.html`.
- Added `Cache-Control: no-store, max-age=0` for HTML/JS/CSS static assets.
- Added regression test for app entry order.

Related files:

- `custom-webui/app.js`
- `custom-webui/index.html`
- `pf_assistant/serve.js`
- `test/gateway-ui.test.js`
- `worklog/round8_modify.md`

Search keywords:

```text
会话未就绪
session-ready
currentSessionKey
recoverSession race
enterApp order
switchToSession
createNewChat
app.js cache
Cache-Control no-store
```

Useful when:

- The page repeatedly says `错误：会话未就绪，请稍候...`.
- The top-right status looks ready but sending still fails.
- Logs show multiple `sessions.create` responses during one browser page load.
- Browser may still be using old frontend JavaScript after a fix.

## Round 9 — Landing Cover + Login Entry Redesign

Log file:

```text
worklog/round9_modify.md
```

Main topics:

- Replaced default unauthenticated login modal entry with a full-screen landing cover.
- Used local background image `custom-webui/Image/2.webp`.
- Kept all hero text, logo mark, buttons, tags, and cards as frontend-rendered UI.
- Added top navigation, hero copy, CTA buttons, ability tags, and four capability cards.
- Login/register buttons open the existing auth modal steps.
- Login success still enters the original chat app.
- Reset links still open the reset modal.
- Added responsive desktop/mobile landing styles.
- Added `.webp` MIME support in `serve.js`.
- Added tests for landing cover presence and unauthenticated behavior.

Related files:

- `custom-webui/index.html`
- `custom-webui/styles.css`
- `custom-webui/app.js`
- `custom-webui/Image/2.webp`
- `pf_assistant/serve.js`
- `test/gateway-ui.test.js`

Search keywords:

```text
landing page
首页封面
登录入口
注册入口
Image/2.webp
PFM² 相场模拟助手
hero
登录使用
创建账号
glassmorphism
auth modal hidden
webp MIME
```

Useful when:

- The unauthenticated homepage design needs adjustment.
- The login modal appears by default again.
- Login/register buttons on the cover do not open the existing auth forms.
- The background image does not load or has the wrong MIME type.
- Mobile landing layout needs review.

## Common Lookup Paths

### Page cannot open

Start with:

```text
Round 1
```

Likely keywords:

```text
port 3000
ERR_INVALID_URL
getRequestBase
```

### Registration or email problem

Start with:

```text
Round 2
```

Likely keywords:

```text
SMTP
ADMIN_NOTIFY_EMAIL
mailer.js
start.env
```

### Material parameter / simulation parameter problem

Start with:

```text
Round 3
```

Likely keywords:

```text
磁性参数
parameter sets
resolve-parameters
unit conversion
```

### Login succeeds but chat is disconnected

Start with:

```text
Round 4
```

Likely keywords:

```text
未连接
OC_GATEWAY_TOKEN
hello-ok
WebSocket
```

### WebUI is connected but messages get no reply, or terminal replies appear in WebUI

Start with:

```text
Round 5
```

Likely keywords:

```text
无回复
message must be string
sessionKey
agent:main:doz
terminal cross-talk
chat.send
```

### Runtime health / Gateway status / persistent service

Start with:

```text
Round 6
```

Likely keywords:

```text
/health
gateway-status
会话准备中
systemd service
transient service
--noproxy
security headers
```

### Persistent service / smoke check / reboot-safe startup

Start with:

```text
Round 7
```

Likely keywords:

```text
systemd
enabled
persistent service
transient
smoke-check
hello-ok
sessions.create
chat.send accepted
```

### Repeated `会话未就绪` messages

Start with:

```text
Round 8
```

Likely keywords:

```text
会话未就绪
currentSessionKey
recoverSession race
enterApp order
app.js cache
Cache-Control no-store
```

### Homepage cover / login entry design

Start with:

```text
Round 9
```

Likely keywords:

```text
landing page
首页封面
登录入口
Image/2.webp
登录使用
创建账号
auth modal hidden
webp MIME
```

## Maintenance Rule

When adding a new `roundN_modify.md` file:

1. Add a new row to the Quick Index table.
2. Add a short section under "Round Details".
3. Include main topic, related files, and search keywords.
4. Avoid recording secret values. Use `<redacted>` for tokens, passwords,
   auth codes, or API keys.


## Round 10 - Chat Response Markdown/Data Panel Rendering

Log file:

```text
worklog/round10_modify.md
```

Main topics:

- Added structured assistant response rendering in `custom-webui/app.js`.
- Added Markdown headings, lists, blockquotes, inline code, tables, and fenced code blocks.
- Added professional data table styles for material/API/parameter outputs.
- Added warning and unit conversion panels.
- Added code block language labels and copy buttons.
- Updated static resource cache versions in `custom-webui/index.html`.
- Added renderer regression coverage in `test/gateway-ui.test.js`.

Related files:

- `custom-webui/app.js`
- `custom-webui/styles.css`
- `custom-webui/index.html`
- `test/gateway-ui.test.js`

Search keywords:

```text
chat-markdown
data-table
parameter-table
warning-box
unit-conversion-box
code-block
copy code
Markdown renderer
材料参数表
单位换算
missingParameters
```

Useful when:

- AI replies look like raw plain text instead of structured panels.
- Material parameter tables, API tables, or unit conversion output need display tuning.
- Code blocks need language labels or copy button behavior.
- Mobile chat messages have table/code overflow issues.


## Round 11 - Chat Theme Tokens + Dark Mode Readability

Log file:

```text
worklog/round11_modify.md
```

Main topics:

- Added chat-specific light/dark design tokens.
- Fixed dark mode by matching the actual `.dark` theme class used by `toggleTheme()`.
- Reworked assistant cards, Markdown text, data tables, warning boxes, unit conversion boxes, and code blocks to use theme variables.
- Added parameter badge class `parameter-code` for parameter-table cells.
- Updated cache busting to `20260602-r11-chat-theme`.
- Added regression tests for tokens, structured panel styles, parameter tables, and API tables.
- Verified light/dark/mobile with Playwright contrast and overflow checks.

Related files:

- `custom-webui/styles.css`
- `custom-webui/app.js`
- `custom-webui/index.html`
- `test/gateway-ui.test.js`

Search keywords:

```text
chat theme tokens
dark mode
黑夜模式
assistant card
data panel
chat-markdown
parameter-code
parameter-table
api-test-table
warning-box
unit-conversion-box
code-block
contrast
no horizontal overflow
```

Useful when:

- Dark mode assistant replies are hard to read.
- Assistant message cards, tables, or code blocks look visually inconsistent between themes.
- Parameter/API tables need data-panel styling adjustments.
- Mobile chat messages show page-level horizontal overflow.


## Round 12 - Compact Parameter Tables + Material Note Boxes

Log file:

```text
worklog/round12_modify.md
```

Main topics:

- Added compact-table detection for small material/parameter tables.
- Added `compact-table-wrapper` and `compact-table` classes for dense parameter panels.
- Kept API and long comparison tables as wide tables.
- Added `material-note-box` for mechanical/material parameter notes.
- Added note-box theme tokens.
- Updated cache busting to `20260602-r12-compact-tables`.
- Added regression tests and Playwright layout checks for light/dark/mobile.

Related files:

- `custom-webui/app.js`
- `custom-webui/styles.css`
- `custom-webui/index.html`
- `test/gateway-ui.test.js`

Search keywords:

```text
compact table
compact-table
compact-table-wrapper
parameter-table
参数表
材料参数
力学参数
material-note-box
note-box
parameter-code
wide-table-wrapper
API table
no horizontal overflow
```

Useful when:

- Small material parameter tables look too wide or sparse.
- Parameter/value/unit columns are too far apart.
- Mechanical parameter descriptions need note-box styling.
- API tables or long Markdown tables are accidentally being compacted.


## Round 13 - Chat Renderer Modularization

Log file:

```text
worklog/round13_modify.md
```

Main topics:

- Extracted chat rendering logic from `custom-webui/app.js` into `custom-webui/chat-renderer.js`.
- Exposed renderer API as `PFMChatRenderer`.
- Updated `index.html` to load renderer before app.
- Updated tests to load renderer before app in the VM sandbox.
- Added XSS/raw HTML escaping coverage.
- Fixed `onerror` being misclassified as a warning because of the `error` substring.

Related files:

- `custom-webui/chat-renderer.js`
- `custom-webui/app.js`
- `custom-webui/index.html`
- `test/gateway-ui.test.js`

Search keywords:

```text
chat-renderer.js
PFMChatRenderer
renderer module
formatContent
handleMessageContentClick
XSS escape
onerror
Markdown renderer
compact table
warning-box
unit-conversion-box
material-note-box
code-block
script order
```

Useful when:

- Chat rendering behavior needs new features or bug fixes.
- Renderer tests fail after changing table/Markdown/code-block logic.
- The page reports `PFMChatRenderer is not loaded`.
- Raw HTML or model output escaping needs to be checked.


## Round 14 - Frontend Directory Structure Cleanup

Log file:

```text
worklog/round14_modify.md
```

Main topics:

- Moved frontend JS into `custom-webui/js/`.
- Moved frontend CSS into `custom-webui/css/`.
- Moved images from `custom-webui/Image/` into `custom-webui/assets/images/`.
- Removed the empty old `custom-webui/Image/` directory.
- Updated `index.html`, tests, and README to use new paths.
- Verified JS syntax, 17 Node tests, and Playwright resource loading.

Related files:

- `custom-webui/index.html`
- `custom-webui/js/app.js`
- `custom-webui/js/chat-renderer.js`
- `custom-webui/css/styles.css`
- `custom-webui/assets/images/1.png`
- `custom-webui/assets/images/2.webp`
- `test/gateway-ui.test.js`
- `README.md`

Search keywords:

```text
frontend structure
custom-webui/js
custom-webui/css
assets/images
Image folder
app.js path
chat-renderer.js path
styles.css path
resource load
cache busting
Round 14
```

Useful when:

- Frontend assets fail to load after path changes.
- Browser cannot find `app.js`, `chat-renderer.js`, `styles.css`, or `2.webp`.
- Future frontend files need a clear location.


## Round 15 - Backend Directory Structure Preparation

Log file:

~~~text
worklog/round15_modify.md
~~~

Main topics:

- Added backend "pf_assistant/src/" preparation structure.
- Added unified path config in "pf_assistant/src/config/paths.js".
- Moved low-risk modules into "src/server/" and "src/materials/".
- Preserved root-level legacy require paths with compatibility exports.
- Connected "serve.js" and "database.js" to unified path config without moving runtime data.
- Updated README and tests.

Related files:

- "pf_assistant/src/config/paths.js"
- "pf_assistant/src/server/gateway-config.js"
- "pf_assistant/src/server/runtime-status.js"
- "pf_assistant/src/materials/unit-converter.js"
- "pf_assistant/src/materials/parameter-resolver.js"
- "pf_assistant/gateway-config.js"
- "pf_assistant/runtime-status.js"
- "pf_assistant/unit-converter.js"
- "pf_assistant/parameter-resolver.js"
- "pf_assistant/serve.js"
- "pf_assistant/database.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
backend structure
pf_assistant/src
src/config/paths.js
legacy require
compatibility export
gateway-config
runtime-status
unit-converter
parameter-resolver
后端目录结构
路径配置
Round 15
~~~

Useful when:

- Backend modules need a cleaner location.
- A require path breaks after backend structure changes.
- Future work needs to move data/assets/scripts with lower risk.
- You need to check why "data/", "logs/", "start.env", and "start.sh" were not moved yet.


## Round 16 - Materials Domain Structure Split

Log file:

~~~text
worklog/round16_modify.md
~~~

Main topics:

- Split material-domain modules into "definitions/", "converters/", and "resolvers/".
- Preserved root and Round 15 compatibility require paths.
- Added "pf_assistant/src/materials/index.js" as a materials module aggregator.
- Added "domain-assets/" scaffold for future ferromagnetic, ferroelectric, piezoelectric, dielectric, example, and scale resources.
- Updated tests and README.

Related files:

- "pf_assistant/src/materials/definitions/default-parameter-definitions.js"
- "pf_assistant/src/materials/converters/unit-converter.js"
- "pf_assistant/src/materials/resolvers/parameter-resolver.js"
- "pf_assistant/src/materials/index.js"
- "pf_assistant/parameter-definitions-seed.js"
- "pf_assistant/unit-converter.js"
- "pf_assistant/parameter-resolver.js"
- "domain-assets/README.md"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
materials domain split
parameter definitions
unit converter
parameter resolver
definitions converters resolvers
domain-assets
ferromagnetic
ferroelectric
piezoelectric
dielectric
scale files
材料领域结构
铁磁
铁电
压电
介电
Round 16
~~~

Useful when:

- Adding new material parameter families.
- Adding unit converters for ferroelectric, piezoelectric, or dielectric data.
- Looking for where future scale files or example scripts should live.
- A require path breaks after materials module cleanup.


## Round 17 - Material Parameters Repository Split

Log file:

~~~text
worklog/round17_modify.md
~~~

Main topics:

- Moved material parameter SQL/data-access implementation under "pf_assistant/src/materials/repositories/".
- Preserved root "pf_assistant/material-parameters.js" compatibility path.
- Added "pf_assistant/src/materials/material-parameters.js" compatibility path.
- Updated the parameter resolver to import the repository directly.
- Added repository compatibility tests and README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "pf_assistant/src/materials/material-parameters.js"
- "pf_assistant/material-parameters.js"
- "pf_assistant/src/materials/resolvers/parameter-resolver.js"
- "pf_assistant/src/materials/index.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
material parameters repository
material-parameters-repository
repositories
SQL data access
legacy material-parameters
makeMaterialKey
upsertMaterial
getParameterSetDetail
import batch
材料参数仓库
数据访问层
Round 17
~~~

Useful when:

- Material parameter data-access code needs to be found or split further.
- A legacy "material-parameters" require path breaks.
- Future repository tests or DB fixtures are being added.
- Material import/reporting behavior needs investigation.

## Round 18 - Isolated Material Repository Test Database

Log file:

~~~text
worklog/round18_modify.md
~~~

Main topics:

- Added "PF_ASSISTANT_DB_PATH" support for isolated test databases.
- Added "getDbPath()" and "closeDbForTests()" helpers in "database.js".
- Added a child-process material repository test using a temporary SQLite DB.
- Documented the test-only DB path override in README.

Related files:

- "pf_assistant/database.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
PF_ASSISTANT_DB_PATH
isolated sqlite
temporary database
material repository test
getDbPath
closeDbForTests
database fixture
repository tests
临时数据库
隔离测试
Round 18
~~~

Useful when:

- Repository tests need to avoid touching "pf_assistant/data/app.db".
- A future data-access split needs DB fixtures.
- You need to check which SQLite file a process is using.

## Round 19 - Material Records Repository Split

Log file:

~~~text
worklog/round19_modify.md
~~~

Main topics:

- Split shared repository helpers into "shared.js".
- Split materials-table access into "material-records.js".
- Kept aggregate material repository API compatible.
- Added compatibility tests and README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/shared.js"
- "pf_assistant/src/materials/repositories/material-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
material records
material-records.js
repository shared helpers
makeMaterialKey
upsertMaterial
listMaterials
materials table
材料记录
材料表
Round 19
~~~

Useful when:

- Materials-table SQL needs to be found or modified.
- Repository splitting causes material helper path issues.
- Future source/parameter repository splits need a template.

## Round 20 - Source Records Repository Split

Log file:

~~~text
worklog/round20_modify.md
~~~

Main topics:

- Split sources-table access into "source-records.js".
- Kept aggregate material repository API compatible.
- Added compatibility tests and README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/source-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
source records
source-records.js
splitAuthors
upsertSource
getSourceById
sources table
source repository
来源记录
文献来源
Round 20
~~~

Useful when:

- Sources-table SQL needs to be found or modified.
- Source parsing or DOI matching behavior needs investigation.
- Future parameter definition/set/value repository splits need a template.

## Round 21 - Parameter Definition Records Repository Split

Log file:

~~~text
worklog/round21_modify.md
~~~

Main topics:

- Split parameter_definitions table reads into "parameter-definition-records.js".
- Kept aggregate material repository API compatible.
- Added compatibility tests and README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/parameter-definition-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
parameter definition records
parameter-definition-records.js
listParameterDefinitions
getParameterDefinitionByKey
getParameterDefinitionById
parameter_definitions table
参数定义记录
参数定义表
Round 21
~~~

Useful when:

- Parameter definition SQL reads need to be found or modified.
- Seeded parameter catalogue behavior needs investigation.
- Future parameter-set/value repository splits need a template.

## Round 22 - Parameter Set Records Repository Split

Log file:

~~~text
worklog/round22_modify.md
~~~

Main topics:

- Split parameter_sets table access into "parameter-set-records.js".
- Kept aggregate material repository API compatible for existing import/API code.
- Added compatibility test proving aggregate exports point to the split module.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/parameter-set-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
parameter set records
parameter-set-records.js
upsertParameterSet
getParameterSetById
listParameterSetsForMaterial
getParameterSetsForMaterialWithSource
parameter_sets table
参数集记录
参数集表
Round 22
~~~

Useful when:

- Parameter set SQL needs to be found or modified.
- Material parameter-set creation/listing behavior needs investigation.
- Future parameter-value repository splitting needs a template.

## Round 23 - Parameter Value Records Repository Split

Log file:

~~~text
worklog/round23_modify.md
~~~

Main topics:

- Split parameter_values table access into "parameter-value-records.js".
- Kept aggregate material repository API compatible.
- Added compatibility test proving aggregate exports point to the split module.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/parameter-value-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
parameter value records
parameter-value-records.js
writeParameterValue
getValuesForSet
parameter_values table
参数值记录
参数值表
Round 23
~~~

Useful when:

- Parameter value write/read SQL needs to be found or modified.
- Import value upsert behavior needs investigation.
- Parameter-set detail value listing needs review.
- Future import-batch repository splitting needs a template.

## Round 24 - Import Batch Records Repository Split

Log file:

~~~text
worklog/round24_modify.md
~~~

Main topics:

- Split import_batches and import_warnings table access into "import-batch-records.js".
- Kept aggregate material repository API compatible.
- Added compatibility test proving aggregate exports point to the split module.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/import-batch-records.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
import batch records
import-batch-records.js
createImportBatch
finalizeImportBatch
recordImportWarning
listImportWarnings
import_batches table
import_warnings table
导入批次
导入警告
Round 24
~~~

Useful when:

- Import batch SQL needs to be found or modified.
- Spreadsheet/API import warning behavior needs investigation.
- Future cleanup of the aggregate material repository needs context.

## Round 25 - Material Parameter Query Helpers Split

Log file:

~~~text
worklog/round25_modify.md
~~~

Main topics:

- Split high-level material parameter read composition into "material-parameter-queries.js".
- Kept aggregate material repository API compatible.
- Added compatibility test proving aggregate exports point to the split module.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/material-parameter-queries.js"
- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
material parameter queries
material-parameter-queries.js
toApiParameter
getMaterialSummary
getParameterSetDetail
API read composition
参数查询组装
Round 25
~~~

Useful when:

- API-facing material parameter response shapes need to be found or modified.
- Display unit conversion in read responses needs investigation.
- Material summary or parameter-set detail composition needs review.

## Round 26 - Material Repository Aggregate Contract

Log file:

~~~text
worklog/round26_modify.md
~~~

Main topics:

- Clarified material-parameters-repository.js as a compatibility aggregator.
- Added a contract test for the aggregate export list.
- Documented that record-level SQL lives in sibling modules.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
aggregate export contract
compatibility aggregator
material-parameters-repository.js
Record-level SQL lives in the sibling modules
repository contract
聚合出口
兼容聚合
Round 26
~~~

Useful when:

- Existing import/API callers depend on material-parameters-repository.js.
- Repository exports need review before future cleanup.
- A developer needs to know whether SQL belongs in the aggregate module or a sibling record module.

## Round 27 - Material HTTP Routes Split

Log file:

~~~text
worklog/round27_modify.md
~~~

Main topics:

- Split material parameter HTTP API route handling out of serve.js.
- Added server/material-routes.js with createMaterialApiHandler and isMaterialApiPath.
- Kept existing URLs, response shapes, repository calls, and resolver calls unchanged.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/server/material-routes.js"
- "pf_assistant/serve.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
material-routes.js
createMaterialApiHandler
isMaterialApiPath
/api/materials
/api/parameter-sets
/api/resolve-parameters
/api/simulation-profiles
serve.js routes
材料 API 路由
Round 27
~~~

Useful when:

- Material API route behavior needs to be found or modified.
- serve.js needs further decomposition.
- HTTP paths must remain stable while server route modules are reorganized.

## Round 28 - Material Route Handler Unit Tests

Log file:

~~~text
worklog/round28_modify.md
~~~

Main topics:

- Added MATERIAL_API_PATHS as a material API path contract.
- Added direct unit coverage for createMaterialApiHandler with injected dependencies.
- Verified /api/materials list response shaping.
- Verified /api/resolve-parameters resolver input and materialId warning behavior.

Related files:

- "pf_assistant/src/server/material-routes.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
MATERIAL_API_PATHS
createMaterialApiHandler
material route handler unit test
/api/materials
/api/resolve-parameters
materialId warning
路径清单契约
Round 28
~~~

Useful when:

- Material API route response shapes need regression coverage.
- New material API paths need to be added to the route contract.
- server route modules need unit tests without starting the HTTP server.

## Round 29 - Runtime HTTP Routes Split

Log file:

~~~text
worklog/round29_modify.md
~~~

Main topics:

- Split health and gateway-status HTTP route handling out of serve.js.
- Added server/runtime-routes.js with RUNTIME_API_PATHS, createRuntimeApiHandler, and isRuntimeApiPath.
- Added injected unit coverage for /health and /api/gateway-status responses.
- Kept runtime status and gateway status response builders unchanged.

Related files:

- "pf_assistant/src/server/runtime-routes.js"
- "pf_assistant/serve.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
runtime-routes.js
RUNTIME_API_PATHS
createRuntimeApiHandler
isRuntimeApiPath
/health
/api/gateway-status
runtime route handler unit test
Round 29
~~~

Useful when:

- Health or gateway-status HTTP route behavior needs to be found or modified.
- serve.js runtime route handling needs further cleanup.
- Runtime route tests need to run without starting the HTTP server.

## Round 30 - Auth Chat HTTP Routes Split

Log file:

~~~text
worklog/round30_modify.md
~~~

Main topics:

- Split auth/chat HTTP route dispatch out of serve.js.
- Added server/auth-chat-routes.js with AUTH_CHAT_API_PATHS, LEGACY_AUTH_API_PATHS, createAuthChatApiHandler, isAuthChatApiPath, and isLegacyAuthPath.
- Preserved auth.js business handling and legacy /auth/* 410 response behavior.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/server/auth-chat-routes.js"
- "pf_assistant/serve.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
auth-chat-routes.js
AUTH_CHAT_API_PATHS
LEGACY_AUTH_API_PATHS
createAuthChatApiHandler
isAuthChatApiPath
isLegacyAuthPath
/api/auth
/chat
/auth legacy 410
Round 30
~~~

Useful when:

- Auth/chat route delegation needs to be found or modified.
- Legacy /auth/* behavior needs review.
- serve.js route dispatch needs further cleanup.

## Round 31 - Static Proxy HTTP Routes Split

Log file:

~~~text
worklog/round31_modify.md
~~~

Main topics:

- Split static UI and bridge proxy route dispatch out of serve.js.
- Added server/static-proxy-routes.js with STATIC_PROXY_ROUTE_LABELS and createStaticProxyHandler.
- Preserved /app, /control, /webui, remaining /api proxy, and fallback static dispatch order.
- Updated README structure documentation.

Related files:

- "pf_assistant/src/server/static-proxy-routes.js"
- "pf_assistant/serve.js"
- "test/gateway-ui.test.js"
- "README.md"

Search keywords:

~~~text
static-proxy-routes.js
STATIC_PROXY_ROUTE_LABELS
createStaticProxyHandler
/app
/control
/webui
bridge proxy
static fallback
Round 31
~~~

Useful when:

- Static page or bridge proxy route dispatch needs to be found or modified.
- serve.js route dispatch needs final cleanup review.
- Dispatch order between WebUI, Control UI, bridge proxy, and static fallback needs regression coverage.


## Round 33 - Project Navigation Docs

Log file:

```text
worklog/round33_modify.md
```

Main topics:

- Added a single-page project development navigation document.
- Documented ownership for custom-webui, serve.js, src/server, src/materials, domain-assets, and worklog.
- Added a common change map for frontend, auth/chat, Gateway readiness, backend routes, materials, persistence, deployment, and history lookup.
- Marked the historical UPGRADE note and later moved it to docs/history/UPGRADE-v2-user-chat.md; new development should use README plus docs/PROJECT_NAVIGATION.md.
- Added a document contract test to keep README, UPGRADE, and worklog linked to the navigation doc.

Related files:

- `docs/PROJECT_NAVIGATION.md`
- `README.md`
- `docs/history/UPGRADE-v2-user-chat.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

Search keywords:

```text
PROJECT_NAVIGATION.md
开发导航
module ownership
serve.js 启动与编排入口
src/server HTTP route
src/materials 材料领域
历史升级记录
```

Useful when:

- Deciding where the next code change should land.
- Avoiding edits to compatibility files when the real implementation lives under src/.
- Checking whether old upgrade docs are still current.

## Round 34 - Root Compatibility Facade Documentation

Log file:

```text
worklog/round34_modify.md
```

Main topics:

- Added clear Compatibility facade comments to root-level backend re-export files.
- Preserved legacy require paths while pointing implementation work to src/.
- Updated docs/PROJECT_NAVIGATION.md with a facade-to-implementation target table.
- Added a contract test proving root facades stay documented and keep their expected src targets.

Related files:

- `pf_assistant/gateway-config.js`
- `pf_assistant/runtime-status.js`
- `pf_assistant/unit-converter.js`
- `pf_assistant/parameter-resolver.js`
- `pf_assistant/parameter-definitions-seed.js`
- `pf_assistant/material-parameters.js`
- `docs/PROJECT_NAVIGATION.md`
- `test/gateway-ui.test.js`

Search keywords:

```text
Compatibility facade
Do not add implementation logic here
legacy require path
src implementation target
gateway-config
runtime-status
unit-converter
parameter-resolver
material-parameters
```

Useful when:

- A root-level backend file looks too small and you need to find the real implementation.
- Preserving old require paths while moving implementation under src/.
- Reviewing whether compatibility files accidentally gained business logic.

## Round 35 - Scripts Navigation

Log file:

```text
worklog/round35_modify.md
```

Main topics:

- Added `pf_assistant/scripts/README.md` as the script command and category guide.
- Grouped scripts into Import Scripts, Seed Scripts, Derivation Scripts, and Smoke Check Scripts.
- Documented commands, purpose, and write-risk notes for each script.
- Linked project navigation and README to the scripts guide.
- Added a documentation contract test so every known script remains covered.

Related files:

- `pf_assistant/scripts/README.md`
- `docs/PROJECT_NAVIGATION.md`
- `README.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

Search keywords:

```text
scripts README
Import Scripts
Seed Scripts
Derivation Scripts
Smoke Check Scripts
import-magnetic-parameters.js
seed-canonical-materials.js
seed-tdf-materials.js
derive-magnetoelastic.js
smoke-check-webui.js
```

Useful when:

- Deciding which script to run for importing, seeding, deriving, or smoke checking.
- Checking whether a script writes to the database or talks to Gateway.
- Adding future scripts without losing directory organization.

## Round 36 - Backend Directory Historical Doc Cleanup

Log file:

```text
worklog/round36_modify.md
```

Main topics:

- Moved historical `pf_assistant/UPGRADE.md` out of the backend runtime package.
- Added `docs/history/UPGRADE-v2-user-chat.md` as the historical v2 user/chat upgrade record.
- Updated README and project navigation to point to the new history location.
- Added a contract test that prevents historical upgrade docs from drifting back into `pf_assistant/`.

Related files:

- `docs/history/UPGRADE-v2-user-chat.md`
- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

Search keywords:

```text
docs/history
UPGRADE-v2-user-chat.md
历史升级记录
backend directory hygiene
pf_assistant/UPGRADE.md
Round 36
```

Useful when:

- Checking whether historical docs belong under backend runtime directories.
- Looking for the v2 user system and chat persistence upgrade notes.
- Continuing cleanup of `pf_assistant/` top-level files.

## Round 37 - pf_assistant Directory Classification

Log file:

```text
worklog/round37_modify.md
```

Main topics:

- Added `docs/PF_ASSISTANT_DIRECTORY.md` as a top-level classification table for `pf_assistant/`.
- Classified entries as Runtime Entry, Business Modules, Compatibility Facades, Runtime State, Dependencies, Scripts and Tools, and Bundled Static Assets.
- Documented which files may look like historical residue but are still used as compatibility facades.
- Linked README and project navigation to the classification document.
- Added a contract test requiring key top-level entries and categories to stay documented.

Related files:

- `docs/PF_ASSISTANT_DIRECTORY.md`
- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

Search keywords:

```text
PF_ASSISTANT_DIRECTORY.md
Runtime Entry
Business Modules
Compatibility Facades
Runtime State
Dependencies
Bundled Static Assets
pf_assistant top-level classification
```

Useful when:

- Deciding whether a `pf_assistant/` top-level file is safe to move or delete.
- Explaining why root compatibility facades still exist.
- Planning the next cleanup round without touching runtime data.

## Round 38 - Cleanup Audit for Confirmed Unused Brand Assets

Log file:

```text
worklog/round38_modify.md
```

Main topics:

- Added `docs/PF_ASSISTANT_CLEANUP_AUDIT.md` for cleanup decisions.
- Recorded user-confirmed deletion of unused Nanobot bitmap brand assets.
- Verified current Nanobot dist HTML uses `research_assistant_icon.svg`, which remains present.
- Added a contract test so removed asset names and cleanup rationale remain documented.

Related files:

- `docs/PF_ASSISTANT_CLEANUP_AUDIT.md`
- `pf_assistant/nanobot/web/dist/index.html`
- `pf_assistant/nanobot/web/dist/brand/research_assistant_icon.svg`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

Search keywords:

```text
PF_ASSISTANT_CLEANUP_AUDIT.md
nanobot_apple_touch.png
nanobot_favicon_32.png
nanobot_icon.png
nanobot_logo.png
nanobot_logo.webp
research_assistant_icon.svg
confirmed unused by user
```

Useful when:

- Checking whether deleted Nanobot bitmap brand assets should be restored.
- Reviewing cleanup decisions before touching bundled static assets.
- Continuing `pf_assistant/` cleanup without confusing intentional deletion with accidental loss.

## Round 39 - Project Brief for PPT / ChatGPT

Log file:

```text
worklog/round39_modify.md
```

Main topics:

- Added `docs/PFM2_WEBUI_PROJECT_BRIEF_FOR_PPT.md`.
- Summarized project background, goals, architecture, workflows, advantages, database, config, dependencies, and PPT outline.
- Prepared copy-ready text for ChatGPT or PPT generation tools.

Related files:

- `docs/PFM2_WEBUI_PROJECT_BRIEF_FOR_PPT.md`
- `worklog/modefiy.md`

Search keywords:

```text
PFM2_WEBUI_PROJECT_BRIEF_FOR_PPT.md
PPT outline
项目总体介绍
项目架构
数据库信息
配置文件
图示建议
```

Useful when:

- Preparing PPT or project report materials.
- Copying a structured project brief into ChatGPT.
- Explaining the full project to a non-code audience.

## Round 40 - Version 0.1.2 Release Upload

Log file:



Main topics:

- Set backend package metadata to version .
- Updated package lock root metadata to keep version records consistent.
- Ensured local runtime secret file  is ignored and not uploaded.
- Prepared the repository for a  Git commit/tag upload.

Related files:

- 
- 
- 
- 
- 

Search keywords:



Useful when:

- Checking which commit/tag corresponds to version .
- Confirming runtime secret files were excluded from Git upload.
- Preparing a later version bump or release tag.

## Round 41 - Canonical Magnetic Reference Materials

Log file:

```text
worklog/round41_modify.md
```

Main topics:

- Added canonical magnetic reference materials to the parameter database.
- Fixed Excel header normalization for smart apostrophes in Young's modulus and Poisson's ratio.
- Added B1/B2 magnetoelastic derivation support from lambda and elastic constants.

Related files:

- `worklog/round41_modify.md`
- `pf_assistant/scripts/import-magnetic-parameters.js`
- `pf_assistant/scripts/derive-magnetoelastic.js`
- `pf_assistant/scripts/seed-canonical-materials.js`

Search keywords:

```text
canonical materials
B1/B2
magnetoelastic
Young's modulus
Poisson's ratio
header normalizer
```

Useful when:

- Reviewing why canonical magnetic reference values were added.
- Checking B1/B2 derivation logic and import-header fixes.
- Explaining database coverage improvements for magnetoelastic profiles.

## Round 42 - TDF Magnetostrictive Material Expansion

Log file:

```text
worklog/round42_modify.md
```

Main topics:

- Expanded the database with TDF / giant-magnetostrictive reference materials.
- Fixed seed-script young_modulus unit conversion issues.
- Added resolver synonyms so derived B1/B2 values can satisfy profile requirements.

Related files:

- `worklog/round42_modify.md`
- `pf_assistant/scripts/seed-tdf-materials.js`
- `pf_assistant/src/materials/resolvers/parameter-resolver.js`

Search keywords:

```text
TDF
Terfenol-D
Tb-Dy-Fe
Galfenol
B1_from_lambda100
B2_from_lambda100
SAW_magnetoelastic
young_modulus unit conversion
```

Useful when:

- Reviewing the TDF/Terfenol-D material expansion.
- Checking resolver support for derived magnetoelastic parameters.
- Explaining simulation-readiness improvements for SAW magnetoelastic workflows.
