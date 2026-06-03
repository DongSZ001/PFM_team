# Round 20 Modify Log - Source Records Repository Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue splitting material-parameters-repository.js by table responsibility. This round splits sources-table access into a focused source-records repository.

This round only splits source records:

- no schema change;
- no API behavior change;
- no database path change;
- no import script behavior change;
- aggregate repository exports remain compatible.

## Design Plan

Repository layout after this round:

~~~text
pf_assistant/src/materials/repositories/
  shared.js
  material-records.js
  source-records.js
  material-parameters-repository.js
~~~

Responsibilities:

- shared.js: getDb(), now(), makeMaterialKey().
- material-records.js: materials table access.
- source-records.js: splitAuthors(), upsertSource(), getSourceById().
- material-parameters-repository.js: aggregate compatibility export plus remaining SQL responsibilities.

## Files Changed

Created:

- "pf_assistant/src/materials/repositories/source-records.js"
- "worklog/round20_modify.md"

Modified:

- "pf_assistant/src/materials/repositories/material-parameters-repository.js"
- "test/gateway-ui.test.js"
- "README.md"
- "worklog/modefiy.md"

## Main Changes

### 1. Source Records Repository

Moved source-related helpers and SQL into source-records.js:

- splitAuthors()
- upsertSource()
- getSourceById()

### 2. Aggregate Repository Compatibility

material-parameters-repository.js now imports source-records.js and re-exports the same source functions. Existing callers still use the aggregate repository or the legacy root path.

### 3. Tests

Added a compatibility test verifying:

- source-records.js exists;
- aggregate repository exports the exact same source function references;
- splitAuthors behavior remains unchanged.

## Verification

TDD red check:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed before implementation:

~~~text
Cannot find module ../pf_assistant/src/materials/repositories/source-records
~~~

Post-change verification commands:

~~~bash
node --check pf_assistant/src/materials/repositories/source-records.js
node --check pf_assistant/src/materials/repositories/material-parameters-repository.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 23 tests passed, 0 failed.

## Risk Notes

- Only sources table access was split in this round.
- Parameter definitions, parameter sets, values, and import batches still remain in the aggregate repository.
- Aggregate exports are intentionally kept to avoid breaking serve.js and import scripts.

## Recommended Next Step

Round 21 can split parameter definition records:

- listParameterDefinitions()
- getParameterDefinitionByKey()
- getParameterDefinitionById()

Then continue with parameter sets, values, and import batches.

## Search Keywords

~~~text
source records
source-records.js
splitAuthors
upsertSource
getSourceById
sources table
source repository
来源记录
文献来源
Round 20
~~~
