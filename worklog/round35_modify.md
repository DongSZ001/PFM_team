# Round 35 Modify Log - Scripts Navigation

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Document `pf_assistant/scripts/` so operational and data-preparation scripts are easy to find, run, and extend without guessing their side effects.

## Planned Scope

- Add a documentation contract test for scripts navigation.
- Create `pf_assistant/scripts/README.md`.
- Group scripts by operational purpose.
- Link project navigation and README to the scripts guide.
- Update worklog index and write this round log.

## Files Changed

- `pf_assistant/scripts/README.md`
- `docs/PROJECT_NAVIGATION.md`
- `README.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

## Main Changes

### 1. Script Category Guide

Added `pf_assistant/scripts/README.md` with four categories:

- Import Scripts
- Seed Scripts
- Derivation Scripts
- Smoke Check Scripts

Each script now has a purpose summary, command examples, and notes about side effects or expected usage.

### 2. Covered Scripts

Documented the current scripts:

- `import-magnetic-parameters.js`
- `seed-canonical-materials.js`
- `seed-tdf-materials.js`
- `derive-magnetoelastic.js`
- `smoke-check-webui.js`

### 3. Navigation Links

Updated:

- `docs/PROJECT_NAVIGATION.md` common change map;
- `README.md` backend directory tree;
- `worklog/modefiy.md` quick index and detail section.

### 4. Documentation Contract Test

Added the test:

```text
scripts navigation documents operational script categories and commands
```

It verifies that:

- `pf_assistant/scripts/README.md` exists;
- all four script categories are documented;
- each known script has a command example;
- project navigation links to the scripts guide;
- worklog index includes Round 35.

## TDD Record

Initial red check:

```bash
node --test test/gateway-ui.test.js
```

Result:

- 37 passed, 1 failed.
- The failing test was the new scripts navigation contract.
- Failure reason: `pf_assistant/scripts/README.md` did not yet exist.

## Verification

Commands run:

```bash
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- `test/gateway-ui.test.js` syntax check passed.
- Node test suite passed: 38 tests passed, 0 failed.

## Risk Notes

- This round changes documentation and tests only.
- No script implementation changed.
- No database, Gateway, API, frontend, or deployment behavior changed.

## Search Keywords

```text
scripts README
Import Scripts
Seed Scripts
Derivation Scripts
Smoke Check Scripts
import-magnetic-parameters.js
seed-canonical-materials.js
seed-tdf-materials.js
derive-magnetoelastic.js
smoke-check-webui.js
```

## Next Recommended Step

Round 36 can review runtime logs and deployment observability, then decide whether log paths, service status checks, and smoke-check usage need a small operations guide.
