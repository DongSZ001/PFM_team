# Efffield MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first usable dielectric effective-field calculation flow to PFM2 WebUI, callable from the chat UI and returning generated result images.

**Architecture:** Add a Node.js efffield backend module that creates per-user job directories, writes or copies case inputs, runs the Python `efffieldpy` CLI, indexes output `.dat` and `.png` files, and exposes job/result/asset APIs. Extend the existing native JS chat UI with a slash-command trigger and a structured result card renderer.

**Tech Stack:** Node.js HTTP routes, SQLite via existing auth DB helpers, child_process `spawn`, Python `efffieldpy`, native browser JavaScript and CSS.

---

### Task 1: Backend Job Service

**Files:**
- Create: `pf_assistant/src/efffield/job-service.js`
- Create: `pf_assistant/src/efffield/python-runner.js`
- Create: `pf_assistant/src/efffield/result-indexer.js`
- Test: `test/efffield-service.test.js`

- [ ] Write tests for job path creation, request validation, and result indexing.
- [ ] Implement a service that accepts dielectric requests, creates `pf_assistant/data/efffield/jobs/<jobId>`, runs the Python commands, and returns result metadata.
- [ ] Keep command execution argument-array based, with no shell interpolation.

### Task 2: Backend HTTP Routes

**Files:**
- Create: `pf_assistant/src/server/efffield-routes.js`
- Modify: `pf_assistant/serve.js`
- Test: `test/efffield-routes.test.js`

- [ ] Add `POST /api/efffield/jobs` for authenticated calculation jobs.
- [ ] Add `GET /api/efffield/jobs/:jobId` and `GET /api/efffield/jobs/:jobId/results`.
- [ ] Add `GET /api/efffield/assets/:jobId/:filename` with path traversal protection.

### Task 3: Frontend Result Rendering

**Files:**
- Modify: `custom-webui/js/chat-renderer.js`
- Modify: `custom-webui/css/styles.css`
- Test: `test/gateway-ui.test.js`

- [ ] Add `renderEfffieldResultCard(result)` that renders summary text, tensor output, and image thumbnails.
- [ ] Ensure image URLs are escaped and rendered as clickable previews.

### Task 4: Frontend Command Trigger

**Files:**
- Modify: `custom-webui/js/app.js`
- Test: `test/gateway-ui.test.js`

- [ ] Recognize `/effective dielectric ...` or `/eff dielectric ...`.
- [ ] Create an efffield job through REST, display an in-chat progress message, poll until completion, then render the result card.
- [ ] Fall back to normal Gateway chat for all non-efffield messages.

### Task 5: Verification

**Commands:**
- `node --check pf_assistant/serve.js`
- `node --test test/efffield-service.test.js test/efffield-routes.test.js test/gateway-ui.test.js`
- Optional smoke: call `/api/efffield/jobs` with the development server running and confirm generated PNG URLs load.
