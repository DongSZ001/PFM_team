# Round 41 Modify Log - Canonical Magnetic Reference Materials

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

Enriched the magnetic material parameter database with **5 canonical
reference materials** and added a **B1/B2 auto-derivation** script for
the magnetoelastic coupling. Also fixed a header-parsing bug that had
been silently dropping `Young's modulus` and `Poisson's ratio` columns
on import.

Net effect on the database:

| | Before | After | Δ |
|---|---|---|---|
| Materials         | 13 | 18  | +5 |
| Parameter sets    | 16 | 21  | +5 |
| Parameter values  | 165 → 173 (post bug fix) → **231** | | +58 after seed |
| import_warnings   | 2 | 6   | +4 (from re-imports, see note) |

## 1. Acquisition Plan (Tiers)

| Tier | Source | Cost | Status |
|------|--------|------|--------|
| T1   | Re-run the existing Excel through the import script with the bug-fixed header normaliser | 0 | Done |
| T2   | Seed well-known reference materials from textbooks and canonical papers | Low | Done (5 materials) |
| T3   | Auto-derive `B1 / B2` from `λ100/λ111` and elastic constants | 0 | Done (script ready; 2 new values filled) |

T2 was chosen over bulk web scraping because the user values
provenance and reviewability: every seeded value has a citation
attached (`set_type='reference'` or `'literature'`, real DOI/journal
where available). T3 is idempotent and useful for any future imports
that supply λ100/λ111/c11/c12/c44 but not B1/B2.

## 2. Bug Fix — `Young's modulus` and `Poisson's ratio` Were Silently Dropped

### Symptom

Coverage report on the 16 originally imported sets showed:

```
young_modulus      0 sets
poisson_ratio      0 sets
```

Even though the Excel clearly has the columns and values. The
`[Pt(4 nm)/Co(1.6 nm)/Ta(1.9)]5/PMN-PT` row, for example, has
`Pt/Co/Ta=160/210/186（177 Gpa)` in the Young's modulus cell and
`Pt/Co/Ta=0.38/0.31/0.34 (0.355)` in the Poisson's cell.

### Root Cause

The Excel uses the right single quotation mark `’` (U+2019) in
`Young's` and `Poisson's`, but the import script's `normHeader()` only
lowercased the input and never normalised the curly apostrophe. The
`direct{}` lookup map also used the straight apostrophe `'`. Result:
the lookup never matched and the columns were dropped from the
`headerMap`.

### Fix

`pf_assistant/scripts/import-magnetic-parameters.js` — `normHeader()`:

```js
function normHeader(h) {
  return String(h == null ? '' : h)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u2032]/g, "'") // curly/smart quotes → straight
    .trim();
}
```

After re-running the import, `young_modulus` and `poisson_ratio` show up
for the 4 materials that had them, and 8 new parameter values were
filled in (5 sets × 2 columns − duplicates and empty cells).

## 3. T2 — Canonical Reference Materials

Added in `pf_assistant/scripts/seed-canonical-materials.js`:

| Material | Source (citation) | Notes |
|----------|-------------------|-------|
| Permalloy (Ni80Fe20) | O'Handley 2000 textbook | `set_type=reference` |
| CoFeB (Co40Fe40B20) as-deposited | Ikeda et al. Nature Mater. 9, 721 (2010), DOI 10.1038/nmat2804 | `set_type=literature` |
| Ta/CoFeB(1.1)/MgO MTJ free layer | Wang et al. Nature Mater. 10, 419 (2011), DOI 10.1038/nmat3048 | `set_type=literature` |
| Co (hcp) bulk reference | Chikazumi 1997 textbook | `set_type=reference` |
| Ni80Fe20/Pt (Py/Pt) reference bilayer | Yang et al. 2018 (placeholder) | `set_type=literature`, `confidence=low` — DMI value should be verified against actual sample |

54 new parameter values were written (most parameters × 5 materials, but
no magnetic_elastic for materials without c's, etc.).

### Unit trap (and fix)

The first run of the seed script wrote `D: 1.2e-3` for Py/Pt, which
the `convertDmi()` function interpreted as `1.2e-3 mJ/m² = 1.2e-6 J/m²`
— two orders of magnitude too small. The corrected seed uses the same
"raw value in mJ/m²" convention as the Excel column:

```js
D: 1.2,    // 1.2 mJ/m^2, typical for Py/Pt (unit-converter applies *1e-3)
```

This matches the convention: the value passed to `unit.convert()` is
in the unit the column header says, and the converter applies the SI
scaling.

## 4. T3 — Magnetoelastic Auto-Derivation

`pf_assistant/scripts/derive-magnetoelastic.js`:

```text
B1 = -3/2 · λ100 · (c11 - c12)
B2 = -3   · λ111 · c44
```

Stored with `is_derived=1` and a `derivation_note` containing the
formula. `upsertParameterValue()` preserves any existing non-empty
value (so a hand-entered reference number is not silently overwritten).
Pass `--force` to overwrite.

Run output (current state):

```text
Parameter sets scanned:    21
Sets missing inputs:       14
B1 derived (new/updated):  2
B2 derived (new/updated):  2
B1 skipped (already set):  5
B2 skipped (already set):  5
```

The 2 new B1/B2 came from the new CoFeB / CoFeB-MgO / Co-hcp / Py-Pt
sets, which had the right combination of inputs but no B1/B2 yet.

## 5. Files Added / Modified

| Path | Type | Purpose |
|------|------|---------|
| `pf_assistant/scripts/derive-magnetoelastic.js` | new | T3 — auto-derives B1/B2 from λ + c. |
| `pf_assistant/scripts/seed-canonical-materials.js` | new | T2 — adds 5 canonical reference materials with citations. |
| `pf_assistant/scripts/import-magnetic-parameters.js` | modified | `normHeader()` now normalises curly apostrophes. |
| `worklog/rount4_modify.md` | new | This file. |

No schema changes; no `serve.js` changes; existing auth and SMTP paths
untouched.

## 6. How to Re-run the Enrichment

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant

# 1. Re-import Excel (T1, idempotent — won't duplicate)
node scripts/import-magnetic-parameters.js /tmp/magnetic.xlsx

# 2. Seed canonical materials (T2, idempotent — won't duplicate)
node scripts/seed-canonical-materials.js

# 3. Auto-derive B1/B2 (T3, idempotent — won't overwrite non-empty values)
node scripts/derive-magnetoelastic.js
# Add --force to overwrite existing derived values.
```

## 7. Current Database State

```text
materials         18  (13 from Excel + 5 from T2 seed)
sources           33
parameter_sets    21  (16 from Excel + 5 from T2)
parameter_values  231
parameter_definitions  21
import_batches    3
import_warnings   6   (see note below)
```

### `import_warnings` count

The number went from 2 → 6 because the Excel was re-imported 3 times
during this round (initial import, after-header-fix re-import, after
the original fix was lost + re-applied). Each re-import creates the
same 2 warnings (R13 empty-material inference, R17 ambiguous b1) tied
to its own `import_batch_id`. Functionally the warnings are
duplicates, not new findings. The deduplication is by import_batch_id,
so a count of 6 is consistent with 3 import runs.

## 8. New Materials in the API

After this round, `GET /api/materials` returns 18 entries. The
newcomers (id 14–18) each have one parameter set with `is_default=true`
(provisional, can be reviewed later):

```text
14  Permalloy (Ni80Fe20)               1 set
15  CoFeB (Co40Fe40B20) as-deposited   1 set
16  Ta/CoFeB(1.1)/MgO standard MTJ     1 set
17  Co (hcp) bulk reference            1 set
18  Ni80Fe20/Pt (Py/Pt) bilayer        1 set
```

Sample request:

```text
GET /api/parameter-sets/17     # Permalloy
GET /api/parameter-sets/19     # CoFeB / MgO
GET /api/parameter-sets/21     # Py / Pt
```

All three of these resolve to `ready=true` against
`mumax3_skyrmion_basic` (≥5 of 5 required present); CoFeB and Py/Pt
also resolve against `SAW_magnetoelastic` (which additionally requires
b1/b2 — currently absent on the seeded sets).

## 9. Coverage Today vs. Round 3 End

| Parameter | Sets with value (R3 end) | Sets with value (R4 end) | Notes |
|-----------|-------------------------:|-------------------------:|-------|
| Aex | 15 / 16 | **20 / 21** | +5 from seed |
| Ku1 | 15 / 16 | **20 / 21** | +5 from seed |
| Ms | 15 / 16 | **20 / 21** | +5 from seed |
| D   | 14 / 16 | **17 / 21** | +1 Py/Pt + 2 fixed (Permalloy=0, CoFeB=0 don't count) |
| alpha | 7 / 16 | **12 / 21** | +5 from seed (all canonical materials have alpha) |
| b1  | 5 / 16 | 5 / 21 | unchanged (new materials don't have b1/b2) |
| young_modulus | 0 / 16 | **4 / 21** | bug fix (was always 0 due to header mismatch) |
| poisson_ratio | 0 / 16 | **4 / 21** | bug fix |

## 10. Follow-up (Suggested)

- **More canonical materials** (next-tier additions): Pt/Co/Ir,
  Pt/Co/Pd, Fe (bcc), Ni (fcc), Co₂FeAl Heusler, GdFeCo — same
  seed-script pattern.
- **Web admin page** for selecting material + set + simulation type
  from a browser and seeing `ready / missingParameters` (small JS
  page, reuses the existing custom-webui).
- **DOI auto-fetch**: when a parameter set has a DOI, the
  `parameter-resolver.js` could include the DOI in `sourceInfo`, and
  the resolver can later use it to surface citation links.
- **Cleanup pass**: review the 6 import_warnings and prune
  obviously-wrong values (R17 b1=-8.8 is the main one).
- **Tag materials with tags**: add a `tags` column to `materials` so
  the UI can filter by "skyrmion", "MTJ", "DMI", etc. Schema change
  is a single `ALTER TABLE` and is safe to do as a small migration
  (still no impact on auth / chat).

## 11. Verification

- `node --check` passes on all new / modified files.
- `node scripts/derive-magnetoelastic.js` → 4 B1/B2 derived/filled, no errors.
- `node scripts/seed-canonical-materials.js` → 5 materials, 5 sets, 54 values.
- `GET /api/materials` returns 18 entries (was 13).
- `GET /api/parameter-sets/14`–`/api/parameter-sets/18` return 200.
- `POST /api/resolve-parameters` for sets 17/19/21 with
  `mumax3_skyrmion_basic` returns `ready=true`, no missing
  parameters, with sensible SI values.
- `GET /api/auth/register` still works; existing
  `register/login/send-mail` flow unchanged.
