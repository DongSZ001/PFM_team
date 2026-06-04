# Ferro Material Model Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a ferroelectric material model registry so PFM2 WebUI can calculate PMN-PT and BTO coefficients through a shared interface instead of hard-coding PMN-PT constants in `job-service.js`.

**Architecture:** Add `pf_assistant/src/ferro/material-models.js` as the coefficient calculation boundary. `job-service.js` validates `materialKey/modelKey/xf/tem`, calls the registry, and writes `input.in` from returned coefficients. `dialogue-service.js` keeps PMN-PT as default and can parse BTO/BaTiO3 requests.

**Tech Stack:** Node.js CommonJS modules, `node:test`, existing ferro job runner, existing Fortran `input.in` format.

---

### Task 1: Material Model Registry

**Files:**
- Create: `pf_assistant/src/ferro/material-models.js`
- Modify: `test/ferro-service.test.js`

- [x] Write failing tests for `listFerroMaterialModels()` and `calculateFerroCoefficients()`.
- [x] Verify tests fail because `material-models.js` does not exist.
- [x] Implement PMN-PT default model and BTO `generate_input.py` model.
- [x] Verify tests pass.

### Task 2: Job Service Uses Registry

**Files:**
- Modify: `pf_assistant/src/ferro/job-service.js`
- Modify: `test/ferro-service.test.js`

- [x] Write failing test that BTO request writes BTO coefficients into `input.in`.
- [x] Verify the test fails because `job-service.js` still writes PMN-PT constants.
- [x] Replace hard-coded coefficients with registry coefficients.
- [x] Verify PMN-PT baseline still writes existing values and BTO writes BTO values.

### Task 3: Dialogue Parses Material Choice

**Files:**
- Modify: `pf_assistant/src/ferro/dialogue-service.js`
- Modify: `test/ferro-dialogue.test.js`

- [x] Write failing test for “用 BTO 材料，温度 298K”.
- [x] Verify it fails because current parser only stores `xf/tem`.
- [x] Add `materialKey/modelKey` defaults and BTO parsing.
- [x] Verify dialogue summary and job request include material/model.

### Task 4: Verification and Notes

**Files:**
- Modify: `worklog/round43_modify.md`

- [x] Run targeted ferro tests.
- [x] Run JS syntax checks.
- [x] Restart WebUI.
- [x] Health check `/health`.
- [x] Record changes and limitations in worklog.

### Task 5: Round B PZT and BFO Models

**Files:**
- Modify: `pf_assistant/src/ferro/material-models.js`
- Modify: `pf_assistant/src/ferro/job-service.js`
- Modify: `pf_assistant/src/ferro/dialogue-service.js`
- Modify: `test/ferro-service.test.js`
- Modify: `test/ferro-dialogue.test.js`

- [x] **Step 1: Write failing model registry snapshot tests**

Added tests requiring model keys `pzt_haun_1989`, `bfo_bens_coefficients`, and `bfo_10004`, plus fixed coefficient snapshots for PZT/BFO.

- [x] **Step 2: Run tests to verify failure**

Run: `node --test test/ferro-service.test.js`
Expected failure observed: registry only listed PMN-PT and BTO.

- [x] **Step 3: Implement material models**

Implemented PZT Haun 1989 formula model, BFO Bens coefficients, and BFO 10004 source-check model.

- [x] **Step 4: Write failing dialogue parser tests**

Added tests for `材料换成 PZT Haun 1989，xf=0.48，温度 300K` and `用 BFO Bens 参数，温度 380K`.

- [x] **Step 5: Implement dialogue parser support**

Updated parser to recognize PZT/锆钛酸铅 and BFO/BiFeO3/铁酸铋. BFO defaults to Bens unless `10004` is explicitly mentioned.

- [x] **Step 6: Verify tests pass**

Run: `node --test test/ferro-service.test.js` and `node --test test/ferro-dialogue.test.js`.
Expected: PASS.

### Task 6: Round C Ferro Material Database and Snapshots

**Files:**
- Modify: `pf_assistant/database.js`
- Modify: `pf_assistant/schema.sql`
- Create: `pf_assistant/src/ferro/material-repository.js`
- Modify: `pf_assistant/src/ferro/job-service.js`
- Modify: `pf_assistant/src/server/ferro-routes.js`
- Create: `test/ferro-material-repository.test.js`
- Modify: `test/ferro-service.test.js`
- Modify: `test/ferro-routes.test.js`

- [x] Add `ferro_materials`, `ferro_parameter_models`, and `ferro_parameter_snapshots` schema.
- [x] Seed material/model metadata from the JS formula registry.
- [x] Save calculated coefficient snapshots for completed ferro jobs.
- [x] Add `GET /api/ferro/materials` for frontend material-model discovery.
- [x] Verify repository, service, route, and gateway tests pass.
- [x] Restart WebUI and confirm `/health` after deployment.
