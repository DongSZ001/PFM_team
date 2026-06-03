# PF Assistant Scripts

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Purpose

This directory contains operational and data-preparation scripts for the backend material-parameter workflow. Scripts should stay focused: importing data, seeding reference data, deriving secondary values, or checking deployed service readiness.

Run commands from the `pf_assistant/` directory unless noted otherwise.

## Import Scripts

### import-magnetic-parameters.js

Purpose: import magnetic material parameters from an Excel workbook into the SQLite material-parameter tables.

Command:

```bash
node scripts/import-magnetic-parameters.js /path/to/磁性参数-汇总.xlsx
node scripts/import-magnetic-parameters.js ./磁性参数-汇总.xlsx --sheet Sheet1 --report data/import-reports/magnetic-parameters-import-report.json
```

Notes:

- Reads workbook data through `xlsx`.
- Upserts materials, sources, parameter sets, and values.
- Writes import warnings and a JSON report.
- Use this when ingesting spreadsheet-based magnetic parameter data.

## Seed Scripts

### seed-canonical-materials.js

Purpose: seed canonical magnetic reference materials from standard literature.

Command:

```bash
node scripts/seed-canonical-materials.js
```

Notes:

- Intended for stable reference entries such as Permalloy and CoFeB.
- Re-running is designed to be idempotent unless script-specific force behavior is used.

### seed-tdf-materials.js

Purpose: seed giant-magnetostrictive and classical ferromagnetic reference materials, including Terfenol-D family data.

Command:

```bash
node scripts/seed-tdf-materials.js
```

Notes:

- Uses widely cited textbook/canonical reference values.
- Existing values are preserved by the upsert policy described in the script header.

## Derivation Scripts

### derive-magnetoelastic.js

Purpose: derive magnetoelastic coupling values from magnetostriction and elastic constants.

Command:

```bash
node scripts/derive-magnetoelastic.js
node scripts/derive-magnetoelastic.js --force
```

Notes:

- Derives `B1_from_lambda100` and `B2_from_lambda100` values.
- Default behavior skips rows that already have values.
- `--force` overwrites existing derived values.

## Smoke Check Scripts

### smoke-check-webui.js

Purpose: check deployed WebUI service readiness and Gateway message flow.

Command:

```bash
node scripts/smoke-check-webui.js
node scripts/smoke-check-webui.js --skip-chat
PF_WEBUI_BASE=http://127.0.0.1:3000 PF_SMOKE_TIMEOUT_MS=15000 node scripts/smoke-check-webui.js
```

Notes:

- Checks HTTP readiness endpoints and WebSocket Gateway flow.
- `--skip-chat` avoids sending a chat message while still checking session creation.
- Use after service deployment or restart.

## Safety Notes

- Import and seed scripts write to the configured SQLite database.
- Smoke checks may create OpenClaw sessions and, unless `--skip-chat` is used, send a lightweight chat request.
- Review `PF_ASSISTANT_DB_PATH` before running data-writing scripts in test or production environments.
- Prefer adding new script categories here before adding more scripts to the directory.

## Related Documentation

- `../README.md` for project-level usage.
- `../../docs/PROJECT_NAVIGATION.md` for module ownership and development entry points.
- `../../worklog/modefiy.md` for historical script/import-related rounds.
