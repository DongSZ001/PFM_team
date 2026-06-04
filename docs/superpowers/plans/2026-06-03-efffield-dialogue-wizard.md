# Efffield Dialogue Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure `parameter.in` and run dielectric effective-field calculations through natural chat Q&A, without clicking UI buttons.

**Architecture:** Add a backend draft wizard that stores one active efffield draft per user/chat session, extracts parameters from each message, asks one missing-field question at a time, and calls the existing job service only after explicit confirmation. The frontend sends likely efffield dialogue messages to the new endpoint and renders normal assistant text or existing result cards.

**Tech Stack:** Node.js built-in HTTP routes, in-memory/file-backed draft store, existing `efffield` job service, vanilla JS frontend, `node:test`.

---

### Task 1: Backend Dialogue Core

**Files:**
- Create: `pf_assistant/src/efffield/dialogue-service.js`
- Test: `test/efffield-dialogue.test.js`

- [ ] Write failing tests for starting a dielectric draft, asking dimension, accepting answers, previewing complete parameters, and running after confirmation.
- [ ] Implement a small draft store keyed by `userId::chatSessionId`.
- [ ] Implement Chinese/English parameter extraction for system, dimension, grid, structure, radius, phase permittivity, electric field, and confirmation.
- [ ] Implement missing-field policy that asks one question at a time.
- [ ] Reuse `createEfffieldJobService().createAndRunJob()` after confirmation.

### Task 2: HTTP Route

**Files:**
- Modify: `pf_assistant/src/server/efffield-routes.js`
- Test: `test/efffield-routes.test.js`

- [ ] Add `POST /api/efffield/dialogue` with auth, `message`, and `chatSessionId`.
- [ ] Return `{ type: "efffield_dialogue", reply, draft }` while collecting parameters.
- [ ] Return `{ type: "efffield_result", ...jobResult }` after confirmation and completed run.
- [ ] Preserve existing `/api/efffield/jobs` routes.

### Task 3: Frontend Chat Integration

**Files:**
- Modify: `custom-webui/js/app.js`
- Modify: `custom-webui/js/chat-renderer.js`
- Test: `test/gateway-ui.test.js`

- [ ] Send natural efffield messages and active draft replies to `/api/efffield/dialogue`.
- [ ] Show the user's text, typing indicator, and assistant reply in the normal chat stream.
- [ ] Render completed result using the existing efffield result card.
- [ ] Persist assistant dialogue text and result summary in chat history.

### Task 4: Verification and Deploy

**Files:**
- No new production files.

- [ ] Run focused node tests.
- [ ] Run syntax checks for changed JS files.
- [ ] Restart `pf-assistant-webui`.
- [ ] Check `/health`.
