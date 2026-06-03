# Runtime Stability Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WebUI runtime easier to operate by adding health/status endpoints, clearer frontend readiness states, a persistent service template, verification coverage, and round 6 worklog documentation.

**Architecture:** Keep the current single Node.js server, but add a small `runtime-status` helper so health/status logic is testable without starting the full server. The frontend keeps using the same WebSocket path, with a clearer distinction between WebSocket connected, Gateway handshake complete, and OpenClaw session ready.

**Tech Stack:** Node.js built-in HTTP/net modules, native browser JavaScript, `node:test`, systemd unit template, Markdown worklog.

---

### Task 1: Runtime Status Helpers

**Files:**
- Create: `pf_assistant/runtime-status.js`
- Modify: `test/gateway-ui.test.js`

- [ ] **Step 1: Write failing tests**

Add tests that require `runtime-status.js` and assert:

```js
const status = buildRuntimeStatus({
  now: 1000,
  startedAt: 250,
  deviceIdentityLoaded: true,
  gatewayConfigured: true,
});
assert.equal(status.ok, true);
assert.equal(status.uptimeMs, 750);
assert.equal(status.checks.deviceIdentity.status, 'ok');
assert.equal(status.checks.gatewayCredentials.status, 'ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/gateway-ui.test.js`
Expected: fail because `pf_assistant/runtime-status.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `buildRuntimeStatus()`, `buildGatewayStatus()`, and `checkTcpPort()` with no secrets in output.

- [ ] **Step 4: Run tests**

Run: `node --test test/gateway-ui.test.js`
Expected: pass.

### Task 2: HTTP Health and Gateway Status Routes

**Files:**
- Modify: `pf_assistant/serve.js`

- [ ] **Step 1: Add route behavior**

Add:

```text
GET /health
GET /api/gateway-status
```

`/health` returns service status, database readiness, device identity presence, and gateway credential presence. `/api/gateway-status` also performs a TCP reachability probe to `127.0.0.1:18789`.

- [ ] **Step 2: Syntax check**

Run: `node --check pf_assistant/serve.js`
Expected: exit 0.

- [ ] **Step 3: Runtime check**

Run: `curl -sS http://127.0.0.1:3000/health`
Expected: JSON response with `"service":"pf-assistant-webui"`.

### Task 3: Frontend Readiness States

**Files:**
- Modify: `custom-webui/app.js`
- Modify: `test/gateway-ui.test.js`

- [ ] **Step 1: Write failing frontend tests**

Assert that `getGatewayReadinessLabel(false, false)` returns `未连接`, `getGatewayReadinessLabel(true, false)` returns `会话准备中`, and `getGatewayReadinessLabel(true, true)` returns `已连接`.

- [ ] **Step 2: Implement minimal frontend helpers**

Add helper functions and call `updateStatus('session-ready')` after `currentSessionKey` is set.

- [ ] **Step 3: Verify frontend syntax and tests**

Run:

```bash
node --check custom-webui/app.js
node --test test/gateway-ui.test.js
```

Expected: both pass.

### Task 4: Persistent Service Template

**Files:**
- Create: `deploy/pf-assistant-webui.service`
- Modify: `README.md`

- [ ] **Step 1: Add service template**

Create a systemd unit pointing to `pf_assistant/start.sh`, with restart policy and working directory.

- [ ] **Step 2: Document deployment**

Add a short README section explaining where the service template lives and that `start.env` remains local/secret.

### Task 5: Verification and Worklog

**Files:**
- Create: `worklog/round6_modify.md`
- Modify: `worklog/modefiy.md`

- [ ] **Step 1: Run verification**

Run:

```bash
node --check pf_assistant/serve.js
node --check custom-webui/app.js
node --test test/gateway-ui.test.js
curl -sS http://127.0.0.1:3000/health
curl -sS http://127.0.0.1:3000/api/gateway-status
```

- [ ] **Step 2: Write worklog**

Record changed files, commands, runtime state, and remaining recommendations without including secrets.

- [ ] **Step 3: Update index**

Add Round 6 to `worklog/modefiy.md` quick index, details, and common lookup paths.
