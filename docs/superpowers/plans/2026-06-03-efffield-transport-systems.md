# Efffield Transport Systems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the effective-field WebUI integration from dielectric-only to first-batch transport systems: diffusion, thermal conduction, and electrical conduction.

**Architecture:** Replace dielectric-only parameter writing with a small system registry. Keep the existing job route and dialogue route, but let each system define `CHOICESYS`, phase property keyword, load keyword, output tensor filename, parser aliases, and display summary.

**Tech Stack:** Node.js backend, vanilla JS frontend tests, existing Python `efffieldpy` runner and visualization script.

---

### Task 1: Skill Artifact

**Files:**
- Create: `/root/.codex/skills/install-new-module/SKILL.md`

- [x] Capture module installation workflow, TDD order, result indexing, deployment checklist, and efffield-specific conventions.

### Task 2: Job Service Transport Registry

**Files:**
- Modify: `pf_assistant/src/efffield/job-service.js`
- Modify: `pf_assistant/src/efffield/result-indexer.js`
- Test: `test/efffield-service.test.js`

- [ ] Add failing tests for `thermal`, `diffusion`, and `electrical_conduction` parameter files.
- [ ] Add registry entries for `CHOICESYS 7/8/9`.
- [ ] Generate `DIFFUSIVITY`, `THERMCOND`, `ELECCOND` phase blocks and `CONCGRAD`, `TEMGRAD`, `ELECFIELD` load lines.
- [ ] Index `effDiffusivity.dat`, `effThermalConductivity.dat`, and `effElectricalConductivity.dat`.

### Task 3: Dialogue Support

**Files:**
- Modify: `pf_assistant/src/efffield/dialogue-service.js`
- Test: `test/efffield-dialogue.test.js`

- [ ] Add failing tests for thermal natural-language flow.
- [ ] Detect diffusion/thermal/electrical intent.
- [ ] Ask for two phase property values using system-specific labels.
- [ ] Use default load vector when enough core fields exist.

### Task 4: Frontend Routing

**Files:**
- Modify: `custom-webui/js/app.js`
- Test: `test/gateway-ui.test.js`

- [ ] Add intent recognition for 热传导、扩散、电导.
- [ ] Route active transport drafts through `/api/efffield/dialogue`.

### Task 5: Verification and Deploy

- [ ] Run focused Node tests.
- [ ] Run JS/Python syntax checks.
- [ ] Run one small real thermal smoke if feasible.
- [ ] Restart `pf-assistant-webui` and check `/health`.
