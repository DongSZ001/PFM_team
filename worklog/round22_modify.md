# Round 22 Modify Log - Parameter Set Records Repository Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue the backend repository cleanup by splitting parameter_sets table access out of the aggregate material repository.

The target is to make each repository file own a smaller table-oriented responsibility while preserving the existing aggregate API used by imports, HTTP endpoints, and tests.

## Planned Scope

- Create a dedicated parameter-set records repository.
- Re-export the same functions from material-parameters-repository.js.
- Avoid schema, API, database path, import flow, and parameter-value behavior changes.
- Add a compatibility regression test before implementing the split.

## Files Changed

- pf_assistant/src/materials/repositories/parameter-set-records.js
- pf_assistant/src/materials/repositories/material-parameters-repository.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. New Parameter Set Records Module

Added pf_assistant/src/materials/repositories/parameter-set-records.js for parameter_sets table access:

- upsertParameterSet
- getParameterSetById
- listParameterSetsForMaterial
- getParameterSetsForMaterialWithSource

The module uses the shared repository helpers getDb() and now().

### 2. Aggregate Repository Compatibility

Updated material-parameters-repository.js to import the split parameter set module and keep exporting the same function names.

Existing callers can continue requiring the aggregate material repository without changing import paths.

### 3. Regression Coverage

Added a test that verifies:

- the split parameter-set module exists;
- all expected parameter-set functions are exported;
- aggregate material repository exports reference the same functions.

### 4. Documentation

Updated README.md directory structure to include parameter-set-records.js.

Updated worklog/modefiy.md with the Round 22 index and detail section.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
Cannot find module '../pf_assistant/src/materials/repositories/parameter-set-records'
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/materials/repositories/parameter-set-records.js
node --check pf_assistant/src/materials/repositories/material-parameters-repository.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 25 tests passed, 0 failed.

## Risk Notes

- No database schema changes.
- No HTTP API changes.
- No import behavior changes.
- No runtime database path behavior changes.
- The aggregate repository remains the compatibility layer, so existing code does not need immediate import rewrites.

## Next Recommended Step

Round 23 can split parameter_values table access into parameter-value-records.js.

That would move writeParameterValue and getValuesForSet out of the aggregate repository while keeping the aggregate exports stable.

## Search Keywords

~~~text
parameter set records
parameter-set-records.js
upsertParameterSet
getParameterSetById
listParameterSetsForMaterial
getParameterSetsForMaterialWithSource
parameter_sets table
参数集记录
参数集表
Round 22
~~~
