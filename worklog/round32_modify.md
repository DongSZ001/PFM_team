# Round 32 Modify Log - serve.js Bootstrap Contract

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Complete the backend route-splitting phase by making `pf_assistant/serve.js` clearly act as the HTTP/WebSocket bootstrap and orchestration entry, while route-specific HTTP dispatch remains in `pf_assistant/src/server/` modules.

## Planned Scope

- Add a contract test for the final `serve.js` role.
- Document the bootstrap/orchestration responsibility in `serve.js`.
- Remove the remaining inline static/proxy dispatch block from `serve.js`.
- Delegate final UI/proxy/fallback dispatch to `handleStaticProxyRoute(req, res, urlPath)`.
- Update README and worklog index.

## Files Changed

- `pf_assistant/serve.js`
- `test/gateway-ui.test.js`
- `README.md`
- `worklog/modefiy.md`

## Main Changes

### 1. serve.js Role Declaration

Updated the top-level comment in `serve.js` to state that it is the `bootstrap/orchestration entry`.

The comment now also records the boundary:

```text
Route-specific HTTP dispatch lives in src/server modules.
```

### 2. Final Static/Proxy Route Delegation

Removed the remaining inline route branches from `serve.js`:

- `/app/*` custom WebUI static handling
- `/control/*` Control UI static handling
- `/webui/*` and fallback `/api/*` bridge proxy handling
- nanobot static fallback handling

These now flow through:

```js
handleStaticProxyRoute(req, res, urlPath);
```

The concrete dispatch remains in `pf_assistant/src/server/static-proxy-routes.js`.

### 3. Contract Test

Added the test:

```text
serve.js documents bootstrap role and delegates route dispatch to server modules
```

It verifies that:

- `serve.js` documents the bootstrap/orchestration role;
- `serve.js` documents the `src/server` route-dispatch boundary;
- `serve.js` calls `handleStaticProxyRoute(req, res, urlPath)`;
- old inline static/proxy route comments and path branches no longer appear.

### 4. README Update

Updated the backend directory structure note:

- `serve.js` is now described as the HTTP/WebSocket startup and orchestration entry.
- Route-specific HTTP dispatch is documented as living under `src/server/*-routes.js`.

## TDD Record

Initial red check after fixing test regex syntax:

```bash
node --test test/gateway-ui.test.js
```

Result:

- 34 passed, 1 failed.
- The failing test was the new `serve.js` bootstrap contract test.
- Failure reason: `serve.js` did not yet contain the `bootstrap/orchestration entry` contract and still had inline static/proxy route dispatch.

## Verification

Commands run:

```bash
node --check pf_assistant/serve.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- `pf_assistant/serve.js` syntax check passed.
- `test/gateway-ui.test.js` syntax check passed.
- Node test suite passed: 35 tests passed, 0 failed.

## Risk Notes

- No WebSocket protocol behavior was changed.
- No auth, chat, material API, database, frontend, or deployment behavior was changed.
- Static/proxy dispatch behavior remains covered by the existing `static-proxy-routes.js` contract test.
- This round only finishes the route ownership boundary and documentation cleanup.

## Search Keywords

```text
bootstrap/orchestration entry
Route-specific HTTP dispatch
handleStaticProxyRoute
serve.js
src/server
static-proxy-routes.js
route delegation
```

## Next Recommended Step

Round 33 should move from code splitting to project-level final calibration:

- align README architecture diagrams with the new `src/server` route modules;
- review remaining legacy labels and duplicate notes;
- produce a final backend-structure checklist for future feature development.
