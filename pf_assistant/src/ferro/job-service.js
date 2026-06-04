'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');
const { runProcess } = require('./process-runner');
const { indexFerroResults } = require('./result-indexer');
const { calculateFerroCoefficients, resolveFerroMaterialModel } = require('./material-models');
const defaultMaterialRepository = require('./material-repository');
const userWorkspace = require('../storage/user-workspace');

const DEFAULT_TEMPLATE_ROOT = process.env.FERRO_TEMPLATE_ROOT || '/home/admin/.openclaw/workspace/TangSY/pfm2_ferro_demo';
const DEFAULT_JOBS_ROOT = path.join(paths.backendRoot, 'data', 'ferro', 'jobs');

function createFerroJobService({
  jobsRoot = process.env.FERRO_JOBS_ROOT || DEFAULT_JOBS_ROOT,
  userDataRoot = process.env.PFM_USER_DATA_ROOT || (jobsRoot !== DEFAULT_JOBS_ROOT ? jobsRoot : userWorkspace.DEFAULT_USER_DATA_ROOT),
  templateRoot = DEFAULT_TEMPLATE_ROOT,
  runner = runProcess,
  now = Date.now,
  materialRepository = defaultMaterialRepository,
} = {}) {
  function validateRequest(request) {
    const body = request || {};
    const grid = body.grid || {};
    const material = body.material || {};
    const run = body.run || {};
    const initial = body.initial || {};
    const field = body.field || {};
    const visualization = body.visualization || {};
    const nx = clampInteger(grid.nx ?? 64, 8, 256, 'nx');
    const ny = clampInteger(grid.ny ?? 1, 1, 64, 'ny');
    const nz = clampInteger(grid.nz ?? 64, 1, 256, 'nz');
    const kstep = clampInteger(run.kstep ?? 20000, 1, 50000, 'kstep');
    const kprnt = clampInteger(run.kprnt ?? Math.min(5000, kstep), 1, kstep, 'kprnt');
    const normalizedMaterial = normalizeMaterial(material);
    return {
      system: 'ferroelectric',
      grid: { nx, ny, nz },
      material: normalizedMaterial,
      initial: {
        magn: positiveNumber(initial.magn ?? 0.1, 'magn'),
        n_random: clampInteger(initial.n_random ?? 15, 0, 1000000, 'n_random'),
      },
      run: { kstep, kprnt },
      field: {
        appel30: finiteNumber(field.appel30 ?? 0.009, 'appel30'),
        appel31: finiteNumber(field.appel31 ?? 0.001, 'appel31'),
      },
      visualization: normalizeVisualization(visualization, { nx, ny, nz }, normalizedMaterial),
      parentJobId: body.parentJobId || body.parent_job_id || null,
    };
  }

  async function createAndRunJob({ userId, chatSessionId = null, request }) {
    if (!userId) throw validationError('userId is required');
    const validated = validateRequest(request);
    const jobId = `ferro_${now()}_${crypto.randomBytes(4).toString('hex')}`;
    const workspace = userWorkspace.createFerroJobWorkspace({ id: userId }, chatSessionId || 'default', jobId, workspaceOptions());
    const jobDir = workspace.jobDir;
    const caseDir = workspace.caseDir;
    const logsDir = workspace.logsDir;
    copyTemplate(templateRoot, caseDir, workspace.sourceDir);
    fs.writeFileSync(workspace.inputPath, buildInput(validated));

    const metadata = {
      id: jobId,
      userId,
      chatSessionId,
      status: 'running',
      system: 'ferroelectric',
      request: validated,
      parentJobId: validated.parentJobId,
      createdAt: now(),
      jobDir,
      caseDir,
      userKey: userWorkspace.getUserKey({ id: userId }),
    };
    fs.writeFileSync(workspace.requestPath, JSON.stringify(metadata, null, 2));
    userWorkspace.writeFerroJobManifest({ id: userId }, chatSessionId || 'default', jobId, {
      ...metadata,
      templateRoot,
      createdAt: metadata.createdAt,
      codeVersion: process.env.GIT_COMMIT || null,
    }, workspaceOptions());

    await runChecked({ runner, command: 'make', args: ['clean'], cwd: caseDir, logPath: path.join(logsDir, 'build-clean.log') });
    await runChecked({ runner, command: 'make', args: [], cwd: caseDir, logPath: path.join(logsDir, 'build.log') });
    mirrorExecutable(caseDir, workspace.executableDir);
    await runChecked({ runner, command: './main.exe', args: [], cwd: caseDir, logPath: path.join(logsDir, 'run.log') });
    await runChecked({
      runner,
      command: 'python3',
      args: buildVisualizerArgs({ caseDir, visualization: validated.visualization }),
      cwd: caseDir,
      env: { MPLBACKEND: 'Agg' },
      logPath: path.join(logsDir, 'visualize.log'),
    });

    const calculatedMaterial = calculateFerroCoefficients(validated.material);
    userWorkspace.writeFerroMaterialSnapshot({ id: userId }, chatSessionId || 'default', jobId, {
      material: validated.material,
      calculated: calculatedMaterial,
      cardVariant: validated.material && validated.material.cardVariant || null,
      landau: calculatedMaterial.warnings && calculatedMaterial.warnings.some((item) => /Landau database/i.test(item)) ? calculatedMaterial : null,
    }, workspaceOptions());
    if (materialRepository && typeof materialRepository.seedFerroMaterialModels === 'function') materialRepository.seedFerroMaterialModels();
    if (materialRepository && typeof materialRepository.saveFerroParameterSnapshot === 'function') {
      materialRepository.saveFerroParameterSnapshot({ jobId, calculated: calculatedMaterial });
    }

    const indexed = indexFerroResults({ jobId, caseDir, request: validated });
    mirrorJobOutputs(caseDir, workspace);
    const result = {
      ...metadata,
      type: 'ferro_result',
      jobId,
      parentJobId: validated.parentJobId,
      status: 'completed',
      completedAt: now(),
      message: '计算完成。下面是当前结果。你可以继续让我切换显示方式、调整网格或步数，然后基于当前草稿重新计算。',
      summary: '铁电相场计算完成，已生成极化分布图片。',
      draftSnapshot: requestToDraftSnapshot(validated),
      result: indexed.result,
      followupChips: defaultFollowupChips(),
      outputs: indexed.outputs,
      assets: indexed.assets,
    };
    fs.writeFileSync(workspace.resultIndexPath, JSON.stringify(indexed.result, null, 2));
    userWorkspace.writeFerroResultJson({ id: userId }, chatSessionId || 'default', jobId, stripPrivatePaths(result), workspaceOptions());
    return result;
  }

  function getJobResult(jobId, userId = null) {
    validateJobId(jobId);
    let filePath = legacyResultPath(jobId);
    if (userId) {
      try {
        filePath = path.join(userWorkspace.assertJobBelongsToUser({ id: userId }, jobId, workspaceOptions()), 'result.json');
      } catch (err) {
        if (err.statusCode !== 404) throw err;
        filePath = legacyResultPath(jobId);
      }
    }
    if (!fs.existsSync(filePath)) return null;
    const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (userId && String(result.userId || '') !== String(userId)) throw validationError('无权访问该铁电计算结果', 403);
    return result;
  }

  async function generateVisualizations({ userId, jobId, visualization = {} }) {
    if (!userId) throw validationError('userId is required');
    validateJobId(jobId);
    const jobDir = userWorkspace.assertJobBelongsToUser({ id: userId }, jobId, workspaceOptions());
    const requestPath = path.join(jobDir, 'request.json');
    if (!fs.existsSync(requestPath)) throw validationError('铁电计算任务不存在', 404);
    const metadata = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    if (String(metadata.userId || '') !== String(userId || '')) throw validationError('无权访问该铁电计算任务', 403);
    const baseRequest = metadata.request || {};
    const mergedVisualization = normalizeVisualization(
      { ...(baseRequest.visualization || {}), ...visualization, outputPolicy: visualization.outputPolicy || visualization.output_policy || 'selected_only' },
      baseRequest.grid || { nx: 64, ny: 1, nz: 64 },
      baseRequest.material || {}
    );
    await runChecked({
      runner,
      command: 'python3',
      args: buildVisualizerArgs({ caseDir: metadata.caseDir, visualization: mergedVisualization }),
      cwd: metadata.caseDir,
      env: { MPLBACKEND: 'Agg' },
      logPath: path.join(jobDir, 'logs', 'plot-postprocess.log'),
    });
    mirrorJobOutputs(metadata.caseDir, {
      outputsDir: path.join(jobDir, 'outputs'),
      visualizationsDir: path.join(jobDir, 'visualizations'),
    });
    const indexed = indexFerroResults({
      jobId,
      caseDir: metadata.caseDir,
      request: { ...baseRequest, visualization: mergedVisualization },
    });
    const resultPath = path.join(jobDir, 'result.json');
    const previous = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : {};
    const next = {
      ...previous,
      result: indexed.result,
      outputs: indexed.outputs,
      assets: indexed.assets,
      draftSnapshot: { ...(previous.draftSnapshot || requestToDraftSnapshot(baseRequest)), visualization: mergedVisualization },
    };
    fs.writeFileSync(resultPath, JSON.stringify(stripPrivatePaths(next), null, 2));
    return { jobId, result: indexed.result, outputs: indexed.outputs, assets: indexed.assets };
  }

  function resolveAssetPath(jobId, filename, userId = null) {
    validateJobId(jobId);
    if (userId) {
      try {
        return userWorkspace.resolveFerroAssetPath({ id: userId }, jobId, filename, workspaceOptions());
      } catch (err) {
        if (err.statusCode !== 404) throw err;
        return resolveLegacyAssetPath(jobId, filename, userId);
      }
    }
    return resolveLegacyAssetPath(jobId, filename, userId);
  }

  function workspaceOptions() {
    return { root: userDataRoot || jobsRoot };
  }

  function legacyResultPath(jobId) {
    return path.join(jobsRoot, jobId, 'result.json');
  }

  function resolveLegacyAssetPath(jobId, filename, userId = null) {
    if (userId) {
      const requestPath = path.join(jobsRoot, jobId, 'request.json');
      if (!fs.existsSync(requestPath)) throw validationError('铁电计算任务不存在', 404);
      const metadata = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
      if (String(metadata.userId || '') !== String(userId)) throw validationError('无权访问该铁电计算图片', 403);
    }
    if (!/^(Polar\.\d{7}_[A-Za-z0-9_-]+|polar_angle_legend|polar_variant_111_legend)\.png$/.test(filename || '')) throw validationError('非法文件名');
    const figuresDir = path.join(jobsRoot, jobId, 'case', 'figures');
    const assetPath = path.resolve(figuresDir, filename);
    if (!assetPath.startsWith(path.resolve(figuresDir) + path.sep)) throw validationError('非法文件路径');
    if (!fs.existsSync(assetPath)) throw validationError('图片不存在', 404);
    return assetPath;
  }

  return { createAndRunJob, generateVisualizations, getJobResult, resolveAssetPath, validateRequest };
}

function buildVisualizerArgs({ caseDir, visualization }) {
  const mode = visualizationModeForVisualizer(visualization);
  return [
    path.join(__dirname, 'polar-visualizer.py'),
    caseDir,
    '--mode',
    mode,
    '--component',
    visualization.component || 'pz',
    '--slice',
    visualization.slice,
    '--steps',
    String(visualization.steps),
    '--output-policy',
    visualization.outputPolicy || 'selected_only',
  ];
}

function visualizationModeForVisualizer(visualization) {
  const mode = visualization && visualization.mode;
  const arrows = !visualization || !visualization.overlay || visualization.overlay.arrows !== false;
  if (mode === 'inplane_angle' && arrows) return 'inplane_angle_arrow';
  if (mode === 'variant_111' && arrows) return 'variant_111_arrow';
  return mode || 'component';
}

async function runChecked({ runner, command, args = [], cwd, env = {}, logPath }) {
  const result = await runner({ command, args, cwd, env });
  fs.writeFileSync(logPath, `STDOUT\n${result.stdout || ''}\n\nSTDERR\n${result.stderr || ''}\n`);
  if (result.code !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return result;
}

function copyTemplate(templateRoot, caseDir, sourceDir = null) {
  if (!fs.existsSync(templateRoot)) throw validationError('铁电程序模板目录不存在', 500);
  const copied = [];
  for (const name of fs.readdirSync(templateRoot)) {
    const src = path.join(templateRoot, name);
    const stat = fs.statSync(src);
    if (!stat.isFile()) continue;
    if (/^(Polar\.|fort\.|AvePol\.dat|AveStrain\.dat|Energy\.dat|const\.out|pxyz$)/.test(name)) continue;
    fs.copyFileSync(src, path.join(caseDir, name));
    copied.push({ name, source: src, size: stat.size, mtimeMs: stat.mtimeMs });
    if (sourceDir && /\.(f90|f|for|F90|inc|h|md|txt)$/i.test(name)) {
      fs.copyFileSync(src, path.join(sourceDir, name));
    }
  }
  if (sourceDir) {
    fs.writeFileSync(path.join(sourceDir, 'README.txt'), 'Source/template files copied or referenced for this ferroelectric job.\n');
    fs.writeFileSync(path.join(sourceDir, 'copied-files-manifest.json'), JSON.stringify(copied, null, 2));
  }
}

function mirrorJobOutputs(caseDir, workspace) {
  if (!workspace) return;
  fs.mkdirSync(workspace.outputsDir, { recursive: true });
  fs.mkdirSync(workspace.visualizationsDir, { recursive: true });
  for (const name of fs.readdirSync(caseDir)) {
    if (/^Polar\.\d{7}\.dat$/.test(name)) {
      fs.copyFileSync(path.join(caseDir, name), path.join(workspace.outputsDir, name));
    }
  }
  const figuresDir = path.join(caseDir, 'figures');
  if (fs.existsSync(figuresDir)) {
    for (const name of fs.readdirSync(figuresDir)) {
      if (/\.png$/.test(name)) fs.copyFileSync(path.join(figuresDir, name), path.join(workspace.visualizationsDir, name));
    }
  }
}

function mirrorExecutable(caseDir, executableDir) {
  const exePath = path.join(caseDir, 'main.exe');
  if (!fs.existsSync(exePath)) return;
  fs.mkdirSync(executableDir, { recursive: true });
  fs.copyFileSync(exePath, path.join(executableDir, 'main.exe'));
}

function buildInput(request) {
  const { nx, ny, nz } = request.grid;
  const material = calculateFerroCoefficients(request.material);
  const c = material.coefficients;
  return [
    `${nx} ${ny} ${nz} !nx, ny, nz`,
    `${material.inputs.xf} ${material.inputs.tem} !xf,tem`,
    `${request.initial.magn}  ${request.initial.n_random}    !magn,n_random`,
    '0.6 0.0 0.3  0.3 !g11,g12,g44,gm44',
    `${nx} ${ny} ${nz}     !lx,ly,lz`,
    '0.0 0.0 0.0          !u0x,u0y,u0z',
    '1.0                  !mult',
    '0.02  1.0            !dt0,ga',
    '100.0  100.0  100.0 1 1 1 1 1 !eka1,eka2,eka3,mb,md1,md2,md3,index_3D',
    `${nz} 0 0  !nf,ns,ns1`,
    `${request.run.kstep} ${request.run.kprnt} !kstep,kprnt`,
    '1 1 1 0 1 0 0  !np1-np6',
    '1 1 0 1 1 0 0  !np7-np12',
    '0.0      ! theta',
    `${c.Q4}   ! Q44`,
    '1.0   !em',
    '0.0   !rou_dis',
    '0 0 ! np13,np14',
    '1 0.0 0.0 0      !nor_mean,nor_sigma,dep_cof',
    `${c.Q1} ${c.Q2} ${c.Q4}          !Q1,Q2,Q4`,
    `${c.s11} ${c.s12} ${c.s44}            !s11,s12,s44`,
    `${c.a0}  ${c.p0}                    !a0,p0`,
    `${c.a1} ${c.a11} ${c.a12} !a1,a11,a12`,
    `${c.a111} ${c.a112} ${c.a123}      !a111,a112,a123`,
    `${c.a1111} ${c.a1112} ${c.a1122} ${c.a1123}          !a1111,a1112,a1122,a1123`,
    `${request.field.appel30} ${request.field.appel31}     !appel30, appel31`,
    '',
  ].join('\n');
}


function normalizeMaterial(material) {
  const materialKey = materialKeyAlias(material.materialKey || material.material_key || 'pmn_pt');
  const modelKey = material.modelKey || material.model_key || defaultModelKey(materialKey);
  const model = resolveFerroMaterialModel({ materialKey, modelKey });
  return {
    ...material,
    materialKey: model.materialKey,
    modelKey: model.modelKey,
    xf: numberInRange(material.xf ?? model.defaultInputs.xf, 0, 1, 'xf'),
    tem: numberInRange(material.tem ?? model.defaultInputs.tem, 1, 2000, 'tem'),
  };
}

function defaultModelKey(materialKey) {
  const key = materialKeyAlias(materialKey);
  if (key === 'bto') return 'bto_generate_input';
  if (key === 'pzt') return 'pzt_haun_1989';
  if (key === 'bfo') return 'bfo_bens_coefficients';
  return 'pmn_pt_default';
}

function materialKeyAlias(materialKey) {
  const key = String(materialKey || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (key === 'pmnpt') return 'pmn_pt';
  if (key === 'batio3' || key === 'ba_tio3') return 'bto';
  return key || 'pmn_pt';
}

function stripPrivatePaths(result) {
  const { jobDir, caseDir, outputs, ...rest } = result;
  return { ...rest, outputs: (outputs || []).map((item) => ({ name: item.name })) };
}

function clampInteger(value, min, max, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw validationError(`${name} 必须是 ${min}-${max} 之间的整数`);
  return number;
}

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw validationError(`${name} 必须是数字`);
  return number;
}

function positiveNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number <= 0) throw validationError(`${name} 必须是正数`);
  return number;
}

function numberInRange(value, min, max, name) {
  const number = finiteNumber(value, name);
  if (number < min || number > max) throw validationError(`${name} 必须在 ${min}-${max} 之间`);
  return number;
}

function normalizeVisualization(visualization, grid, material = {}) {
  const hasExplicitMode = visualization.mode !== undefined || visualization.component !== undefined;
  const defaultMode = isBfoMaterial(material) ? 'variant_111' : 'component';
  const rawMode = String(visualization.mode || (visualization.component ? 'component' : defaultMode)).toLowerCase();
  const legacyMode = rawMode === 'angle_arrow' || rawMode === 'inplane_angle_arrow' ? 'inplane_angle' : rawMode === 'variant_111_arrow' ? 'variant_111' : rawMode;
  const mode = ['component', 'inplane_angle', 'variant_111'].includes(legacyMode) ? legacyMode : (hasExplicitMode ? 'component' : defaultMode);
  const component = mode === 'component' ? normalizeComponent(visualization.component || 'pz') : null;
  return {
    mode,
    component,
    plane: visualization.plane || 'auto',
    inplaneComponents: normalizeInplaneComponents(visualization.inplaneComponents, grid),
    slice: normalizeSlice(visualization.slice || 'xz'),
    steps: visualization.steps || 'all',
    outputPolicy: normalizeOutputPolicy(visualization.outputPolicy || visualization.output_policy),
    overlay: normalizeOverlay(visualization.overlay),
  };
}

function normalizeOverlay(value) {
  const overlay = value && typeof value === 'object' ? value : {};
  return { ...overlay, arrows: overlay.arrows !== false };
}

function normalizeOutputPolicy(value) {
  return String(value || 'selected_only') === 'all_modes' ? 'all_modes' : 'selected_only';
}

function isBfoMaterial(material) {
  const text = [material.materialKey, material.material_key, material.modelKey, material.model_key].filter(Boolean).join(' ').toLowerCase();
  return /\bbfo\b|bifeo3/.test(text);
}

function normalizeInplaneComponents(value, grid) {
  if (Array.isArray(value) && value.length === 2 && value.every((item) => ['px', 'py', 'pz'].includes(String(item).toLowerCase()))) return value.map((item) => String(item).toLowerCase());
  if (Number(grid.ny) === 1) return ['px', 'pz'];
  if (Number(grid.nx) === 1) return ['py', 'pz'];
  return ['px', 'py'];
}

function normalizeComponent(value) {
  const component = String(value || '').toLowerCase();
  if (!['px', 'py', 'pz'].includes(component)) throw validationError('component 只支持 px、py、pz');
  return component;
}

function requestToDraftSnapshot(request) {
  return {
    status: 'ready',
    system: 'ferroelectric',
    material: request.material,
    grid: request.grid,
    run: { steps: request.run.kstep, outputInterval: request.run.kprnt, kstep: request.run.kstep, kprnt: request.run.kprnt },
    initial: request.initial,
    field: request.field,
    visualization: request.visualization,
    parentJobId: request.parentJobId || null,
  };
}

function defaultFollowupChips() {
  return [
    { label: '查看面内角度', action: 'set_visualization_mode', mode: 'inplane_angle' },
    { label: '面内', action: 'set_visualization_mode', mode: 'inplane_angle' },
    { label: 'R相变体', action: 'set_visualization_mode', mode: 'variant_111' },
    { label: '切换 Pz', action: 'set_component', component: 'pz' },
    { label: '网格加密再跑', action: 'refine_grid' },
    { label: '增加到 20000 步', action: 'increase_steps', steps: 20000 },
    { label: '对比上一次', action: 'compare_previous' },
    { label: '生成报告', action: 'generate_report' },
  ];
}

function normalizeSlice(value) {
  const slice = String(value || '').toLowerCase();
  if (!['xz'].includes(slice)) throw validationError('slice 目前只支持 xz');
  return slice;
}

function validateJobId(jobId) {
  if (!/^ferro_[A-Za-z0-9_-]+$/.test(jobId || '')) throw validationError('非法 jobId');
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { createFerroJobService, DEFAULT_TEMPLATE_ROOT, DEFAULT_JOBS_ROOT };
