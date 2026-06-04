const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function samplePayload() {
  return {
    sourceSet: {
      set_key: 'ABC_Test',
      material_id: 'ABC',
      material_name: 'ABC',
      composition: '',
      source_ref: '[local]',
      polynomial_order: 'sixth_order',
      temperature_unit: 'K',
      variables: 'T',
      notes: 'test set',
    },
    coefficients: [
      ['alpha1', '1.0*(T-300)'],
      ['alpha11', '2.0'],
      ['alpha12', '3.0'],
      ['Q11', '0.1'],
      ['Q12', '-0.02'],
      ['Q44', '0.03'],
      ['C11', '200e9'],
      ['C12', '100e9'],
      ['C44', '50e9'],
    ].map(([coefficient_id, value_expression]) => ({ coefficient_id, value_expression, unit_reported: '', material: 'ABC', polynomial_order: 'sixth_order' })),
  };
}

test('ferro Landau editor validates runnable coefficient payloads and unsafe expressions', () => {
  const { validateLandauPayload, isSafeExpression } = require('../tools/ferro-landau-editor/server');
  const validation = validateLandauPayload(samplePayload());
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(isSafeExpression('1.0*(T-300) + exp(-T)'), true);
  assert.equal(isSafeExpression('process.exit(1)'), false);

  const bad = samplePayload();
  bad.coefficients[0].value_expression = 'process.exit(1)';
  const badValidation = validateLandauPayload(bad);
  assert.equal(badValidation.valid, false);
  assert.match(badValidation.errors.join('\n'), /表达式不安全/);
});

test('ferro Landau editor saves through repository with markdown backup and audit log', () => {
  const { saveLandauPayload, createLandauEditorServer } = require('../tools/ferro-landau-editor/server');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-landau-editor-'));
  const calls = [];
  const repository = {
    exportFerroLandauDatabaseToMarkdown() { return '# backup\n'; },
    upsertFerroLandauSourceSet(sourceSet) { calls.push(['sourceSet', sourceSet.set_key]); return { ...sourceSet, updated: true }; },
    replaceFerroLandauCoefficientRecords(setKey, rows) { calls.push(['coefficients', setKey, rows.length]); return rows; },
    listFerroLandauSourceSets() { return []; },
    getFerroLandauSourceSet() { return null; },
    listFerroLandauCoefficientRecords() { return []; },
  };

  const result = saveLandauPayload(samplePayload(), {
    repository,
    backupDir: path.join(root, 'backups'),
    logPath: path.join(root, 'audit.log'),
    actor: 'test-admin',
    now: () => new Date('2026-06-04T01:02:03Z'),
  });

  assert.equal(result.saved, true);
  assert.deepEqual(calls, [['sourceSet', 'ABC_Test'], ['coefficients', 'ABC_Test', 9]]);
  assert.equal(fs.existsSync(result.backupPath), true);
  assert.match(fs.readFileSync(path.join(root, 'audit.log'), 'utf8'), /test-admin/);
  assert.match(fs.readFileSync(path.join(root, 'audit.log'), 'utf8'), /ABC_Test/);

  const server = createLandauEditorServer({ host: '127.0.0.1', port: 0, repository });
  assert.equal(server.host, '127.0.0.1');
  assert.throws(() => createLandauEditorServer({ host: '0.0.0.0', repository }), /127\.0\.0\.1/);
});
