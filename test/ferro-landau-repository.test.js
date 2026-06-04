const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const markdownPath = path.resolve(__dirname, '../ferroelectric_landau_coefficients_database.md');

test('ferro Landau markdown parser extracts source sets, references, auxiliary definitions, and coefficients', () => {
  const { parseFerroLandauMarkdown } = require('../pf_assistant/src/ferro/landau-repository');
  const parsed = parseFerroLandauMarkdown(fs.readFileSync(markdownPath, 'utf8'));

  assert.equal(parsed.sourceSets.length, 19);
  assert.equal(parsed.coefficientRecords.length, 215);
  assert.equal(parsed.references.length, 12);
  assert.equal(parsed.auxiliaryDefinitions.length, 3);

  const pzt = parsed.sourceSets.find((row) => row.setId === 'PZT_Haun1989_composition');
  assert.equal(pzt.materialId, 'PZT');
  assert.equal(pzt.temperatureUnit, 'degree_C');
  assert.match(pzt.notes, /minor conflict in n1/);

  const bfoCaoC11 = parsed.coefficientRecords.find((row) => row.setId === 'BFO_Cao2018_eighth' && row.coefficientId === 'C11');
  assert.equal(bfoCaoC11.unitReported, 'GPa');
  assert.equal(bfoCaoC11.valueExpression, '228');

  const pztAlpha1 = parsed.coefficientRecords.find((row) => row.setId === 'PZT_Haun1989_composition' && row.coefficientId === 'alpha1');
  assert.equal(pztAlpha1.valueExpression, '(T-T0(x))/(2*epsilon0*C_curie(x))');
});

test('ferro Landau repository imports markdown into an isolated sqlite database', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-ferro-landau-'));
  const tempDb = path.join(tempDir, 'app.db');
  const script = [
    "const fs = require('node:fs');",
    "const db = require('./pf_assistant/database');",
    "db.initDb();",
    "const repo = require('./pf_assistant/src/ferro/landau-repository');",
    "const markdown = fs.readFileSync('ferroelectric_landau_coefficients_database.md', 'utf8');",
    "const summary = repo.importFerroLandauDatabaseFromMarkdown(markdown, { sourceFileName: 'ferroelectric_landau_coefficients_database.md' });",
    "const counts = repo.getFerroLandauCounts();",
    "const pzt = repo.getFerroLandauSourceSet('PZT_Haun1989_composition');",
    "const bfoRows = repo.listFerroLandauCoefficientRecords('BFO_Cao2018_eighth');",
    "console.log(JSON.stringify({ summary, counts, pzt, bfoRowsLength: bfoRows.length, firstBfo: bfoRows[0] }));",
  ].join('\n');

  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    encoding: 'utf8',
  }).trim().split('\n').pop();
  const result = JSON.parse(out);

  assert.deepEqual(result.summary, {
    sourceSets: 19,
    coefficientRecords: 215,
    references: 12,
    auxiliaryDefinitions: 3,
  });
  assert.equal(result.counts.sourceSets, 19);
  assert.equal(result.counts.coefficientRecords, 215);
  assert.equal(result.counts.references, 12);
  assert.equal(result.counts.auxiliaryDefinitions, 3);
  assert.equal(result.pzt.material_id, 'PZT');
  assert.equal(result.pzt.temperature_unit, 'degree_C');
  assert.equal(result.bfoRowsLength, 19);
});
