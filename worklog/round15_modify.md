# Round 15 Modify Log - Backend Directory Structure Preparation

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Start the backend directory-structure cleanup without breaking the current runtime path.

This round follows the low-risk plan from the PF Assistant directory review:

- introduce a "pf_assistant/src/" structure;
- centralize important filesystem paths;
- move low-risk backend modules into domain folders;
- keep legacy root-level require paths working;
- do not move "data/", "logs/", "start.env", "start.sh", or the systemd unit target yet.

## Design Decision

The backend currently depends on fixed runtime anchors:

- "pf_assistant/start.sh" loads "pf_assistant/start.env";
- "deploy/pf-assistant-webui.service" points to "pf_assistant/start.sh";
- SQLite still lives at "pf_assistant/data/app.db";
- "serve.js" remains the root entrypoint.

So this round creates a compatibility structure instead of doing a disruptive move. Root files that were moved into "src/" now re-export the new modules.

## Files Changed

Created:

- "pf_assistant/src/config/paths.js"
- "pf_assistant/src/server/gateway-config.js"
- "pf_assistant/src/server/runtime-status.js"
- "pf_assistant/src/materials/unit-converter.js"
- "pf_assistant/src/materials/parameter-resolver.js"

Modified:

- "pf_assistant/gateway-config.js"
- "pf_assistant/runtime-status.js"
- "pf_assistant/unit-converter.js"
- "pf_assistant/parameter-resolver.js"
- "pf_assistant/serve.js"
- "pf_assistant/database.js"
- "test/gateway-ui.test.js"
- "README.md"
- "worklog/modefiy.md"

## Main Changes

### 1. Unified Backend Paths

Added "pf_assistant/src/config/paths.js" with stable paths for:

- project root;
- backend root;
- custom WebUI directory;
- nanobot dist directory;
- database file;
- import reports;
- logs directory;
- start env files.

"serve.js" now uses this module for "STATIC_DIR" and "CUSTOM_WEBUI_DIR".

"database.js" now uses "paths.databaseFile", while the actual DB location remains "pf_assistant/data/app.db".

### 2. Server Module Preparation

Moved low-risk server utility modules into:

~~~text
pf_assistant/src/server/
  gateway-config.js
  runtime-status.js
~~~

Root files now preserve old require paths:

~~~js
module.exports = require('./src/server/gateway-config');
module.exports = require('./src/server/runtime-status');
~~~

### 3. Materials Module Preparation

Moved low-risk materials modules into:

~~~text
pf_assistant/src/materials/
  unit-converter.js
  parameter-resolver.js
~~~

Root files now preserve old require paths:

~~~js
module.exports = require('./src/materials/unit-converter');
module.exports = require('./src/materials/parameter-resolver');
~~~

"parameter-resolver.js" in "src/materials/" still calls the existing root "material-parameters.js"; the heavier SQL/data-access module was intentionally left in place for now.

### 4. Compatibility Test

Added a test that verifies:

- new "src/" modules are require-able;
- old root require paths still return the same exported functions;
- unified paths still resolve to the existing runtime locations.

### 5. README Update

Updated the project directory tree to document:

- "pf_assistant/src/config/paths.js";
- "pf_assistant/src/server/";
- "pf_assistant/src/materials/";
- "pf_assistant/scripts/".

## Verification

TDD red check:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed before implementation:

~~~text
Cannot find module '../pf_assistant/src/config/paths'
~~~

Post-change verification commands:

~~~bash
node --check pf_assistant/src/config/paths.js
node --check pf_assistant/src/server/gateway-config.js
node --check pf_assistant/src/materials/parameter-resolver.js
node --check pf_assistant/serve.js
node --check pf_assistant/database.js
node --check pf_assistant/src/materials/unit-converter.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 18 tests passed, 0 failed.

## Risk Notes

- "data/", "logs/", "start.env", and "start.sh" were intentionally not moved.
- "serve.js" remains the root runtime entrypoint, so the existing systemd service remains compatible.
- The root compatibility files should remain until all internal imports and docs have migrated to "src/" paths.
- "material-parameters.js" and "database.js" still carry larger responsibilities; they should be split in later rounds after tests are added around material APIs and import behavior.

## Recommended Next Step

Round 16 can split material-domain resources more clearly:

~~~text
pf_assistant/src/materials/definitions/
pf_assistant/src/materials/converters/
pf_assistant/scripts/import/
domain-assets/parameters/ferromagnetic/
~~~

That should happen before moving SQLite runtime data or service startup files.

## Search Keywords

~~~text
backend structure
pf_assistant/src
src/config/paths.js
legacy require
compatibility export
gateway-config
runtime-status
unit-converter
parameter-resolver
后端目录结构
路径配置
Round 15
~~~
