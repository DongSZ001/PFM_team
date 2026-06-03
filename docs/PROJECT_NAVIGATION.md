# Project Navigation - PFM2 WebUI

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Purpose

This document is the current development map for the project. Use it before changing code so each change lands in the right module and older compatibility files are not mistaken for the main implementation.

## Current Architecture

The project has three active layers:

| Area | Primary Path | Responsibility |
|---|---|---|
| Browser UI | `custom-webui/` | 页面展示, landing cover, login/register entry, chat UI, markdown rendering, Gateway session UX |
| Service entry | `pf_assistant/serve.js` | HTTP/WebSocket 启动与编排入口, shared helpers, CORS/security headers, OpenClaw Gateway bridge lifecycle |
| Backend modules | `pf_assistant/src/` | Route dispatch, runtime checks, materials domain logic, repository access, path config |

`serve.js` should stay small enough to understand as the startup coordinator. Route-specific HTTP behavior belongs in `src/server/*-routes.js`.

## Module Ownership

### custom-webui/ - 页面展示

Use this area for frontend-only changes:

- `custom-webui/index.html`: DOM structure and script/style loading order.
- `custom-webui/css/styles.css`: theme tokens, layout, chat panels, landing cover, responsive styling.
- `custom-webui/js/app.js`: auth flow, session readiness, Gateway send/receive behavior, UI state.
- `custom-webui/js/chat-renderer.js`: assistant markdown/data-panel rendering.
- `custom-webui/assets/images/`: local UI images and landing cover assets.

Do not put backend API behavior here. Frontend changes should preserve existing auth cookies, Gateway session keys, and chat persistence calls.

### pf_assistant/serve.js - 启动与编排入口

Use this file for service-level wiring only:

- start the HTTP server;
- set shared response headers;
- initialize database/mailer/runtime lifecycle;
- create the WebSocket bridge to OpenClaw Gateway;
- inject shared helpers into route modules.

Do not add new route-specific branching here unless it is only the top-level delegation to a `src/server/` module.

### pf_assistant/src/server/ - HTTP route modules

Use this area for HTTP path dispatch and handler composition:

- `runtime-routes.js`: `/health`, `/api/gateway-status`, readiness/runtime responses.
- `auth-chat-routes.js`: `/api/auth/*`, legacy `/auth/*`, `/chat/*` behavior.
- `material-routes.js`: material parameter APIs and resolve-parameters API.
- `static-proxy-routes.js`: `/app`, `/control`, `/webui`, bridge proxy, and static fallback dispatch.

Each route module should expose a small contract such as path lists, path predicates, and handler factories with injected dependencies.

### pf_assistant/src/materials/ - 材料领域

Use this area for material parameters and simulation-domain behavior:

- `definitions/`: default parameter definitions and domain vocabulary.
- `converters/`: unit conversion logic.
- `resolvers/`: parameter readiness and simulation profile resolution.
- `repositories/`: SQLite-backed material/source/parameter/import record access.
- `material-parameters.js`: material domain facade.

The repository aggregate remains a compatibility boundary. Prefer editing the focused `*-records.js` or query module instead of expanding the aggregate file.

### domain-assets/ - 非运行态领域资源

Use this area for organized source resources:

- parameter source files by domain, such as ferromagnetic, ferroelectric, piezoelectric, dielectric;
- example scripts;
- scale resources, such as ferromagnetic scale and ferroelectric scale.

Files here should be treated as curated inputs or reference assets. Runtime DB writes should still flow through importer scripts and repository modules.

### worklog/ - 迭代记录

Use `worklog/` to record every round:

- create `roundN_modify.md` for each completed iteration;
- update `worklog/modefiy.md` Quick Index with the topic and search keywords;
- include changed files, verification commands, risk notes, and next suggested step.

## Common Change Map

| Need | Start Here | Also Check |
|---|---|---|
| Web page layout or chat rendering | `custom-webui/` | tests for renderer/UI behavior |
| Login/register/session issue | `custom-webui/js/app.js`, `pf_assistant/src/server/auth-chat-routes.js`, `pf_assistant/auth.js` | cookie/session persistence tests |
| Gateway connected/session-ready issue | `custom-webui/js/app.js`, `pf_assistant/serve.js`, `pf_assistant/src/server/runtime-routes.js` | `/health`, `/api/gateway-status` |
| New backend API route | new or existing `pf_assistant/src/server/*-routes.js` | `serve.js` delegation and route tests |
| Material parameter logic | `pf_assistant/src/materials/` | importer scripts and repository tests |
| SQLite schema or persistence | `pf_assistant/database.js`, `pf_assistant/schema.sql`, repositories | isolated DB tests |
| Deployment service behavior | `deploy/`, `pf_assistant/start.*` | smoke-check script and systemd logs |
| Import/seed/derive scripts | `pf_assistant/scripts/README.md` | script purpose, command, write-risk notes |
| Backend top-level classification | `docs/PF_ASSISTANT_DIRECTORY.md` | runtime entry, business module, compatibility facade, runtime state, dependencies |
| Cleanup audit | `docs/PF_ASSISTANT_CLEANUP_AUDIT.md` | confirmed removals, unused assets, cleanup rationale |
| Historical change lookup | `worklog/modefiy.md` | exact `roundN_modify.md` file |

## Compatibility Files

Some root-level backend files remain as compatibility facade exports for older require paths:

| Compatibility facade | Current implementation target |
|---|---|
| `pf_assistant/gateway-config.js` | `pf_assistant/src/server/gateway-config.js` |
| `pf_assistant/runtime-status.js` | `pf_assistant/src/server/runtime-status.js` |
| `pf_assistant/unit-converter.js` | `pf_assistant/src/materials/converters/unit-converter.js` |
| `pf_assistant/parameter-resolver.js` | `pf_assistant/src/materials/resolvers/parameter-resolver.js` |
| `pf_assistant/parameter-definitions-seed.js` | `pf_assistant/src/materials/definitions/default-parameter-definitions.js` |
| `pf_assistant/material-parameters.js` | `pf_assistant/src/materials/repositories/material-parameters-repository.js` |

Prefer editing the corresponding `pf_assistant/src/` implementation first, then keep legacy exports stable. Do not add implementation logic to these facade files.

## Historical Documents

Historical upgrade notes live outside the backend runtime package:

- `docs/history/UPGRADE-v2-user-chat.md`: v2 user system and chat persistence upgrade record.

Do not place historical architecture notes back under `pf_assistant/`; that directory should stay focused on runtime code, runtime configuration examples, scripts, data, logs, and bundled static assets.

## Verification Baseline

For backend structure or route changes, run:

```bash
node --check pf_assistant/serve.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

For frontend layout changes, also use the existing Playwright/browser smoke workflow when available and check desktop/mobile overflow.

## Current Direction

The current restructuring goal is to make the project easier to develop without breaking the WebUI-to-OpenClaw workflow:

1. keep Web UI focused on presentation and browser interaction;
2. keep `serve.js` focused on startup and orchestration;
3. keep HTTP route ownership inside `src/server/`;
4. keep material simulation logic inside `src/materials/`;
5. keep worklog entries searchable enough that old fixes can be reused instead of rediscovered.
