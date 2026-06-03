# Round 3 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

Added a **magnetic material parameter database** to the PF Assistant backend:

1. New SQLite tables for materials / sources / parameter_sets / parameter_values /
   parameter_definitions / import_batches / import_warnings (7 tables, all
   `IF NOT EXISTS`, fully idempotent).
2. A `unit-converter.js` that maps every raw Excel cell to SI units (and
   back to display units for the API).
3. A `material-parameters.js` data access layer with upsert semantics so
   re-imports do not silently duplicate data.
4. A `parameter-resolver.js` that checks a parameter set against the
   required / recommended parameters of a simulation profile.
5. A `scripts/import-magnetic-parameters.js` CLI that ingests
   `磁性参数-汇总.xlsx` into the DB and writes a JSON report.
6. Five new HTTP endpoints under `/api/materials`, `/api/parameter-sets`,
   `/api/resolve-parameters`, `/api/simulation-profiles`.

Existing login / registration / SMTP email functionality is unchanged.

## 1. Files Added / Modified

| Path | Type | Purpose |
|------|------|---------|
| `pf_assistant/unit-converter.js` | new | Convert raw Excel cells to SI; SI → display units. |
| `pf_assistant/parameter-definitions-seed.js` | new | Seed catalogue (20 parameters, magnetic / DMI / elastic / magnetoelastic). |
| `pf_assistant/material-parameters.js` | new | All SQL touching the material tables. |
| `pf_assistant/parameter-resolver.js` | new | `resolveParameterSet` + simulation profiles. |
| `pf_assistant/scripts/import-magnetic-parameters.js` | new | CLI importer. |
| `pf_assistant/database.js` | modified | Added `initMaterialTables()` + `ensureParameterDefinitions()`. Existing auth / chat tables untouched. |
| `pf_assistant/serve.js` | modified | Wired up `handleMaterialsRoute()` and 5 new endpoints. |
| `pf_assistant/package.json` | modified | Added `xlsx@^0.18.5`. |
| `pf_assistant/data/import-reports/magnetic-parameters-import-report.json` | new | Last import report. |
| `worklog/round3_modify.md` | new | This file. |

## 2. Database Schema (new tables)

All created with `CREATE TABLE IF NOT EXISTS`; existing `users`,
`password_reset_tokens`, `chat_sessions`, `chat_messages` are not
touched.

```
materials(id, material_key UNIQUE, display_name, stack_structure,
          material_family, magnetic_layer, substrate, notes,
          created_at, updated_at)

sources(id, first_author, authors, journal, year, title, doi,
        source_note, created_at, updated_at)

parameter_sets(id, material_id → materials, source_id → sources,
               set_name, set_type, simulation_context, is_default,
               confidence_level, notes, created_at, updated_at)
UNIQUE(material_id, set_name)

parameter_definitions(id, parameter_key UNIQUE, display_name,
                      category, si_unit, display_unit, value_type,
                      description, created_at, updated_at)

parameter_values(id, parameter_set_id, parameter_definition_id,
                 value_si, value_min_si, value_max_si, text_value,
                 raw_value, raw_unit, is_derived, derivation_note,
                 import_warning, notes, created_at, updated_at)
UNIQUE(parameter_set_id, parameter_definition_id)

import_batches(id, source_file_name, sheet_name, imported_rows,
               skipped_rows, warning_count, notes, created_at)

import_warnings(id, import_batch_id, row_index, column_name,
                raw_value, warning_type, message, created_at)
```

Adding a new parameter type (ferroelectric, thermal, etc.) means a new
seed entry — no schema migration.

## 3. Unit Conversion Rules (implemented in `unit-converter.js`)

| Parameter | Excel header | Stored as | Display as |
|-----------|--------------|-----------|-------------|
| Aex | J/m | J/m | pJ/m |
| K1/K2 | J/m³ | J/m³ | kJ/m³ |
| Ms | A/m | A/m | kA/m |
| DMI | mJ/m² | J/m² | mJ/m² |
| α | dimensionless | dimensionless | dimensionless |
| γ₀ | rad/(T·s) | rad/(T·s) | rad/(T·s) |
| B_ext | text/number | T | mT |
| c11/c12/c44 | Pa | Pa | GPa |
| λ100/λ111 | dimensionless | dimensionless | ppm |
| Young's modulus | GPa | Pa | GPa |
| Poisson's ratio | dimensionless | dimensionless | dimensionless |
| b1/b2 | Pa | Pa | MJ/m³ |
| anisotropy_type | text | text | — |
| DMI_type | text | text | — |

DMI range strings (`"0~6"`) become `value_min_si=0, value_max_si=6e-3`.
B-field strings (`"89.6 mT"`) become `0.0896 T`.
Young's modulus composite text (`"Pt/Co/Ta=160/210/186（177 Gpa)"`) has the
parenthetical `177` extracted and converted to `177e9 Pa`; the original
text is kept in `raw_value` and a warning is recorded when extraction
fails.
b1 = `-8.8` is **not** auto-scaled but flagged as a possible MJ/m³
ambiguity via `import_warning`.

## 4. Simulation Profiles

Defined in `parameter-resolver.js`:

| Profile | Required | Recommended |
|---------|----------|-------------|
| `mumax3_skyrmion_basic` | Ms, Aex, Ku1, D, alpha | gamma0, B_ext |
| `SAW_magnetoelastic` | Ms, Aex, Ku1, D, alpha, b1, b2 | c11, c12, c44, λ100, λ111, E, ν |
| `strain_DMI_gradient` | Ms, Aex, Ku1, D, alpha | b1, b2, λ100, λ111, c11, c12, c44 |
| `general` | — | — |

Adding a profile is a one-line change in `SIMULATION_PROFILES`.

## 5. How to Run the Import

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant

# Use a copy with an ASCII name if the original has CJK characters
# (helps avoid shell escaping quirks):
cp "../磁性参数-汇总.xlsx" /tmp/magnetic.xlsx

node scripts/import-magnetic-parameters.js /tmp/magnetic.xlsx
# or, with the original name:
node scripts/import-magnetic-parameters.js "../磁性参数-汇总.xlsx"
```

Useful flags:

```bash
node scripts/import-magnetic-parameters.js <file> \
  --sheet Sheet1 \
  --report /path/to/report.json
```

Console output (current run):

```text
=== Import summary ===
Source:        /tmp/magnetic.xlsx
Sheet:         Sheet1
Total rows:    39
Imported:      16
Skipped:       23
Materials:     13
ParameterSets: 16
Values:        165
Warnings:      2
Report file:   /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/data/import-reports/magnetic-parameters-import-report.json
```

The `--report` path defaults to
`pf_assistant/data/import-reports/magnetic-parameters-import-report.json`.

## 6. How to Start the Server

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant
./start.sh
```

The new `initMaterialTables()` is called automatically on `db.initDb()`,
so the server boot also (idempotently) creates the new tables and seeds
`parameter_definitions`.

## 7. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/materials` | List all materials with parameter-set counts. |
| GET | `/api/materials/:id` | Material detail + all parameter sets. |
| GET | `/api/materials/:id/parameter-sets` | Just the parameter sets for a material. |
| GET | `/api/parameter-sets/:id` | Full parameter set (with source, material, per-parameter SI + display). |
| POST | `/api/resolve-parameters` | Resolve a set against a simulation profile; returns `ready`, `parametersSi`, `missingParameters`, `warnings`, `completenessScore`. |
| GET | `/api/simulation-profiles` | List available simulation profiles. |

### Smoke test (live response)

```text
GET /api/materials
  -> 13 materials, each with parameterSetCount.

GET /api/parameter-sets/1
  -> Co20Fe60B20 / Hu Jiamian 2018 / 17 parameters
       Aex=1.9e-11 J/m (19 pJ/m)
       Ms=1250000 A/m (1250 kA/m)
       D=0.00075 J/m^2 (0.75 mJ/m^2)
       Ku1=978000 J/m^3 (978 kJ/m^3)
       anisotropy_type=单轴各向异性  (text)
       DMI_type=Interface           (text)
       ... etc.

POST /api/resolve-parameters {parameterSetId:3, simulationType:mumax3_skyrmion_basic}
  -> ready=true, completenessScore=86
       parametersSi.Ms=1200000
       parametersSi.Aex=5e-12
       parametersSi.D=0.004
       parametersSi.alpha=0.3
       ...

POST /api/resolve-parameters {parameterSetId:1, simulationType:mumax3_skyrmion_basic}
  -> ready=false, missingParameters=["alpha"]
```

## 8. Excel Data Issues Found

These were captured as `import_warnings` (and listed in the JSON
report). The user should review before running simulations.

| Row | Column | Issue | Suggestion |
|-----|--------|-------|------------|
| R13 | 材料 | Row's material cell empty; inferred from previous row `[Pt(4 nm)/Co(1.6 nm)/Ta(1.9)]n/PMN-PT(10 um）`. | Verify if R13 belongs to that stack or to a new material. |
| R17 | b1 | `b1 = -8.8` is unusually small for Pa — likely `MJ/m^3`. | Confirm the source sheet's intended unit; re-import with corrected value. |

Other things noticed but not flagged as warnings:

- **R3** is a composite stack `[Pt(4 nm)/Co(1.6 nm)/Ta(1.9)]5/PMN-PT` and
  gets its own `material` row, but R12 / R13 / R14 with related stacks
  had empty "材料" cells and were folded into the closest non-empty
  material (heuristic). These are not silently dropped but their
  inferred material is recorded in a warning.
- **R10** uses DMI range `"0~6"` (mJ/m²), correctly stored as
  `value_min_si=0, value_max_si=6e-3 J/m²`.
- **B1_from λ100 / B2_from λ100** are marked `is_derived=1` but stored
  with the Excel-original numeric value; derivation logic itself is not
  computed in this first version (the values came from the sheet).

## 9. Future Simulation Scripts — How to Get Parameters

The contract that any future simulation generator (mumax3, SAW, etc.)
should use is `POST /api/resolve-parameters`:

```http
POST /api/resolve-parameters
Content-Type: application/json

{
  "materialId": 3,
  "parameterSetId": 3,
  "simulationType": "mumax3_skyrmion_basic",
  "targetEngine": "mumax3"
}
```

Response:

```json
{
  "ready": true,
  "simulationType": "mumax3_skyrmion_basic",
  "parametersSi": {
    "Ms": 1200000,
    "Aex": 5e-12,
    "Ku1": 1200000,
    "D": 0.004,
    "alpha": 0.3,
    "gamma0": -220000
  },
  "missingParameters": [],
  "warnings": [],
  "completenessScore": 86,
  "sourceInfo": { "firstAuthor": "Song Cheng", "year": 2023, "doi": null }
}
```

The simulation generator should:

1. Check `ready` before proceeding.
2. Convert SI → engine-native units **inside the generator**, never
   inside the API or the database.
3. If `missingParameters` is non-empty, refuse to run or fall back to
   defaults explicitly.
4. Log `sourceInfo` so generated scripts are attributable to the
   literature.

For ad-hoc exploration, `GET /api/parameter-sets/:id` returns both
`parametersSi` and the human-readable display values plus the original
`raw_value` from Excel.

## 10. Verification Summary

- `node --check` passes on all new / modified files.
- DB created with 7 new tables; seed produced 21 parameter definitions.
- Import run: 16 rows / 13 materials / 16 parameter sets / 165
  parameter values / 2 warnings.
- All 5 new endpoints return HTTP 200; existing auth / mail endpoints
  unchanged and still passing.
- Existing register / login flow still works (re-tested with a new
  user `params.test.<ts>@bit.edu.cn` → `status=active`).
- `parameter-resolver.js` correctly distinguishes a set with all 5
  required parameters (`set 3` → `ready=true`) from one missing alpha
  (`set 1` → `ready=false, missing=["alpha"]`).

## 11. Current Runtime State

- Process: `node serve.js`, PID 688345, user `admin`, listening on
  `0.0.0.0:3000`.
- DB: `pf_assistant/data/app.db` (SQLite, WAL on).
- Importer: `pf_assistant/scripts/import-magnetic-parameters.js`.
- Last report: `pf_assistant/data/import-reports/magnetic-parameters-import-report.json`.

## 12. Follow-up (Suggested)

- Compute `B1_from_lambda100` / `B2_from_lambda100` from λ100 / λ111 and
  c11 / c12 on import (currently we just preserve the Excel value).
- Allow manual `is_default` toggling through an API (first version
  leaves it `false` for multi-set materials).
- A small WebUI page at `/app/material-parameters` that lists materials
  → parameter sets → parameter details (a minimal page; the existing
  custom-webui was not touched in this round to avoid scope creep).
- Consider a re-import "merge vs replace" mode: today the upsert policy
  is "preserve existing if new data is empty, otherwise overlay" — a
  `--strict` mode that errors on collision could be useful later.
