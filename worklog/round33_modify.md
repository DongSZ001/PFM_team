# Round 33 Modify Log - Project Navigation Docs

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

After completing the backend route split, create a clear project navigation document so future iterations can quickly find the correct module boundary and avoid relying on outdated upgrade notes.

## Planned Scope

- Add a documentation contract test.
- Create a current project navigation document under `docs/`.
- Link README to the new navigation document.
- Mark `pf_assistant/UPGRADE.md` as historical instead of current architecture guidance.
- Update worklog index and write this round log.

## Files Changed

- `docs/PROJECT_NAVIGATION.md`
- `README.md`
- `pf_assistant/UPGRADE.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

## Main Changes

### 1. Project Navigation Document

Added `docs/PROJECT_NAVIGATION.md` as the current development map.

It documents:

- active project layers;
- module ownership;
- where common changes should start;
- compatibility files that should stay stable;
- verification baseline for backend structure and route work;
- the current restructuring direction.

### 2. README Link

Added a directory-section note in `README.md` pointing developers to `docs/PROJECT_NAVIGATION.md` before making code changes.

### 3. UPGRADE Historical Status

Updated `pf_assistant/UPGRADE.md` with a top notice explaining that it is a historical v2.0 upgrade record.

The notice points new development to:

- `README.md`
- `docs/PROJECT_NAVIGATION.md`

### 4. Documentation Contract Test

Added the test:

```text
project navigation docs describe current module ownership and legacy upgrade status
```

It verifies that:

- `docs/PROJECT_NAVIGATION.md` exists;
- the navigation doc describes `serve.js`, `src/server`, `src/materials`, `custom-webui`, and `worklog`;
- README links to the navigation doc;
- UPGRADE is marked as historical and links to the navigation doc;
- worklog index includes Round 33.

## TDD Record

Initial red check:

```bash
node --test test/gateway-ui.test.js
```

Result:

- 35 passed, 1 failed.
- The failing test was the new project navigation documentation contract.
- Failure reason: `docs/PROJECT_NAVIGATION.md` and related README/UPGRADE/worklog links were not yet present.

## Verification

Commands run:

```bash
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- `test/gateway-ui.test.js` syntax check passed.
- Node test suite passed: 36 tests passed, 0 failed.

## Risk Notes

- This round changes documentation and tests only.
- No runtime code, auth behavior, Gateway behavior, material logic, database schema, or frontend behavior was changed.
- The main risk is documentation drift; the new contract test reduces that risk by keeping key docs linked.

## Search Keywords

```text
PROJECT_NAVIGATION.md
开发导航
module ownership
serve.js 启动与编排入口
src/server HTTP route
src/materials 材料领域
历史升级记录
```

## Next Recommended Step

Round 34 can start converting the remaining older root-level compatibility files into clearer documented facades, or move to feature work now that the project navigation is stable.
