# Round 43 - Ferro Phase-Field WebUI Integration

## Goal

Integrate the `pfm2_ferro_demo` ferroelectric phase-field program into the WebUI calculation platform as a chat-driven workflow.

## Scope

Planned implementation areas:

- Backend ferro job service for isolated Fortran calculation jobs.
- Polar data visualization from `Polar.*******.dat` to PNG.
- `/api/ferro/*` HTTP routes.
- Chat dialogue parameter collection for ferroelectric simulations.
- Frontend routing and result-card rendering for `ferro_result`.

## Key Notes

- Existing worklog numbering reached Round 42, so this integration continues as Round 43.
- The original template directory `/home/admin/.openclaw/workspace/TangSY/pfm2_ferro_demo` must not be used as a live job directory.
- Each WebUI job should copy the template into `pf_assistant/data/ferro/jobs/<jobId>/case`.
- The per-job execution sequence is `make clean`, `make`, then `./main.exe`.
- The first visualization target is `Polar.*******.dat`, defaulting to the `pz` component on an `x-z` slice.
- Preserve existing `efffield` behavior and route contracts.

## Implementation Log

### Initial Setup

- Confirmed existing worklog directory and index file already exist.
- Next log file selected: `worklog/round43_modify.md`.
- Existing implementation plan: `docs/superpowers/plans/2026-06-03-ferro-webui-integration.md`.

### Backend Job Service Implemented

Changed files:

- `pf_assistant/src/ferro/process-runner.js`
- `pf_assistant/src/ferro/result-indexer.js`
- `pf_assistant/src/ferro/job-service.js`
- `pf_assistant/src/ferro/polar-visualizer.py`
- `test/ferro-service.test.js`

What changed:

- Added a `ferro` job service that creates isolated job directories.
- Added request validation for grid, material, run, field, and visualization parameters.
- Added template copying from `FERRO_TEMPLATE_ROOT` or the default `TangSY/pfm2_ferro_demo` path.
- Added per-job execution sequence: `make clean`, `make`, `./main.exe`, `python3 polar-visualizer.py`.
- Added result indexing for `Polar.*******.dat` and `figures/Polar.*******.png`.
- Added asset path safety checks to prevent path traversal.
- Added a pure Python standard-library PNG heatmap visualizer.

Important adjustment:

- The first visualizer draft used Matplotlib, but the runtime Python environment did not have `matplotlib` installed. To reduce deployment friction, `polar-visualizer.py` now writes PNG files using only Python standard library modules: `struct`, `zlib`, `math`, `argparse`, and `pathlib`.

Verification:

```bash
node --test test/ferro-service.test.js
```

Result:

```text
# pass 3
# fail 0
```

### Dialogue, Routes, Frontend, and Docs Implemented

Changed files:

- `pf_assistant/src/ferro/dialogue-service.js`
- `pf_assistant/src/server/ferro-routes.js`
- `pf_assistant/serve.js`
- `custom-webui/js/app.js`
- `custom-webui/js/chat-renderer.js`
- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `test/ferro-dialogue.test.js`
- `test/ferro-routes.test.js`
- `test/gateway-ui.test.js`

What changed:

- Added `/api/ferro/dialogue`, `/api/ferro/jobs`, `/api/ferro/jobs/:id`, `/api/ferro/jobs/:id/results`, and `/api/ferro/assets/:id/:file` route handling.
- Wired ferro routes into `serve.js` as top-level route delegation only.
- Added Chinese ferro dialogue intent detection for messages containing terms such as `铁电`, `畴结构`, `极化分布`, and `相场模拟`.
- Added frontend `ferro_result` rendering with safe `/api/ferro/assets/` image URLs.
- Updated docs to describe the ferro module and chat-driven workflow.

Verification so far:

```bash
node --check pf_assistant/serve.js
node --test test/ferro-service.test.js test/ferro-dialogue.test.js test/ferro-routes.test.js
node --test test/gateway-ui.test.js
```

Results observed:

```text
ferro backend tests: pass 7, fail 0
gateway-ui tests: pass 47, fail 0
```

## Remaining Notes

- A tiny real Fortran smoke test is still recommended before exposing this to normal users.
- The current image renderer creates simple heatmap PNG files without a colorbar to avoid Python package dependencies.
- The first supported slice is `xz`; additional slices can be added later once 3D cases are part of the UI workflow.

### Real Tiny Job Smoke Test

Command shape:

```text
createFerroJobService().createAndRunJob({ grid: 16x1x16, kstep: 2, kprnt: 2, component: pz })
```

Result:

```json
{
  "status": "completed",
  "outputs": [{ "name": "Polar.0000002.dat" }],
  "assets": [{ "name": "Polar.0000002_pz.png" }]
}
```

Observed job id:

```text
ferro_1780488618586_22538575
```

This confirms the real workflow can copy the Fortran template, run `make clean`, run `make`, execute `./main.exe`, and generate a PNG from `Polar.0000002.dat` inside an isolated WebUI job directory.

### Permission Fix for Ferro Jobs Directory

Issue observed from WebUI chat:

```text
EACCES: permission denied, mkdir '/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/data/ferro/jobs/<jobId>/case'
```

Root cause:

- A previous smoke test was executed with elevated privileges.
- That created `pf_assistant/data/ferro` and `pf_assistant/data/ferro/jobs` as `root:root`.
- The production WebUI service runs as `admin`, so it could not create new ferro job directories.

Fix applied:

```bash
chown -R admin:admin /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/data/ferro
```

Verification:

```bash
runuser -u admin -- test -w /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/data/ferro/jobs
curl --noproxy '*' -sS http://127.0.0.1:3000/health
```

Result:

- `data/ferro` and `data/ferro/jobs` are now owned by `admin:admin`.
- `admin` can write to `data/ferro/jobs`.
- `/health` returns `ok: true`.

Note:

- Future elevated smoke tests must restore `data/ferro` ownership to `admin:admin` afterward.


## 2026-06-03 20:25 补充：铁电 ready 确认消息路由修复

### 问题现象
- 前端铁电向导已经提示“回复开始计算即可运行”后，用户发送“开始计算”，消息有时被转发到普通 Gateway 聊天。
- 普通 AI 因看不到铁电向导上下文，回复“没看到具体要算什么”，导致计算没有启动。

### 根因判断
- “开始计算”本身不包含“铁电/畴结构/极化分布”等关键词。
- 当前端的 `activeFerroDialogue` 状态因页面刷新、服务重启或会话恢复丢失时，确认消息无法命中铁电路由。
- 后端 job 启动失败时，draft 会停在 `running` 状态，下一次确认无法再次触发运行。

### 修改内容
- `custom-webui/js/app.js`
  - 增加铁电 draft 的 `sessionStorage` 持久化，按 chat session 保存 ready draft。
  - `shouldRouteToFerroDialogue()` 支持在存在 ready draft 时，将“开始计算/开始/运行/确认”等确认词路由到铁电流程。
  - 当检测到 stored ready draft + 确认词时，直接调用 `/api/ferro/jobs`，避免依赖后端内存 draft 是否还存在。
  - 计算成功后清理 stored draft；启动失败时保留 draft，方便用户修复问题后再次发送“开始计算”。
- `pf_assistant/src/ferro/dialogue-service.js`
  - job 启动失败时将 draft 状态恢复为 `ready` 并保留，避免一次失败后无法重试。
- `test/gateway-ui.test.js`
  - 为 UI sandbox 增加 `sessionStorage` mock。
  - 增加 ready draft + “开始计算”仍进入铁电计算路径的回归测试。
- `test/ferro-dialogue.test.js`
  - 增加 job 首次启动失败、第二次确认可重试成功的回归测试。

### 验证
- `node --test test/ferro-dialogue.test.js`：通过。
- `node --test test/gateway-ui.test.js`：通过。
- `node --test test/ferro-service.test.js test/ferro-routes.test.js`：通过。
- `node --check custom-webui/js/app.js`：通过。
- `node --check pf_assistant/src/ferro/dialogue-service.js`：通过。

### 注意事项
- 浏览器页面需要刷新后才能加载新的 `custom-webui/js/app.js`。
- 如果页面已经停在旧脚本状态，直接刷新页面，再从铁电向导继续或重新发起一轮即可。

## 2026-06-03 20:45 补充：铁电极化取向箭头图

### 背景
- 现有结果卡片主要展示 `Polar.*_pz.png`，本质是 Pz 分量红蓝热图。
- 对铁电畴结构而言，仅看 Pz 正负分区不够直观；需要通过箭头表达局部极化取向，尤其便于观察畴壁附近的旋转和倾斜。

### 方案
- 保留原有 `Pz` 热图输出：`Polar.XXXXXXX_pz.png`。
- 新增取向箭头图：`Polar.XXXXXXX_vector.png`。
- vector 图采用 `Pz` 热图作为背景，并叠加 `(Px, Pz)` 在 x-z 截面内的方向箭头。
- 箭头自动降采样：按照网格尺寸计算 stride，避免 64×64 等网格下箭头过密。
- 箭头长度按方向归一化，仅表达取向，不让局部幅值差异导致箭头过长或过短。

### 修改内容
- `pf_assistant/src/ferro/polar-visualizer.py`
  - 重构读取结果为 `px/py/pz` 三个二维场。
  - 保留原分量热图 PNG 写出。
  - 新增 `vector_png_on_pz()`，生成 Pz 背景 + Px/Pz 箭头叠加图。
  - 继续使用纯 Python PNG 写法，无新增 matplotlib/Pillow 依赖。
- `pf_assistant/src/ferro/result-indexer.js`
  - 将 `Polar.*_vector.png` 标题显示为 `极化取向箭头图 kt=...`。
- `test/ferro-service.test.js`
  - 增加 visualizer 同时生成 `_pz.png` 和 `_vector.png` 的断言。
  - 增加 result indexer 对 vector 图标题的回归测试。

### 验证
- `node --test test/ferro-service.test.js`：通过。
- `node --test test/ferro-routes.test.js test/ferro-dialogue.test.js`：通过。
- `node --test test/gateway-ui.test.js`：通过。
- `python3 -m py_compile pf_assistant/src/ferro/polar-visualizer.py`：通过。
- `node --check pf_assistant/src/ferro/result-indexer.js`：通过。
- `node --check pf_assistant/src/ferro/job-service.js`：通过。
- 使用临时 `Polar.0000002.dat` 做烟测，确认生成 `Polar.0000002_pz.png` 和 `Polar.0000002_vector.png`，且均为有效 PNG。

### 注意事项
- 新增箭头图只会在后续新计算中生成；历史 job 的 figures 目录不会自动补图。
- 若需要给历史结果补图，可对对应 case 目录手动运行 `python3 pf_assistant/src/ferro/polar-visualizer.py <case_dir> --component pz --slice xz --steps all`。

## 2026-06-03 20:52 补充：放大铁电取向箭头

### 背景
- 用户反馈新增 `Polar.*_vector.png` 中箭头仍偏小，方向可读性不足。

### 修改内容
- `pf_assistant/src/ferro/polar-visualizer.py`
  - 将箭头尺寸参数提为常量，便于后续调节和测试。
  - `ARROW_LENGTH_FACTOR = 0.75`：箭头长度约为采样间距 75%。
  - `ARROW_OUTLINE_THICKNESS = 4`，`ARROW_INNER_THICKNESS = 2`：增强红蓝背景上的对比度。
  - `ARROW_HEAD_MAX = 13.0`，`ARROW_HEAD_FACTOR = 0.42`：放大箭头头部。
- `test/ferro-service.test.js`
  - 增加箭头尺寸参数回归测试，避免后续意外回退到偏小参数。

### 验证
- `node --test test/ferro-service.test.js`：通过。
- `python3 -m py_compile pf_assistant/src/ferro/polar-visualizer.py`：通过。
- 使用 64×64 临时 Polar 数据烟测，生成有效 `Polar.0000002_vector.png`，尺寸 384×384。

### 注意事项
- 放大仅影响后续新计算或重新运行 visualizer 的结果；历史图不会自动刷新。

## 2026-06-03 21:05 补充：铁电材料参数数据库设计文档

### 背景
- 用户希望后续像铁磁材料参数库一样，构建铁电材料参数数据库。
- 用户提供了 BFO、PZT、BTO 等 Fortran 参数片段，希望整理进入平台。

### 新增文档
- `docs/superpowers/specs/2026-06-03-ferro-material-database-design.md`

### 主要内容
- 明确当前 WebUI 铁电计算仍以 PMN-PT 为默认硬编码路径。
- 将首批材料体系整理为：PMN-PT、BTO/BaTiO3、PZT、BFO。
- 将用户提供的 PZT Haun 1989 公式整理为 `pzt_haun_1989` 模型。
- 将 BFO 片段整理为 `bfo_bens_coefficients` 与 `bfo_10004` 两个待确认模型版本。
- 标注 BFO 片段中 `c11/c12/c44` 多次赋值时，按 Fortran 顺序最终生效值为 `300e9/162e9/69e9`。
- 设计三张数据库表：`ferro_materials`、`ferro_parameter_models`、`ferro_parameter_snapshots`。
- 设计 `material-models.js` 输出契约，后续 `job-service.js` 只依赖统一 coefficients 对象写入 `input.in`。
- 给出 Round A-D 集成路线：先模型注册表，再 PZT/BFO，再数据库持久化，最后对话/UI 选择。

### 注意事项
- 公式先落在 JS 模型函数中，数据库先存 metadata 和计算快照，避免把复杂公式直接塞进 SQL。
- BFO 来源和标签后续需要用户确认，避免把可能混淆的 BTO-like 参数当成最终 BFO 文献数据。

## 2026-06-03 21:20 补充：Round A 铁电材料模型注册表

### 目标
- 执行铁电材料参数数据库设计文档中的 Round A：先建立代码层材料模型注册表，不改数据库 schema。
- 目标是把 WebUI 当前 PMN-PT 硬编码材料常数迁移到统一模型接口，并接入已有 BTO/BaTiO3 模型。

### 新增文件
- `pf_assistant/src/ferro/material-models.js`
  - 新增 `listFerroMaterialModels()`。
  - 新增 `resolveFerroMaterialModel()`。
  - 新增 `calculateFerroCoefficients()`。
  - 首批模型：`pmn_pt_default`、`bto_generate_input`。

### 修改内容
- `pf_assistant/src/ferro/job-service.js`
  - `validateRequest()` 中的 material 现在保留 `materialKey/modelKey/xf/tem`。
  - `buildInput()` 不再直接写死 PMN-PT 材料常数，而是调用 `calculateFerroCoefficients()` 获取系数。
  - 默认仍为 PMN-PT，保持现有计算路径兼容。
  - BTO 请求会写入 BTO 的 `Q1/Q2/Q4`、`s11/s12/s44`、`a0/p0` 和 Landau 系数。
- `pf_assistant/src/ferro/dialogue-service.js`
  - 默认材料 draft 现在包含 `materialKey='pmn_pt'`、`modelKey='pmn_pt_default'`。
  - 支持解析 `BTO`、`BaTiO3`、`钛酸钡` 为 `bto_generate_input`。
  - ready summary 显示材料名和模型名。
- `test/ferro-service.test.js`
  - 增加材料模型注册表测试。
  - 增加 BTO job-service 写入 `input.in` 的回归测试。
- `test/ferro-dialogue.test.js`
  - 增加对话中选择 BTO 材料模型的回归测试。
- `docs/superpowers/plans/2026-06-03-ferro-material-model-registry.md`
  - 新增 Round A 具体实施计划，并标记已完成的测试/实现/验证步骤。

### 验证
- `node --test test/ferro-service.test.js`：通过。
- `node --test test/ferro-dialogue.test.js`：通过。
- `node --test test/ferro-routes.test.js test/gateway-ui.test.js`：通过。
- `node --check pf_assistant/src/ferro/material-models.js`：通过。
- `node --check pf_assistant/src/ferro/job-service.js`：通过。
- `node --check pf_assistant/src/ferro/dialogue-service.js`：通过。

### 当前能力
- 默认对话仍可使用 PMN-PT。
- 用户可说“材料换成 BTO，温度 298K”，对话 draft 会记录 `materialKey=bto`、`modelKey=bto_generate_input`。
- 后续计算会根据材料模型写入对应材料系数。

### 后续
- Round B：接入 `pzt_haun_1989` 和两个 BFO 模型版本。
- Round C：新增铁电材料参数数据库表和参数快照持久化。

## 2026-06-03 21:35 补充：Round B 接入 PZT/BFO 铁电材料模型

### 目标
- 在 Round A 的材料模型注册表基础上，接入用户提供的 PZT Haun 1989 和 BFO 参数片段。
- 暂不改数据库 schema，继续保持公式模型在 JS 代码中，数据库持久化留到 Round C。

### 修改内容
- `pf_assistant/src/ferro/material-models.js`
  - 新增 `pzt_haun_1989`：PZT Haun 1989 公式模型，支持 `xf/tem`。
  - 新增 `bfo_bens_coefficients`：BFO Bens 参数模型，默认 `tem=380K`。
  - 新增 `bfo_10004`：BFO 10004 source-check 模型，保留来源待确认 warning。
  - PZT 模型返回 `Curie_C/T0/zta1/zta2` 等中间量，便于后续快照入库。
  - BFO Bens 片段中最终 Fortran-active stiffness 取 `c11=300e9`、`c12=162e9`、`c44=69e9`，同时推导 `s11/s12/s44` 用于写入当前 `input.in`。
  - BFO 两个模型均携带 warnings，提醒来源/重复赋值问题。
- `pf_assistant/src/ferro/job-service.js`
  - `normalizeMaterial()` 改为从 `resolveFerroMaterialModel()` 获取各模型默认 `xf/tem`。
  - PZT 默认 `xf=0.48, tem=300`；BFO 默认 `xf=1.0, tem=380`。
- `pf_assistant/src/ferro/dialogue-service.js`
  - 支持识别 `PZT/锆钛酸铅` 为 `pzt_haun_1989`。
  - 支持识别 `BFO/BiFeO3/铁酸铋`，默认使用 `bfo_bens_coefficients`。
  - 若用户明确说 `10004`，使用 `bfo_10004`。
- `test/ferro-service.test.js`
  - 增加 PZT/BFO 模型注册表和系数快照测试。
  - 增加 job-service 按所选模型读取默认 `xf/tem` 的测试。
- `test/ferro-dialogue.test.js`
  - 增加 PZT 和 BFO 对话材料选择解析测试。
- `docs/superpowers/plans/2026-06-03-ferro-material-model-registry.md`
  - 追加 Round B 执行记录。

### 验证
- `node --test test/ferro-service.test.js`：通过。
- `node --test test/ferro-dialogue.test.js`：通过。
- `node --test test/ferro-routes.test.js test/gateway-ui.test.js`：通过。
- `node --check pf_assistant/src/ferro/material-models.js`：通过。
- `node --check pf_assistant/src/ferro/job-service.js`：通过。
- `node --check pf_assistant/src/ferro/dialogue-service.js`：通过。

### 当前可用材料模型
- `PMN-PT`：`pmn_pt_default`
- `BaTiO3/BTO`：`bto_generate_input`
- `PZT`：`pzt_haun_1989`
- `BFO`：`bfo_bens_coefficients`
- `BFO`：`bfo_10004`，来源待确认

### 示例对话
- `材料换成 PZT Haun 1989，xf=0.48，温度 300K`
- `用 BFO Bens 参数，温度 380K`
- `用 BFO 10004，温度 380K`

### 后续
- Round C：新增 ferro material tables，并将 coefficients snapshot 绑定到 job。

## 2026-06-03 22:10 补充：Round C 铁电材料参数数据库与计算快照

### 目标
- 将铁电材料模型从纯 JS 注册表进一步接入 SQLite 元数据表。
- 每次铁电计算完成后保存本次使用的材料模型和计算得到的系数快照。
- 给前端预留材料模型列表接口，后续可以做下拉选择或对话推荐。

### 修改内容
- `pf_assistant/database.js`
  - 新增 `initFerroMaterialTables()`。
  - 新增 `ferro_materials`、`ferro_parameter_models`、`ferro_parameter_snapshots` 三张表。
- `pf_assistant/schema.sql`
  - 同步补充上述三张铁电材料参数表，便于新库初始化。
- `pf_assistant/src/ferro/material-repository.js`
  - 新增材料参数仓库。
  - 从 `material-models.js` 自动 seed PMN-PT、BTO、PZT、BFO 模型元数据。
  - 支持保存/查询按 job 绑定的系数快照。
- `pf_assistant/src/ferro/job-service.js`
  - 计算完成后调用 `calculateFerroCoefficients()` 并保存 snapshot。
  - 保持原计算流程不变：准备 case、运行 Fortran、渲染图片、索引结果。
- `pf_assistant/src/server/ferro-routes.js`
  - 新增 `GET /api/ferro/materials`，返回前端可用的材料模型列表。
- `test/ferro-material-repository.test.js`
  - 新增仓库级测试，覆盖 seed、PZT 系数计算、snapshot 保存/读取。
- `test/ferro-service.test.js`
  - 新增作业完成后保存材料系数快照的回归测试。
- `test/ferro-routes.test.js`
  - 新增 `/api/ferro/materials` 路由测试。

### 验证
- `node --check pf_assistant/database.js`：通过。
- `node --check pf_assistant/src/ferro/material-repository.js`：通过。
- `node --check pf_assistant/src/ferro/job-service.js`：通过。
- `node --check pf_assistant/src/server/ferro-routes.js`：通过。
- `node --test test/ferro-service.test.js test/ferro-material-repository.test.js test/ferro-dialogue.test.js test/ferro-routes.test.js`：18 项通过。
- `node --test test/gateway-ui.test.js`：49 项通过。

### 当前可用材料模型
- `pmn_pt_default`：PMN-PT 默认模型。
- `bto_generate_input`：来自 `generate_input.py` 的 BaTiO3/BTO 模型。
- `pzt_haun_1989`：PZT Haun 1989 公式模型。
- `bfo_bens_coefficients`：BFO Bens 参数片段模型。
- `bfo_10004`：BFO 10004 参数片段模型，来源仍需后续文献确认。

### 注意事项
- 当前数据库保存的是“模型元数据 + 本次计算展开后的系数快照”，公式本体仍在 `material-models.js` 中。
- 这样可以先保证 Fortran 输入可复现；后续若要做完整材料数据库管理，可再把公式表达式、文献 DOI、适用相区和可信等级拆表。
- 前端下一步可调用 `/api/ferro/materials`，在对话引导中展示材料体系和默认 `xf/tem`。
