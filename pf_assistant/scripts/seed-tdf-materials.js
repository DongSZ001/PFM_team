#!/usr/bin/env node
/**
 * Seed giant-magnetostrictive and classical ferromagnet reference materials.
 *
 *   TDF  = Terfenol-D (Tb0.7Dy0.3Fe2) family
 *   + pure Fe (bcc), Ni (fcc), Galfenol
 *
 * Values are widely cited textbook / canonical reference values. All values
 * stored in SI units via unit-converter.
 *
 * Sources:
 *   - Clark, A.E., "Ferromagnetic Materials" Vol 1, North-Holland (1980).
 *   - Chikazumi, S., "Physics of Ferromagnetism", Oxford (1997).
 *   - Clark, A.E.; Wun-Fogle, M.; Restorff, J.B.; Lograsso, T.A.,
 *     "Effect of Quenching on the Magnetostriction of Fe1-xGax",
 *     IEEE Trans. Magn. 37, 2678 (2001).
 *   - Engdahl, G., "Handbook of Giant Magnetostrictive Materials",
 *     Academic Press (2000).
 *
 * Run:
 *   node scripts/seed-tdf-materials.js
 *
 * Idempotent: existing values are preserved (upsert policy is
 * "COALESCE(new, old)").
 */

'use strict';

const db = require('../database');
const mp = require('../material-parameters');

const MATERIALS = [
  // ---------- 1. Terfenol-D (the canonical giant magnetostrictive) ----------
  {
    material: {
      displayName: 'Terfenol-D (Tb0.27Dy0.73Fe2)',
      materialFamily: 'rare_earth_iron_laves',
      magneticLayer: 'Tb0.27Dy0.73Fe2',
      notes: 'Cubic Laves (MgCu2-type, C15). Engineered composition to minimise anisotropy at room temperature. Widely used in actuators and sonar.',
    },
    source: {
      firstAuthor: 'Clark',
      authors: 'Clark, A. E.',
      journal: 'Ferromagnetic Materials (handbook)',
      year: 1980,
      title: 'Chapter 7: Magnetostrictive rare earth-Fe2 compounds',
      doi: null,
    },
    set: {
      setName: 'Clark_handbook_1980_reference_TDF_general',
      setType: 'reference',
      simulationContext: 'magnetoelastic',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Polycrystalline bulk at 300 K. Saturation magnetostriction λs ≈ 1000 ppm.',
    },
    parameters: {
      // SI
      Ms: 8.0e5,                   // 800 kA/m
      Aex: 9.0e-12,                // 9 pJ/m
      alpha: 0.01,
      Ku1: -6.0e4,                 // J/m^3 (small in engineered TDF)
      Ku2: -2.0e4,                 // J/m^3
      D: 0,                        // rare earth — no significant DMI
      gamma0: -1.76e7,
      c11: 1.01e11,                // 101 GPa
      c12: 3.8e10,                 // 38 GPa
      c44: 4.8e10,                 // 48 GPa
      young_modulus: 80,            // GPa (along [112])
      poisson_ratio: 0.30,
      lambda100: 9.0e-5,           // 90 ppm
      lambda111: 1.64e-3,          // 1640 ppm
      anisotropy_type: 'cubic (engineered to minimise at RT)',
    },
  },

  // ---------- 2. TbFe2 (parent compound) ----------
  {
    material: {
      displayName: 'TbFe2 (cubic Laves)',
      materialFamily: 'rare_earth_iron_laves',
      magneticLayer: 'TbFe2',
      notes: 'Parent C15 Laves compound. Larger magnetostriction than Terfenol-D but stronger anisotropy at RT, so requires a field to align.',
    },
    source: {
      firstAuthor: 'Clark',
      authors: 'Clark, A. E.; Belson, H. S.; Strakna, R. E.; Savage, J. M.',
      journal: 'J. Appl. Phys.',
      year: 1976,
      title: 'Magnetic properties of TbFe2',
      doi: '10.1063/1.323522',
    },
    set: {
      setName: 'Clark_1976_literature_TbFe2_general',
      setType: 'literature',
      simulationContext: 'magnetoelastic',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Bulk TbFe2 at 300 K. λ111 ≈ 4400 ppm at low T (extrapolated to 300 K is ~1700-2000 ppm).',
    },
    parameters: {
      Ms: 8.3e5,                   // 830 kA/m
      Aex: 1.0e-11,
      alpha: 0.02,
      Ku1: -7.6e6,                 // J/m^3 (very large cubic anisotropy)
      Ku2: -1.0e5,
      D: 0,
      gamma0: -1.76e7,
      c11: 1.06e11,
      c12: 3.9e10,
      c44: 4.6e10,
      lambda100: 1.0e-4,
      lambda111: 1.7e-3,
      anisotropy_type: 'cubic (large)',
    },
  },

  // ---------- 3. Galfenol Fe81Ga19 ----------
  {
    material: {
      displayName: 'Galfenol (Fe81Ga19)',
      materialFamily: 'transition_metal_alloy',
      magneticLayer: 'Fe0.81Ga0.19',
      notes: 'Body-centred cubic Fe-Ga alloy. "Galfenol" — engineered for moderate magnetostriction (~250 ppm) at low fields, ductile, weldable.',
    },
    source: {
      firstAuthor: 'Clark',
      authors: 'Clark, A. E.; Wun-Fogle, M.; Restorff, J. B.; Lograsso, T. A.',
      journal: 'IEEE Trans. Magn.',
      year: 2001,
      title: 'Effect of quenching on the magnetostriction of Fe1-xGax (0.13 ≤ x ≤ 0.21)',
      doi: '10.1109/20.951246',
    },
    set: {
      setName: 'Clark_2001_literature_Galfenol_general',
      setType: 'literature',
      simulationContext: 'magnetoelastic',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Slow-cooled Fe81Ga19 single crystal at RT. Quenched values can be 2x higher.',
    },
    parameters: {
      Ms: 1.43e6,                  // 1430 kA/m
      Aex: 2.0e-11,                // 20 pJ/m
      alpha: 0.01,
      Ku1: 2.0e4,                  // J/m^3
      Ku2: 0,
      D: 0,
      gamma0: -1.76e7,
      c11: 2.20e11,                // 220 GPa
      c12: 1.45e11,                // 145 GPa
      c44: 1.30e11,                // 130 GPa
      young_modulus: 150,           // GPa
      poisson_ratio: 0.32,
      lambda100: 2.8e-4,           // 280 ppm
      lambda111: -5.0e-5,          // -50 ppm
      anisotropy_type: 'cubic (weak)',
    },
  },

  // ---------- 4. Pure Fe (bcc) reference ----------
  {
    material: {
      displayName: 'Fe (bcc) bulk reference',
      materialFamily: 'transition_metal',
      magneticLayer: 'Fe',
      notes: 'Body-centred cubic iron at 300 K. Standard ferromagnet reference.',
    },
    source: {
      firstAuthor: 'Chikazumi',
      authors: 'Chikazumi, S.',
      journal: 'Physics of Ferromagnetism (textbook)',
      year: 1997,
      title: 'Physics of Ferromagnetism',
      doi: null,
    },
    set: {
      setName: 'Chikazumi_textbook_1997_reference_Fe_general',
      setType: 'reference',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'high',
      notes: 'Bulk bcc Fe at 300 K. Most well-measured ferromagnet.',
    },
    parameters: {
      Ms: 1.71e6,                  // 1710 kA/m
      Aex: 2.1e-11,                // 21 pJ/m
      alpha: 0.002,
      Ku1: 4.8e4,                  // J/m^3 (small cubic anisotropy)
      Ku2: 1.5e4,
      D: 0,
      gamma0: -1.76e7,
      c11: 2.41e11,                // 241 GPa
      c12: 1.46e11,                // 146 GPa
      c44: 1.12e11,                // 112 GPa
      young_modulus: 210,           // GPa
      poisson_ratio: 0.29,
      lambda100: 2.1e-5,           // 21 ppm
      lambda111: -2.1e-5,          // -21 ppm
      anisotropy_type: 'cubic',
    },
  },

  // ---------- 5. Ni (fcc) reference ----------
  {
    material: {
      displayName: 'Ni (fcc) bulk reference',
      materialFamily: 'transition_metal',
      magneticLayer: 'Ni',
      notes: 'Face-centred cubic nickel at 300 K. Soft ferromagnet, negative magnetostriction.',
    },
    source: {
      firstAuthor: 'Chikazumi',
      authors: 'Chikazumi, S.',
      journal: 'Physics of Ferromagnetism (textbook)',
      year: 1997,
      title: 'Physics of Ferromagnetism',
      doi: null,
    },
    set: {
      setName: 'Chikazumi_textbook_1997_reference_Ni_general',
      setType: 'reference',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'high',
      notes: 'Bulk fcc Ni at 300 K.',
    },
    parameters: {
      Ms: 4.9e5,                   // 490 kA/m
      Aex: 8.0e-12,                // 8 pJ/m
      alpha: 0.01,
      Ku1: -5.7e3,                 // J/m^3 (very small, negative)
      Ku2: 0,
      D: 0,
      gamma0: -1.92e7,             // slightly different from Fe
      c11: 2.50e11,                // 250 GPa
      c12: 1.50e11,                // 150 GPa
      c44: 1.20e11,                // 120 GPa
      young_modulus: 200,           // GPa
      poisson_ratio: 0.31,
      lambda100: -5.0e-5,          // -50 ppm
      lambda111: -2.3e-5,          // -23 ppm
      anisotropy_type: 'cubic (weak)',
    },
  },
];

function run() {
  db.initDb();

  let materialsCreated = 0;
  let setsCreated = 0;
  let valuesCreated = 0;

  for (const entry of MATERIALS) {
    const m = mp.upsertMaterial(entry.material);
    if (m) materialsCreated++;

    const s = mp.upsertSource(entry.source);
    const set = mp.upsertParameterSet({
      materialId: m.id,
      sourceId: s.id,
      setName: entry.set.setName,
      setType: entry.set.setType,
      simulationContext: entry.set.simulationContext,
      isDefault: entry.set.isDefault,
      confidenceLevel: entry.set.confidenceLevel,
      notes: entry.set.notes,
    });
    setsCreated++;

    for (const [key, raw] of Object.entries(entry.parameters)) {
      const conv = require('../unit-converter').convert(key, raw);
      mp.writeParameterValue({
        parameterSetId: set.id,
        parameterKey: key,
        valueSi: conv.valueSi,
        valueMinSi: conv.valueMinSi,
        valueMaxSi: conv.valueMaxSi,
        textValue: conv.textValue,
        rawValue: raw,
        rawUnit: conv.rawUnit,
        isDerived: false,
        importWarning: conv.warning || null,
        notes: null,
      });
      valuesCreated++;
    }
  }

  console.log('=== Seeded TDF / ferromagnet reference materials ===');
  console.log(`Materials created: ${materialsCreated}`);
  console.log(`Parameter sets:    ${setsCreated}`);
  console.log(`Parameter values:  ${valuesCreated}`);
  console.log('Materials:');
  for (const entry of MATERIALS) {
    console.log(`  - ${entry.material.displayName}  (set: ${entry.set.setName})`);
  }
}

if (require.main === module) run();

module.exports = { run, MATERIALS };
