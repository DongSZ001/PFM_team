'use strict';

const { createEfffieldJobService, SYSTEM_DEFS, buildParameterTextFromRequest } = require('./job-service');

const DIALOGUE_SYSTEMS = Object.freeze({
  dielectric: {
    key: 'dielectric',
    property: 'permittivity',
    propertyLabel: '介电常数（相对介电常数）',
    loadLabel: '外加电场',
    loadUnit: 'V/m',
    phaseQuestion: '两相介电常数（相对介电常数）分别是多少？无量纲，例如：基体 2，夹杂 80。',
    intent: (text) => /(介电|电场分布|电势分布|电位移|permittivity|dielectric)/i.test(text) && hasEfffieldIntentContext(text),
  },
  magnetic: {
    key: 'magnetic',
    property: 'permeability',
    propertyLabel: '相对磁导率',
    loadLabel: '外加磁场',
    loadUnit: 'A/m',
    phaseQuestion: '两相相对磁导率分别是多少？无量纲，例如：基体 1，夹杂 20。',
    intent: (text) => /(磁性|磁导|磁场|磁感应|magnetic|permeability)/i.test(text) && hasEfffieldIntentContext(text),
  },
  thermal: {
    key: 'thermal',
    property: 'conductivity',
    propertyLabel: '热导率',
    loadLabel: '温度梯度',
    loadUnit: 'K/m',
    phaseQuestion: '两相热导率分别是多少？单位 W/(m·K)，例如：基体 1，夹杂 20。',
    intent: (text) => /(热传导|热导|导热|热流|温度场|温度梯度|thermal)/i.test(text) && hasEfffieldIntentContext(text),
  },
  diffusion: {
    key: 'diffusion',
    property: 'diffusivity',
    propertyLabel: '扩散率',
    loadLabel: '浓度梯度',
    loadUnit: '浓度单位/m',
    phaseQuestion: '两相扩散率分别是多少？单位通常为 m²/s，例如：基体 1，夹杂 10。',
    intent: (text) => /(扩散|浓度场|浓度梯度|浓度分布|扩散通量|diffusion|diffusivity)/i.test(text) && hasEfffieldIntentContext(text),
  },
  electrical_conduction: {
    key: 'electrical_conduction',
    property: 'conductivity',
    propertyLabel: '电导率',
    loadLabel: '外加电场',
    loadUnit: 'V/m',
    phaseQuestion: '两相电导率分别是多少？单位 S/m，例如：基体 1，夹杂 50。',
    intent: (text) => /(电导|电传导|电流分布|电流密度|electrical conduction|electrical conductivity)/i.test(text) && hasEfffieldIntentContext(text),
  },
  elastic: {
    key: 'elastic',
    property: null,
    propertyLabel: '弹性材料模板',
    loadLabel: '宏观应变',
    loadUnit: '无量纲',
    phaseQuestion: '',
    materialTemplate: true,
    intent: (text) => /(弹性|elastic)/i.test(text) && /(模拟|计算|有效场|分布)?/.test(text),
  },
  piezoelectric: {
    key: 'piezoelectric',
    property: null,
    propertyLabel: '压电材料模板',
    loadLabel: '外加电场',
    loadUnit: 'V/m',
    phaseQuestion: '',
    materialTemplate: true,
    intent: (text) => /(压电|piezoelectric|piezo)/i.test(text) && /(模拟|计算|有效场|分布)?/.test(text),
  },
  piezomagnetic: {
    key: 'piezomagnetic',
    property: null,
    propertyLabel: '压磁材料模板',
    loadLabel: '外加磁场',
    loadUnit: 'A/m',
    phaseQuestion: '',
    materialTemplate: true,
    intent: (text) => /(压磁|piezomagnetic)/i.test(text) && /(模拟|计算|有效场|分布)?/.test(text),
  },
  magnetoelectric: {
    key: 'magnetoelectric',
    property: null,
    propertyLabel: '磁电耦合材料模板',
    loadLabel: '外加电场/磁场',
    loadUnit: '电场 V/m；磁场 A/m',
    phaseQuestion: '',
    materialTemplate: true,
    intent: (text) => /(磁电|磁电耦合|magnetoelectric)/i.test(text) && /(模拟|计算|有效场|分布)?/.test(text),
  },
});

function createEfffieldDialogueService({
  jobService = createEfffieldJobService(),
  drafts = new Map(),
} = {}) {
  async function handleMessage({ userId, chatSessionId = 'default', message }) {
    if (!userId) throw validationError('userId is required');
    const text = String(message || '').trim();
    if (!text) throw validationError('message is required');

    const key = draftKey(userId, chatSessionId);
    const existing = drafts.get(key);
    const panelRequested = isParameterPanelRequest(text);
    if (existing && isCancelRequest(text)) {
      drafts.delete(key);
      return {
        type: 'efffield_cancelled',
        reply: '已退出当前有效场参数向导。现在可以重新输入新的计算需求，或继续普通对话。',
      };
    }

    const incomingSystem = detectSystem(text);
    if (existing && incomingSystem && incomingSystem.key !== existing.system && shouldOfferModeChoice(text, incomingSystem)) {
      const nextDraft = createDraft({ userId, chatSessionId, system: incomingSystem.key });
      nextDraft.status = 'mode_choice';
      drafts.set(key, nextDraft);
      return buildModeChoiceResponse(nextDraft);
    }

    if (existing && !incomingSystem && !isEfffieldContinuation(text)) return null;

    const detectedSystem = incomingSystem || detectSystem(text, existing && existing.system) || (panelRequested ? DIALOGUE_SYSTEMS.dielectric : null);
    if (!detectedSystem && !existing) return null;

    const draft = existing || createDraft({ userId, chatSessionId, system: detectedSystem.key });
    if (detectedSystem && !existing) draft.system = detectedSystem.key;

    if (!existing && shouldOfferModeChoice(text, detectedSystem)) {
      draft.status = 'mode_choice';
      drafts.set(key, draft);
      return buildModeChoiceResponse(draft);
    }

    if (existing && existing.status === 'mode_choice') {
      if (isPanelModeChoice(text)) {
        applyMessageToDraft(draft, text);
        const panel = buildParameterPanel(draft);
        draft.status = 'panel';
        drafts.set(key, draft);
        return {
          type: 'efffield_parameter_panel',
          reply: '已打开有效场 parameter.in 面板。可以直接编辑文本，校验后开始计算。',
          panel,
          draft: publicDraft(draft),
        };
      }
      if (isDialogueModeChoice(text)) {
        draft.status = 'collecting';
        drafts.set(key, draft);
        return {
          type: 'efffield_dialogue',
          reply: questionFor(firstMissingField(draft) || 'dimension', draft),
          draft: publicDraft(draft),
        };
      }
    }

    applyMessageToDraft(draft, text);
    drafts.set(key, draft);

    if (panelRequested) {
      const panel = buildParameterPanel(draft);
      draft.status = 'panel';
      return {
        type: 'efffield_parameter_panel',
        reply: '已打开有效场 parameter.in 面板。可以直接编辑文本，校验后开始计算。',
        panel,
        draft: publicDraft(draft),
      };
    }

    if (isConfirmation(text) && draft.status === 'ready') {
      draft.status = 'running';
      const result = await jobService.createAndRunJob({
        userId,
        chatSessionId,
        request: draftToRequest(draft),
      });
      drafts.delete(key);
      return { type: 'efffield_result', ...result };
    }

    const missing = firstMissingField(draft);
    if (missing) {
      draft.status = 'collecting';
      return {
        type: 'efffield_dialogue',
        reply: questionFor(missing, draft),
        draft: publicDraft(draft),
      };
    }

    draft.status = 'ready';
    return {
      type: 'efffield_dialogue',
      reply: readySummary(draft),
      draft: publicDraft(draft),
    };
  }

  function clearDraft({ userId, chatSessionId = 'default' } = {}) {
    if (!userId) return false;
    return drafts.delete(draftKey(userId, chatSessionId || 'default'));
  }

  return { handleMessage, clearDraft };
}

function isCancelRequest(text) {
  return /(退出|取消|停止|结束|终止|重新开始|重置|返回初始|回到初始|不要算了|先不算|cancel|exit|quit|reset)/i.test(String(text || ''));
}

function isEfffieldContinuation(text) {
  const compact = String(text || '').trim();
  if (!compact) return false;
  if (isPanelModeChoice(compact) || isDialogueModeChoice(compact) || isParameterPanelRequest(compact) || isConfirmation(compact)) return true;
  if (hasExplicitEfffieldSetup(compact) || isAdvancedRequest(compact) || detectEditTarget(compact)) return true;
  return /(二维|三维|2d|3d|2D|3D|默认|基体|夹杂|第二相|半径|直径|球|圆|方|盒|椭圆|尺寸|网格|沿|方向|外场|电场|磁场|梯度|应变|应力|x\s*=|y\s*=|z\s*=|\[[^\]]+\]|^\s*[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?(?:\s+[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?){0,5}\s*$)/i.test(compact);
}

function shouldOfferModeChoice(text, system) {
  if (!system) return false;
  const compact = String(text || '').trim();
  if (isParameterPanelRequest(compact)) return false;
  if (/对话问答|问答模式|面板输入|面板模式/.test(compact)) return false;
  if (hasExplicitEfffieldSetup(compact)) return false;
  return hasEfffieldIntentContext(compact) && Boolean(detectSystem(compact, system && system.key));
}

function hasEfffieldIntentContext(text) {
  return /(有效场|模拟|仿真|计算|求|做|研究|分析|看看|生成|得到|预测|评估|分布|场|通量|常数|系数|张量)/i.test(String(text || ''));
}

function hasExplicitEfffieldSetup(text) {
  return /(尺寸|大小|网格|半径|直径|基体|夹杂|第二相|相参数|外加|REALDIM|SYSDIM|PHASEID|OUTDIST|ELECFIELD|MAGFIELD|TEMGRAD|CONCGRAD|PERMITTIVITY|THERMCOND|DIFFUSIVITY|ELECCOND|PERMEABILITY|tol|maxiter|\d+\s*[xX×*＊]\s*\d+)/i.test(String(text || ''));
}

function buildModeChoiceResponse(draft) {
  const system = DIALOGUE_SYSTEMS[draft.system] || DIALOGUE_SYSTEMS.dielectric;
  const title = system.propertyLabel || system.key;
  const reply = '你想用哪种方式设置' + title + '有效场计算参数？请选择“对话问答”或“面板输入”。';
  return {
    type: 'efffield_mode_choice',
    reply,
    choice: {
      system: draft.system,
      title,
      options: [
        { action: 'choose_dialogue_mode', label: '对话问答', message: draft.system + ' 有效场，对话问答' },
        { action: 'choose_parameter_panel', label: '面板输入', message: draft.system + ' 有效场，面板输入' },
      ],
    },
    draft: publicDraft(draft),
  };
}

function isPanelModeChoice(text) {
  return /(面板输入|面板模式|自定义输入|parameter\.in|参数文件)/i.test(text);
}

function isDialogueModeChoice(text) {
  return /(对话问答|问答模式|逐步问答|向导模式)/i.test(text);
}

function isParameterPanelRequest(text) {
  return /(parameter\.in|参数文件|输入文件|面板模式|自定义输入|自定义参数|高级面板)/i.test(text)
    && /(有效场|efffield|effective|介电|热传导|热导|扩散|电导|磁性|磁导|弹性|压电|压磁|磁电)/i.test(text);
}

function buildParameterPanel(draft) {
  const request = draftToPanelRequest(draft);
  return {
    system: request.system,
    parameterText: annotateParameterText(buildParameterTextFromRequest(request), request),
    grid: request.grid,
    realdim: request.realdim,
    structure: request.structure,
    solver: request.solver,
    outdist: request.outdist,
  };
}

function annotateParameterText(text, request) {
  const system = DIALOGUE_SYSTEMS[request.system] || DIALOGUE_SYSTEMS.dielectric;
  const comments = {
    REALDIM: '真实物理尺寸，三个方向长度；会影响梯度/外场量纲解释',
    SYSDIM: '网格尺寸 nx ny nz；必须和结构文件 struct.in 的尺寸一致',
    CHOICESYS: '物理系统编号；2=介电，4=磁导，7=扩散，8=热传导，9=电导，1/3/5/6=耦合模块',
    NPHASES: '相数量；当前自动结构生成默认两相',
    CHOICESTRUCT: '结构输入方式；2 表示从 struct.in 读取相编号结构',
    OUTDIST: '是否输出空间分布数据；true 会生成场分布图片',
    ELECFIELD: '外加电场 Ex Ey Ez，单位 V/m',
    MAGFIELD: '外加磁场 Hx Hy Hz，单位 A/m',
    CONCGRAD: '外加浓度梯度 gx gy gz，单位为浓度单位/m',
    TEMGRAD: '外加温度梯度 gx gy gz，单位 K/m',
    CHOICEELABC: '弹性边界条件；1=外加应变，2=外加应力',
    STRAIN: '宏观应变 6 分量，Voigt 顺序 11 22 33 23 13 12',
    STRESS: '宏观应力 6 分量，Voigt 顺序 11 22 33 23 13 12，单位 Pa',
    PHASEID: '下面材料参数所属的相编号；需与 struct.in 中相编号一致',
    PERMITTIVITY: '相对介电常数张量 6 分量，顺序 11 22 33 23 13 12，无量纲',
    PERMEABILITY: '相对磁导率张量 6 分量，顺序 11 22 33 23 13 12，无量纲',
    DIFFUSIVITY: '扩散率张量 6 分量，顺序 11 22 33 23 13 12，常用单位 m^2/s',
    THERMCOND: '热导率张量 6 分量，顺序 11 22 33 23 13 12，单位 W/(m K)',
    ELECCOND: '电导率张量 6 分量，顺序 11 22 33 23 13 12，单位 S/m',
    STIFFNESS: '弹性刚度矩阵；可写 21 个上三角分量或后续 6 行上三角格式，单位 Pa',
    PIEZOELEC: '压电 d 矩阵，3x6，单位 C/N 或 m/V，按程序约定输入',
    PIEZOMAG: '压磁 q 矩阵，3x6，按程序约定输入',
    MAGELEC: '磁电耦合矩阵，3x3 或兼容 3x6 输入，按程序约定输入',
  };
  let currentPhase = null;
  const lines = String(text || '').split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    const key = trimmed.split(/\s+/)[0].toUpperCase();
    if (key === 'PHASEID') {
      currentPhase = trimmed.split(/\s+/)[1] || null;
      return line + ' # ' + comments.PHASEID;
    }
    const base = comments[key];
    if (!base) return line;
    if (['PERMITTIVITY', 'PERMEABILITY', 'DIFFUSIVITY', 'THERMCOND', 'ELECCOND', 'STIFFNESS', 'PIEZOELEC', 'PIEZOMAG', 'MAGELEC'].includes(key)) {
      return line + ' # 相' + (currentPhase || '?') + '材料参数：' + base;
    }
    return line + ' # ' + base;
  });
  return [
    '# 有效场 parameter.in 自定义输入模板',
    '# 中文注释以 # 开头，底层程序会自动忽略；修改数值时请保留关键字名称。',
    '# 当前系统：' + system.key + '；' + (system.propertyLabel || system.loadLabel || ''),
    ...lines,
  ].join('\n');
}

function draftToPanelRequest(draft) {
  const dimension = draft.dimension || (draft.grid && draft.grid.nz > 1 ? 3 : 2);
  const grid = draft.grid || (dimension === 3 ? { nx: 16, ny: 16, nz: 16 } : { nx: 16, ny: 16, nz: 1 });
  const structure = draft.structure && draft.structure.type
    ? { ...draft.structure }
    : { type: defaultStructureFor(dimension), radius: Math.max(1, Math.floor(Math.min(grid.nx, grid.ny, grid.nz > 1 ? grid.nz : Math.max(grid.nx, grid.ny)) / 4)) };
  if (structure.radius == null) structure.radius = Math.max(1, Math.floor(Math.min(grid.nx, grid.ny, grid.nz > 1 ? grid.nz : Math.max(grid.nx, grid.ny)) / 4));
  return {
    system: draft.system || 'dielectric',
    grid,
    realdim: draft.realdim,
    structure,
    phases: draft.phases,
    load: draft.load || { vector: [1, 0, 0] },
    outdist: draft.outdist,
    solver: draft.solver || { tol: 1e-3, maxiter: 300 },
  };
}

function createDraft({ userId, chatSessionId, system = 'dielectric' }) {
  return {
    userId,
    chatSessionId,
    status: 'collecting',
    system,
    advanced: false,
    dimension: null,
    grid: null,
    realdim: null,
    structure: null,
    phases: null,
    load: null,
    outdist: null,
    editTarget: null,
    solver: { tol: 1e-3, maxiter: 300 },
  };
}

function detectSystem(text, existingSystem = null) {
  if (existingSystem && DIALOGUE_SYSTEMS[existingSystem]) return DIALOGUE_SYSTEMS[existingSystem];
  const lowered = text.toLowerCase();
  if (lowered.startsWith('/eff') || lowered.startsWith('/effective')) {
    const tokens = lowered.split(/\s+/).filter(Boolean);
    const key = tokens[1] || 'dielectric';
    return systemByAlias(key) || DIALOGUE_SYSTEMS.dielectric;
  }
  for (const system of Object.values(DIALOGUE_SYSTEMS)) {
    if (system.intent(text)) return system;
  }
  return null;
}

function systemByAlias(value) {
  const normalized = String(value || '').toLowerCase();
  for (const def of Object.values(SYSTEM_DEFS)) {
    if (def.key === normalized || def.aliases.includes(normalized)) return DIALOGUE_SYSTEMS[def.key] || null;
  }
  return null;
}

function applyMessageToDraft(draft, text) {
  const newSystem = detectSystem(text);
  if (newSystem && draft.status === 'collecting') draft.system = newSystem.key;
  if (isAdvancedRequest(text)) draft.advanced = true;
  const requestedEditTarget = detectEditTarget(text);
  if (requestedEditTarget) draft.editTarget = requestedEditTarget;
  if (/三维|3d|3D/.test(text)) draft.dimension = 3;
  if (/二维|2d|2D/.test(text)) draft.dimension = 2;

  const grid = parseGrid(text);
  if (grid) {
    draft.grid = grid;
    draft.dimension = grid.nz > 1 ? 3 : (draft.dimension || 2);
  }

  const realdim = parseRealDim(text, draft.editTarget === 'realdim');
  if (realdim) {
    draft.realdim = realdim;
    if (draft.editTarget === 'realdim') draft.editTarget = null;
  }

  const outdist = parseOutdist(text);
  if (outdist !== null) {
    draft.outdist = outdist;
    if (draft.editTarget === 'outdist') draft.editTarget = null;
  }

  const solver = parseSolver(text);
  if (solver) draft.solver = { ...draft.solver, ...solver };

  const structureType = parseStructureType(text, draft.dimension);
  const radius = parseRadius(text);
  if (structureType || radius != null) {
    draft.structure = {
      ...(draft.structure || {}),
      type: structureType || (draft.structure && draft.structure.type) || defaultStructureFor(draft.dimension),
    };
    if (radius != null) draft.structure.radius = radius;
    if (draft.editTarget === 'structure' && draft.structure.type && draft.structure.radius != null) draft.editTarget = null;
  }

  const phases = parsePhaseValues(text, draft.system);
  if (phases) {
    draft.phases = phases;
    if (draft.editTarget === 'phases') draft.editTarget = null;
  }

  const field = parseVector(text, draft.editTarget === 'field');
  if (field) {
    draft.load = { vector: field };
    if (draft.editTarget === 'field') draft.editTarget = null;
  }
  if (/默认/.test(text) && firstMissingField(draft) === 'field') {
    draft.load = { vector: [1, 0, 0] };
  }
  const completedCoreInThisMessage = Boolean(grid || structureType || radius != null);
  if (!draft.load && hasCoreCalculationFields(draft) && completedCoreInThisMessage && !isShortAnswer(text)) {
    draft.load = { vector: [1, 0, 0] };
  }
}

function parseGrid(text) {
  const match = text.match(/(?:尺寸|大小|网格)?\s*(\d+)\s*[xX×*＊]\s*(\d+)(?:\s*[xX×*＊]\s*(\d+))?/);
  if (!match) return null;
  return {
    nx: Number(match[1]),
    ny: Number(match[2]),
    nz: match[3] ? Number(match[3]) : 1,
  };
}

function parseStructureType(text, dimension) {
  if (/球|sphere/i.test(text)) return 'sphere';
  if (/圆柱|cylinder/i.test(text)) return dimension === 3 ? 'cylinder' : 'circle';
  if (/圆|circle/i.test(text)) return dimension === 3 ? 'sphere' : 'circle';
  if (/椭圆|ellipse/i.test(text)) return 'ellipse';
  if (/方|盒|box/i.test(text)) return dimension === 3 ? 'cube' : 'square';
  return null;
}

function parseRadius(text) {
  const match = text.match(/半径(?:改成|设置为|为)?\s*[:：=]?\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parsePhaseValues(text, systemKey) {
  const system = DIALOGUE_SYSTEMS[systemKey] || DIALOGUE_SYSTEMS.dielectric;
  const number = numberPattern();
  const tensorRegex = new RegExp('基体(?:张量|各向异性)?\\s*(' + number + '(?:[,，\\s]+' + number + '){5})[,，；;\\s]+夹杂(?:张量|各向异性)?\\s*(' + number + '(?:[,，\\s]+' + number + '){5})', 'i');
  const tensorMatch = text.match(tensorRegex);
  if (tensorMatch) {
    return [
      { id: 1, [system.property]: parseNumberList(tensorMatch[1]) },
      { id: 2, [system.property]: parseNumberList(tensorMatch[2]) },
    ];
  }

  const pair = text.match(new RegExp('基体\\s*(' + number + ')[,，\\s]+夹杂\\s*(' + number + ')', 'i'));
  const propertyPair = text.match(new RegExp('(?:介电常数|热导率|导热率|扩散率|电导率|磁导率|相对磁导率)\\s*(' + number + ')[,，\\s]+(' + number + ')', 'i'));
  const match = pair || propertyPair;
  if (!match) return null;
  return [
    { id: 1, [system.property]: Number(match[1]) },
    { id: 2, [system.property]: Number(match[2]) },
  ];
}

function parseVector(text, allowBare = false) {
  const components = parseComponentVector(text);
  if (components) return components;

  const directional = parseDirectionalVector(text, allowBare);
  if (directional) return directional;

  const number = numberPattern();
  const match = text.match(new RegExp('(?:电场|磁场|外场|温度梯度|浓度梯度|梯度|field|grad)\\s*(?:为|是|取|设置为)?\\s*[:：=]?\\s*\\[?\\s*(' + number + ')\\s*[,，\\s]\\s*(' + number + ')\\s*[,，\\s]\\s*(' + number + ')\\s*\\]?', 'i'));
  if (match) return match.slice(1, 4).map(Number);
  return allowBare ? parseBareVector(text) : null;
}

function firstMissingField(draft) {
  if (draft.editTarget) return draft.editTarget;
  if (!draft.dimension) return 'dimension';
  if (!draft.grid) return 'grid';
  if (draft.advanced && !draft.realdim) return 'realdim';
  if (!draft.structure || !draft.structure.type || draft.structure.radius == null) return 'structure';
  if (!isMaterialTemplateSystem(draft.system) && !draft.phases) return 'phases';
  if (!draft.load || !draft.load.vector) return 'field';
  if (draft.advanced && draft.outdist === null) return 'outdist';
  return null;
}

function hasCoreCalculationFields(draft) {
  return Boolean(
    draft.dimension &&
    draft.grid &&
    draft.structure &&
    draft.structure.type &&
    draft.structure.radius != null &&
    draft.phases
  );
}

function isShortAnswer(text) {
  return String(text || '').trim().length <= 8;
}

function questionFor(field, draft) {
  const system = DIALOGUE_SYSTEMS[draft.system] || DIALOGUE_SYSTEMS.dielectric;
  if (field === 'dimension') return '好的。先确定计算维度：你要做二维还是三维？';
  if (field === 'grid') return '网格尺寸是多少？例如 32×32 或 32×32×32。';
  if (field === 'realdim') return '物理尺寸 REALDIM 是多少？例如 1 1 1，或直接说“物理尺寸 2.5 2.5 1”。';
  if (field === 'structure') return '初始结构用哪一种？例如二维圆形夹杂或三维球形夹杂，并给出半径。';
  if (field === 'phases') return `${system.phaseQuestion} 也可以输入 6 分量张量，例如：基体张量 2 2 3 0 0 0，夹杂张量 80 80 100 0 0 0。`;
  if (field === 'field') return `${system.loadLabel}方向是多少？单位 ${system.loadUnit}，可写 [1,0,0]、x=1 y=0 z=0，或“沿 x 方向 1”。`;
  if (field === 'outdist') return '是否输出空间分布 OUTDIST？默认建议输出，可以回复“输出分布”或“不输出分布”。';
  return readySummary(draft);
}

function readySummary(draft) {
  const system = DIALOGUE_SYSTEMS[draft.system] || DIALOGUE_SYSTEMS.dielectric;
  const g = draft.grid;
  const s = draft.structure;
  const field = draft.load.vector.join(',');
  return [
    '参数已完整：',
    `系统=${system.key}，维度=${draft.dimension}，尺寸=${g.nx}×${g.ny}×${g.nz}，结构=${s.type}，半径=${s.radius}。`,
    draft.realdim ? `REALDIM=${draft.realdim.join('×')}，OUTDIST=${draft.outdist === false ? 'false' : 'true'}。` : null,
    materialSummary(draft, system, field),
    '回复“开始计算”即可运行，或者直接说要修改哪一项。',
  ].filter(Boolean).join('\n');
}

function materialSummary(draft, system, field) {
  if (isMaterialTemplateSystem(draft.system)) {
    return `材料=${system.propertyLabel}（当前使用程序示例两相模板），${system.loadLabel}=[${field}]（${system.loadUnit}）。`;
  }
  return `两相${system.propertyLabel}=${phaseValue(draft.phases[0])}/${phaseValue(draft.phases[1])}，${system.loadLabel}=[${field}]（${system.loadUnit}）。`;
}

function phaseValue(phase) {
  return phase.permittivity ?? phase.conductivity ?? phase.diffusivity ?? phase.permeability ?? phase.value;
}

function isMaterialTemplateSystem(systemKey) {
  return Boolean((DIALOGUE_SYSTEMS[systemKey] || {}).materialTemplate);
}

function isConfirmation(text) {
  return /^(开始计算|开始|运行|确认|可以计算|run)$/i.test(text.trim());
}

function draftToRequest(draft) {
  return {
    system: draft.system,
    grid: draft.grid,
    realdim: draft.realdim,
    structure: draft.structure,
    phases: draft.phases,
    load: draft.load,
    outdist: draft.outdist,
    editTarget: draft.editTarget,
    solver: draft.solver,
  };
}

function publicDraft(draft) {
  return {
    status: draft.status,
    system: draft.system,
    advanced: draft.advanced,
    dimension: draft.dimension,
    grid: draft.grid,
    realdim: draft.realdim,
    structure: draft.structure,
    phases: draft.phases,
    load: publicLoad(draft),
    outdist: draft.outdist,
    solver: draft.solver,
  };
}

function publicLoad(draft) {
  if (!draft.load) return null;
  if (draft.system === 'dielectric') return { ...draft.load, electricField: draft.load.vector };
  return draft.load;
}

function detectEditTarget(text) {
  if (!/(修改|改成|改为|设置|调整|重新)/.test(text)) return null;
  if (/(外加电场|电场|磁场|外场|温度梯度|浓度梯度|梯度|field|grad)/i.test(text)) return 'field';
  if (/(REALDIM|物理尺寸|实际尺寸|真实尺寸)/i.test(text)) return 'realdim';
  if (/(输出分布|OUTDIST)/i.test(text)) return 'outdist';
  if (/(半径|结构|形状|夹杂)/i.test(text)) return 'structure';
  if (/(介电常数|热导率|导热率|扩散率|电导率|基体|相参数|张量)/i.test(text)) return 'phases';
  return null;
}

function parseBareVector(text) {
  const number = numberPattern();
  const pattern = '^\\[?\\s*(' + number + ')\\s*[,，\\s]\\s*(' + number + ')\\s*[,，\\s]\\s*(' + number + ')\\s*\\]?$';
  const match = text.trim().match(new RegExp(pattern, 'i'));
  return match ? match.slice(1, 4).map(Number) : null;
}

function isAdvancedRequest(text) {
  return /(高级|完整|全部参数|所有参数|parameter\.in|REALDIM|OUTDIST|物理尺寸|实际尺寸|收敛精度|最大迭代|张量)/i.test(text);
}

function parseRealDim(text, allowBare = false) {
  const number = numberPattern();
  const match = text.match(new RegExp('(?:REALDIM|物理尺寸|实际尺寸|真实尺寸)\\s*(?:为|是|取|设置为)?\\s*[:：=]?\\s*(' + number + ')\\s*[xX×*＊,，\\s]\\s*(' + number + ')\\s*[xX×*＊,，\\s]\\s*(' + number + ')', 'i'));
  if (match) return match.slice(1, 4).map(Number);
  return allowBare ? parseBareVector(text) : null;
}
function parseOutdist(text) {
  if (/(不输出|无需输出|关闭|false|no|off)\s*(?:空间)?分布|OUTDIST\s*(?:false|0|no|off)/i.test(text)) return false;
  if (/(输出|保存|打开|true|yes|on)\s*(?:空间)?分布|OUTDIST\s*(?:true|1|yes|on)/i.test(text)) return true;
  return null;
}

function parseSolver(text) {
  const solver = {};
  const number = numberPattern();
  const tol = text.match(new RegExp('(?:tol|收敛精度|容差|误差)\\s*(?:为|是|取|设置为)?\\s*[:：=]?\\s*(' + number + ')', 'i'));
  const maxiter = text.match(/(?:maxiter|最大迭代|迭代次数)\s*(?:为|是|取|设置为)?\s*[:：=]?\s*(\d+)/i);
  if (tol) solver.tol = Number(tol[1]);
  if (maxiter) solver.maxiter = Number(maxiter[1]);
  return Object.keys(solver).length ? solver : null;
}

function parseComponentVector(text) {
  const number = numberPattern();
  const matches = [...text.matchAll(new RegExp('([xyzXYZ])\\s*[:：=]\\s*(' + number + ')', 'g'))];
  if (matches.length < 3) return null;
  const vector = [0, 0, 0];
  for (const match of matches) {
    const index = { x: 0, y: 1, z: 2 }[match[1].toLowerCase()];
    vector[index] = Number(match[2]);
  }
  return vector;
}

function parseDirectionalVector(text, allowBare = false) {
  const number = numberPattern();
  const prefix = allowBare ? '(?:(?:电场|磁场|外场|温度梯度|浓度梯度|梯度|field|grad).*?)?' : '(?:电场|磁场|外场|温度梯度|浓度梯度|梯度|field|grad).*?';
  const match = text.match(new RegExp(prefix + '(?:沿\\s*)?([xyzXYZ])\\s*(?:轴|方向)?\\s*(?:为|=|:|：)?\\s*(' + number + ')', 'i'));
  if (!match) return null;
  const vector = [0, 0, 0];
  vector[{ x: 0, y: 1, z: 2 }[match[1].toLowerCase()]] = Number(match[2]);
  return vector;
}

function parseNumberList(text) {
  return String(text).split(/[,，\s]+/).filter(Boolean).map(Number);
}

function numberPattern() {
  return '[-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';
}

function defaultStructureFor(dimension) {
  return dimension === 3 ? 'sphere' : 'circle';
}

function draftKey(userId, chatSessionId) {
  return `${userId}::${chatSessionId || 'default'}`;
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { createEfffieldDialogueService };
