const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');


test('ferro material registry lists PMN-PT and BTO models with stable coefficients', () => {
  const { listFerroMaterialModels, calculateFerroCoefficients } = require('../pf_assistant/src/ferro/material-models');

  assert.deepEqual(listFerroMaterialModels().map((model) => model.modelKey).slice(0, 5), [
    'pmn_pt_default',
    'bto_generate_input',
    'pzt_haun_1989',
    'bfo_bens_coefficients',
    'bfo_10004',
  ]);

  const pmn = calculateFerroCoefficients({ materialKey: 'pmn_pt', modelKey: 'pmn_pt_default', xf: 0.3, tem: 298 });
  assert.equal(pmn.displayName, 'PMN-PT');
  assert.equal(pmn.coefficients.a1, -25199000.0);
  assert.equal(pmn.coefficients.Q4, 0.035);
  assert.equal(pmn.coefficients.s11, 5.2e-11);

  const bto = calculateFerroCoefficients({ materialKey: 'bto', modelKey: 'bto_generate_input', tem: 298 });
  assert.equal(bto.displayName, 'BaTiO3');
  assert.equal(bto.inputs.xf, 1.0);
  assert.equal(bto.inputs.tem, 298);
  assert.equal(bto.modelName, 'BaTiO3 Wang2010 modified');
  assert.equal(bto.coefficients.Q1, 0.11);
  assert.equal(bto.coefficients.Q2, -0.045);
  assert.equal(bto.coefficients.Q4, 0.029);
  assert.equal(bto.coefficients.s44, 8.197e-12);

  const pzt = calculateFerroCoefficients({ materialKey: 'pzt', modelKey: 'pzt_haun_1989', xf: 0.48, tem: 300 });
  assert.equal(pzt.displayName, 'PZT');
  assert.equal(pzt.modelName, 'PZT Haun 1989');
  assert.ok(Math.abs(pzt.coefficients.Q1 - 0.0935531170) < 1e-9);
  assert.ok(Math.abs(pzt.coefficients.Q2 - (-0.04379064)) < 1e-9);
  assert.ok(Math.abs(pzt.coefficients.Q4 - 0.0398037170) < 1e-9);
  assert.ok(Math.abs(pzt.coefficients.T0 - 387.0611307110) < 1e-6);
  assert.ok(Math.abs(pzt.coefficients.Curie_C - 388251.6506058231) < 1e-3);
  assert.equal(pzt.coefficients.p0, 0.7570);
  assert.equal(pzt.coefficients.s11, 8.2e-12);

  const bfoBens = calculateFerroCoefficients({ materialKey: 'bfo', modelKey: 'bfo_bens_coefficients', tem: 380 });
  assert.equal(bfoBens.displayName, 'BFO');
  assert.equal(bfoBens.modelName, 'BFO Bens coefficients');
  assert.equal(bfoBens.coefficients.a1, 4.25 * (380 - 1103) * 1e5);
  assert.equal(bfoBens.coefficients.c11, 300e9);
  assert.equal(bfoBens.coefficients.c12, 162e9);
  assert.equal(bfoBens.coefficients.c44, 69e9);
  assert.match(bfoBens.warnings[0], /multiple elastic stiffness assignments/);

  const bfo10004 = calculateFerroCoefficients({ materialKey: 'bfo', modelKey: 'bfo_10004', tem: 380 });
  assert.equal(bfo10004.modelName, 'BFO 10004 source-check model');
  assert.equal(bfo10004.coefficients.a1, 4.64385e5 * (380 - 1103));
  assert.equal(bfo10004.coefficients.Q4, 0.02);
  assert.equal(bfo10004.coefficients.c44, 0.68e11);
  assert.match(bfo10004.warnings[0], /source label requires confirmation/);
});


test('ferro service validates material defaults from selected model', () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const service = createFerroJobService({ templateRoot: '/tmp/no-template', runner: async () => ({ code: 0 }) });

  const pzt = service.validateRequest({ material: { materialKey: 'pzt', modelKey: 'pzt_haun_1989' } });
  assert.deepEqual(pzt.material, {
    materialKey: 'pzt',
    modelKey: 'pzt_haun_1989',
    xf: 0.48,
    tem: 300,
  });

  const bfo = service.validateRequest({ material: { materialKey: 'bfo', modelKey: 'bfo_bens_coefficients' } });
  assert.deepEqual(bfo.material, {
    materialKey: 'bfo',
    modelKey: 'bfo_bens_coefficients',
    xf: 1.0,
    tem: 298,
  });
});

test('ferro service validates request, prepares isolated case, runs workflow, and indexes figures', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');
  fs.writeFileSync(path.join(templateRoot, 'input.in'), 'template input\n');

  const calls = [];
  const runner = async ({ command, args, cwd }) => {
    calls.push({ command, args, cwd });
    if (command === 'make' && (!args || !args.length)) {
      fs.writeFileSync(path.join(cwd, 'main.exe'), 'exe');
    }
    if (command === './main.exe') {
      fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n1 1 2 0.2 0.3 0.4\n');
    }
    if (command === 'python3' && String(args[0]).endsWith('polar-visualizer.py')) {
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_pz.png'), 'png');
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_vector.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };

  const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000000 });
  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: {
      grid: { nx: 16, ny: 1, nz: 16 },
      material: { xf: 0.3, tem: 298 },
      run: { kstep: 2, kprnt: 2 },
      visualization: { component: 'pz', slice: 'xz', steps: 'all' },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.system, 'ferroelectric');
  assert.deepEqual(result.assets.map((asset) => asset.name), ['Polar.0000002_pz.png', 'Polar.0000002_vector.png']);
  assert.match(result.caseDir, /\/u_[0-9a-f]{24}\/ferroelectric-simulation\/chat-1\/ferro_/);
  assert.match(fs.readFileSync(path.join(result.caseDir, 'input.in'), 'utf8'), /16 1 16 !nx, ny, nz/);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'request.json')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'result.json')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'result-index.json')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'source', 'main.f90')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'executable', 'main.exe')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'materials', 'material_snapshot.json')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'outputs', 'Polar.0000002.dat')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'visualizations', 'Polar.0000002_pz.png')), true);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'logs', 'run.log')), true);
  assert.equal(service.getJobResult(result.id, 'other-user'), null);
  assert.equal(service.getJobResult(result.id, 'user-1').jobId, result.id);
  assert.deepEqual(calls.map((c) => c.command), ['make', 'make', './main.exe', 'python3']);
});

test('ferro service writes selected BTO material coefficients into input', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-bto-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');
  fs.writeFileSync(path.join(templateRoot, 'input.in'), 'template input\n');

  const runner = async ({ command, cwd }) => {
    if (command === './main.exe') {
      fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n');
    }
    if (command === 'python3') {
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_pz.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };

  const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000001 });
  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: {
      grid: { nx: 16, ny: 1, nz: 16 },
      material: { materialKey: 'bto', modelKey: 'bto_generate_input', tem: 298 },
      run: { kstep: 2, kprnt: 2 },
      visualization: { component: 'pz', slice: 'xz', steps: 'all' },
    },
  });

  const input = fs.readFileSync(path.join(result.caseDir, 'input.in'), 'utf8');
  assert.match(input, /1 298 !xf,tem/);
  assert.match(input, /0\.11 -0\.045 0\.029\s+!Q1,Q2,Q4/);
  assert.match(input, /9\.07e-12 -3\.186e-12 8\.197e-12\s+!s11,s12,s44/);
  assert.match(input, /45038854\.75874245\s+0\.26\s+!a0,p0/);
  assert.match(input, /-42769495\.68547448 -115400000 653000000 !a1,a11,a12/);
});

test('ferro service writes Landau database coefficients into input', async () => {
  const tempDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-landau-service-db-')), 'app.db');
  const script = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const os = require('os');",
    "const db = require('./pf_assistant/database');",
    "db.initDb();",
    "const landau = require('./pf_assistant/src/ferro/landau-repository');",
    "landau.importFerroLandauDatabaseFromMarkdown(fs.readFileSync('ferroelectric_landau_coefficients_database.md', 'utf8'), { sourceFileName: 'ferroelectric_landau_coefficients_database.md' });",
    "const { createFerroJobService } = require('./pf_assistant/src/ferro/job-service');",
    "const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-landau-service-'));",
    "const templateRoot = path.join(root, 'template');",
    "const jobsRoot = path.join(root, 'jobs');",
    "fs.mkdirSync(templateRoot, { recursive: true });",
    "fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\\n\\ttouch main.exe\\nclean:\\n\\trm -f Polar.*.dat *.png\\n');",
    "fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\\nend program x\\n');",
    "const runner = async ({ command, cwd }) => {",
    "  if (command === './main.exe') fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\\n');",
    "  if (command === 'python3') { fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true }); fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_variant_111_arrow.png'), 'png'); fs.writeFileSync(path.join(cwd, 'figures', 'polar_variant_111_legend.png'), 'png'); }",
    "  return { code: 0, stdout: 'ok', stderr: '' };",
    "};",
    "const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000006 });",
    "const validated = service.validateRequest({ material: { materialKey: 'bfo', modelKey: 'landau:BFO_Hsieh2016_sixth', tem: 380 }, grid: { nx: 16, ny: 1, nz: 16 } });",
    "console.log(JSON.stringify({ validated: validated.material, visualization: validated.visualization }));",
    "service.createAndRunJob({ userId: 'user-1', chatSessionId: 'chat-1', request: { material: { materialKey: 'bfo', modelKey: 'landau:BFO_Hsieh2016_sixth', tem: 380 }, grid: { nx: 16, ny: 1, nz: 16 }, run: { kstep: 2, kprnt: 2 } } }).then((result) => {",
    "  const input = fs.readFileSync(path.join(result.caseDir, 'input.in'), 'utf8');",
    "  console.log(JSON.stringify({ modelKey: result.draftSnapshot.material.modelKey, input }));",
    "});",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    encoding: 'utf8',
  }).trim().split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));

  assert.deepEqual(output[0].validated, {
    materialKey: 'bfo',
    modelKey: 'landau:BFO_Hsieh2016_sixth',
    xf: 1,
    tem: 380,
  });
  assert.equal(output[0].visualization.mode, 'variant_111');
  assert.equal(output[1].modelKey, 'landau:BFO_Hsieh2016_sixth');
  assert.match(output[1].input, /0\.032 -0\.016 0\.02\s+!Q1,Q2,Q4/);
  assert.match(output[1].input, /5\.294386125057052e-12 -1\.8484710178000914e-12 1\.4705882352941176e-11\s+!s11,s12,s44/);
  assert.match(output[1].input, /-335750355 2290470000 3063610000 !a1,a11,a12/);
  assert.match(output[1].input, /5991860000 -333980000 -1777540000\s+!a111,a112,a123/);
});


test('ferro service saves material coefficient snapshot for completed jobs', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-snapshot-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');
  fs.writeFileSync(path.join(templateRoot, 'input.in'), 'template input\n');

  const snapshots = [];
  const runner = async ({ command, cwd }) => {
    if (command === './main.exe') fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n');
    if (command === 'python3') {
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_pz.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const service = createFerroJobService({
    jobsRoot,
    templateRoot,
    runner,
    now: () => 1710000000002,
    materialRepository: {
      seedFerroMaterialModels() {},
      saveFerroParameterSnapshot(payload) { snapshots.push(payload); },
    },
  });

  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: {
      grid: { nx: 16, ny: 1, nz: 16 },
      material: { materialKey: 'pzt', modelKey: 'pzt_haun_1989', xf: 0.48, tem: 300 },
      run: { kstep: 2, kprnt: 2 },
      visualization: { component: 'pz', slice: 'xz', steps: 'all' },
    },
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].jobId, result.id);
  assert.equal(snapshots[0].calculated.modelKey, 'pzt_haun_1989');
  assert.ok(Math.abs(snapshots[0].calculated.coefficients.Q1 - 0.0935531170) < 1e-9);
});

test('ferro service resolves assets only inside the requested job directory', () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const jobsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-assets-'));
  const service = createFerroJobService({ jobsRoot, templateRoot: '/tmp/no-template', runner: async () => ({ code: 0 }) });
  const assetDir = path.join(jobsRoot, 'ferro_1', 'case', 'figures');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, 'Polar.0000002_pz.png'), 'png');

  assert.equal(service.resolveAssetPath('ferro_1', 'Polar.0000002_pz.png'), path.join(assetDir, 'Polar.0000002_pz.png'));
  assert.throws(() => service.resolveAssetPath('ferro_1', '../request.json'), /非法文件名/);
  assert.throws(() => service.resolveAssetPath('../ferro_1', 'Polar.0000002_pz.png'), /非法 jobId/);
});


test('polar visualizer uses readable arrow sizing for orientation overlays', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'pf_assistant', 'src', 'ferro', 'polar-visualizer.py'), 'utf8');

  assert.match(script, /ARROW_LENGTH_FACTOR\s*=\s*0\.75/);
  assert.match(script, /ARROW_OUTLINE_THICKNESS\s*=\s*4/);
  assert.match(script, /ARROW_INNER_THICKNESS\s*=\s*2/);
  assert.match(script, /ARROW_HEAD_MAX\s*=\s*13\.0/);
});

test('polar visualizer converts a Polar dat file to a png figure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-plot-'));
  fs.writeFileSync(path.join(root, 'Polar.0000002.dat'), [
    '1 1 1 0.1 0.2 0.3',
    '1 1 2 0.2 0.3 0.4',
    '2 1 1 0.3 0.4 0.5',
    '2 1 2 0.4 0.5 0.6',
    '',
  ].join('\n'));
  const script = path.join(__dirname, '..', 'pf_assistant', 'src', 'ferro', 'polar-visualizer.py');
  const result = spawnSync('python3', [script, root, '--component', 'pz', '--slice', 'xz', '--steps', 'all'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(root, 'figures', 'Polar.0000002_pz.png')), true);
  assert.equal(fs.existsSync(path.join(root, 'figures', 'Polar.0000002_vector.png')), false);
});

test('ferro result indexer labels vector orientation figures clearly', () => {
  const { indexFerroResults } = require('../pf_assistant/src/ferro/result-indexer');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-index-'));
  const figuresDir = path.join(root, 'figures');
  fs.mkdirSync(figuresDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'Polar.0002500.dat'), '1 1 1 0.1 0.2 0.3\n');
  fs.writeFileSync(path.join(figuresDir, 'Polar.0002500_pz.png'), 'png');
  fs.writeFileSync(path.join(figuresDir, 'Polar.0002500_vector.png'), 'png');

  const indexed = indexFerroResults({ jobId: 'ferro_1', caseDir: root });

  assert.deepEqual(indexed.assets.map((asset) => asset.title), [
    '极化 pz 分量 kt=2500',
    '极化取向箭头图 kt=2500',
  ]);
});

test('ferro service validates visualization modes and returns structured angle assets', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-angle-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');
  fs.writeFileSync(path.join(templateRoot, 'input.in'), 'template input\n');

  const runner = async ({ command, args, cwd }) => {
    if (command === './main.exe') fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n2 1 1 0.2 0.3 0.4\n');
    if (command === 'python3') {
      assert.deepEqual(args.slice(1), [cwd, '--mode', 'inplane_angle_arrow', '--component', 'pz', '--slice', 'xz', '--steps', 'all', '--output-policy', 'selected_only']);
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_inplane_angle_arrow.png'), 'png');
      fs.writeFileSync(path.join(cwd, 'figures', 'polar_angle_legend.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000003 });
  const validated = service.validateRequest({ visualization: { mode: 'angle_arrow', component: null }, grid: { nx: 16, ny: 1, nz: 16 } });
  assert.equal(validated.visualization.mode, 'inplane_angle');
  assert.equal(validated.visualization.overlay.arrows, true);
  assert.deepEqual(validated.visualization.inplaneComponents, ['px', 'pz']);

  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: { grid: { nx: 16, ny: 1, nz: 16 }, run: { kstep: 2, kprnt: 2 }, visualization: { mode: 'angle_arrow', component: null } },
  });
  assert.equal(result.type, 'ferro_result');
  assert.equal(result.draftSnapshot.visualization.mode, 'inplane_angle');
  assert.deepEqual(result.result.timesteps, [2]);
  assert.equal(result.result.visualizations.some((item) => item.mode === 'inplane_angle' && item.overlay.arrows === true && item.components.join(',') === 'px,pz'), true);
  assert.equal(result.result.legend.mode, 'inplane_angle');
  assert.equal(result.followupChips.some((chip) => chip.label === '面内'), true);
  assert.equal(result.followupChips.some((chip) => chip.label === '面内角度+箭头'), false);
});

test('ferro service defaults BFO to selected-only variant 111 arrow visualizations', async () => {
  const { createFerroJobService } = require('../pf_assistant/src/ferro/job-service');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-bfo-variant-service-'));
  const templateRoot = path.join(root, 'template');
  const jobsRoot = path.join(root, 'jobs');
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'Makefile'), 'all:\n\ttouch main.exe\nclean:\n\trm -f Polar.*.dat *.png\n');
  fs.writeFileSync(path.join(templateRoot, 'main.f90'), 'program x\nend program x\n');

  const runner = async ({ command, args, cwd }) => {
    if (command === './main.exe') fs.writeFileSync(path.join(cwd, 'Polar.0000002.dat'), '1 1 1 0.1 0.2 0.3\n2 1 1 0.2 0.3 0.4\n');
    if (command === 'python3') {
      assert.deepEqual(args.slice(1), [cwd, '--mode', 'variant_111_arrow', '--component', 'pz', '--slice', 'xz', '--steps', 'all', '--output-policy', 'selected_only']);
      fs.mkdirSync(path.join(cwd, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'figures', 'Polar.0000002_variant_111_arrow.png'), 'png');
      fs.writeFileSync(path.join(cwd, 'figures', 'polar_variant_111_legend.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };

  const service = createFerroJobService({ jobsRoot, templateRoot, runner, now: () => 1710000000004 });
  const validated = service.validateRequest({ material: { materialKey: 'bfo', modelKey: 'bfo_bens_coefficients' }, grid: { nx: 16, ny: 1, nz: 16 } });
  assert.equal(validated.visualization.mode, 'variant_111');
  assert.equal(validated.visualization.overlay.arrows, true);
  assert.equal(validated.visualization.outputPolicy, 'selected_only');

  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: { material: { materialKey: 'bfo', modelKey: 'bfo_bens_coefficients' }, grid: { nx: 16, ny: 1, nz: 16 }, run: { kstep: 2, kprnt: 2 } },
  });

  assert.equal(result.result.visualizations.length, 1);
  assert.equal(result.result.visualizations[0].mode, 'variant_111');
  assert.equal(result.result.visualizations[0].overlay.arrows, true);
  assert.deepEqual(result.result.visualizations[0].components, ['px', 'py', 'pz']);
  assert.deepEqual(result.result.visualizations[0].projectionComponents, ['px', 'pz']);
  assert.equal(result.result.legend.mode, 'variant_111');
});

test('ferro result indexer structures BFO variant images and legends', () => {
  const { indexFerroResults } = require('../pf_assistant/src/ferro/result-indexer');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-variant-index-'));
  const figuresDir = path.join(root, 'figures');
  fs.mkdirSync(figuresDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'Polar.0002000.dat'), '1 1 1 0.1 0.2 0.3\n');
  fs.writeFileSync(path.join(figuresDir, 'Polar.0002000_variant_111.png'), 'png');
  fs.writeFileSync(path.join(figuresDir, 'Polar.0002000_variant_111_arrow.png'), 'png');
  fs.writeFileSync(path.join(figuresDir, 'polar_variant_111_legend.png'), 'png');

  const indexed = indexFerroResults({ jobId: 'ferro_1', caseDir: root, request: { visualization: { inplaneComponents: ['px', 'pz'] } } });

  assert.deepEqual(indexed.result.visualizations.map((item) => item.mode), ['variant_111', 'variant_111']);
  assert.equal(indexed.result.visualizations[1].label, 'R相变体 kt=2000');
  assert.equal(indexed.result.visualizations[1].overlay.arrows, true);
  assert.deepEqual(indexed.result.visualizations[1].components, ['px', 'py', 'pz']);
  assert.deepEqual(indexed.result.visualizations[1].projectionComponents, ['px', 'pz']);
  assert.equal(indexed.result.legend.label, 'R相 <111> 变体');
});

test('polar visualizer declares BFO variant colors and nearest 111 classification', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'pf_assistant', 'src', 'ferro', 'polar-visualizer.py'), 'utf8');

  assert.match(script, /VARIANT_111_DIRECTIONS/);
  assert.match(script, /nearest_variant_111/);
  assert.match(script, /confidence_min\s*=\s*0\.65/);
  for (const color of ['#D55E00', '#E69F00', '#F0E442', '#CC79A7', '#0072B2', '#009E73', '#56B4E9', '#6A3D9A', '#BDBDBD']) {
    assert.equal(script.includes(color), true, color);
  }
});

test('polar visualizer warns when BFO variant classification is missing Py', () => {
  const { indexFerroResults } = require('../pf_assistant/src/ferro/result-indexer');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-missing-py-'));
  fs.writeFileSync(path.join(root, 'Polar.0000002.dat'), [
    '1 1 1 0.1 0.3',
    '1 1 2 0.2 0.4',
    '2 1 1 -0.3 0.5',
    '2 1 2 -0.4 -0.6',
    '',
  ].join('\n'));
  const script = path.join(__dirname, '..', 'pf_assistant', 'src', 'ferro', 'polar-visualizer.py');
  const result = spawnSync('python3', [script, root, '--mode', 'variant_111_arrow', '--component', 'pz', '--slice', 'xz', '--steps', 'all'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const indexed = indexFerroResults({ jobId: 'ferro_missing_py', caseDir: root, request: { grid: { nx: 2, ny: 1, nz: 2 } } });
  assert.equal(fs.existsSync(path.join(root, 'figures', 'Polar.0000002_variant_111_arrow.png')), true);
  assert.equal(indexed.result.warnings.some((item) => item.includes('当前数据缺少 Py')), true);
});
