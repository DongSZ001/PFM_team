# Round 37 Modify Log - pf_assistant Directory Classification

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Create a clear classification table for the current `pf_assistant/` top-level contents before making any further relocation or deletion decisions.

## Planned Scope

- Add a contract test for backend directory classification docs.
- Create `docs/PF_ASSISTANT_DIRECTORY.md`.
- Link README and project navigation to the classification document.
- Update worklog index and write this round log.

## Files Changed

- `docs/PF_ASSISTANT_DIRECTORY.md`
- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

## Main Changes

### 1. Classification Table

Added a table classifying `pf_assistant/` top-level entries as:

- Runtime Entry
- Business Modules
- Compatibility Facades
- Runtime State
- Dependencies
- Scripts and Tools
- Bundled Static Assets

### 2. Cleanup Guidance

Documented that runtime state and generated directories such as `data/`, `logs/`, `start.env`, `node_modules/`, and `nanobot/` should not be moved without deployment planning.

### 3. Historical Residue Clarification

Documented that the small root compatibility files are still intentionally retained for old require paths. They should stay thin and not gain implementation logic.

### 4. Contract Test

Added the test:

```text
pf_assistant directory classification documents top-level responsibilities
```

It verifies that:

- `docs/PF_ASSISTANT_DIRECTORY.md` exists;
- required categories are present;
- key current top-level entries are documented;
- README and project navigation link to the classification doc;
- worklog index includes Round 37.

## TDD Record

Initial red check:

```bash
node --test test/gateway-ui.test.js
```

Result:

- 39 passed, 1 failed.
- Failure reason: `docs/PF_ASSISTANT_DIRECTORY.md` did not yet exist.

## Verification

Commands run:

```bash
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- `test/gateway-ui.test.js` syntax check passed.
- Node test suite passed: 40 tests passed, 0 failed.

## Risk Notes

- Documentation and tests only.
- No runtime code moved.
- No database, logs, dependencies, scripts, or static assets moved.
- This creates the decision map for later cleanup rounds.

## Search Keywords

```text
PF_ASSISTANT_DIRECTORY.md
Runtime Entry
Business Modules
Compatibility Facades
Runtime State
Dependencies
Bundled Static Assets
pf_assistant top-level classification
```

## Next Recommended Step

Round 38 can use this classification to decide whether any non-runtime documentation or generated state should be excluded from source tracking, or whether compatibility facade callers can start migrating to `src/` imports.
