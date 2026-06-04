const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('ferro card editor reads, validates, backs up, and atomically saves catalog JSON', () => {
  const {
    createEditorServer,
    readCatalog,
    saveCatalog,
    validateCatalog,
  } = require('../tools/ferro-card-editor/server');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-card-editor-'));
  const catalogPath = path.join(root, 'material-card-catalog.json');
  const backupDir = path.join(root, 'catalog-backups');
  const logPath = path.join(root, 'editor-audit.log');
  fs.writeFileSync(catalogPath, JSON.stringify({
    version: 1,
    defaultPresets: {
      quick_2d: { label: '快速预览', grid: { nx: 64, ny: 1, nz: 64 }, run: { steps: 10000, outputInterval: 2000 } },
    },
    families: [
      {
        familyId: 'abc',
        title: 'ABC',
        groupMode: 'single',
        displayOrder: 30,
        visibleInRecommendation: true,
        composition: { enabled: false },
        defaultVisualization: { mode: 'component', component: 'pz', overlay: { arrows: true } },
        variants: [{ variantId: 'abc_default', materialModelId: 'abc_default', buttonLabel: '默认', title: 'ABC default', visible: true }],
      },
    ],
  }, null, 2));

  const loaded = readCatalog({ catalogPath });
  assert.equal(loaded.families[0].familyId, 'abc');

  const validation = validateCatalog(loaded, {
    repoModels: [{ materialKey: 'abc', modelKey: 'abc_default', displayName: 'ABC', modelName: 'ABC default', active: true }],
  });
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);

  const next = { ...loaded, families: [{ ...loaded.families[0], title: 'ABC edited' }] };
  const result = saveCatalog(next, {
    catalogPath,
    backupDir,
    logPath,
    repoModels: [{ materialKey: 'abc', modelKey: 'abc_default', displayName: 'ABC', modelName: 'ABC default', active: true }],
    actor: 'test-user',
    now: () => new Date('2026-06-04T12:34:56Z'),
  });

  assert.equal(result.saved, true);
  assert.equal(JSON.parse(fs.readFileSync(catalogPath, 'utf8')).families[0].title, 'ABC edited');
  assert.equal(fs.readdirSync(backupDir).filter((name) => name.endsWith('.json')).length, 1);
  assert.match(fs.readFileSync(logPath, 'utf8'), /test-user/);
  assert.match(fs.readFileSync(logPath, 'utf8'), /ABC edited/);

  const server = createEditorServer({ catalogPath, backupDir, logPath, host: '127.0.0.1', port: 0 });
  assert.equal(server.host, '127.0.0.1');
});

test('ferro card editor rejects invalid JSON, duplicate ids, traversal, and unsafe host', () => {
  const {
    createEditorServer,
    readCatalog,
    saveCatalog,
    validateCatalog,
  } = require('../tools/ferro-card-editor/server');

  assert.throws(() => createEditorServer({ host: '0.0.0.0' }), /127\.0\.0\.1/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-card-editor-invalid-'));
  const catalogPath = path.join(root, 'material-card-catalog.json');
  fs.writeFileSync(catalogPath, '{ nope');
  assert.throws(() => readCatalog({ catalogPath }), /JSON/);
  assert.throws(() => readCatalog({ catalogPath: path.join(root, '..', 'escape.json'), allowedRoot: root }), /非法路径/);

  const invalid = {
    version: 1,
    defaultPresets: {},
    families: [
      {
        familyId: 'dup',
        title: 'Dup',
        groupMode: 'wrong',
        displayOrder: 'x',
        visibleInRecommendation: true,
        defaultVisualization: { mode: 'component', component: 'bad' },
        variants: [{ variantId: 'same', materialModelId: 'missing', visible: true }],
      },
      {
        familyId: 'dup',
        title: 'Dup2',
        groupMode: 'single',
        displayOrder: 1,
        visibleInRecommendation: true,
        variants: [{ variantId: 'same', materialModelId: 'missing2', visible: true }],
      },
    ],
  };
  const validation = validateCatalog(invalid, { repoModels: [] });
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /familyId 重复/);
  assert.match(validation.errors.join('\n'), /variantId 重复/);
  assert.match(validation.errors.join('\n'), /groupMode/);
  assert.match(validation.errors.join('\n'), /component/);
  assert.match(validation.warnings.join('\n'), /materialModelId 找不到/);

  assert.throws(() => saveCatalog(invalid, {
    catalogPath,
    backupDir: path.join(root, 'catalog-backups'),
    logPath: path.join(root, 'audit.log'),
    repoModels: [],
  }), /校验失败/);
});
