const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('efffield service validates dielectric requests and indexes generated assets', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-service-'));
  const efffieldRoot = path.join(rootDir, 'efffieldpy');
  const jobsRoot = path.join(rootDir, 'jobs');
  fs.mkdirSync(path.join(efffieldRoot, 'examples', 'dielectric'), { recursive: true });
  fs.writeFileSync(path.join(efffieldRoot, 'examples', 'dielectric', 'parameter.in'), 'template parameter');
  fs.writeFileSync(path.join(efffieldRoot, 'examples', 'dielectric', 'struct.in'), 'template struct');

  const calls = [];
  const runner = async ({ args, cwd, env }) => {
    calls.push({ args, cwd, env });
    const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py'))
      ? args[1]
      : args[2];
    if (args.includes('run')) {
      fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'output', 'effDielectricPermittivity.dat'), '1 0 0\n0 1 0\n0 0 1\n');
      fs.writeFileSync(path.join(caseDir, 'output', 'eleField.00000000.dat'), 'field');
    }
    if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
      fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
      fs.writeFileSync(path.join(caseDir, 'figures', 'eleField.00000000_magnitude.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };

  const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });

  const result = await service.createAndRunJob({
    userId: 'user-1',
    chatSessionId: 'chat-1',
    request: {
      system: 'dielectric',
      grid: { nx: 64, ny: 64, nz: 1 },
      structure: { type: 'circle', radius: 16 },
      phases: [
        { id: 1, permittivity: 2 },
        { id: 2, permittivity: 80 },
      ],
      load: { electricField: [1, 0, 0] },
      solver: { tol: 0.001, maxiter: 300 },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.system, 'dielectric');
  assert.equal(result.assets.length, 2);
  assert.equal(result.outputs.length, 2);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'parameter.in')), true);
  const parameterText = fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8');
  assert.match(parameterText, /PERMITTIVITY 2 2 2 0 0 0/);
  assert.match(parameterText, /PERMITTIVITY 80 80 80 0 0 0/);
  assert.equal(fs.existsSync(path.join(result.caseDir, 'struct.in')), true);
  assert.match(fs.readFileSync(path.join(result.jobDir, 'request.json'), 'utf8'), /"userId": "user-1"/);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].args[1], 'generate-struct');
  assert.equal(calls[1].args[1], 'run');
  assert.equal(calls[2].args[0], path.join(efffieldRoot, 'examples', 'visualize_composites.py'));
  assert.equal(calls[2].args.includes('--mode'), true);
  assert.equal(calls[2].args[calls[2].args.indexOf('--mode') + 1], 'auto');
});

test('efffield service writes transport system parameter files', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const cases = [
    {
      system: 'thermal',
      choice: 'CHOICESYS 8',
      property: 'THERMCOND 3 3 3 0 0 0',
      load: 'TEMGRAD 0 1 0',
      tensor: 'effThermalConductivity.dat',
      phaseKey: 'conductivity',
    },
    {
      system: 'diffusion',
      choice: 'CHOICESYS 7',
      property: 'DIFFUSIVITY 3 3 3 0 0 0',
      load: 'CONCGRAD 0 1 0',
      tensor: 'effDiffusivity.dat',
      phaseKey: 'diffusivity',
    },
    {
      system: 'electrical_conduction',
      choice: 'CHOICESYS 9',
      property: 'ELECCOND 3 3 3 0 0 0',
      load: 'ELECFIELD 0 1 0',
      tensor: 'effElectricalConductivity.dat',
      phaseKey: 'conductivity',
    },
  ];

  for (const item of cases) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-transport-'));
    const efffieldRoot = path.join(rootDir, 'efffieldpy');
    const jobsRoot = path.join(rootDir, 'jobs');
    fs.mkdirSync(efffieldRoot, { recursive: true });
    const runner = async ({ args }) => {
      const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py')) ? args[1] : args[2];
      if (args.includes('run')) {
        fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
        fs.writeFileSync(path.join(caseDir, 'output', item.tensor), `3 0 0\n0 3 0\n0 0 3\n`);
      }
      if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
        fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
        fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
      }
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });
    const result = await service.createAndRunJob({
      userId: 'user-transport',
      chatSessionId: 'chat-transport',
      request: {
        system: item.system,
        grid: { nx: 16, ny: 16, nz: 1 },
        structure: { type: 'circle', radius: 4 },
        phases: [
          { id: 1, [item.phaseKey]: 1 },
          { id: 2, [item.phaseKey]: 3 },
        ],
        load: { vector: [0, 1, 0] },
        solver: { tol: 0.001, maxiter: 20 },
      },
    });

    const parameterText = fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8');
    assert.match(parameterText, new RegExp(item.choice));
    assert.match(parameterText, new RegExp(item.property));
    assert.match(parameterText, new RegExp(item.load));
    assert.equal(result.system, item.system);
    assert.equal(result.effectiveTensor.name, item.tensor);
  }
});

test('efffield service maps box structure to square or cube generator shapes', () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const service = createEfffieldJobService({
    jobsRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-shape-')),
    efffieldRoot: '/tmp/no-such-efffield',
    runner: async () => ({ code: 0, stdout: '', stderr: '' }),
  });

  const twoD = service.validateRequest({
    system: 'thermal',
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'box', radius: 3 },
  });
  assert.equal(twoD.structure.type, 'square');

  const threeD = service.validateRequest({
    system: 'thermal',
    grid: { nx: 16, ny: 16, nz: 16 },
    structure: { type: 'box', radius: 3 },
  });
  assert.equal(threeD.structure.type, 'cube');
});

test('efffield service resolves assets only inside the requested job directory', () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const jobsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-assets-'));
  const service = createEfffieldJobService({
    jobsRoot,
    efffieldRoot: '/tmp/no-such-efffield',
    runner: async () => ({ code: 0, stdout: '', stderr: '' }),
  });

  const assetDir = path.join(jobsRoot, 'eff_job_1', 'case', 'figures');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, 'phase_map.png'), 'png');

  const safe = service.resolveAssetPath('eff_job_1', 'phase_map.png');
  assert.equal(safe, path.join(assetDir, 'phase_map.png'));
  assert.throws(() => service.resolveAssetPath('eff_job_1', '../request.json'), /非法文件名/);
  assert.throws(() => service.resolveAssetPath('../job-1', 'phase_map.png'), /非法 jobId/);
});


test('efffield service writes advanced parameter options', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-advanced-'));
  const efffieldRoot = path.join(rootDir, 'efffieldpy');
  const jobsRoot = path.join(rootDir, 'jobs');
  fs.mkdirSync(efffieldRoot, { recursive: true });
  const runner = async ({ args }) => {
    const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py')) ? args[1] : args[2];
    if (args.includes('run')) {
      fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'output', 'effDielectricPermittivity.dat'), '1 0 0\n0 2 0\n0 0 3\n');
    }
    if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
      fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });

  const result = await service.createAndRunJob({
    userId: 'user-advanced',
    request: {
      system: 'dielectric',
      grid: { nx: 16, ny: 16, nz: 1 },
      realdim: [2.5, 3.5, 1],
      structure: { type: 'circle', radius: 4 },
      phases: [
        { id: 1, permittivity: [2, 3, 4, 0.1, 0.2, 0.3] },
        { id: 2, permittivity: [80, 90, 100, 1, 2, 3] },
      ],
      load: { vector: [100000000, 0, 0] },
      outdist: false,
      solver: { tol: 1e-5, maxiter: 700 },
    },
  });

  const parameterText = fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8');
  assert.match(parameterText, /REALDIM 2.5 3.5 1/);
  assert.match(parameterText, /OUTDIST false/);
  assert.match(parameterText, /PERMITTIVITY 2 3 4 0.1 0.2 0.3/);
  assert.match(parameterText, /PERMITTIVITY 80 90 100 1 2 3/);
  assert.equal(result.request.outdist, false);
  assert.deepEqual(result.request.realdim, [2.5, 3.5, 1]);
});

test('efffield service writes magnetic and coupled module parameter files', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const cases = [
    { system: 'magnetic', choice: 'CHOICESYS 4', must: ['MAGFIELD 0 1 0', 'PERMEABILITY 20 20 20 0 0 0'], tensor: 'effMagneticPermeability.dat' },
    { system: 'elastic', choice: 'CHOICESYS 1', must: ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', 'STIFFNESS'], tensor: 'effElasticStiffness.dat' },
    { system: 'piezoelectric', choice: 'CHOICESYS 3', must: ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', 'ELECFIELD 0 1 0', 'PIEZOELEC'], tensor: 'effPiezoelectricDTensor.dat' },
    { system: 'piezomagnetic', choice: 'CHOICESYS 5', must: ['MAGFIELD 0 1 0', 'PIEZOMAG'], tensor: 'effPiezomagneticQTensor.dat' },
    { system: 'magnetoelectric', choice: 'CHOICESYS 6', must: ['ELECFIELD 0 1 0', 'MAGFIELD 0 1 0', 'MAGELEC'], tensor: 'effMagnetoelectricTensor.dat' },
  ];

  for (const item of cases) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-coupled-'));
    const efffieldRoot = path.join(rootDir, 'efffieldpy');
    const jobsRoot = path.join(rootDir, 'jobs');
    fs.mkdirSync(efffieldRoot, { recursive: true });
    const runner = async ({ args }) => {
      const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py')) ? args[1] : args[2];
      if (args.includes('run')) {
        fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
        if (item.system === 'piezoelectric') fs.writeFileSync(path.join(caseDir, 'output', 'effElasticStiffness.dat'), 'elastic\n');
        fs.writeFileSync(path.join(caseDir, 'output', item.tensor), '1 0 0\n0 1 0\n0 0 1\n');
      }
      if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
        fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
        fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
      }
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });
    const result = await service.createAndRunJob({
      userId: 'user-coupled',
      request: {
        system: item.system,
        grid: { nx: 16, ny: 16, nz: 1 },
        structure: { type: 'circle', radius: 4 },
        load: { vector: [0, 1, 0] },
        solver: { tol: 0.001, maxiter: 20 },
      },
    });

    const parameterText = fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8');
    assert.match(parameterText, new RegExp(item.choice));
    for (const expected of item.must) assert.match(parameterText, new RegExp(expected));
    assert.equal(result.system, item.system);
    assert.equal(result.effectiveTensor.name, item.tensor);
  }
});

test('efffield service runs jobs from custom parameter.in text while generating struct.in', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-parameter-panel-'));
  const efffieldRoot = path.join(rootDir, 'efffieldpy');
  const jobsRoot = path.join(rootDir, 'jobs');
  fs.mkdirSync(efffieldRoot, { recursive: true });
  const calls = [];
  const runner = async ({ args }) => {
    calls.push(args);
    const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py')) ? args[1] : args[2];
    if (args.includes('run')) {
      fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'output', 'effDielectricPermittivity.dat'), '2 0 0\n0 2 0\n0 0 2\n');
    }
    if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
      fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });
  const parameterText = [
    'REALDIM 16 16 1',
    'SYSDIM 16 16 1',
    'CHOICESYS 2',
    'NPHASES 2',
    'CHOICESTRUCT 2',
    'OUTDIST true',
    'ELECFIELD 0 1 0',
    'PHASEID 1',
    'PERMITTIVITY 2 2 2 0 0 0',
    'PHASEID 2',
    'PERMITTIVITY 80 80 80 0 0 0',
    '',
  ].join('\n');

  const result = await service.createAndRunParameterJob({
    userId: 'user-panel',
    chatSessionId: 'chat-panel',
    parameterText,
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 1e-4, maxiter: 25 },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.system, 'dielectric');
  assert.equal(fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8'), parameterText.endsWith('\n') ? parameterText : parameterText + '\n');
  assert.equal(fs.existsSync(path.join(result.caseDir, 'struct.in')), true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1], 'generate-struct');
  assert.equal(calls[1][1], 'run');
  assert.equal(result.effectiveTensor.name, 'effDielectricPermittivity.dat');
});

test('efffield service accepts commented parameter.in text from the panel', async () => {
  const { createEfffieldJobService } = require('../pf_assistant/src/efffield/job-service');
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-commented-'));
  const efffieldRoot = path.join(rootDir, 'efffieldpy');
  const jobsRoot = path.join(rootDir, 'jobs');
  fs.mkdirSync(efffieldRoot, { recursive: true });
  const runner = async ({ args }) => {
    const caseDir = args.some((arg) => String(arg).endsWith('visualize_composites.py')) ? args[1] : args[2];
    if (args.includes('run')) {
      fs.mkdirSync(path.join(caseDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'output', 'effDielectricPermittivity.dat'), '2 0 0\n0 2 0\n0 0 2\n');
    }
    if (args.some((arg) => String(arg).endsWith('visualize_composites.py'))) {
      fs.mkdirSync(path.join(caseDir, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'figures', 'phase_map.png'), 'png');
    }
    return { code: 0, stdout: 'ok', stderr: '' };
  };
  const service = createEfffieldJobService({ jobsRoot, efffieldRoot, runner, now: () => 1710000000000 });
  const parameterText = [
    '# 中文注释应被解析器忽略',
    'REALDIM 16 16 1 # 真实物理尺寸',
    'SYSDIM 16 16 1 # 网格尺寸',
    'CHOICESYS 2 # 介电',
    'NPHASES 2 # 两相',
    'CHOICESTRUCT 2',
    'OUTDIST true',
    'ELECFIELD 1 0 0',
    'PHASEID 1',
    'PERMITTIVITY 2 2 2 0 0 0 # 相1材料参数',
    'PHASEID 2',
    'PERMITTIVITY 80 80 80 0 0 0 # 相2材料参数',
    '',
  ].join('\n');

  const result = await service.createAndRunParameterJob({
    userId: 'user-commented',
    parameterText,
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 20 },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.system, 'dielectric');
  assert.match(fs.readFileSync(path.join(result.caseDir, 'parameter.in'), 'utf8'), /# 真实物理尺寸/);
});
