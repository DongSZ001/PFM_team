# Round 23 Modify Log - Parameter Value Records Repository Split

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Continue backend repository cleanup by splitting parameter_values table access out of the aggregate material repository.

The goal is to reduce the size and responsibility of material-parameters-repository.js while preserving existing imports, APIs, and database behavior.

## Planned Scope

- Create a dedicated parameter-value records repository.
- Move writeParameterValue and getValuesForSet into the new module.
- Re-export the same functions from material-parameters-repository.js.
- Avoid schema, API, import flow, database path, and unit conversion changes.
- Add a compatibility regression test before implementation.

## Files Changed

- pf_assistant/src/materials/repositories/parameter-value-records.js
- pf_assistant/src/materials/repositories/material-parameters-repository.js
- test/gateway-ui.test.js
- README.md
- worklog/modefiy.md

## Main Changes

### 1. New Parameter Value Records Module

Added pf_assistant/src/materials/repositories/parameter-value-records.js for parameter_values table access:

- writeParameterValue
- getValuesForSet

The module depends on shared repository helpers and parameter-definition-records.js for parameter key lookup.

### 2. Aggregate Repository Compatibility

Updated material-parameters-repository.js to import parameter-value-records.js and keep exporting writeParameterValue and getValuesForSet.

Existing callers can continue requiring the aggregate material repository without changing paths.

### 3. Regression Coverage

Added a test that verifies:

- the split parameter-value module exists;
- writeParameterValue and getValuesForSet are exported;
- aggregate material repository exports reference the same functions.

### 4. Documentation

Updated README.md directory structure to include parameter-value-records.js.

Updated worklog/modefiy.md with the Round 23 index and detail section.

## Verification

Red test before implementation:

~~~bash
node --test test/gateway-ui.test.js
~~~

Expected failure observed:

~~~text
Cannot find module '../pf_assistant/src/materials/repositories/parameter-value-records'
~~~

Green verification after implementation:

~~~bash
node --check pf_assistant/src/materials/repositories/parameter-value-records.js
node --check pf_assistant/src/materials/repositories/material-parameters-repository.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
~~~

Result:

- Syntax checks passed.
- Node test suite passed: 26 tests passed, 0 failed.

## Risk Notes

- No database schema changes.
- No HTTP API changes.
- No unit conversion changes.
- No import behavior changes.
- The aggregate repository remains the compatibility layer, so existing code does not need immediate import rewrites.

## Next Recommended Step

Round 24 can split import batch and import warning table access into import-batch-records.js.

That would move createImportBatch, finalizeImportBatch, recordImportWarning, and listImportWarnings out of the aggregate repository while keeping aggregate exports stable.

## Search Keywords

~~~text
parameter value records
parameter-value-records.js
writeParameterValue
getValuesForSet
parameter_values table
参数值记录
参数值表
Round 23
~~~
