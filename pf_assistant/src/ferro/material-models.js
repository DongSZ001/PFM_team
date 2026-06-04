'use strict';

const {
  isLandauModelKey,
  listRunnableLandauMaterialModels,
  calculateLandauCoefficients,
} = require('./landau-model-adapter');

const FERRO_UI_METADATA = Object.freeze({
  pmn_pt_default: { family: 'PMN-PT', title: 'PMN-PT', subtitle: 'Default PMN-PT model', mode: 'inplane_angle', badges: ['PMN-PT', '2D', 'domain structure'], composition: { enabled: true, key: 'xf', label: 'xf' } },
  bto_generate_input: { family: 'BaTiO3', title: 'BaTiO3', subtitle: 'BTO / BaTiO3 model', mode: 'inplane_angle', badges: ['BaTiO3', '2D', 'domain structure'], composition: { enabled: false } },
  pzt_haun_1989: { family: 'PZT', title: 'PZT', subtitle: 'PZT Haun 1989', mode: 'inplane_angle', badges: ['PZT', '2D', 'Haun 1989'], composition: { enabled: true, key: 'xf', label: 'xf' } },
  bfo_bens_coefficients: { family: 'BFO', title: 'BFO', subtitle: 'BFO (Fortran 10004)', mode: 'variant_111', badges: ['BFO', '2D', '<111> variants'], composition: { enabled: false } },
  bfo_10004: { family: 'BFO', title: 'BFO', subtitle: 'BFO 10004 source-check', mode: 'variant_111', badges: ['BFO', 'legacy', '<111> variants'], composition: { enabled: false } },
});

function enrichFerroMaterialModel(model) {
  const item = normalizePublicMaterialModel(model);
  const meta = FERRO_UI_METADATA[item.modelKey] || landauUiMetadata(item);
  const family = meta.family || item.displayName || item.materialKey;
  const title = meta.title || item.displayName || family;
  const subtitle = meta.subtitle || item.modelName || item.modelKey;
  const composition = buildCompositionMetadata(item, meta);
  const temperature = normalizeDefaultTemperature(item);
  const defaultParams = composition.enabled ? { [composition.key || 'xf']: composition.value, temperature } : { temperature };
  const displayParams = [];
  if (composition.enabled) displayParams.push({ label: composition.label || composition.key || 'xf', value: String(composition.value), highlight: true });
  displayParams.push({ label: 'T', value: temperature + ' K', highlight: true });
  return {
    ...item,
    id: item.modelKey,
    model: item.modelKey,
    family,
    title,
    subtitle,
    formula: formulaFor(item, family),
    description: (item.description || subtitle) + ' phase-field model',
    defaultParams,
    composition,
    hasComposition: composition.enabled,
    compositionKey: composition.key,
    compositionLabel: composition.label,
    compositionValue: composition.value,
    showCompositionInCard: composition.enabled,
    showCompositionInDraft: composition.enabled,
    displayParams,
    tags: meta.badges || item.tags || [family, '2D', 'domain structure'],
    badges: meta.badges || item.tags || [family, '2D', 'domain structure'],
    active: item.active !== false,
    presets: buildFerroPresets(meta.mode || 'inplane_angle'),
  };
}

function listEnrichedFerroMaterialModels(models = listFerroMaterialModels()) {
  return models.map(enrichFerroMaterialModel);
}

function landauUiMetadata(item) {
  if (!isLandauModelKey(item && item.modelKey)) return {};
  const family = familyLabel(item.materialKey || item.displayName);
  return {
    family,
    title: family,
    subtitle: item.modelName || item.modelKey,
    mode: item.materialKey === 'bfo' ? 'variant_111' : 'inplane_angle',
    badges: [family, 'Landau DB', '可计算'],
    composition: { enabled: ['pmn_pt', 'pzt', 'knn'].includes(item.materialKey), key: 'xf', label: item.materialKey === 'pzt' ? 'x' : 'xf' },
  };
}

function normalizePublicMaterialModel(model) {
  if (!model) throw validationError('material model is required');
  return {
    materialKey: model.materialKey || model.material_key,
    modelKey: model.modelKey || model.model_key || model.id,
    displayName: model.displayName || model.display_name || model.title,
    modelName: model.modelName || model.model_name || model.subtitle,
    defaultXf: numberOr(model.defaultXf, model.default_xf, model.defaultParams && model.defaultParams.xf),
    defaultTem: numberOr(model.defaultTem, model.default_tem, model.defaultParams && model.defaultParams.temperature),
    active: model.active !== 0 && model.active !== false,
    description: model.description || model.notes,
    tags: model.tags,
  };
}

function buildFerroPresets(modeOrComponent) {
  const visualization = visualizationPreset(modeOrComponent);
  return [
    {
      id: 'quick_2d',
      label: '快速预览',
      description: '64×1×64，10000步，每2000步输出',
      grid: { nx: 64, ny: 1, nz: 64 },
      run: { steps: 10000, outputInterval: 2000 },
      visualization: { ...visualization },
      initial: { type: 'random_small_perturbation' },
      field: { enabled: false },
    },
    {
      id: 'standard_2d',
      label: '标准计算',
      description: '128×1×128，20000步，每5000步输出',
      grid: { nx: 128, ny: 1, nz: 128 },
      run: { steps: 20000, outputInterval: 5000 },
      visualization: { ...visualization },
      initial: { type: 'random_small_perturbation' },
      field: { enabled: false },
    },
    {
      id: 'custom',
      label: '自定义',
      description: '手动设置网格、步数、外场和高级参数',
      custom: true,
    },
  ];
}

function visualizationPreset(modeOrComponent) {
  const mode = modeOrComponent === 'angle_arrow' || modeOrComponent === 'inplane_angle_arrow'
    ? 'inplane_angle'
    : modeOrComponent === 'variant_111_arrow'
      ? 'variant_111'
      : modeOrComponent;
  if (['inplane_angle', 'variant_111'].includes(mode)) {
    return { mode, component: null, plane: 'auto', inplaneComponents: 'auto', outputPolicy: 'selected_only', overlay: { arrows: true } };
  }
  return { mode: 'component', component: supportedVisualizationComponent(mode || 'pz'), plane: 'auto', inplaneComponents: 'auto', outputPolicy: 'selected_only', overlay: { arrows: true } };
}

function supportedVisualizationComponent(component) {
  return ['px', 'py', 'pz'].includes(component) ? component : 'pz';
}

function buildCompositionMetadata(item, meta) {
  const explicit = meta.composition || {};
  const inferred = /pmn|pzt|knn/i.test(item.materialKey || item.modelKey || item.displayName || '');
  const enabled = explicit.enabled !== undefined ? explicit.enabled : inferred;
  if (!enabled) return { enabled: false, key: null, label: null, value: null };
  const key = explicit.key || 'xf';
  const value = numberOr(item.defaultXf, item.default_xf, item.defaultParams && item.defaultParams[key], item.defaultParams && item.defaultParams.xf);
  return { enabled: true, key, label: explicit.label || key, value: value ?? null };
}

function normalizeDefaultTemperature(item) {
  if ((item.materialKey === 'bfo') || /^bfo/i.test(item.modelKey || '') || /BFO/i.test(item.displayName || '')) return 298;
  return numberOr(item.defaultTem, item.default_tem, item.defaultParams && item.defaultParams.temperature, 300);
}

function formulaFor(item, family) {
  if (/bfo/i.test(item.materialKey || item.modelKey || family)) return 'BiFeO3';
  if (/bto|batio3/i.test(item.materialKey || item.modelKey || family)) return 'BaTiO3';
  return item.formula || '';
}

function numberOr(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return Number(value);
  }
  return undefined;
}

const MATERIAL_MODELS = [
  {
    materialKey: 'pmn_pt',
    modelKey: 'pmn_pt_default',
    displayName: 'PMN-PT',
    modelName: 'Default PMN-PT model',
    defaultInputs: { xf: 0.3, tem: 298 },
    calculate: calculatePmnPtDefault,
  },
  {
    materialKey: 'bto',
    modelKey: 'bto_generate_input',
    displayName: 'BaTiO3',
    modelName: 'BaTiO3 Wang2010 modified',
    defaultInputs: { xf: 1.0, tem: 298 },
    calculate: calculateBtoGenerateInput,
  },
  {
    materialKey: 'pzt',
    modelKey: 'pzt_haun_1989',
    displayName: 'PZT',
    modelName: 'PZT Haun 1989',
    defaultInputs: { xf: 0.48, tem: 300 },
    calculate: calculatePztHaun1989,
  },
  {
    materialKey: 'bfo',
    modelKey: 'bfo_bens_coefficients',
    displayName: 'BFO',
    modelName: 'BFO Bens coefficients',
    defaultInputs: { xf: 1.0, tem: 298 },
    calculate: calculateBfoBensCoefficients,
    warnings: ['BFO Bens source has multiple elastic stiffness assignments; final c11/c12/c44 block is used.'],
  },
  {
    materialKey: 'bfo',
    modelKey: 'bfo_10004',
    displayName: 'BFO',
    modelName: 'BFO 10004 source-check model',
    defaultInputs: { xf: 1.0, tem: 298 },
    calculate: calculateBfo10004,
    warnings: ['BFO 10004 source label requires confirmation because coefficients resemble a BTO-style block.'],
  },
];

function listFerroMaterialModels() {
  const builtIns = MATERIAL_MODELS.map(({ materialKey, modelKey, displayName, modelName, defaultInputs }) => ({
    materialKey,
    modelKey,
    displayName,
    modelName,
    defaultInputs: { ...defaultInputs },
  }));
  return builtIns.concat(listRunnableLandauMaterialModels().map(({ materialKey, modelKey, displayName, modelName, defaultInputs }) => ({
    materialKey,
    modelKey,
    displayName,
    modelName,
    defaultInputs: { ...defaultInputs },
  })));
}

function calculateFerroCoefficients({ materialKey = 'pmn_pt', modelKey, xf, tem } = {}) {
  if (isLandauModelKey(modelKey)) return calculateLandauCoefficients({ modelKey, xf, tem });
  const model = resolveFerroMaterialModel({ materialKey, modelKey });
  const inputs = {
    xf: finiteOrDefault(xf, model.defaultInputs.xf, 'xf'),
    tem: finiteOrDefault(tem, model.defaultInputs.tem, 'tem'),
  };
  return {
    materialKey: model.materialKey,
    modelKey: model.modelKey,
    displayName: model.displayName,
    modelName: model.modelName,
    inputs,
    coefficients: model.calculate(inputs),
    warnings: [...(model.warnings || [])],
  };
}

function resolveFerroMaterialModel({ materialKey = 'pmn_pt', modelKey } = {}) {
  if (isLandauModelKey(modelKey)) {
    const model = listRunnableLandauMaterialModels().find((item) => item.modelKey === modelKey);
    if (!model) throw validationError(`Unsupported ferro material model: ${materialKey || modelKey}`);
    return model;
  }
  const normalizedMaterial = normalizeKey(materialKey || 'pmn_pt');
  const normalizedModel = modelKey ? normalizeKey(modelKey) : null;
  const model = MATERIAL_MODELS.find((item) => {
    if (normalizedModel) return item.modelKey === normalizedModel;
    return item.materialKey === normalizedMaterial;
  });
  if (!model) throw validationError(`Unsupported ferro material model: ${materialKey || modelKey}`);
  return model;
}

function familyLabel(value) {
  const key = normalizeKey(value);
  if (key === 'pmn_pt') return 'PMN-PT';
  if (key === 'bto') return 'BaTiO3';
  if (key === 'pzt') return 'PZT';
  if (key === 'bfo') return 'BFO';
  if (key === 'knn') return 'KNN';
  return value || 'Landau';
}

function calculatePmnPtDefault() {
  return {
    Q1: 0.084,
    Q2: -0.025,
    Q4: 0.035,
    s11: 5.2e-11,
    s12: -1.89e-11,
    s44: 1.4e-11,
    a0: 100000000.0,
    p0: 0.26,
    a1: -25199000.0,
    a11: 34520500.0,
    a12: 60750000.0,
    a111: 2570000000.0,
    a112: 6950000000.0,
    a123: 13130000000.0,
    a1111: 0.0,
    a1112: 0.0,
    a1122: 0.0,
    a1123: 0.0,
  };
}

function calculateBtoGenerateInput({ tem }) {
  // Wang2010 modified potential for BaTiO3
  // Source: Wang et al., J. Appl. Phys. 108, 114105 (2010)
  const Ts = 160;
  const coth = (x) => 1 / Math.tanh(x);
  const a1 = 5.0e5 * Ts * (coth(Ts / tem) - coth(Ts / 390));
  const a0 = -(5.0e5 * Ts * (coth(Ts / 293) - coth(Ts / 390)));
  return {
    Q1: 0.11,
    Q2: -0.045,
    Q4: 0.029,
    s11: 9.07e-12,
    s12: -3.186e-12,
    s44: 8.197e-12,
    a0,
    p0: 0.26,
    a1,
    a11: -1.154e8,
    a12: 6.530e8,
    a111: -2.106e9,
    a112: 4.091e9,
    a123: -6.688e9,
    a1111: 7.590e10,
    a1112: -2.193e10,
    a1122: -2.221e10,
    a1123: 2.416e10,
  };
}

function calculatePztHaun1989({ xf, tem }) {
  const epsilon0 = 8.854e-12;
  const denomQ = 1 + 200 * (xf - 0.5) ** 2;
  const Q1 = 0.045624 + 0.042796 * xf + 0.029578 / denomQ;
  const Q2 = -0.013386 - 0.012093 * xf - 0.026568 / denomQ;
  const Q4 = 0.5 * (0.046147 + 0.020857 * xf + 0.025325 / denomQ);
  const Curie_C1 = (2.1716 / (1 + 500.05 * (xf - 0.5) ** 2) + 0.131 * xf + 2.01) * 1e5;
  const Curie_C2 = (2.8339 / (1 + 126.56 * (xf - 0.5) ** 2) + 1.4132) * 1e5;
  const Curie_C = xf > 0.5 ? Curie_C2 : Curie_C1;
  const T0 = 189.48 + 843.40 * xf - 2105.5 * xf ** 2 + 4041.8 * xf ** 3 - 3828.3 * xf ** 4 + 1337.8 * xf ** 5;
  const a1 = (tem - T0) / (2 * epsilon0 * Curie_C);
  const a11 = (10.612 - 22.655 * xf + 10.955 * xf ** 2) * 1.0e13 / Curie_C;
  const a111 = (12.026 - 17.296 * xf + 9.179 * xf ** 2) * 1.0e13 / Curie_C;
  const a112 = (58.804 * Math.exp(-29.397 * xf) - 3.3754 * xf + 4.2904) * 1.0e14 / Curie_C;
  const zta1 = ((-9.6 - 0.012501 * xf) * Math.exp(-12.6 * xf) + 0.42743 * xf + 2.6213) * 1.0e14 / Curie_C;
  const zta2 = ((16.225 - 0.088651 * xf) * Math.exp(-21.255 * xf) - 0.76973 * xf + 0.887) * 1.0e15 / Curie_C;
  const a12 = zta1 / 3 - a11;
  const a123 = zta2 - 3 * a111 - 6 * a112;
  const Curie_C0 = (2.8339 / (1 + 126.56 * (1.0 - 0.5) ** 2) + 1.4132) * 1e5;
  const a0 = -(25 - T0) / (2 * epsilon0 * Curie_C0);
  const s11 = 8.2e-12;
  const s12 = -2.6e-12;
  const s44 = 14.4e-12;
  const stiffness = stiffnessFromCompliance(s11, s12, s44);
  return {
    Q1,
    Q2,
    Q4,
    s11,
    s12,
    s44,
    ...stiffness,
    a0,
    p0: 0.7570,
    a1,
    a11,
    a12,
    a111,
    a112,
    a123,
    a1111: 0.0,
    a1112: 0.0,
    a1122: 0.0,
    a1123: 0.0,
    epsilon0,
    Curie_C,
    Curie_C1,
    Curie_C2,
    Curie_C0,
    T0,
    zta1,
    zta2,
  };
}

function calculateBfoBensCoefficients({ tem }) {
  const c11 = 300e9;
  const c12 = 162e9;
  const c44 = 69e9;
  const compliance = complianceFromStiffness(c11, c12, c44);
  return {
    Q1: 0.032,
    Q2: -0.016,
    Q4: 0.04,
    c11,
    c12,
    c44,
    ...compliance,
    a0: -4.25 * (298 - 1103) * 1e5,
    p0: 0.51,
    a1: 4.25 * (tem - 1103) * 1e5,
    a11: 1.10e8,
    a12: 6.40e8,
    a111: 1.00e9,
    a112: 0.0,
    a123: 0.0,
    a1111: 0.0,
    a1112: 0.0,
    a1122: 0.0,
    a1123: 0.0,
  };
}

function calculateBfo10004({ tem }) {
  const c11 = 1.78e11;
  const c12 = 0.96e11;
  const c44 = 0.68e11;
  const compliance = complianceFromStiffness(c11, c12, c44);
  return {
    Q1: 0.032,
    Q2: -0.016,
    Q4: 0.02,
    c11,
    c12,
    c44,
    ...compliance,
    a0: -4.64385e5 * (298 - 1103),
    p0: 0.51,
    a1: 4.64385e5 * (tem - 1103),
    a11: 2.29047e8,
    a12: 3.06361e8,
    a111: 5.99186e7,
    a112: -3.33980e5,
    a123: -1.77754e7,
    a1111: 0.0,
    a1112: 0.0,
    a1122: 0.0,
    a1123: 0.0,
  };
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

function normalizeKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (key === 'pmnpt') return 'pmn_pt';
  if (key === 'batio3' || key === 'ba_tio3') return 'bto';
  if (key === 'lead_zirconate_titanate') return 'pzt';
  if (key === 'bifeo3') return 'bfo';
  return key;
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  listFerroMaterialModels,
  resolveFerroMaterialModel,
  calculateFerroCoefficients,
  enrichFerroMaterialModel,
  listEnrichedFerroMaterialModels,
};
