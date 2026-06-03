# Round 31 Modify Log - Static Proxy HTTP Routes Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue backend server structure cleanup by moving static UI and bridge proxy route dispatch out of serve.js.

The goal is to make serve.js a thinner bootstrap/orchestration entry while preserving static file and bridge proxy behavior.

## Planned Scope

- Create pf_assistant/src/server/static-proxy-routes.js.
- Add STATIC_PROXY_ROUTE_LABELS and createStaticProxyHandler.
- Preserve dispatch order for /app, /control, /webui, remaining /api bridge proxy, and fallback static files.
- Keep serveStatic and proxyRequest implementations in serve.js and inject them into the new handler.
- Avoid changing static file serving, bridge proxy behavior, auth/chat routes, material routes, runtime routes, Gateway WebSocket, database, or frontend behavior.
- Add a failing test before implementation.

## Files Changed

- pf_assistant/src/server/static-proxy-routes.js
- pf_assistant/serve.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. New Static Proxy Routes Module

Added pf_assistant/src/server/static-proxy-routes.js with:

- STATIC_PROXY_ROUTE_LABELS
- createStaticProxyHandler

The module dispatches:

- /app and /app/* to the custom WebUI directory;
- /control and /control/* to the OpenClaw Control UI directory;
- /webui/* and remaining /api/* to the bridge proxy;
- all other paths to the nanobot static fallback.

### 2. serve.js Delegation

Updated serve.js to import createStaticProxyHandler.

serve.js now injects directory paths plus serveStatic and proxyRequest into the new handler.

### 3. Regression Coverage

Added a direct unit test that verifies:

- static-proxy-routes.js exists;
- route labels are stable;
- /app and /app/* map to custom WebUI static paths;
- /control maps to Control UI static paths;
- /webui/* and remaining /api/* go to bridge proxy;
- fallback static files still use the nanobot static directory;
- serve.js delegates to the new module.

### 4. Documentation

Updated README.md directory structure to include server/static-proxy-routes.js.

Updated worklog/modefiy.md with the Round 31 index and detail section.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
Cannot find module '../pf_assistant/src/server/static-proxy-routes'
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/server/static-proxy-routes.js
node --check pf_assistant/serve.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 34 tests passed, 0 failed.

## Risk Notes

- No static file serving implementation changes.
- No bridge proxy implementation changes.
- No route order changes intended.
- No auth/chat, runtime, material API, Gateway WebSocket, database, or frontend behavior changes.
- serve.js still owns the concrete serveStatic and proxyRequest helpers.

## Next Recommended Step

Round 32 can focus on a final serve.js role review and route module contract documentation.

A conservative next step is to add a test/documentation note that serve.js is now the bootstrap/orchestration entry point for HTTP/WebSocket services.

## Search Keywords

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
