'use strict';

const db = require('../../database');
const { listFerroMaterialModels } = require('./material-models');
const { listRunnableLandauMaterialModels, isLandauModelKey } = require('./landau-model-adapter');

const MATERIAL_METADATA = {
  pmn_pt: {
    displayName: 'PMN-PT',
    family: 'relaxor_ferroelectric',
    compositionVariable: 'xf',
    temperatureVariable: 'tem',
    notes: 'Default ferroelectric model used by the initial WebUI integration.',
  },
  bto: {
    displayName: 'BaTiO3',
    family: 'perovskite',
    compositionVariable: null,
    temperatureVariable: 'tem',
    notes: 'BaTiO3 model migrated from pfm2_ferro_demo/generate_input.py.',
  },
  pzt: {
    displayName: 'PZT',
    family: 'perovskite_solid_solution',
    compositionVariable: 'xf',
    temperatureVariable: 'tem',
    notes: 'PZT Haun 1989 composition-temperature dependent model.',
  },
  bfo: {
    displayName: 'BFO',
    family: 'multiferroic',
    compositionVariable: null,
    temperatureVariable: 'tem',
    notes: 'BFO models include source-check warnings until source labels are confirmed.',
  },
};

const MODEL_METADATA = {
  pmn_pt_default: {
    sourceLabel: 'PFM2 default PMN-PT parameters',
    sourceCitation: '',
    formulaType: 'static',
    validXfMin: 0,
    validXfMax: 1,
    validTemMin: 1,
    validTemMax: 2000,
    notes: 'Baseline constants reproduced from previous hard-coded job-service input writer.',
  },
  bto_generate_input: {
    sourceLabel: 'pfm2_ferro_demo/generate_input.py BTOModel',
    sourceCitation: '',
    formulaType: 'temperature_dependent',
    validXfMin: 1,
    validXfMax: 1,
    validTemMin: 1,
    validTemMax: 2000,
    notes: 'BaTiO3 coefficients migrated from the existing Python input generator.',
  },
  pzt_haun_1989: {
    sourceLabel: 'MJ Haun et al.',
    sourceCitation: 'Ferroelectrics 99, 1989',
    formulaType: 'composition_temperature_dependent',
    validXfMin: 0,
    validXfMax: 1,
    validTemMin: 1,
    validTemMax: 2000,
    notes: 'PZT formula model provided from Haun et al. expressions.',
  },
  bfo_bens_coefficients: {
    sourceLabel: 'Bens coefficients for BFO',
    sourceCitation: '',
    formulaType: 'temperature_dependent',
    validXfMin: 1,
    validXfMax: 1,
    validTemMin: 1,
    validTemMax: 2000,
    notes: 'Uses final Fortran-active c11/c12/c44 assignments and stores warnings.',
  },
  bfo_10004: {
    sourceLabel: '10004 continue ! for BFO',
    sourceCitation: '',
    formulaType: 'temperature_dependent',
    validXfMin: 1,
    validXfMax: 1,
    validTemMin: 1,
    validTemMax: 2000,
    notes: 'Source label requires confirmation because coefficients resemble a BTO-style block.',
  },
};

function seedFerroMaterialModels() {
  const database = db.getDb();
  if (typeof db.initFerroMaterialTables === 'function') db.initFerroMaterialTables(database);
  const ts = now();
  const materialRows = new Map();
  const upsertMaterial = database.prepare(`
    INSERT INTO ferro_materials
      (material_key, display_name, family, composition_variable, temperature_variable, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(material_key) DO UPDATE SET
      display_name = excluded.display_name,
      family = excluded.family,
      composition_variable = excluded.composition_variable,
      temperature_variable = excluded.temperature_variable,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  const getMaterial = database.prepare(`SELECT * FROM ferro_materials WHERE material_key = ?`);

  for (const [materialKey, meta] of Object.entries(MATERIAL_METADATA)) {
    upsertMaterial.run(
      materialKey,
      meta.displayName,
      meta.family,
      meta.compositionVariable,
      meta.temperatureVariable,
      meta.notes,
      ts,
      ts,
    );
    materialRows.set(materialKey, getMaterial.get(materialKey));
  }

  const upsertModel = database.prepare(`
    INSERT INTO ferro_parameter_models
      (material_id, model_key, model_name, source_label, source_citation, formula_type, valid_xf_min, valid_xf_max, valid_tem_min, valid_tem_max, default_xf, default_tem, implementation_key, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_key) DO UPDATE SET
      material_id = excluded.material_id,
      model_name = excluded.model_name,
      source_label = excluded.source_label,
      source_citation = excluded.source_citation,
      formula_type = excluded.formula_type,
      valid_xf_min = excluded.valid_xf_min,
      valid_xf_max = excluded.valid_xf_max,
      valid_tem_min = excluded.valid_tem_min,
      valid_tem_max = excluded.valid_tem_max,
      default_xf = excluded.default_xf,
      default_tem = excluded.default_tem,
      implementation_key = excluded.implementation_key,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  for (const model of listFerroMaterialModels()) {
    const material = materialRows.get(model.materialKey);
    if (!material) throw new Error(`Missing ferro material metadata for ${model.materialKey}`);
    const meta = MODEL_METADATA[model.modelKey] || {};
    upsertModel.run(
      material.id,
      model.modelKey,
      model.modelName,
      meta.sourceLabel || '',
      meta.sourceCitation || '',
      meta.formulaType || 'static',
      meta.validXfMin ?? null,
      meta.validXfMax ?? null,
      meta.validTemMin ?? null,
      meta.validTemMax ?? null,
      model.defaultInputs.xf,
      model.defaultInputs.tem,
      model.modelKey,
      meta.notes || '',
      ts,
      ts,
    );
  }
}

function listFerroParameterModels() {
  seedFerroMaterialModels();
  seedRunnableLandauParameterModels();
  return db.getDb().prepare(`
    SELECT fm.material_key, fm.display_name, fpm.*
    FROM ferro_parameter_models fpm
    JOIN ferro_materials fm ON fm.id = fpm.material_id
    ORDER BY fpm.id ASC
  `).all();
}

function getFerroParameterModelByKey(modelKey) {
  seedFerroMaterialModels();
  if (isLandauModelKey(modelKey)) seedRunnableLandauParameterModels();
  return db.getDb().prepare(`
    SELECT fm.material_key, fm.display_name, fpm.*
    FROM ferro_parameter_models fpm
    JOIN ferro_materials fm ON fm.id = fpm.material_id
    WHERE fpm.model_key = ?
  `).get(modelKey) || null;
}

function seedRunnableLandauParameterModels() {
  const database = db.getDb();
  if (typeof db.initFerroMaterialTables === 'function') db.initFerroMaterialTables(database);
  if (typeof db.initFerroLandauTables === 'function') db.initFerroLandauTables(database);
  const models = listRunnableLandauMaterialModels();
  if (!models.length) return;
  const ts = now();
  const upsertMaterial = database.prepare(`
    INSERT INTO ferro_materials
      (material_key, display_name, family, composition_variable, temperature_variable, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(material_key) DO UPDATE SET
      display_name = COALESCE(NULLIF(excluded.display_name, ''), ferro_materials.display_name),
      family = COALESCE(NULLIF(excluded.family, ''), ferro_materials.family),
      composition_variable = excluded.composition_variable,
      temperature_variable = excluded.temperature_variable,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  const getMaterial = database.prepare(`SELECT * FROM ferro_materials WHERE material_key = ?`);
  const upsertModel = database.prepare(`
    INSERT INTO ferro_parameter_models
      (material_id, model_key, model_name, source_label, source_citation, formula_type, valid_xf_min, valid_xf_max, valid_tem_min, valid_tem_max, default_xf, default_tem, implementation_key, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_key) DO UPDATE SET
      material_id = excluded.material_id,
      model_name = excluded.model_name,
      source_label = excluded.source_label,
      source_citation = excluded.source_citation,
      formula_type = excluded.formula_type,
      valid_xf_min = excluded.valid_xf_min,
      valid_xf_max = excluded.valid_xf_max,
      valid_tem_min = excluded.valid_tem_min,
      valid_tem_max = excluded.valid_tem_max,
      default_xf = excluded.default_xf,
      default_tem = excluded.default_tem,
      implementation_key = excluded.implementation_key,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  for (const model of models) {
    upsertMaterial.run(
      model.materialKey,
      model.displayName,
      'landau_database',
      ['pmn_pt', 'pzt', 'knn'].includes(model.materialKey) ? 'xf' : null,
      'tem',
      'Material model generated from ferroelectric Landau coefficient database.',
      ts,
      ts,
    );
    const material = getMaterial.get(model.materialKey);
    upsertModel.run(
      material.id,
      model.modelKey,
      model.modelName,
      model.sourceLabel,
      model.sourceCitation,
      model.formulaType,
      null,
      null,
      1,
      2000,
      model.defaultInputs.xf,
      model.defaultInputs.tem,
      model.implementationKey,
      model.notes,
      ts,
      ts,
    );
  }
}

function saveFerroParameterSnapshot({ jobId, calculated }) {
  if (!calculated || !calculated.modelKey) throw new Error('calculated ferro material model is required');
  const model = getFerroParameterModelByKey(calculated.modelKey);
  if (!model) throw new Error(`Unknown ferro model ${calculated.modelKey}`);
  const c = calculated.coefficients || {};
  const ts = now();
  db.getDb().prepare(`
    INSERT INTO ferro_parameter_snapshots
      (model_id, job_id, material_key, model_key, xf, tem, a1, a11, a12, a111, a112, a123, a1111, a1112, a1122, a1123, Q1, Q2, Q4, s11, s12, s44, c11, c12, c44, a0, p0, T0, Curie_C, zta1, zta2, warnings_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      model_id = excluded.model_id,
      material_key = excluded.material_key,
      model_key = excluded.model_key,
      xf = excluded.xf,
      tem = excluded.tem,
      a1 = excluded.a1,
      a11 = excluded.a11,
      a12 = excluded.a12,
      a111 = excluded.a111,
      a112 = excluded.a112,
      a123 = excluded.a123,
      a1111 = excluded.a1111,
      a1112 = excluded.a1112,
      a1122 = excluded.a1122,
      a1123 = excluded.a1123,
      Q1 = excluded.Q1,
      Q2 = excluded.Q2,
      Q4 = excluded.Q4,
      s11 = excluded.s11,
      s12 = excluded.s12,
      s44 = excluded.s44,
      c11 = excluded.c11,
      c12 = excluded.c12,
      c44 = excluded.c44,
      a0 = excluded.a0,
      p0 = excluded.p0,
      T0 = excluded.T0,
      Curie_C = excluded.Curie_C,
      zta1 = excluded.zta1,
      zta2 = excluded.zta2,
      warnings_json = excluded.warnings_json
  `).run(
    model.id,
    jobId || null,
    calculated.materialKey,
    calculated.modelKey,
    calculated.inputs?.xf ?? null,
    calculated.inputs?.tem ?? null,
    valueOrNull(c.a1),
    valueOrNull(c.a11),
    valueOrNull(c.a12),
    valueOrNull(c.a111),
    valueOrNull(c.a112),
    valueOrNull(c.a123),
    valueOrNull(c.a1111),
    valueOrNull(c.a1112),
    valueOrNull(c.a1122),
    valueOrNull(c.a1123),
    valueOrNull(c.Q1),
    valueOrNull(c.Q2),
    valueOrNull(c.Q4),
    valueOrNull(c.s11),
    valueOrNull(c.s12),
    valueOrNull(c.s44),
    valueOrNull(c.c11),
    valueOrNull(c.c12),
    valueOrNull(c.c44),
    valueOrNull(c.a0),
    valueOrNull(c.p0),
    valueOrNull(c.T0),
    valueOrNull(c.Curie_C),
    valueOrNull(c.zta1),
    valueOrNull(c.zta2),
    JSON.stringify(calculated.warnings || []),
    ts,
  );
  return getFerroParameterSnapshotForJob(jobId);
}

function getFerroParameterSnapshotForJob(jobId) {
  return db.getDb().prepare(`
    SELECT fps.*, fpm.model_name, fm.display_name
    FROM ferro_parameter_snapshots fps
    JOIN ferro_parameter_models fpm ON fpm.id = fps.model_id
    JOIN ferro_materials fm ON fm.id = fpm.material_id
    WHERE fps.job_id = ?
  `).get(jobId) || null;
}

function valueOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function now() {
  return Date.now();
}

module.exports = {
  seedFerroMaterialModels,
  listFerroParameterModels,
  getFerroParameterModelByKey,
  saveFerroParameterSnapshot,
  getFerroParameterSnapshotForJob,
};
