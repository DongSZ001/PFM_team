/**
 * Parameter resolver.
 *
 * Given a parameter set, check it against the requirements of a
 * simulation type and return the SI values ready for the simulation
 * generator.  This is the contract that any future mumax3 / SAW /
 * phase-field script should depend on, instead of hard-coding numbers.
 *
 * All values are returned in SI units.  The caller is expected to
 * convert to whatever the simulation engine wants.
 */

'use strict';

const mp = require('../repositories/material-parameters-repository');

// Some parameters have synonyms — semantically the same quantity, but
// stored under different keys (e.g. b1 and B1_from_lambda100 are the
// same physical constant, the latter just being marked is_derived=1).
// The resolver uses this map to look up either form.
const PARAMETER_SYNONYMS = {
  b1: ['b1', 'B1_from_lambda100'],
  b2: ['b2', 'B2_from_lambda100'],
};

function lookupWithSynonyms(byKey, key) {
  const alts = PARAMETER_SYNONYMS[key] || [key];
  for (const k of alts) {
    if (byKey.has(k)) {
      const p = byKey.get(k);
      if (p.valueSi != null || p.valueMinSi != null || p.valueMaxSi != null) return p;
    }
  }
  return null;
}

// Each simulation type declares required and recommended parameters.
// `parameterKey` must exist in parameter_definitions.
const SIMULATION_PROFILES = {
  mumax3_skyrmion_basic: {
    description: 'Minimal skyrmion simulation in mumax3 (Ms/Aex/Ku1/D/alpha).',
    required: ['Ms', 'Aex', 'Ku1', 'D', 'alpha'],
    recommended: ['gamma0', 'B_ext'],
  },
  SAW_magnetoelastic: {
    description: 'Surface acoustic wave + magnetoelastic coupling; needs b1/b2.',
    required: ['Ms', 'Aex', 'Ku1', 'D', 'alpha', 'b1', 'b2'],
    recommended: ['c11', 'c12', 'c44', 'lambda100', 'lambda111', 'young_modulus', 'poisson_ratio'],
  },
  strain_DMI_gradient: {
    description: 'Strain-driven DMI gradient simulation.',
    required: ['Ms', 'Aex', 'Ku1', 'D', 'alpha'],
    recommended: ['b1', 'b2', 'lambda100', 'lambda111', 'c11', 'c12', 'c44'],
  },
  general: {
    description: 'No required parameters; just return whatever is present.',
    required: [],
    recommended: [],
  },
};

/**
 * Resolve a parameter set against a simulation profile.
 *
 * @param {object} opts
 * @param {number} opts.parameterSetId
 * @param {string} [opts.simulationType='general']
 * @param {string} [opts.targetEngine]   e.g. 'mumax3' (currently informational)
 * @returns {{
 *   ready: boolean,
 *   simulationType: string,
 *   targetEngine: string|null,
 *   material: object|null,
 *   parameterSet: object|null,
 *   source: object|null,
 *   parametersSi: Record<string, number>,
 *   parametersText: Record<string, string>,
 *   missingParameters: string[],
 *   warnings: string[],
 *   completenessScore: number,
 *   sourceInfo: object|null,
 * }}
 */
function resolveParameterSet({ parameterSetId, simulationType = 'general', targetEngine = null } = {}) {
  const profile = SIMULATION_PROFILES[simulationType] || SIMULATION_PROFILES.general;
  const detail = mp.getParameterSetDetail(parameterSetId);
  if (!detail) {
    return {
      ready: false,
      simulationType,
      targetEngine,
      material: null,
      parameterSet: null,
      source: null,
      parametersSi: {},
      parametersText: {},
      missingParameters: [],
      warnings: [`Parameter set ${parameterSetId} not found`],
      completenessScore: 0,
      sourceInfo: null,
    };
  }

  const parametersSi = {};
  const parametersText = {};
  const warnings = [];
  const byKey = new Map(detail.parameters.map((p) => [p.parameterKey, p]));

  // Build a reverse-lookup map: for each synonym target, find which
  // canonical key it should be reported under.  We prefer the
  // canonical name (b1) over the derived alias (B1_from_lambda100).
  const canonicalFor = new Map();
  for (const [canonical, alts] of Object.entries(PARAMETER_SYNONYMS)) {
    for (const alt of alts) canonicalFor.set(alt, canonical);
  }

  for (const p of detail.parameters) {
    const outKey = canonicalFor.get(p.parameterKey) || p.parameterKey;
    if (p.valueSi != null) {
      parametersSi[outKey] = p.valueSi;
    } else if (p.valueMinSi != null && p.valueMaxSi != null) {
      // Range — pass both min and max; mid-point is the caller's choice.
      parametersSi[`${outKey}_min`] = p.valueMinSi;
      parametersSi[`${outKey}_max`] = p.valueMaxSi;
    }
    if (p.textValue) {
      parametersText[outKey] = p.textValue;
    }
    if (p.importWarning) {
      warnings.push(`${p.parameterKey}: ${p.importWarning}`);
    }
  }

  const missing = [];
  for (const key of profile.required) {
    const p = lookupWithSynonyms(byKey, key);
    if (!p) {
      missing.push(key);
      continue;
    }
    if (p.valueSi == null && p.valueMinSi == null && p.valueMaxSi == null && !p.textValue) {
      missing.push(key);
    }
  }

  const allConsidered = [...profile.required, ...profile.recommended];
  const present = allConsidered.filter((k) => byKey.has(k));
  const completenessScore = allConsidered.length
    ? Math.round((present.length / allConsidered.length) * 100)
    : 100;

  return {
    ready: missing.length === 0,
    simulationType,
    targetEngine,
    material: detail.material,
    parameterSet: detail.parameterSet,
    source: detail.source,
    parametersSi,
    parametersText,
    missingParameters: missing,
    warnings,
    completenessScore,
    sourceInfo: detail.source ? {
      firstAuthor: detail.source.firstAuthor,
      journal: detail.source.journal,
      year: detail.source.year,
      doi: detail.source.doi,
    } : null,
  };
}

function listSimulationProfiles() {
  return Object.entries(SIMULATION_PROFILES).map(([key, p]) => ({
    key,
    description: p.description,
    required: p.required,
    recommended: p.recommended,
  }));
}

module.exports = {
  resolveParameterSet,
  listSimulationProfiles,
  SIMULATION_PROFILES,
};
