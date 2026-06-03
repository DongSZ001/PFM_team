# Round 27 Modify Log - Material HTTP Routes Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue backend structure cleanup by moving material parameter HTTP API route handling out of serve.js into a dedicated server module.

The goal is to reduce serve.js route complexity while preserving the existing HTTP paths and responses.

## Planned Scope

- Create pf_assistant/src/server/material-routes.js.
- Move material API route dispatch into createMaterialApiHandler().
- Add isMaterialApiPath() for serve.js route matching.
- Keep jsonResponse and readJsonBody in serve.js and inject them into the material handler.
- Avoid changing auth, WebSocket, Gateway, database, repository, URL, and response behavior.
- Add a failing test before implementation.

## Files Changed

- pf_assistant/src/server/material-routes.js
- pf_assistant/serve.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. New Material Routes Module

Added pf_assistant/src/server/material-routes.js with:

- createMaterialApiHandler
- isMaterialApiPath

The module handles existing material-related routes:

- GET /api/materials
- GET /api/materials/:id
- GET /api/materials/:id/parameter-sets
- GET /api/parameter-sets/:id
- POST /api/resolve-parameters
- GET /api/simulation-profiles

### 2. serve.js Delegation

Updated serve.js to import createMaterialApiHandler and isMaterialApiPath.

serve.js now delegates material API requests to the new handler and keeps shared response/body helpers local.

### 3. Regression Coverage

Added a test that verifies:

- material-routes.js exists;
- createMaterialApiHandler and isMaterialApiPath are exported;
- material API paths are detected;
- unrelated runtime API paths are not detected;
- serve.js delegates to the new module.

### 4. Documentation

Updated README.md directory structure to include server/material-routes.js.

Updated worklog/modefiy.md with the Round 27 index and detail section.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
Cannot find module '../pf_assistant/src/server/material-routes'
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/server/material-routes.js
node --check pf_assistant/serve.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 30 tests passed, 0 failed.

## Risk Notes

- No HTTP URL changes.
- No response shape changes intended.
- No auth, Gateway, WebSocket, or database behavior changes.
- jsonResponse and readJsonBody remain in serve.js and are injected into the material route handler.

## Next Recommended Step

Round 28 can inspect auth/chat route handling in serve.js and decide whether to extract another server route module, or add focused HTTP route handler tests for material-routes.js before further decomposition.

## Search Keywords

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
