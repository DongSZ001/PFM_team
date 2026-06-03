# Round 42 Modify Log - TDF Magnetostrictive Material Expansion

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

Expanded the database with **5 giant-magnetostrictive / classical
ferromagnet reference materials** (Terfenol-D, TbFe2, Galfenol, Fe, Ni),
fixed a **young_modulus unit-conversion bug** in the seed scripts
(some values were 9 orders of magnitude too large), and added
**parameter-key synonyms** in the resolver so that derived
`B1_from_lambda100` / `B2_from_lambda100` can satisfy `b1` / `b2`
required by the SAW_magnetoelastic profile.

Net effect on coverage of the 26 parameter sets:

| Simulation profile | R4 end (21 sets) | R5 end (26 sets) | Δ |
|---|---|---|---|
| `mumax3_skyrmion_basic`         | 6 ready  | **15 ready**  | +9 |
| `SAW_magnetoelastic`            | 0 ready  | **11 ready**  | **+11** |
| `strain_DMI_gradient`           | 5 ready  | **15 ready**  | +10 |
| `general`                       | 21 ready | **26 ready**  | +5 |

Database totals:

| | R4 | R5 | Δ |
|---|---:|---:|---:|
| materials         | 18 | **23** | +5 |
| parameter_sets    | 21 | **26** | +5 |
| parameter_values  | 231| **314**| +83 |

## 1. TDF Interpretation

"TDF" was interpreted as the **Tb-Dy-Fe giant-magnetostrictive
family** (Terfenol-D = Tb0.27Dy0.73Fe2). Rationale:

- The SAW_magnetoelastic profile is the most under-served so far (0/21
  ready at R4 end).
- The user's group is doing PFM (phase-field modeling) of
  magnetoelectric / multiferroic systems, where giant
  magnetostrictive materials like Terfenol-D are the textbook
  magnetoelastic driver.
- "TDF" appears in some Chinese magnetics literature as a shorthand
  for Tb-Dy-Fe (T=Tb, D=Dy, F=Fe).

If the user actually meant something else (TMD 2D ferromagnets,
temperature-dependent FMR, etc.) the seed file can be amended.

## 2. Materials Added (T2 seed)

`pf_assistant/scripts/seed-tdf-materials.js` (new file):

| Material | Source (citation) | set_type | context |
|----------|-------------------|----------|---------|
| Terfenol-D (Tb0.27Dy0.73Fe2) | Clark 1980 handbook | reference | magnetoelastic |
| TbFe2 (cubic Laves)         | Clark et al. 1976 J. Appl. Phys. | literature | magnetoelastic |
| Galfenol (Fe81Ga19)         | Clark et al. 2001 IEEE Trans. Magn. | literature | magnetoelastic |
| Fe (bcc) bulk reference     | Chikazumi 1997 textbook | reference | general |
| Ni (fcc) bulk reference     | Chikazumi 1997 textbook | reference | general |

73 new parameter values written. B1/B2 then auto-derived for 5 of
them (5 new derived values; 1 set — TbFe2 — has λ100=1e-4 so B1 is
small but non-zero).

## 3. Bug Fix — young_modulus in seed scripts was 9 orders too large

### Symptom

Spot-checking `GET /api/parameter-sets/22` (Terfenol-D) after the seed
revealed:

```text
young_modulus = 8.0e+19 Pa    (expected ~ 8.0e+10 Pa = 80 GPa)
```

### Root Cause

`unit-converter.js`'s `convertYoungModulus()` treats a numeric input
as a value in **GPa** and multiplies by 1e9 to get Pa (matching the
Excel column header "Young's modulus (GPa)"). The seed scripts were
written as if the input were already in **Pa**, so the same value
was scaled twice.

Round 4's `seed-canonical-materials.js` had this same bug for
CoFeB / CoFeB-MgO / Co-hcp; Round 5's new
`seed-tdf-materials.js` had it for Terfenol-D / Galfenol / Fe / Ni.
7 wrong rows total were written.

### Fix

Both seed scripts now use GPa convention (a bare number, e.g. `80`,
`150`, `210`) and the unit-converter applies the ×1e9 scaling. The
7 wrong rows were deleted and re-seeded:

```sql
DELETE FROM parameter_values
WHERE parameter_definition_id = (SELECT id FROM parameter_definitions WHERE parameter_key='young_modulus')
  AND parameter_set_id IN (18, 19, 20, 22, 24, 25, 26);
```

Verified:

```text
young_modulus values now span 8e10 .. 2.1e11 Pa  (80–210 GPa, physical)
```

## 4. Resolver Synonyms — `b1` ↔ `B1_from_lambda100`

`SAW_magnetoelastic` declares its required list as
`['Ms', 'Aex', 'Ku1', 'D', 'alpha', 'b1', 'b2']`. The auto-derivation
script stores its outputs under the longer keys
`B1_from_lambda100` and `B2_from_lambda100` (with `is_derived=1`).
The keys are semantically the same physical constant, but the
resolver was treating them as different and reporting `b1`/`b2` as
missing.

### Fix

`src/materials/resolvers/parameter-resolver.js` now contains a
`PARAMETER_SYNONYMS` map:

```js
const PARAMETER_SYNONYMS = {
  b1: ['b1', 'B1_from_lambda100'],
  b2: ['b2', 'B2_from_lambda100'],
};
```

A `lookupWithSynonyms(byKey, key)` helper checks the canonical key
first, then alternates. The output map uses the **canonical** key
(`b1`, `b2`) regardless of which form was actually stored, so
downstream simulation scripts see a stable shape.

Result: Terfenol-D / TbFe2 / Galfenol / Fe / Ni all return
`ready: true` for `SAW_magnetoelastic` — the profile jumped from
**0 / 21 ready** at R4 end to **11 / 26 ready** now (the 5 new ones
plus the 6 existing sets that already had direct b1/b2 values).

## 5. Files Added / Modified

| Path | Type | Purpose |
|------|------|---------|
| `pf_assistant/scripts/seed-tdf-materials.js` | new | T2 — 5 TDF / classical ferromagnet reference materials. |
| `pf_assistant/scripts/seed-canonical-materials.js` | modified | young_modulus convention fix (3 entries). |
| `src/materials/resolvers/parameter-resolver.js` | modified | Added PARAMETER_SYNONYMS for b1/b2 ↔ B1/B2_from_lambda100. |
| `parameter-resolver.js` (top-level stub) | unchanged | Still re-exports from `src/materials/resolvers/`. |
| `worklog/rount5_modify.md` | new | This file. |

No schema changes. `serve.js` was restarted so the resolver change
takes effect.

## 6. How to Re-run

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant

# 1. Seed TDF / classical materials (idempotent)
node scripts/seed-tdf-materials.js

# 2. Re-derive B1/B2 for any set with λ + c data
node scripts/derive-magnetoelastic.js

# 3. Restart server so the resolver sees the synonym map
pkill -f "node.*serve\.js"; sleep 1; ./start.sh
```

## 7. Verification

### `/api/parameter-sets/22` (Terfenol-D) — full dump

```text
Material:  Terfenol-D (Tb0.27Dy0.73Fe2)
Source:    Clark, A. E. (1980)
Set:       reference / magnetoelastic

  Ms                =  8.00e+05 A/m       (800 kA/m)
  Aex               =  9.00e-12 J/m       (9 pJ/m)
  alpha             =  0.01
  Ku1               = -6.00e+04 J/m^3     (-60 kJ/m^3)
  Ku2               = -2.00e+04 J/m^3
  D                 =  0
  c11               =  1.01e+11 Pa       (101 GPa)
  c12               =  3.80e+10 Pa       (38 GPa)
  c44               =  4.80e+10 Pa       (48 GPa)
  young_modulus     =  8.00e+10 Pa       (80 GPa)    [fixed]
  poisson_ratio     =  0.30
  lambda100         =  9.00e-05          (90 ppm)
  lambda111         =  1.64e-03          (1640 ppm)
  B1_from_lambda100 = -8.505e+06 J/m^3   (derived)
  B2_from_lambda100 = -2.362e+08 J/m^3   (derived)
```

### Ready matrix (R5 end)

```text
Material                       mumax3_sk    SAW_me    strain     general
-------------------------------------------------------------------------------------
Terfenol-D (Tb0.27Dy0.73Fe2)   READY        READY     READY      READY
TbFe2 (cubic Laves)            READY        READY     READY      READY
Galfenol (Fe81Ga19)            READY        READY     READY      READY
Fe (bcc) bulk reference        READY        READY     READY      READY
Ni (fcc) bulk reference        READY        READY     READY      READY
```

### API check on Terfenol-D after synonym fix

```text
POST /api/resolve-parameters
{ "parameterSetId":22, "simulationType":"SAW_magnetoelastic" }
→ ready: True   score: 86   missing: []
  parametersSi.b1 = -8.505e+06   (was missing; now resolved from B1_from_lambda100)
  parametersSi.b2 = -2.362e+08
```

## 8. Current Database State

```text
materials            23
sources              36
parameter_sets       26
parameter_values     314
parameter_definitions 21
import_batches       3
import_warnings      6
```

## 9. Follow-up (Suggested)

- **More TDF family**: SmFe2 (negative magnetostriction — useful
  reference), Tb0.5Dy0.5Fe2 (different Dy ratio), and epitaxial
  thin-film Terfenol-D (much lower Ms and different elastic
  constants than bulk).
- **Co/Ni superlattices** — [Co/Ni]N and [Co/Pd]N are important
  PMA systems; add a reference for the [Co/Ni] multilayer.
- **Caveat note in API**: the synonym map currently silently picks
  the canonical name in the output. A future refinement could
  expose both keys and a `derivedFrom` hint so callers know whether
  the value came from a direct measurement or a formula.
- **Heusler alloys**: Co2FeAl, Co2MnSi — relevant for spin-torque
  work, follow the same seed pattern.
- **Graph of coverage**: if the user wants a visual
  "parameter × set" heatmap, a small static HTML page (in
  `custom-webui/`) using the existing API would be straightforward.
- **Schema cleanup**: the `import_warnings` count is 6 from 3
  re-import runs; a deduplication pass keyed by `(row_index,
  column_name, warning_type, message)` would clean that up.

## 10. Verification Commands

```bash
# Quick smoke
curl http://127.0.0.1:3000/api/materials | python3 -c "import sys,json;print(len(json.load(sys.stdin)),'materials')"
curl -X POST http://127.0.0.1:3000/api/resolve-parameters \
  -H "Content-Type: application/json" \
  -d '{"parameterSetId":22,"simulationType":"SAW_magnetoelastic"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('ready=',d['ready'],'b1=',d['parametersSi'].get('b1'),'b2=',d['parametersSi'].get('b2'))"
```
