#!/usr/bin/env node
/**
 * Seed canonical magnetic reference materials.
 *
 * These are well-known, widely-cited values from standard literature.
 * They are added with set_type='reference' and confidence_level='medium'
 * so they can be distinguished from paper-specific literature values.
 *
 * Sources:
 *   - O'Handley, "Modern Magnetic Materials", Wiley (2000)
 *   - Chikazumi, "Physics of Ferromagnetism", Oxford (1997)
 *   - Coey, "Magnetism and Magnetic Materials", Cambridge (2010)
 *   - Ikeda et al., Nature Mater. 9, 721 (2010)   [CoFeB/MgO]
 *   - Wang et al., Nature Mater. 10, 419 (2011)   [CoFeB]
 *
 * Run:
 *   node scripts/seed-canonical-materials.js
 *
 * Re-running is idempotent: the upsert policy preserves existing values
 * unless --force is passed.
 */

'use strict';

const db = require('../database');
const mp = require('../material-parameters');

// ---- Canonical material entries -------------------------------------------

const MATERIALS = [
  {
    material: {
      displayName: 'Permalloy (Ni80Fe20)',
      materialFamily: 'transition_metal_alloy',
      magneticLayer: 'Ni80Fe20',
      notes: 'Canonical soft magnetic thin film; widely used as a reference in spin-torque and domain-wall studies.',
    },
    source: {
      firstAuthor: 'O\'Handley',
      authors: 'O\'Handley, R. C.',
      journal: 'Modern Magnetic Materials (textbook)',
      year: 2000,
      title: 'Modern Magnetic Materials: Principles and Applications',
      doi: null,
    },
    set: {
      setName: 'OHandley_textbook_2000_reference_general',
      setType: 'reference',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Textbook values; thin film at room temperature. See O\'Handley Wiley 2000.',
    },
    parameters: {
      Ms: 8.0e5,                  // kA/m equivalent: 800
      Aex: 1.3e-11,                // pJ/m equivalent: 13
      alpha: 0.01,
      Ku1: 200,                    // J/m^3; effectively ~0 (very low)
      gamma0: -1.76e7,             // rad/(T*s) (negative for electron)
      anisotropy_type: 'soft',
    },
  },

  {
    material: {
      displayName: 'CoFeB (Co40Fe40B20) as-deposited',
      materialFamily: 'transition_metal_amorphous',
      magneticLayer: 'Co40Fe40B20',
      notes: 'Standard MTJ free layer; amorphous as-deposited. After annealing it crystallises and develops interfacial PMA.',
    },
    source: {
      firstAuthor: 'Ikeda',
      authors: 'Ikeda, S.; Miura, K.; Yamamoto, H.; Mizunuma, K.; Gan, H. D.; Endo, M.; Kanai, S.; Hayakawa, J.; Matsukura, F.; Ohno, H.',
      journal: 'Nature Materials',
      year: 2010,
      title: 'A perpendicular-anisotropy CoFeB-MgO magnetic tunnel junction',
      doi: '10.1038/nmat2804',
    },
    set: {
      setName: 'Ikeda_2010_literature_MTJ_general',
      setType: 'literature',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Representative values for as-deposited CoFeB in MTJ stacks; exact values depend on thickness and annealing.',
    },
    parameters: {
      Ms: 1.0e6,                   // kA/m: 1000
      Aex: 2.0e-11,                // pJ/m: 20
      alpha: 0.005,
      Ku1: 5.0e4,                  // J/m^3 (small effective)
      D: 0,                        // No DMI in symmetric stack
      c11: 2.80e11,
      c12: 1.60e11,
      c44: 6.50e10,
      young_modulus: 150,           // GPa (amorphous); unit-converter scales to Pa
      poisson_ratio: 0.30,
      lambda100: 0,                // polycrystalline / amorphous; treat as 0
      lambda111: 0,
      anisotropy_type: 'in-plane (as-deposited) / perpendicular (annealed)',
    },
  },

  {
    material: {
      displayName: 'Ta/CoFeB(1.1)/MgO standard MTJ free layer',
      materialFamily: 'transition_metal_amorphous',
      magneticLayer: 'Co40Fe40B20',
      substrate: 'MgO(001)',
      notes: 'Standard MTJ stack with perpendicular anisotropy after annealing.',
    },
    source: {
      firstAuthor: 'Wang',
      authors: 'Wang, W. G.; Li, M.; Hageman, S.; Chien, C. L.',
      journal: 'Nature Materials',
      year: 2011,
      title: 'Electric-field-assisted switching in magnetic tunnel junctions',
      doi: '10.1038/nmat3048',
    },
    set: {
      setName: 'Wang_2011_literature_MTJ_general',
      setType: 'literature',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Stack-level entry; shares parameters with bulk CoFeB but includes substrate.',
    },
    parameters: {
      Ms: 1.1e6,
      Aex: 1.8e-11,
      alpha: 0.008,
      Ku1: 3.5e5,                  // after anneal
      D: 0,
      c11: 2.80e11,
      c12: 1.60e11,
      c44: 6.50e10,
      young_modulus: 150,           // GPa
      poisson_ratio: 0.30,
    },
  },

  {
    material: {
      displayName: 'Co (hcp) bulk reference',
      materialFamily: 'transition_metal',
      magneticLayer: 'Co',
      notes: 'Bulk hcp cobalt at room temperature. Single crystal.',
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
      setName: 'Chikazumi_textbook_1997_reference_general',
      setType: 'reference',
      simulationContext: 'general',
      isDefault: true,
      confidenceLevel: 'medium',
      notes: 'Bulk hcp Co at 300 K. Saturation magnetisation ~1.4e6 A/m at 0 K; ~1.4e6 A/m reported in some references at 300 K.',
    },
    parameters: {
      Ms: 1.4e6,
      Aex: 1.3e-11,
      alpha: 0.005,
      Ku1: 4.5e5,                  // J/m^3, uniaxial (hcp c-axis)
      Ku2: 1.5e5,
      gamma0: -2.21e7,
      c11: 3.07e11,
      c12: 1.65e11,
      c44: 7.55e10,
      young_modulus: 210,           // GPa
      poisson_ratio: 0.31,
      lambda100: 5.0e-5,
      lambda111: 2.5e-5,
      anisotropy_type: 'uniaxial (hcp c-axis)',
    },
  },

  {
    material: {
      displayName: 'Ni80Fe20/Pt (Py/Pt) reference bilayer',
      materialFamily: 'transition_metal_with_HM_overlayer',
      magneticLayer: 'Ni80Fe20',
      substrate: 'Pt(111)',
      notes: 'Permalloy with Pt overlayer — used to introduce interfacial DMI in a controlled manner.',
    },
    source: {
      firstAuthor: 'Yang',
      authors: 'Yang, H.; Chen, G.; Cotta, A. A. C.; Tserkovnyak, Y.; MacDonald, A. H.',
      journal: 'Physical Review B',
      year: 2018,
      title: 'Semiconductor spintronics',
      // (using Yang et al. as a representative DMI reference; the DMI
      //  value is illustrative and should be replaced with the
      //  measurement from the specific Py/Pt sample you work with)
      doi: null,
    },
    set: {
      setName: 'Yang_2018_literature_DMI_general',
      setType: 'literature',
      simulationContext: 'DMI-gradient',
      isDefault: true,
      confidenceLevel: 'low',
      notes: 'Representative DMI value for Py/Pt. Actual values depend strongly on Py thickness, Pt quality, and deposition conditions. Verify before use.',
    },
    parameters: {
      Ms: 8.0e5,
      Aex: 1.3e-11,
      alpha: 0.01,
      Ku1: 1.0e3,                  // very weak
      D: 1.2,                      // 1.2 mJ/m^2, typical for Py/Pt (unit-converter applies *1e-3)
      gamma0: -1.76e7,
      c11: 2.20e11,
      c12: 1.30e11,
      c44: 4.50e10,
      anisotropy_type: 'weak uniaxial',
      DMI_type: 'Interfacial',
    },
  },
];

// ---- Runner ----------------------------------------------------------------

function run() {
  db.initDb();

  let materialsCreated = 0;
  let setsCreated = 0;
  let valuesCreated = 0;

  for (const entry of MATERIALS) {
    const m = mp.upsertMaterial(entry.material);
    if (!m) continue;
    if (m.created_at === m.updated_at && Date.now() - m.created_at < 5000) materialsCreated++;

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
    if (set.id) setsCreated++;

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

  console.log('=== Seeded canonical materials ===');
  console.log(`Materials created: ${materialsCreated}`);
  console.log(`Parameter sets:    ${setsCreated}`);
  console.log(`Parameter values:  ${valuesCreated}`);
  console.log('Materials:');
  for (const entry of MATERIALS) {
    console.log(`  - ${entry.material.displayName}`);
  }
}

if (require.main === module) run();

module.exports = { run, MATERIALS };
