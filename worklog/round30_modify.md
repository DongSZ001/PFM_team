# Round 30 Modify Log - Auth Chat HTTP Routes Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue backend server structure cleanup by moving auth/chat HTTP route dispatch out of serve.js.

The goal is to reduce serve.js route complexity while preserving auth.js behavior and existing auth/chat URL behavior.

## Planned Scope

- Create pf_assistant/src/server/auth-chat-routes.js.
- Add AUTH_CHAT_API_PATHS, LEGACY_AUTH_API_PATHS, createAuthChatApiHandler, isAuthChatApiPath, and isLegacyAuthPath.
- Delegate /api/auth/* and /chat/* to the existing handleAuthRoute function.
- Preserve the legacy /auth and /auth/* 410 Gone response.
- Avoid changing auth.js, database, session cookie behavior, chat persistence behavior, Gateway WebSocket behavior, materials API, runtime API, or frontend behavior.
- Add a failing test before implementation.

## Files Changed

- pf_assistant/src/server/auth-chat-routes.js
- pf_assistant/serve.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. New Auth Chat Routes Module

Added pf_assistant/src/server/auth-chat-routes.js with:

- AUTH_CHAT_API_PATHS
- LEGACY_AUTH_API_PATHS
- createAuthChatApiHandler
- isAuthChatApiPath
- isLegacyAuthPath

The module handles route dispatch for:

- /api/auth/*
- /chat/*
- legacy /auth and /auth/* 410 responses

### 2. serve.js Delegation

Updated serve.js to import createAuthChatApiHandler, isAuthChatApiPath, and isLegacyAuthPath.

serve.js now delegates auth/chat API requests to the new handler while still using the existing handleAuthRoute implementation from auth.js.

### 3. Regression Coverage

Added a direct unit test that verifies:

- auth-chat-routes.js exists;
- route path contracts are stable;
- /api/auth/* and /chat/* are detected;
- /api/materials is not treated as auth/chat;
- /auth and /auth/* are detected as legacy auth paths;
- delegation to handleAuthRoute still works;
- unhandled auth/chat routes return 404;
- legacy auth routes return 410 with newPrefix /api/auth/;
- serve.js delegates to the new module.

### 4. Documentation

Updated README.md directory structure to include server/auth-chat-routes.js.

Updated worklog/modefiy.md with the Round 30 index and detail section.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
Cannot find module '../pf_assistant/src/server/auth-chat-routes'
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/server/auth-chat-routes.js
node --check pf_assistant/serve.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 33 tests passed, 0 failed.

## Risk Notes

- No auth.js behavior changes.
- No session cookie or database behavior changes.
- No HTTP path changes.
- No Gateway WebSocket, material API, runtime API, or frontend behavior changes.
- The new route module only centralizes dispatch and legacy auth response behavior.

## Next Recommended Step

Round 31 can focus on serve.js final role cleanup.

A conservative next step is to inspect remaining static/proxy route dispatch and decide whether serve.js is already thin enough or whether static/proxy helpers should become small server modules.

## Search Keywords

~~~text
auth-chat-routes.js
AUTH_CHAT_API_PATHS
LEGACY_AUTH_API_PATHS
createAuthChatApiHandler
isAuthChatApiPath
isLegacyAuthPath
/api/auth
/chat
/auth legacy 410
Round 30
~~~
