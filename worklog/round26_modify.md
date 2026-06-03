# Round 26 Modify Log - Material Repository Aggregate Contract

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Stabilize the repository cleanup completed in previous rounds by documenting and testing the role of material-parameters-repository.js.

After the table-level and query-level modules were split out, this file should be understood as a compatibility aggregator for old callers, not as the place to add new SQL.

## Planned Scope

- Add a contract test for the aggregate export list.
- Verify the aggregate source documents its compatibility aggregator role.
- Update the aggregate module header comment.
- Update README structure notes.
- Avoid adding, removing, or renaming public repository functions.

## Files Changed

- pf_assistant/src/materials/repositories/material-parameters-repository.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. Aggregate Contract Test

Added a regression test that verifies:

- the aggregate export list remains stable;
- material-parameters-repository.js explicitly documents itself as a compatibility aggregator;
- record-level SQL is documented as living in sibling modules.

### 2. Aggregator Header

Updated the top comment in material-parameters-repository.js to say:

- this file preserves the historical aggregate export contract;
- it is used by import scripts and HTTP handlers;
- record-level SQL lives in sibling modules;
- API-facing read composition lives in material-parameter-queries.js.

### 3. README Structure Note

Updated README.md so the repository directory description explains that material-parameters-repository.js is the compatibility aggregate exit point and table-level SQL belongs in *-records.js modules.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
The input did not match the regular expression /compatibility aggregator/i
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/materials/repositories/material-parameters-repository.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 29 tests passed, 0 failed.

## Risk Notes

- No database schema changes.
- No HTTP API changes.
- No import behavior changes.
- No public repository function names were added or removed.
- The new contract test intentionally makes accidental aggregate export drift visible.

## Next Recommended Step

Round 27 can move from repository structure to service/API structure.

A conservative next step is to inspect serve.js material API routes and design whether they should move into a dedicated server/material-routes.js module while keeping HTTP paths unchanged.

## Search Keywords

~~~text
aggregate export contract
compatibility aggregator
material-parameters-repository.js
Record-level SQL lives in the sibling modules
repository contract
聚合出口
兼容聚合
Round 26
~~~
