# Ferro Material Parameter Database Design

## Goal

Build a ferroelectric material parameter database for PFM2 WebUI so the ferro calculation flow can choose material systems such as PMN-PT, BTO, PZT, and BFO instead of using hard-coded PMN-PT constants.

The database should support both static parameters and formula-based models, because many ferroelectric coefficients depend on temperature `tem` and composition `xf`.

## Current State

The WebUI ferro module currently supports one effective material path:

- Material display: PMN-PT
- User-facing variables: `xf`, `tem`
- Default: `xf=0.3`, `tem=298 K`
- Implementation: `pf_assistant/src/ferro/job-service.js` writes PMN-PT-like constants directly into `input.in`
- Dialogue: `pf_assistant/src/ferro/dialogue-service.js` asks whether to use the default PMN-PT model

The original ferro template contains richer material formulas in `pfm2_ferro_demo/generate_input.py` and historical Fortran snippets. Those should be promoted into explicit model records.

## Material Systems To Seed First

### 1. PMN-PT

Status: already used as the WebUI baseline, but not yet represented as a formal ferro material model.

Inputs:

- `xf`: composition, default `0.3`
- `tem`: temperature in K, default `298`

Core coefficients currently used in WebUI input generation:

- `Q1=0.084`, `Q2=-0.025`, `Q4=0.035`
- `s11=5.2e-11`, `s12=-1.89e-11`, `s44=1.4e-11`
- `a0=1.0e8`, `p0=0.26`
- `a1=-25199000.0`, `a11=34520500.0`, `a12=60750000.0`
- `a111=2570000000.0`, `a112=6950000000.0`, `a123=13130000000.0`
- eighth-order terms currently `0.0`

Implementation note: migrate these constants into `ferro-material-models.js` first, then replace the hard-coded block in `job-service.js`.

### 2. BTO / BaTiO3

Status: a BTO model already exists in `pfm2_ferro_demo/generate_input.py`. Additional historical BTO variants are present in the user-provided Fortran comments.

Recommended model versions:

- `bto_generate_input`: model currently encoded in `generate_input.py`
- `bto_wang_2010`: J. Wang potential, JAP 108, 114105 (2010)
- `bto_landau_alt`: alternate BTO Landau parameter set from the Fortran snippet

Common outputs:

- Landau coefficients: `a1`, `a11`, `a12`, `a111`, `a112`, `a123`, `a1111`, `a1112`, `a1122`, `a1123`
- Electrostrictive coefficients: `Q1`, `Q2`, `Q4`
- Elastic compliance: `s11`, `s12`, `s44`
- Elastic stiffness if explicitly provided or derived: `c11`, `c12`, `c44`
- Normalization: `a0`, `p0`

Implementation note: BTO variants should be selectable by `modelKey`, not collapsed into one ambiguous BTO entry.

### 3. PZT

Status: user-provided formula set is complete and suitable for formula-based model storage.

Proposed model key:

- `pzt_haun_1989`

Source note:

- MJ Haun et al., Ferroelectrics 99, 1989

Inputs:

- `xf`: composition
- `tem`: temperature in K

Formula-derived intermediate values:

- `epsilon0`
- `Curie_C1`
- `Curie_C2`
- `Curie_C`
- `Curie_C0`
- `T0`
- `zta1`
- `zta2`

Formula-derived coefficients:

- `Q1=0.045624+0.042796*xf+0.029578/(1+200*(xf-0.5)^2)`
- `Q2=-0.013386-0.012093*xf-0.026568/(1+200*(xf-0.5)^2)`
- `Q4=0.5*(0.046147+0.020857*xf+0.025325/(1+200*(xf-0.5)^2))`
- `a1=(tem-T0)/(2*epsilon0*Curie_C)`
- `a11=(10.612-22.655*xf+10.955*xf^2)*1.0e13/Curie_C`
- `a111=(12.026-17.296*xf+9.179*xf^2)*1.0e13/Curie_C`
- `a112=(58.804*exp(-29.397*xf)-3.3754*xf+4.2904)*1.0e14/Curie_C`
- `a12=zta1/3-a11`
- `a123=zta2-3*a111-6*a112`
- eighth-order terms currently `0.0`
- `a0=-(25-T0)/(2*epsilon0*Curie_C0)`
- `p0=0.7570`
- `s11=8.2e-12`, `s12=-2.6e-12`, `s44=14.4e-12`
- `c11`, `c12`, `c44` derived from compliance values

Implementation note: this is the first priority composition-dependent model after PMN-PT/BTO because it exercises the full formula pipeline.

### 4. BFO

Status: user provided two BFO-like parameter blocks. They should be saved as separate model versions until the source/labeling is confirmed.

Recommended model versions:

- `bfo_bens_coefficients`
- `bfo_10004`

Important caution:

- The `10004 continue ! for BFO` block numerically resembles the existing BTO-style Landau model. Keep it as a separate model version and mark the source as requiring confirmation.
- In the `Bens coefficients for BFO` block, `c11`, `c12`, and `c44` are assigned multiple times. For executable equivalence with Fortran, the final active values are:
  - `c11=300.e9`
  - `c12=162.e9`
  - `c44=69.e9`
- Earlier values such as `261.5e9`, `231.5e9`, and `72.6e9` should be retained as notes or alternate elastic set metadata, not silently discarded.

## Parameter Output Contract

Every ferro material model should return a normalized object with stable keys:

```js
{
  materialKey: 'pzt',
  modelKey: 'pzt_haun_1989',
  displayName: 'PZT',
  source: 'MJ Haun et al., Ferroelectrics 99, 1989',
  inputs: { xf: 0.48, tem: 300 },
  coefficients: {
    a1, a11, a12,
    a111, a112, a123,
    a1111, a1112, a1122, a1123,
    Q1, Q2, Q4,
    s11, s12, s44,
    c11, c12, c44,
    a0, p0,
    T0, Curie_C, zta1, zta2
  },
  warnings: []
}
```

`job-service.js` should only depend on this output contract when writing `input.in`.

## Proposed Database Tables

### `ferro_materials`

Purpose: one row per material family/system.

Fields:

- `id`
- `material_key`: `pmn_pt`, `bto`, `pzt`, `bfo`
- `display_name`
- `family`: e.g. `relaxor_ferroelectric`, `perovskite`, `multiferroic`
- `composition_variable`: usually `xf`, nullable
- `temperature_variable`: usually `tem`
- `notes`
- `created_at`, `updated_at`

### `ferro_parameter_models`

Purpose: one row per formula/static model version.

Fields:

- `id`
- `material_id`
- `model_key`
- `model_name`
- `source_label`
- `source_citation`
- `formula_type`: `static`, `temperature_dependent`, `composition_temperature_dependent`
- `valid_xf_min`, `valid_xf_max`
- `valid_tem_min`, `valid_tem_max`
- `default_xf`, `default_tem`
- `implementation_key`: JS function key, e.g. `pztHaun1989`
- `notes`
- `created_at`, `updated_at`

### `ferro_parameter_snapshots`

Purpose: persist the exact coefficients used for a calculation or preview.

Fields:

- `id`
- `model_id`
- `job_id`, nullable before job creation
- `xf`, `tem`
- all coefficient fields from the output contract
- `warnings_json`
- `created_at`

This table provides reproducibility even if the model implementation changes later.

## Code Architecture

### New Module: `pf_assistant/src/ferro/material-models.js`

Responsibilities:

- Expose available material models.
- Validate `xf` and `tem` ranges.
- Compute coefficients from formula models.
- Return the stable output contract.

Suggested API:

```js
listFerroMaterialModels()
resolveFerroMaterialModel({ materialKey, modelKey, xf, tem })
calculateFerroCoefficients({ materialKey, modelKey, xf, tem })
```

### New Module: `pf_assistant/src/ferro/material-repository.js`

Responsibilities:

- Seed/read ferro material metadata.
- Save coefficient snapshots.
- Keep formula implementation in JS code, not in SQL strings.

### Update: `pf_assistant/src/ferro/job-service.js`

Change from hard-coded PMN-PT constants to:

1. validate request material fields
2. calculate coefficients through `material-models.js`
3. write `input.in` from the returned coefficient object
4. save coefficient snapshot with `jobId`

### Update: `pf_assistant/src/ferro/dialogue-service.js`

Support natural-language material selection:

- `默认 PMN-PT`
- `材料换成 PZT，xf=0.48，温度300K`
- `用 BTO Wang 2010 模型`
- `用 BFO Bens 参数`

The ready summary should include both material and model:

```text
材料=PZT, 模型=Haun 1989, xf=0.48, 温度=300K
```

## First Implementation Milestones

### Round A: Model Registry Without DB

- Add `material-models.js`.
- Move PMN-PT hard-coded constants into the registry.
- Add BTO model from `generate_input.py`.
- Add tests for coefficient calculations.
- Make `job-service.js` write coefficients from the registry.

### Round B: Add PZT and BFO Models

- Implement `pzt_haun_1989` formula.
- Implement two BFO model versions with source warnings.
- Add snapshot tests at fixed `xf/tem`.
- Add request validation and warnings for ambiguous BFO source.

### Round C: Add Database Persistence

- Create ferro material tables.
- Seed metadata/model rows.
- Save parameter snapshots per job.
- Add API endpoint for listing materials/models.

### Round D: Dialogue and UI Selection

- Let chat dialogue parse material/model names.
- Show material/model summary before running.
- Optionally add a small UI material selector later.

## Risks and Open Questions

- BFO model labels and sources need confirmation before being presented as final literature-grade data.
- Some snippets define both compliance `sij` and stiffness `cij`; `input.in` currently expects `s11/s12/s44`, while parts of the Fortran derive `cij` internally. The database should store both when available but preserve the input writer contract.
- Formula models should be unit-tested against known snapshots because small expression mistakes can silently alter simulation behavior.
- Existing historical jobs should keep their stored snapshots, so future formula fixes do not rewrite past provenance.

## Recommended Next Step

Start with Round A. It is low risk because it should reproduce current PMN-PT output exactly while introducing the material model boundary needed for BTO/PZT/BFO.
