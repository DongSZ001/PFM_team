#!/usr/bin/env node
/**
 * Derive magnetoelastic coupling B1 / B2 from λ100 / λ111 and elastic
 * constants c11 / c12 / c44.
 *
 * Physics:
 *   B1 = -3/2 · λ100 · (c11 - c12)
 *   B2 = -3   · λ111 · c44
 *
 * Stored as is_derived=1 in the corresponding B1_from_lambda100 /
 * B2_from_lambda100 rows, with a derivation_note.
 *
 * Usage:
 *   node scripts/derive-magnetoelastic.js
 *   node scripts/derive-magnetoelastic.js --force
 *
 *   --force:  overwrite existing derived values (default: skip rows
 *             that already have a value).
 */

'use strict';

const db = require('../database');
const mp = require('../material-parameters');

function deriveB1(lambda100, c11, c12) {
  if (lambda100 == null || c11 == null || c12 == null) return null;
  return -1.5 * lambda100 * (c11 - c12);
}
function deriveB2(lambda111, c44) {
  if (lambda111 == null || c44 == null) return null;
  return -3 * lambda111 * c44;
}

function getValue(pv) {
  if (!pv) return null;
  if (pv.value_si != null) return pv.value_si;
  if (pv.value_min_si != null && pv.value_max_si != null) {
    return (pv.value_min_si + pv.value_max_si) / 2;
  }
  return null;
}

function run(force = false) {
  db.initDb();
  const database = db.getDb();

  // Load all parameter_sets with their (c11, c12, c44, λ100, λ111, B1, B2).
  const setIds = database.prepare(`SELECT id FROM parameter_sets ORDER BY id`).all().map((r) => r.id);

  let derivedB1 = 0, derivedB2 = 0, skippedB1 = 0, skippedB2 = 0, missingInputs = 0;

  for (const setId of setIds) {
    const values = mp.getValuesForSet(setId);
    const byKey = new Map(values.map((v) => [v.parameter_key, v]));

    const lambda100 = getValue(byKey.get('lambda100'));
    const lambda111 = getValue(byKey.get('lambda111'));
    const c11 = getValue(byKey.get('c11'));
    const c12 = getValue(byKey.get('c12'));
    const c44 = getValue(byKey.get('c44'));

    const canB1 = lambda100 != null && c11 != null && c12 != null;
    const canB2 = lambda111 != null && c44 != null;

    if (!canB1 && !canB2) {
      missingInputs++;
      continue;
    }

    if (canB1) {
      const b1 = deriveB1(lambda100, c11, c12);
      const existing = byKey.get('B1_from_lambda100');
      if (!existing || force) {
        mp.writeParameterValue({
          parameterSetId: setId,
          parameterKey: 'B1_from_lambda100',
          valueSi: b1,
          rawValue: existing ? existing.raw_value : null,
          rawUnit: existing ? existing.raw_unit : 'J/m^3',
          isDerived: true,
          derivationNote: 'computed: B1 = -3/2 * λ100 * (c11 - c12)',
          importWarning: null,
          force: true,
        });
        derivedB1++;
      } else if (existing.value_si == null) {
        // Existing row but value is empty — fill it in
        mp.writeParameterValue({
          parameterSetId: setId,
          parameterKey: 'B1_from_lambda100',
          valueSi: b1,
          isDerived: true,
          derivationNote: 'computed: B1 = -3/2 * λ100 * (c11 - c12)',
          force: false,
        });
        derivedB1++;
      } else {
        skippedB1++;
      }
    }

    if (canB2) {
      const b2 = deriveB2(lambda111, c44);
      const existing = byKey.get('B2_from_lambda100');
      if (!existing || force) {
        mp.writeParameterValue({
          parameterSetId: setId,
          parameterKey: 'B2_from_lambda100',
          valueSi: b2,
          rawValue: existing ? existing.raw_value : null,
          rawUnit: existing ? existing.raw_unit : 'J/m^3',
          isDerived: true,
          derivationNote: 'computed: B2 = -3 * λ111 * c44',
          importWarning: null,
          force: true,
        });
        derivedB2++;
      } else if (existing.value_si == null) {
        mp.writeParameterValue({
          parameterSetId: setId,
          parameterKey: 'B2_from_lambda100',
          valueSi: b2,
          isDerived: true,
          derivationNote: 'computed: B2 = -3 * λ111 * c44',
          force: false,
        });
        derivedB2++;
      } else {
        skippedB2++;
      }
    }
  }

  console.log('=== Magnetoelastic derivation ===');
  console.log(`Parameter sets scanned:    ${setIds.length}`);
  console.log(`Sets missing inputs:       ${missingInputs}`);
  console.log(`B1 derived (new/updated):  ${derivedB1}`);
  console.log(`B2 derived (new/updated):  ${derivedB2}`);
  console.log(`B1 skipped (already set):  ${skippedB1}`);
  console.log(`B2 skipped (already set):  ${skippedB2}`);
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  run(force);
}

module.exports = { run, deriveB1, deriveB2 };
