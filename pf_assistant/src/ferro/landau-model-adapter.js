'use strict';

const landauRepository = require('./landau-repository');

const LANDAU_MODEL_PREFIX = 'landau:';
const DEFAULT_TEMPERATURE_BY_MATERIAL = Object.freeze({
  bfo: 298,
  bto: 298,
  pmn_pt: 298,
  pzt: 300,
  knn: 298,
});
const DEFAULT_XF_BY_MATERIAL = Object.freeze({
  pmn_pt: 0.3,
  pzt: 0.48,
  knn: 0.5,
});
const DEFAULT_P0_BY_MATERIAL = Object.freeze({
  bfo: 0.51,
  bto: 0.51,
  pzt: 0.757,
  pmn_pt: 0.26,
  knn: 0.4,
});

function isLandauModelKey(modelKey) {
  return String(modelKey || '').startsWith(LANDAU_MODEL_PREFIX);
}

function landauSetKeyFromModelKey(modelKey) {
  return String(modelKey || '').replace(new RegExp('^' + LANDAU_MODEL_PREFIX), '');
}

function listRunnableLandauMaterialModels() {
  return landauRepository.listFerroLandauSourceSets()
    .map((sourceSet) => buildLandauMaterialModel(sourceSet))
    .filter(Boolean);
}

function buildLandauMaterialModel(sourceSet) {
  const setKey = sourceSet && sourceSet.set_key;
  if (!setKey) return null;
  const records = landauRepository.listFerroLandauCoefficientRecords(setKey);
  const materialKey = normalizeMaterialKey(sourceSet.material_id || sourceSet.material_name);
  if (!materialKey || !recordsAreRunnable(records)) return null;
  const modelKey = LANDAU_MODEL_PREFIX + setKey;
  return {
    materialKey,
    modelKey,
    displayName: sourceSet.material_name || sourceSet.material_id || materialKey,
    modelName: readableLandauModelName(sourceSet),
    defaultInputs: {
      xf: defaultXfFor(sourceSet, materialKey),
      tem: defaultTemFor(sourceSet, materialKey),
    },
    sourceSetKey: setKey,
    sourceLabel: 'Landau DB: ' + setKey,
    sourceCitation: sourceSet.source_ref || '',
    formulaType: 'landau_database',
    implementationKey: modelKey,
    notes: sourceSet.notes || '',
  };
}

function calculateLandauCoefficients({ modelKey, xf, tem }) {
  const setKey = landauSetKeyFromModelKey(modelKey);
  const sourceSet = landauRepository.getFerroLandauSourceSet(setKey);
  if (!sourceSet) throw validationError(`Unsupported ferro Landau model: ${modelKey}`);
  const materialKey = normalizeMaterialKey(sourceSet.material_id || sourceSet.material_name);
  const model = buildLandauMaterialModel(sourceSet);
  if (!model) throw validationError(`Landau source set is not runnable: ${setKey}`);
  const inputs = {
    xf: finiteOrDefault(xf, model.defaultInputs.xf, 'xf'),
    tem: finiteOrDefault(tem, model.defaultInputs.tem, 'tem'),
  };
  const records = landauRepository.listFerroLandauCoefficientRecords(setKey);
  const coefficientMap = evaluateCoefficientRecords(records, {
    T: inputs.tem,
    x: inputs.xf,
    Ts: 160,
    sigma1: 0,
    sigma2: 0,
    sigma3: 0,
  });
  const c = mappedPfm2Coefficients(coefficientMap);
  const referenceMap = evaluateCoefficientRecords(records, {
    T: model.defaultInputs.tem,
    x: inputs.xf,
    Ts: 160,
    sigma1: 0,
    sigma2: 0,
    sigma3: 0,
  });
  c.a0 = -mappedPfm2Coefficients(referenceMap).a1;
  c.p0 = DEFAULT_P0_BY_MATERIAL[materialKey] || 0.5;
  return {
    materialKey,
    modelKey,
    displayName: model.displayName,
    modelName: model.modelName,
    inputs,
    coefficients: c,
    warnings: [
      'Landau database source set: ' + setKey,
      ...(sourceSet.notes ? [sourceSet.notes] : []),
    ],
  };
}

function evaluateCoefficientRecords(records, variables) {
  const out = {};
  for (const record of records) {
    const key = normalizeCoefficientId(record.normalized_coefficient_id || record.coefficient_id);
    const value = evaluateSafeExpression(record.value_expression, variables) * unitScale(record.unit_reported);
    if (Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function mappedPfm2Coefficients(map) {
  const coeffs = {
    Q1: required(map, 'Q11'),
    Q2: required(map, 'Q12'),
    Q4: required(map, 'Q44'),
    a1: required(map, 'alpha1'),
    a11: required(map, 'alpha11'),
    a12: required(map, 'alpha12'),
    a111: valueOrZero(map.alpha111),
    a112: valueOrZero(map.alpha112),
    a123: valueOrZero(map.alpha123),
    a1111: valueOrZero(map.alpha1111),
    a1112: valueOrZero(map.alpha1112),
    a1122: valueOrZero(map.alpha1122),
    a1123: valueOrZero(map.alpha1123),
  };
  if (hasAll(map, ['S11', 'S12', 'S44'])) {
    coeffs.s11 = map.S11;
    coeffs.s12 = map.S12;
    coeffs.s44 = map.S44;
    Object.assign(coeffs, stiffnessFromCompliance(coeffs.s11, coeffs.s12, coeffs.s44));
  } else if (hasAll(map, ['C11', 'C12', 'C44'])) {
    coeffs.c11 = map.C11;
    coeffs.c12 = map.C12;
    coeffs.c44 = map.C44;
    Object.assign(coeffs, complianceFromStiffness(coeffs.c11, coeffs.c12, coeffs.c44));
  } else {
    throw validationError('Landau source set lacks complete elastic S11/S12/S44 or C11/C12/C44 fields');
  }
  return coeffs;
}

function recordsAreRunnable(records) {
  try {
    const keys = new Set((records || []).map((record) => normalizeCoefficientId(record.normalized_coefficient_id || record.coefficient_id)));
    const hasLandau = ['alpha1', 'alpha11', 'alpha12'].every((key) => keys.has(key));
    const hasQ = ['Q11', 'Q12', 'Q44'].every((key) => keys.has(key));
    const hasElastic = ['S11', 'S12', 'S44'].every((key) => keys.has(key)) || ['C11', 'C12', 'C44'].every((key) => keys.has(key));
    const expressionsSafe = (records || []).every((record) => isSafeExpression(record.value_expression));
    return hasLandau && hasQ && hasElastic && expressionsSafe;
  } catch {
    return false;
  }
}

function isSafeExpression(expression) {
  const text = String(expression || '').trim();
  if (!text || /±|[{}]|where\b/i.test(text)) return false;
  return /^[0-9TtxsSigmacohqrtanepE+\-*/().,_\s]+$/.test(text);
}

function evaluateSafeExpression(expression, variables) {
  const source = String(expression || '').trim();
  if (!isSafeExpression(source)) throw validationError(`Unsafe Landau expression: ${source}`);
  const names = Object.keys(variables);
  const values = names.map((key) => Number(variables[key]));
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, 'exp', 'coth', 'sqrt', `"use strict"; return (${source});`);
  const result = fn(...values, Math.exp, coth, Math.sqrt);
  if (!Number.isFinite(result)) throw validationError(`Landau expression did not evaluate to a finite number: ${source}`);
  return result;
}

function unitScale(unit) {
  const text = String(unit || '');
  const match = text.match(/10\^([+-]?\d+)/);
  if (match) return 10 ** Number(match[1]);
  if (/\bGPa\b/i.test(text)) return 1e9;
  return 1;
}

function readableLandauModelName(sourceSet) {
  const setKey = sourceSet.set_key || '';
  const material = sourceSet.material_id || sourceSet.material_name || 'Landau';
  const rest = setKey.replace(new RegExp('^' + escapeRegExp(material) + '_?', 'i'), '').replace(/_/g, ' ');
  return [material, rest].filter(Boolean).join(' ').trim();
}

function normalizeMaterialKey(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/pmn/.test(text)) return 'pmn_pt';
  if (/bto|batio3|barium/.test(text)) return 'bto';
  if (/pzt|pbtio3|pbzr/.test(text)) return 'pzt';
  if (/bfo|bifeo3/.test(text)) return 'bfo';
  if (/knn|knbo3|nanbo3/.test(text)) return 'knn';
  return text.replace(/[^a-z0-9]+/g, '_');
}

function defaultTemFor(sourceSet, materialKey) {
  return DEFAULT_TEMPERATURE_BY_MATERIAL[materialKey] || (String(sourceSet.variables || '').includes('T') ? 298 : 300);
}

function defaultXfFor(sourceSet, materialKey) {
  const composition = String(sourceSet.composition || '');
  const match = composition.match(/0\.(\d+)/);
  if (match && materialKey === 'pmn_pt') return Number('0.' + match[1]);
  return DEFAULT_XF_BY_MATERIAL[materialKey] ?? 1;
}

function normalizeCoefficientId(value) {
  const text = String(value || '').trim();
  if (/^alpha/i.test(text)) return text.toLowerCase();
  if (/^a\d/i.test(text)) return text.toLowerCase().replace(/^a/, 'alpha');
  return text.toUpperCase();
}

function required(map, key) {
  const value = map[key];
  if (!Number.isFinite(value)) throw validationError(`Landau source set lacks ${key}`);
  return value;
}

function valueOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function hasAll(map, keys) {
  return keys.every((key) => Number.isFinite(map[key]));
}

function complianceFromStiffness(c11, c12, c44) {
  return {
    s11: (c11 + c12) / ((c11 - c12) * (c11 + 2 * c12)),
    s12: -c12 / ((c11 - c12) * (c11 + 2 * c12)),
    s44: 1 / c44,
  };
}

function stiffnessFromCompliance(s11, s12, s44) {
  return {
    c11: (s11 + s12) / ((s11 - s12) * (s11 + 2 * s12)),
    c12: -s12 / ((s11 - s12) * (s11 + 2 * s12)),
    c44: 1 / s44,
  };
}

function finiteOrDefault(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw validationError(`${name} must be a finite number`);
  return number;
}

function coth(value) {
  return 1 / Math.tanh(value);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  LANDAU_MODEL_PREFIX,
  isLandauModelKey,
  landauSetKeyFromModelKey,
  listRunnableLandauMaterialModels,
  calculateLandauCoefficients,
  buildLandauMaterialModel,
};
