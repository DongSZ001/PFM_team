# Ferro WebUI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-driven ferroelectric phase-field calculation workflow to PFM2 WebUI that runs the `pfm2_ferro_demo` Fortran program, visualizes `Polar.*******.dat`, and displays generated images in the chat UI.

**Architecture:** Implement a new `ferro` module parallel to the existing `efffield` module. The backend creates isolated job directories, copies the Fortran template, writes `input.in`, runs `make clean`, `make`, and `./main.exe`, then generates PNG plots from `Polar.*.dat`. The frontend routes ferroelectric chat intents to `/api/ferro/dialogue` and renders `ferro_result` cards with image assets served by `/api/ferro/assets/:jobId/:filename`.

**Tech Stack:** Node.js HTTP route modules, native JavaScript frontend, Fortran `ifort`/MKL executable workflow, Python 3 + NumPy + Matplotlib for visualization, `node:test` for backend/frontend unit tests.

---

## File Structure

Create these files:

- `pf_assistant/src/ferro/job-service.js`: validates requests, creates isolated jobs, prepares case files, runs Fortran workflow, indexes outputs.
- `pf_assistant/src/ferro/process-runner.js`: small child-process runner for `make` and `./main.exe` with timeout and log capture.
- `pf_assistant/src/ferro/result-indexer.js`: finds `Polar.*.dat`, generated figures, and summary output files.
- `pf_assistant/src/ferro/dialogue-service.js`: handles Chinese chat-driven parameter collection for ferroelectric calculations.
- `pf_assistant/src/ferro/polar-visualizer.py`: converts `Polar.*.dat` into PNG images.
- `pf_assistant/src/server/ferro-routes.js`: exposes `/api/ferro/dialogue`, `/api/ferro/jobs`, `/api/ferro/jobs/:id`, and `/api/ferro/assets/:id/:file`.
- `test/ferro-service.test.js`: backend job-service, input generation, asset safety, and output indexing tests.
- `test/ferro-dialogue.test.js`: dialogue intent and parameter collection tests.
- `test/ferro-routes.test.js`: route dispatch, auth, result JSON, and PNG asset serving tests.

Modify these files:

- `pf_assistant/serve.js`: import and delegate to `ferro-routes.js` beside `efffield-routes.js`.
- `custom-webui/js/app.js`: detect ferroelectric intents and call `/api/ferro/dialogue`.
- `custom-webui/js/chat-renderer.js`: render `ferro_result` cards and allow `/api/ferro/assets/` image URLs.
- `custom-webui/css/styles.css`: reuse or extend current result-card styles for ferroelectric result images.
- `test/gateway-ui.test.js`: add frontend parsing/rendering coverage and serve.js route-delegation assertion.
- `README.md`: document the new ferroelectric calculation integration at a high level.
- `docs/PROJECT_NAVIGATION.md`: add `pf_assistant/src/ferro/` to the module ownership map.

Do not modify the source template at `/home/admin/.openclaw/workspace/TangSY/pfm2_ferro_demo` during WebUI jobs. It is copied into per-job directories.

---

### Task 1: Ferro Job Service Core

**Files:**
- Create: `pf_assistant/src/ferro/process-runner.js`
- Create: `pf_assistant/src/ferro/result-indexer.js`
- Create: `pf_assistant/src/ferro/job-service.js`
- Test: `test/ferro-service.test.js`

- [ ] **Step 1: Write failing tests for job validation and case preparation**

Create `test/ferro-service.test.js` with a test that stubs the runner and verifies:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('ferro service validates request, prepares isolated case, runs workflow, and indexes figures', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');
  fs.writeFileSync(path.join(templateRoot, 'input.in'), 'template input\n');

  const calls = [];
  const runner = async ({ command, args, cwd }) => {
    calls.push({ command, args, cwd });
    if (command === './main.exe') {
      fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n1 1 2 0.2 0.3 0.4\n');
    }
    if (String(args[0]).endsWith('polar-visualizer.py')) {
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_pz.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };

  const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000000 });
  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: {
      grid: { nx: 16, ny: 1, nz: 16 },
      material: { xf: 0.3, tem: 298 },
      run: { kstep: 2, kprnt: 2 },
      visualization: { component: 'pz', slice: 'xz', steps: 'all' },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.system, 'ferroelectric');
  assert.equal(result.assets[0].name, 'Polar.0000002_pz.png');
  assert.match(fs.readFileSync(path.join(result.caseDir, 'input.in'), 'utf8'), /16 1 16 !nx, ny, nz/);
  assert.deepEqual(calls.map((c) => c.command), ['make', 'make', './main.exe', 'python3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/ferro-service.test.js
```

Expected: FAIL with module-not-found for `pf_assistant/src/ferro/job-service`.

- [ ] **Step 3: Implement `process-runner.js`**

Create a child-process helper with this public contract:

```js
'use strict';

const { spawn } = require('child_process');

function runProcess({ command, args = [], cwd, env = {}, timeoutMs = 30 * 60 * 1000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs).unref();
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 1 : code, signal, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

module.exports = { runProcess };
```

- [ ] **Step 4: Implement `result-indexer.js`**

Index `Polar.*.dat` and figures:

```js
'use strict';

const fs = require('fs');
const path = require('path');

function indexFerroResults({ jobId, caseDir }) {
  const outputs = fs.readdirSync(caseDir)
    .filter((name) => /^Polar\.\d{7}\.dat$/.test(name))
    .sort()
    .map((name) => ({ name }));
  const figuresDir = path.join(caseDir, 'figures');
  const assets = fs.existsSync(figuresDir)
    ? fs.readdirSync(figuresDir).filter((name) => /^Polar\.\d{7}_[A-Za-z0-9_-]+\.png$/.test(name)).sort().map((name) => ({
        name,
        title: titleForFigure(name),
        url: `/api/ferro/assets/${encodeURIComponent(jobId)}/${encodeURIComponent(name)}`,
      }))
    : [];
  return { outputs, assets };
}

function titleForFigure(name) {
  const match = name.match(/^Polar\.(\d{7})_([A-Za-z0-9_-]+)\.png$/);
  if (!match) return name;
  return `极化 ${match[2]} 分量 kt=${Number(match[1])}`;
}

module.exports = { indexFerroResults };
```

- [ ] **Step 5: Implement `job-service.js`**

Implement:

- `validateRequest(request)`: clamps `nx 8-256`, `ny 1-64`, `nz 8-256`, `kstep 1-50000`, `kprnt 1-kstep`, `xf 0-1`, `tem 1-2000`, `component in px/py/pz/magnitude`.
- `createAndRunJob({ userId, chatSessionId, request })`: creates `ferro_<timestamp>_<hex>`, copies template files, writes `input.in`, runs `make clean`, `make`, `./main.exe`, then `python3 polar-visualizer.py`.
- `getJobResult(jobId)` and `resolveAssetPath(jobId, filename)`.

Use per-job paths:

```js
const DEFAULT_TEMPLATE_ROOT = process.env.FERRO_TEMPLATE_ROOT || '/home/admin/.openclaw/workspace/TangSY/pfm2_ferro_demo';
const DEFAULT_JOBS_ROOT = path.join(paths.backendRoot, 'data', 'ferro', 'jobs');
```

- [ ] **Step 6: Run service test to verify it passes**

Run:

```bash
node --test test/ferro-service.test.js
```

Expected: PASS.

---

### Task 2: Polar Visualization Script

**Files:**
- Create: `pf_assistant/src/ferro/polar-visualizer.py`
- Test: extend `test/ferro-service.test.js`

- [ ] **Step 1: Write failing visualization test**

Add a test that creates `Polar.0000002.dat`, runs the Python script via `child_process.spawnSync`, and asserts `figures/Polar.0000002_pz.png` exists.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/ferro-service.test.js
```

Expected: FAIL because `polar-visualizer.py` does not exist.

- [ ] **Step 3: Implement `polar-visualizer.py`**

Script behavior:

```bash
python3 polar-visualizer.py /path/to/case --component pz --slice xz --steps all
```

Requirements:

- Use `argparse`, `numpy`, `matplotlib` with `Agg` backend.
- Read `Polar.*******.dat` files.
- Columns are `i j k px py pz`.
- For `slice=xz`, filter or reshape by `i,k`; current production default assumes `ny=1`.
- `component` maps to `px`, `py`, `pz`, or `sqrt(px^2+py^2+pz^2)`.
- Save PNG files under `case/figures/`.

- [ ] **Step 4: Run visualization test to verify it passes**

Run:

```bash
node --test test/ferro-service.test.js
```

Expected: PASS.

---

### Task 3: Ferro HTTP Routes and Serve Wiring

**Files:**
- Create: `pf_assistant/src/server/ferro-routes.js`
- Modify: `pf_assistant/serve.js`
- Test: `test/ferro-routes.test.js`
- Test: update `test/gateway-ui.test.js`

- [ ] **Step 1: Write failing route tests**

Create `test/ferro-routes.test.js` asserting:

- `isFerroApiPath('/api/ferro/jobs') === true`.
- POST `/api/ferro/jobs` requires auth, calls service, and returns JSON.
- GET `/api/ferro/assets/:jobId/:file.png` serves `image/png`.
- path traversal such as `../request.json` is rejected by service.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/ferro-routes.test.js
```

Expected: FAIL with module-not-found for `ferro-routes`.

- [ ] **Step 3: Implement `ferro-routes.js`**

Mirror the `efffield-routes.js` structure with these exported names:

```js
module.exports = {
  FERRO_API_PATHS,
  createFerroApiHandler,
  isFerroApiPath,
};
```

Supported endpoints:

- `POST /api/ferro/dialogue`
- `POST /api/ferro/jobs`
- `GET /api/ferro/jobs/:jobId`
- `GET /api/ferro/jobs/:jobId/results`
- `GET /api/ferro/assets/:jobId/:filename`

- [ ] **Step 4: Wire `serve.js`**

Add imports beside efffield:

```js
const { createFerroApiHandler, isFerroApiPath } = require('./src/server/ferro-routes');
```

Create handler beside `efffieldApiHandler` and add route dispatch before static fallback:

```js
if (isFerroApiPath(urlPath) && await ferroApiHandler(req, res, url, urlPath)) return;
```

- [ ] **Step 5: Run route and syntax checks**

Run:

```bash
node --check pf_assistant/serve.js
node --test test/ferro-routes.test.js
node --test test/gateway-ui.test.js
```

Expected: PASS.

---

### Task 4: Ferro Dialogue Service

**Files:**
- Create: `pf_assistant/src/ferro/dialogue-service.js`
- Modify: `pf_assistant/src/server/ferro-routes.js`
- Test: `test/ferro-dialogue.test.js`

- [ ] **Step 1: Write failing dialogue tests**

Create tests covering:

- User says `做一个铁电畴结构计算` and service asks for grid/time parameters.
- User provides `64×1×64，跑 20000 步，每 5000 步输出`.
- User says `默认温度和成分`.
- User confirms `开始计算`, and service calls job service with `grid`, `material`, `run`, and `visualization`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/ferro-dialogue.test.js
```

Expected: FAIL because `dialogue-service.js` does not exist.

- [ ] **Step 3: Implement dialogue draft flow**

Draft fields:

```js
{
  status: 'collecting',
  system: 'ferroelectric',
  grid: null,
  material: { xf: 0.3, tem: 298 },
  run: null,
  initial: { magn: 0.1, n_random: 15 },
  field: { appel30: 0.009, appel31: 0.001 },
  visualization: { component: 'pz', slice: 'xz', steps: 'all' },
}
```

Intent detection should match:

- `铁电`
- `畴结构`
- `极化分布`
- `相场模拟`
- slash command `/ferro`

- [ ] **Step 4: Run dialogue test to verify it passes**

Run:

```bash
node --test test/ferro-dialogue.test.js
```

Expected: PASS.

---

### Task 5: Frontend Chat Integration and Result Rendering

**Files:**
- Modify: `custom-webui/js/app.js`
- Modify: `custom-webui/js/chat-renderer.js`
- Modify: `custom-webui/css/styles.css`
- Test: update `test/gateway-ui.test.js`

- [ ] **Step 1: Write failing frontend tests**

Extend `test/gateway-ui.test.js` to verify:

- `shouldRouteToFerroDialogue('做一个铁电畴结构计算')` returns true.
- `buildFerroDialogueRequest('...', 'chat-1')` returns `{ message, chatSessionId }`.
- `formatContent({ type: 'ferro_result', assets: [...] })` renders image HTML.
- `/api/ferro/assets/ferro_1/Polar.0005000_pz.png` is accepted as a safe image URL.

- [ ] **Step 2: Run frontend tests to verify failure**

Run:

```bash
node --test test/gateway-ui.test.js
```

Expected: FAIL because ferro helpers/rendering are not implemented.

- [ ] **Step 3: Add frontend routing**

In `custom-webui/js/app.js`, add helpers parallel to efffield:

```js
function parseFerroCommand(content) { /* detect /ferro and Chinese ferro intents */ }
function shouldRouteToFerroDialogue(content, hasActiveDraft = activeFerroDialogue) { /* boolean */ }
function buildFerroDialogueRequest(message, chatSessionId) { return { message, chatSessionId }; }
async function runFerroDialogue(content) { /* POST /api/ferro/dialogue */ }
```

Dispatch ferro before ordinary Gateway chat, and keep efffield behavior unchanged.

- [ ] **Step 4: Add result rendering**

In `chat-renderer.js`, generalize safe image URL handling to allow both:

- `/api/efffield/assets/`
- `/api/ferro/assets/`

Add `renderFerroResultCard(result)` or generalize current result card to show header `铁电相场计算结果` for `type === 'ferro_result'`.

- [ ] **Step 5: Run frontend tests**

Run:

```bash
node --test test/gateway-ui.test.js
```

Expected: PASS.

---

### Task 6: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/PROJECT_NAVIGATION.md`
- Optional create: `docs/ferro-webui-integration.md`

- [ ] **Step 1: Document user workflow**

Add a section explaining:

```text
在聊天框输入“做一个铁电畴结构计算”，WebUI 会进入铁电相场计算向导，收集网格、步数、输出间隔、材料参数和可视化分量，计算完成后在聊天中显示极化分布图片。
```

- [ ] **Step 2: Document backend module ownership**

Update `docs/PROJECT_NAVIGATION.md` with:

```text
pf_assistant/src/ferro/ - 铁电相场计算 job service、对话参数收集、Polar 文件后处理和结果索引。
```

- [ ] **Step 3: Run full relevant verification**

Run:

```bash
node --check pf_assistant/serve.js
node --test test/ferro-service.test.js
node --test test/ferro-dialogue.test.js
node --test test/ferro-routes.test.js
node --test test/gateway-ui.test.js
```

Expected: all pass.

- [ ] **Step 4: Manual smoke test with tiny case**

Use WebUI or direct API with a tiny request:

```json
{
  "grid": { "nx": 16, "ny": 1, "nz": 16 },
  "material": { "xf": 0.3, "tem": 298 },
  "run": { "kstep": 2, "kprnt": 2 },
  "visualization": { "component": "pz", "slice": "xz", "steps": "all" }
}
```

Expected:

- job status is `completed`;
- `Polar.0000002.dat` exists in the job case directory;
- `figures/Polar.0000002_pz.png` exists;
- chat UI shows the PNG image card.

---

## Self-Review

- Spec coverage: Covers isolated job execution, `make clean -> make -> ./main.exe`, `Polar.*.dat` visualization, API assets, and chat UI display.
- Placeholder scan: No task uses TBD/TODO/implement-later language. Each task gives concrete files, commands, and expected results.
- Type consistency: Result type is consistently `ferro_result`; API prefix is consistently `/api/ferro`; job id prefix is consistently `ferro_`; request fields are consistently `grid`, `material`, `run`, `initial`, `field`, and `visualization`.
