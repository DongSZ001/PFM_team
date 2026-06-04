'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');
const { runPythonCommand } = require('./python-runner');
const { indexEfffieldResults } = require('./result-indexer');

const DEFAULT_EFFFIELD_ROOT = '/home/admin/.openclaw/workspace/XuK/Eff';
const DEFAULT_JOBS_ROOT = path.join(paths.backendRoot, 'data', 'efffield', 'jobs');

const STIFFNESS_1 = [
  'STIFFNESS',
  '90e9 30e9 30e9 0 0 0',
  '90e9 30e9 0 0 0',
  '90e9 0 0 0',
  '30e9 0 0',
  '30e9 0',
  '30e9',
].join('\n');

const STIFFNESS_2 = [
  'STIFFNESS',
  '45e9 15e9 15e9 0 0 0',
  '45e9 15e9 0 0 0',
  '45e9 0 0 0',
  '15e9 0 0',
  '15e9 0',
  '15e9',
].join('\n');

const PIEZO_1 = [
  'PIEZOELEC',
  '1e-11 0 0 0 0 0',
  '0 1e-11 0 0 0 0',
  '0 0 1e-11 0 0 0',
].join('\n');

const PIEZO_2 = [
  'PIEZOELEC',
  '3e-11 0 0 0 0 0',
  '0 3e-11 0 0 0 0',
  '0 0 3e-11 0 0 0',
].join('\n');

const PIEZOMAG_1 = [
  'PIEZOMAG',
  '1e-7 0 0 0 0 0',
  '0 1e-7 0 0 0 0',
  '0 0 1e-7 0 0 0',
].join('\n');

const PIEZOMAG_2 = [
  'PIEZOMAG',
  '3e-7 0 0 0 0 0',
  '0 3e-7 0 0 0 0',
  '0 0 3e-7 0 0 0',
].join('\n');

const MAGELEC_1 = [
  'MAGELEC',
  '1e-12 0 0',
  '0 1e-12 0',
  '0 0 1e-12',
].join('\n');

const MAGELEC_2 = [
  'MAGELEC',
  '3e-12 0 0',
  '0 3e-12 0',
  '0 0 3e-12',
].join('\n');

const SYSTEM_DEFS = Object.freeze({
  dielectric: {
    key: 'dielectric',
    aliases: ['dielectric', 'permittivity'],
    choiceSys: 2,
    displayName: '介电有效场',
    phaseKeyword: 'PERMITTIVITY',
    phaseProperty: 'permittivity',
    loadKeyword: 'ELECFIELD',
    loadNames: ['electricField', 'vector'],
    defaultPhaseValues: [100, 10],
    tensorFile: 'effDielectricPermittivity.dat',
    summary: '介电有效场计算完成，已生成相分布、电场和电位移相关图片。',
  },
  magnetic: {
    key: 'magnetic',
    aliases: ['magnetic', 'magnetism', 'permeability'],
    choiceSys: 4,
    displayName: '磁性有效场',
    phaseKeyword: 'PERMEABILITY',
    phaseProperty: 'permeability',
    loadKeyword: 'MAGFIELD',
    loadNames: ['magneticField', 'vector'],
    defaultPhaseValues: [1, 20],
    tensorFile: 'effMagneticPermeability.dat',
    summary: '磁性有效场计算完成，已生成相分布、磁场、磁化强度和磁感应强度相关图片。',
  },
  diffusion: {
    key: 'diffusion',
    aliases: ['diffusion', 'diffusivity'],
    choiceSys: 7,
    displayName: '扩散有效场',
    phaseKeyword: 'DIFFUSIVITY',
    phaseProperty: 'diffusivity',
    loadKeyword: 'CONCGRAD',
    loadNames: ['concentrationGradient', 'vector'],
    defaultPhaseValues: [1, 10],
    tensorFile: 'effDiffusivity.dat',
    summary: '扩散有效场计算完成，已生成相分布、浓度梯度和摩尔通量相关图片。',
  },
  thermal: {
    key: 'thermal',
    aliases: ['thermal', 'thermal_conduction', 'heat'],
    choiceSys: 8,
    displayName: '热传导有效场',
    phaseKeyword: 'THERMCOND',
    phaseProperty: 'conductivity',
    loadKeyword: 'TEMGRAD',
    loadNames: ['temperatureGradient', 'vector'],
    defaultPhaseValues: [1, 10],
    tensorFile: 'effThermalConductivity.dat',
    summary: '热传导有效场计算完成，已生成相分布、温度梯度和热流相关图片。',
  },
  electrical_conduction: {
    key: 'electrical_conduction',
    aliases: ['electrical_conduction', 'electrical', 'electric_conduction', 'conductivity'],
    choiceSys: 9,
    displayName: '电导有效场',
    phaseKeyword: 'ELECCOND',
    phaseProperty: 'conductivity',
    loadKeyword: 'ELECFIELD',
    loadNames: ['electricField', 'vector'],
    defaultPhaseValues: [1, 10],
    tensorFile: 'effElectricalConductivity.dat',
    summary: '电导有效场计算完成，已生成相分布、电场和电流密度相关图片。',
  },
  elastic: {
    key: 'elastic',
    aliases: ['elastic', 'elasticity'],
    choiceSys: 1,
    displayName: '弹性有效场',
    materialTemplate: true,
    loadNames: ['strain', 'vector'],
    tensorFile: 'effElasticStiffness.dat',
    summary: '弹性有效场计算完成，已生成相分布、应变和应力相关图片。',
  },
  piezoelectric: {
    key: 'piezoelectric',
    aliases: ['piezoelectric', 'piezo'],
    choiceSys: 3,
    displayName: '压电有效场',
    materialTemplate: true,
    loadNames: ['electricField', 'vector'],
    tensorFile: 'effPiezoelectricDTensor.dat',
    summary: '压电有效场计算完成，已生成相分布、应变/应力、电场、电位移和极化相关图片。',
  },
  piezomagnetic: {
    key: 'piezomagnetic',
    aliases: ['piezomagnetic'],
    choiceSys: 5,
    displayName: '压磁有效场',
    materialTemplate: true,
    loadNames: ['magneticField', 'vector'],
    tensorFile: 'effPiezomagneticQTensor.dat',
    summary: '压磁有效场计算完成，已生成相分布、应变/应力、磁场和磁感应相关图片。',
  },
  magnetoelectric: {
    key: 'magnetoelectric',
    aliases: ['magnetoelectric', 'magneto_electric'],
    choiceSys: 6,
    displayName: '磁电耦合有效场',
    materialTemplate: true,
    loadNames: ['electricField', 'magneticField', 'vector'],
    tensorFile: 'effMagnetoelectricTensor.dat',
    summary: '磁电耦合有效场计算完成，已生成相分布、力电磁耦合场变量相关图片。',
  },
});

function createEfffieldJobService({
  jobsRoot = process.env.EFFFIELD_JOBS_ROOT || DEFAULT_JOBS_ROOT,
  efffieldRoot = process.env.EFFFIELD_ROOT || DEFAULT_EFFFIELD_ROOT,
  runner = runPythonCommand,
  now = Date.now,
} = {}) {
  function validateRequest(request) {
    const body = request || {};
    const system = resolveSystem(body.system || 'dielectric');
    const grid = body.grid || {};
    const nx = clampInteger(grid.nx ?? 128, 8, 256, 'nx');
    const ny = clampInteger(grid.ny ?? 128, 8, 256, 'ny');
    const nz = clampInteger(grid.nz ?? 1, 1, 64, 'nz');
    const structure = body.structure || {};
    const rawShape = structure.type || structure.shape || (nz > 1 ? 'sphere' : 'circle');
    const shape = normalizeStructureShape(rawShape, nz);
    if (!['circle', 'sphere', 'square', 'cube', 'ellipse', 'ellipsoid'].includes(shape)) {
      throw validationError('structure.type 只支持 circle、sphere、square、cube、ellipse、ellipsoid、box');
    }
    const radius = optionalPositiveNumber(structure.radius, 'radius');
    const rx = optionalPositiveNumber(structure.rx, 'rx');
    const ry = optionalPositiveNumber(structure.ry, 'ry');
    const rz = optionalPositiveNumber(structure.rz, 'rz');
    const phases = normalizePhases(body.phases, system);
    const load = body.load || {};
    const loadVector = normalizeVector(resolveLoadVector(load, body, system), 'load.vector');
    const realdim = normalizeRealDim(body.realdim, { nx, ny, nz });
    const outdist = normalizeBoolean(body.outdist, true);
    const solver = body.solver || {};
    const tol = optionalPositiveNumber(solver.tol, 'tol') || 1e-3;
    const maxiter = clampInteger(solver.maxiter ?? 300, 1, 5000, 'maxiter');
    return {
      system: system.key,
      systemDef: system,
      grid: { nx, ny, nz },
      realdim,
      structure: { type: shape, radius, rx, ry, rz },
      phases,
      load: { vector: loadVector },
      outdist,
      solver: { tol, maxiter },
    };
  }

  async function createAndRunJob({ userId, chatSessionId = null, request }) {
    if (!userId) throw validationError('userId is required');
    const validated = validateRequest(request);
    return runPreparedEfffieldJob({
      userId,
      chatSessionId,
      validated,
      prepare: (caseDir) => prepareCase(caseDir, validated),
    });
  }

  async function createAndRunParameterJob({ userId, chatSessionId = null, parameterText, structure, solver } = {}) {
    if (!userId) throw validationError('userId is required');
    const validated = validateParameterJobRequest({ parameterText, structure, solver });
    return runPreparedEfffieldJob({
      userId,
      chatSessionId,
      validated,
      prepare: (caseDir) => {
        fs.writeFileSync(path.join(caseDir, 'parameter.in'), validated.parameterText);
        fs.writeFileSync(path.join(caseDir, 'struct.in'), `${validated.grid.nx} ${validated.grid.ny} ${validated.grid.nz}\n`);
      },
    });
  }

  async function runPreparedEfffieldJob({ userId, chatSessionId, validated, prepare }) {
    const jobId = `eff_${now()}_${crypto.randomBytes(4).toString('hex')}`;
    const jobDir = path.join(jobsRoot, jobId);
    const caseDir = path.join(jobDir, 'case');
    const logsDir = path.join(jobDir, 'logs');
    fs.mkdirSync(caseDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const metadata = {
      id: jobId,
      userId,
      chatSessionId,
      status: 'running',
      system: validated.system,
      request: stripSystemDef(validated),
      createdAt: now(),
      jobDir,
      caseDir,
    };
    fs.writeFileSync(path.join(jobDir, 'request.json'), JSON.stringify(metadata, null, 2));
    prepare(caseDir);

    const env = {
      PYTHONPATH: path.join(efffieldRoot, 'src'),
      MPLBACKEND: 'Agg',
    };
    const adapterScript = path.join(__dirname, 'efffield-runner.py');
    await runChecked({ runner, args: buildGenerateStructArgs(caseDir, validated), cwd: efffieldRoot, env, logPath: path.join(logsDir, 'generate-struct.log') });
    await runChecked({
      runner,
      args: [adapterScript, 'run', caseDir, '--tol', String(validated.solver.tol), '--maxiter', String(validated.solver.maxiter)],
      cwd: efffieldRoot,
      env,
      logPath: path.join(logsDir, 'run.log'),
    });
    await runChecked({
      runner,
      args: [path.join(efffieldRoot, 'examples', 'visualize_composites.py'), caseDir, '--save', '--stride', String(defaultStride(validated.grid)), '--mode', 'auto'],
      cwd: efffieldRoot,
      env,
      logPath: path.join(logsDir, 'plot.log'),
    });

    const indexed = indexEfffieldResults({ jobId, caseDir, tensorPreference: validated.systemDef.tensorFile });
    const result = {
      ...metadata,
      status: 'completed',
      completedAt: now(),
      summary: validated.systemDef.summary,
      outputs: indexed.outputs,
      assets: indexed.assets,
      effectiveTensor: indexed.effectiveTensor,
    };
    fs.writeFileSync(path.join(jobDir, 'result.json'), JSON.stringify(stripPrivatePaths(result), null, 2));
    return result;
  }

  function getJobResult(jobId) {
    validateJobId(jobId);
    const filePath = path.join(jobsRoot, jobId, 'result.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function resolveAssetPath(jobId, filename) {
    validateJobId(jobId);
    if (!/^[A-Za-z0-9_.-]+\.png$/.test(filename || '')) {
      throw validationError('非法文件名');
    }
    const figuresDir = path.join(jobsRoot, jobId, 'case', 'figures');
    const assetPath = path.resolve(figuresDir, filename);
    if (!assetPath.startsWith(path.resolve(figuresDir) + path.sep)) {
      throw validationError('非法文件路径');
    }
    if (!fs.existsSync(assetPath)) throw validationError('图片不存在', 404);
    return assetPath;
  }

  return {
    createAndRunJob,
    createAndRunParameterJob,
    getJobResult,
    resolveAssetPath,
    validateRequest,
    validateParameterJobRequest,
  };
}

function prepareCase(caseDir, request) {
  if (request.systemDef.materialTemplate) return prepareTemplateCase(caseDir, request);
  return prepareTransportCase(caseDir, request);
}

function prepareTransportCase(caseDir, request) {
  fs.writeFileSync(path.join(caseDir, 'parameter.in'), buildParameterTextFromValidatedRequest(request));
  fs.writeFileSync(path.join(caseDir, 'struct.in'), `${request.grid.nx} ${request.grid.ny} ${request.grid.nz}\n`);
}

function prepareTemplateCase(caseDir, request) {
  fs.writeFileSync(path.join(caseDir, 'parameter.in'), buildParameterTextFromValidatedRequest(request));
  fs.writeFileSync(path.join(caseDir, 'struct.in'), `${request.grid.nx} ${request.grid.ny} ${request.grid.nz}\n`);
}

function buildParameterTextFromRequest(request) {
  return buildParameterTextFromValidatedRequest(request && request.systemDef ? request : validateStandaloneRequest(request));
}

function validateStandaloneRequest(request) {
  const service = createEfffieldJobService({ runner: async () => ({ code: 0, stdout: '', stderr: '' }) });
  return service.validateRequest(request);
}

function buildParameterTextFromValidatedRequest(request) {
  const def = request.systemDef;
  if (def.materialTemplate) {
    return [
      `REALDIM ${request.realdim.join(' ')}`,
      `SYSDIM ${request.grid.nx} ${request.grid.ny} ${request.grid.nz}`,
      `CHOICESYS ${def.choiceSys}`,
      'NPHASES 2',
      'CHOICESTRUCT 2',
      `OUTDIST ${request.outdist ? 'true' : 'false'}`,
      templateBody(request),
      '',
    ].join('\n');
  }
  return [
    `REALDIM ${request.realdim.join(' ')}`,
    `SYSDIM ${request.grid.nx} ${request.grid.ny} ${request.grid.nz}`,
    `CHOICESYS ${def.choiceSys}`,
    'NPHASES 2',
    'CHOICESTRUCT 2',
    `OUTDIST ${request.outdist ? 'true' : 'false'}`,
    `${def.loadKeyword} ${request.load.vector.join(' ')}`,
    'PHASEID 1',
    formatSymmetric6(def.phaseKeyword, request.phases[0].value),
    'PHASEID 2',
    formatSymmetric6(def.phaseKeyword, request.phases[1].value),
    '',
  ].join('\n');
}

function templateBody(request) {
  const load = request.load.vector.join(' ');
  if (request.system === 'elastic') {
    return ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', '', 'PHASEID 1', STIFFNESS_1, '', 'PHASEID 2', STIFFNESS_2].join('\n');
  }
  if (request.system === 'piezoelectric') {
    return ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', `ELECFIELD ${load}`, '', 'PHASEID 1', STIFFNESS_1, 'PERMITTIVITY 5 5 5 0 0 0', PIEZO_1, '', 'PHASEID 2', STIFFNESS_2, 'PERMITTIVITY 50 50 50 0 0 0', PIEZO_2].join('\n');
  }
  if (request.system === 'piezomagnetic') {
    return ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', `MAGFIELD ${load}`, '', 'PHASEID 1', STIFFNESS_1, 'PERMEABILITY 2 2 2 0 0 0', PIEZOMAG_1, '', 'PHASEID 2', STIFFNESS_2, 'PERMEABILITY 20 20 20 0 0 0', PIEZOMAG_2].join('\n');
  }
  if (request.system === 'magnetoelectric') {
    return ['CHOICEELABC 1', 'STRAIN 1e-3 0 0 0 0 0', `ELECFIELD ${load}`, `MAGFIELD ${load}`, '', 'PHASEID 1', STIFFNESS_1, 'PERMITTIVITY 5 5 5 0 0 0', PIEZO_1, 'PERMEABILITY 2 2 2 0 0 0', PIEZOMAG_1, MAGELEC_1, '', 'PHASEID 2', STIFFNESS_2, 'PERMITTIVITY 50 50 50 0 0 0', PIEZO_2, 'PERMEABILITY 20 20 20 0 0 0', PIEZOMAG_2, MAGELEC_2].join('\n');
  }
  throw validationError(`未支持的材料模板系统: ${request.system}`);
}

function buildGenerateStructArgs(caseDir, request) {
  const args = [
    path.join(__dirname, 'efffield-runner.py'), 'generate-struct', caseDir,
    '--nx', String(request.grid.nx),
    '--ny', String(request.grid.ny),
    '--nz', String(request.grid.nz),
    '--shape', request.structure.type,
  ];
  if (request.structure.radius) args.push('--radius', String(request.structure.radius));
  if (request.structure.rx || request.structure.ry || request.structure.rz) {
    if (request.structure.rx) args.push('--rx', String(request.structure.rx));
    if (request.structure.ry) args.push('--ry', String(request.structure.ry));
    if (request.structure.rz) args.push('--rz', String(request.structure.rz));
  }
  return args;
}

async function runChecked({ runner, args, cwd, env, logPath }) {
  const result = await runner({ args, cwd, env });
  fs.writeFileSync(logPath, `STDOUT\n${result.stdout || ''}\n\nSTDERR\n${result.stderr || ''}\n`);
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `efffield command failed: ${args.join(' ')}`).trim());
  }
  return result;
}

function stripPrivatePaths(result) {
  const { jobDir, caseDir, outputs, ...rest } = result;
  return {
    ...rest,
    outputs: (outputs || []).map((output) => ({ name: output.name })),
  };
}

function stripSystemDef(request) {
  const { systemDef, ...rest } = request;
  return rest;
}

function validateParameterJobRequest({ parameterText, structure, solver } = {}) {
  const text = normalizeParameterText(parameterText);
  const cleanText = stripParameterComments(text);
  const grid = parseParameterSysdim(cleanText);
  const system = resolveSystemByChoice(parseParameterChoiceSys(cleanText));
  const rawStructure = structure || {};
  const shape = normalizeStructureShape(rawStructure.type || rawStructure.shape || (grid.nz > 1 ? 'sphere' : 'circle'), grid.nz);
  if (!['circle', 'sphere', 'square', 'cube', 'ellipse', 'ellipsoid'].includes(shape)) {
    throw validationError('structure.type 只支持 circle、sphere、square、cube、ellipse、ellipsoid、box');
  }
  const radius = optionalPositiveNumber(rawStructure.radius, 'radius') || Math.max(1, Math.floor(Math.min(grid.nx, grid.ny, grid.nz > 1 ? grid.nz : Math.max(grid.nx, grid.ny)) / 4));
  const parsedSolver = solver || {};
  const tol = optionalPositiveNumber(parsedSolver.tol, 'tol') || 1e-3;
  const maxiter = clampInteger(parsedSolver.maxiter ?? 300, 1, 5000, 'maxiter');
  return {
    system: system.key,
    systemDef: system,
    grid,
    structure: {
      type: shape,
      radius,
      rx: optionalPositiveNumber(rawStructure.rx, 'rx'),
      ry: optionalPositiveNumber(rawStructure.ry, 'ry'),
      rz: optionalPositiveNumber(rawStructure.rz, 'rz'),
    },
    solver: { tol, maxiter },
    parameterText: text.endsWith('\n') ? text : text + '\n',
    parameterMode: 'custom',
  };
}

function normalizeParameterText(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.trim()) throw validationError('parameter.in 内容不能为空');
  if (text.includes('\0')) throw validationError('parameter.in 内容包含非法字符');
  if (text.length > 200000) throw validationError('parameter.in 内容过长');
  return text;
}

function stripParameterComments(text) {
  return String(text || '').split('\n').map((line) => {
    const hashIndex = line.indexOf('#');
    const bangIndex = line.indexOf('!');
    const indexes = [hashIndex, bangIndex].filter((index) => index >= 0);
    return indexes.length ? line.slice(0, Math.min(...indexes)) : line;
  }).join('\n');
}

function parseParameterSysdim(text) {
  const match = text.match(/^\s*SYSDIM\s+(\d+)\s+(\d+)\s+(\d+)\s*$/im);
  if (!match) throw validationError('parameter.in 缺少 SYSDIM nx ny nz');
  return {
    nx: clampInteger(match[1], 8, 256, 'nx'),
    ny: clampInteger(match[2], 8, 256, 'ny'),
    nz: clampInteger(match[3], 1, 64, 'nz'),
  };
}

function parseParameterChoiceSys(text) {
  const match = text.match(/^\s*CHOICESYS\s+(\d+)\s*$/im);
  if (!match) throw validationError('parameter.in 缺少 CHOICESYS');
  return Number(match[1]);
}

function resolveSystemByChoice(choiceSys) {
  const system = Object.values(SYSTEM_DEFS).find((def) => def.choiceSys === choiceSys);
  if (!system) throw validationError('parameter.in 的 CHOICESYS 暂未支持');
  return system;
}

function normalizeStructureShape(value, nz) {
  const shape = String(value || '').toLowerCase();
  if (shape === 'box') return nz > 1 ? 'cube' : 'square';
  if (shape === 'circle' && nz > 1) return 'sphere';
  if (shape === 'square' && nz > 1) return 'cube';
  return shape;
}

function resolveSystem(systemKey) {
  const normalized = String(systemKey || '').toLowerCase();
  for (const def of Object.values(SYSTEM_DEFS)) {
    if (def.key === normalized || def.aliases.includes(normalized)) return def;
  }
  throw validationError('目前只支持 dielectric、magnetic、thermal、diffusion、electrical_conduction、elastic、piezoelectric、piezomagnetic、magnetoelectric 有效场计算');
}

function resolveLoadVector(load, body, system) {
  for (const name of system.loadNames) {
    if (load[name]) return load[name];
    if (body[name]) return body[name];
  }
  if (load.electricField) return load.electricField;
  return [1, 0, 0];
}

function normalizePhases(value, system) {
  if (system.materialTemplate) return null;
  const phases = Array.isArray(value) && value.length >= 2
    ? value.slice(0, 2)
    : system.defaultPhaseValues.map((item, index) => ({ id: index + 1, [system.phaseProperty]: item }));
  return phases.map((phase, index) => {
    const raw = phase && (phase[system.phaseProperty] ?? phase.value ?? phase.permittivity ?? phase.conductivity ?? phase.diffusivity);
    const normalized = normalizeMaterialValue(raw, system.phaseProperty);
    return { id: index + 1, value: normalized, [system.phaseProperty]: normalized };
  });
}

function normalizeMaterialValue(value, name) {
  if (Array.isArray(value)) {
    if (value.length !== 6) throw validationError(`${name} 张量必须是 6 个数字`);
    const numbers = value.map((item) => Number(item));
    if (numbers.some((number) => !Number.isFinite(number))) throw validationError(`${name} 张量必须是 6 个数字`);
    if (numbers.slice(0, 3).some((number) => number <= 0)) throw validationError(`${name} 主轴分量必须是正数`);
    return numbers;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw validationError(`${name} 必须是正数`);
  return number;
}

function formatSymmetric6(keyword, value) {
  if (Array.isArray(value)) return `${keyword} ${value.join(' ')}`;
  return `${keyword} ${value} ${value} ${value} 0 0 0`;
}

function normalizeRealDim(value, grid) {
  if (value === undefined || value === null || value === '') return [grid.nx, grid.ny, grid.nz];
  const vector = normalizeVector(value, 'realdim');
  if (vector.some((number) => number <= 0)) throw validationError('realdim 必须是 3 个正数');
  return vector;
}

function normalizeBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  throw validationError('outdist 必须是 true 或 false');
}

function clampInteger(value, min, max, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw validationError(`${name} 必须是 ${min}-${max} 之间的整数`);
  }
  return number;
}

function optionalPositiveNumber(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw validationError(`${name} 必须是正数`);
  return number;
}

function normalizeVector(value, name) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw validationError(`${name} 必须是 3 个数字`);
  }
  return value.map((item) => {
    const number = Number(item);
    if (!Number.isFinite(number)) throw validationError(`${name} 必须是 3 个数字`);
    return number;
  });
}

function validateJobId(jobId) {
  if (!/^eff_[A-Za-z0-9_-]+$/.test(jobId || '')) throw validationError('非法 jobId');
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function defaultStride(grid) {
  return Math.max(2, Math.floor(Math.max(grid.nx, grid.ny) / 32));
}

module.exports = {
  createEfffieldJobService,
  buildParameterTextFromRequest,
  DEFAULT_EFFFIELD_ROOT,
  DEFAULT_JOBS_ROOT,
  SYSTEM_DEFS,
};
