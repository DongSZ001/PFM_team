# Round 36 Modify Log - Backend Directory Historical Doc Cleanup

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Reduce top-level clutter in `pf_assistant/` by moving historical documentation out of the backend runtime package while leaving runtime code, data, scripts, and compatibility entry points untouched.

## Planned Scope

- Add a test requiring historical upgrade docs to live under `docs/history/`.
- Move `pf_assistant/UPGRADE.md` to `docs/history/UPGRADE-v2-user-chat.md`.
- Update README and project navigation links.
- Update worklog index and write this round log.

## Files Changed

- `docs/history/UPGRADE-v2-user-chat.md`
- `README.md`
- `docs/PROJECT_NAVIGATION.md`
- `test/gateway-ui.test.js`
- `worklog/modefiy.md`

## Files Removed From pf_assistant Top Level

- `pf_assistant/UPGRADE.md`

The content was preserved under `docs/history/UPGRADE-v2-user-chat.md`.

## Main Changes

### 1. Historical Upgrade Doc Moved

The v2 user system and chat persistence upgrade note is now stored in:

```text
docs/history/UPGRADE-v2-user-chat.md
```

This keeps `pf_assistant/` focused on backend runtime files and nearby operational assets.

### 2. Documentation Links Updated

Updated:

- `README.md` directory tree;
- `docs/PROJECT_NAVIGATION.md` historical-docs section;
- `worklog/modefiy.md` quick index and detail section.

### 3. Contract Test

Added the test:

```text
backend directory keeps historical upgrade docs outside runtime package
```

It verifies that:

- `pf_assistant/UPGRADE.md` no longer exists;
- `docs/history/UPGRADE-v2-user-chat.md` exists;
- the historical doc is still marked as a historical upgrade record;
- README and project navigation point to the new location;
- worklog index includes Round 36.

## TDD Record

Initial red check:

```bash
node --test test/gateway-ui.test.js
```

Result:

- 37 passed, 2 failed.
- Failure reasons: `docs/history/UPGRADE-v2-user-chat.md` did not exist and `pf_assistant/UPGRADE.md` still existed.

## Verification

Commands run:

```bash
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- `test/gateway-ui.test.js` syntax check passed.
- Node test suite passed: 39 tests passed, 0 failed.

## Risk Notes

- Runtime JavaScript code was not moved.
- Database files, logs, scripts, and service startup files were not moved.
- Existing backend behavior is unchanged.
- Only historical documentation was moved out of `pf_assistant/`.

## Search Keywords

```text
docs/history
UPGRADE-v2-user-chat.md
历史升级记录
backend directory hygiene
pf_assistant/UPGRADE.md
Round 36
```

## Next Recommended Step

Round 37 can produce a formal `pf_assistant/` top-level classification table: runtime code, runtime state, compatibility facade, scripts, dependencies, and bundled assets. That should happen before any code-file relocation.
