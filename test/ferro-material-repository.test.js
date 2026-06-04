const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('ferro material repository seeds models and saves coefficient snapshots', () => {
  const tempDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-material-db-')), 'app.db');
  const script = [
    "const db = require('./pf_assistant/database');",
    "db.initDb();",
    "const repo = require('./pf_assistant/src/ferro/material-repository');",
    "repo.seedFerroMaterialModels();",
    "const models = repo.listFerroParameterModels();",
    "console.log(JSON.stringify({ modelKeys: models.map((m) => m.model_key) }));",
    "const calc = require('./pf_assistant/src/ferro/material-models').calculateFerroCoefficients({ materialKey: 'pzt', modelKey: 'pzt_haun_1989', xf: 0.48, tem: 300 });",
    "const snap = repo.saveFerroParameterSnapshot({ jobId: 'ferro_job_1', calculated: calc });",
    "const fetched = repo.getFerroParameterSnapshotForJob('ferro_job_1');",
    "console.log(JSON.stringify({ snapshot: { jobId: fetched.job_id, modelKey: fetched.model_key, xf: fetched.xf, tem: fetched.tem, Q1: fetched.Q1, T0: fetched.T0, warnings: JSON.parse(fetched.warnings_json) } }));",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    encoding: 'utf8',
  }).trim().split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));

  assert.deepEqual(output[0].modelKeys, [
    'pmn_pt_default',
    'bto_generate_input',
    'pzt_haun_1989',
    'bfo_bens_coefficients',
    'bfo_10004',
  ]);
  assert.equal(output[1].snapshot.jobId, 'ferro_job_1');
  assert.equal(output[1].snapshot.modelKey, 'pzt_haun_1989');
  assert.equal(output[1].snapshot.xf, 0.48);
  assert.equal(output[1].snapshot.tem, 300);
  assert.ok(Math.abs(output[1].snapshot.Q1 - 0.0935531170) < 1e-9);
  assert.ok(Math.abs(output[1].snapshot.T0 - 387.0611307110) < 1e-6);
  assert.deepEqual(output[1].snapshot.warnings, []);
});

test('ferro material repository exposes runnable Landau database source sets as parameter models', () => {
  const tempDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-landau-model-db-')), 'app.db');
  const markdown = fs.readFileSync(path.join(__dirname, '..', 'ferroelectric_landau_coefficients_database.md'), 'utf8');
  const script = [
    "const fs = require('fs');",
    "const db = require('./pf_assistant/database');",
    "db.initDb();",
    "const landau = require('./pf_assistant/src/ferro/landau-repository');",
    "const repo = require('./pf_assistant/src/ferro/material-repository');",
    "landau.importFerroLandauDatabaseFromMarkdown(fs.readFileSync('ferroelectric_landau_coefficients_database.md', 'utf8'), { sourceFileName: 'ferroelectric_landau_coefficients_database.md' });",
    "const models = repo.listFerroParameterModels();",
    "const bfo = models.find((m) => m.model_key === 'landau:BFO_Hsieh2016_sixth');",
    "console.log(JSON.stringify({ found: Boolean(bfo), model: bfo && { materialKey: bfo.material_key, modelName: bfo.model_name, formulaType: bfo.formula_type, implementationKey: bfo.implementation_key, defaultTem: bfo.default_tem, sourceLabel: bfo.source_label } }));",
  ].join('\n');

  fs.writeFileSync(path.join(path.dirname(tempDb), 'noop.md'), markdown);
  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    encoding: 'utf8',
  }).trim().split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line))[0];

  assert.equal(output.found, true);
  assert.deepEqual(output.model, {
    materialKey: 'bfo',
    modelName: 'BFO Hsieh2016 sixth',
    formulaType: 'landau_database',
    implementationKey: 'landau:BFO_Hsieh2016_sixth',
    defaultTem: 298,
    sourceLabel: 'Landau DB: BFO_Hsieh2016_sixth',
  });
});
