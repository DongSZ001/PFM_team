'use strict';

const { createFerroJobService } = require('./job-service');
const {
  resolveFerroMaterialModel,
  listEnrichedFerroMaterialModels,
} = require('./material-models');
const {
  buildMaterialCards,
  expandCardsToLegacyMaterials,
  findCatalogVariant,
  findFamilyById,
  findFamilyByText,
  presetFromCatalog,
} = require('./material-card-catalog');

const COMPONENTS = new Set(['px', 'py', 'pz']);
const VISUALIZATION_MODES = new Set(['component', 'inplane_angle', 'variant_111']);
const BIG_GRID_WARNING = 128 * 128 * 4;
const MATERIAL_FIRST_MESSAGE = '我理解你想模拟铁电畴，请先选择材料，我会帮你生成可运行草稿。';

function createFerroDialogueService({ jobService = createFerroJobService(), drafts = new Map() } = {}) {
  async function handleMessage({ userId, chatSessionId = 'default', message = '', action = null, materialId = null, materialGroupId = null, variantId = null, presetId = null, patch = null, clientPreferences = null, context = null } = {}) {
    if (!userId) throw validationError('userId is required');
    const text = String(message || '').trim();
    if (!text && !action) throw validationError('message is required');

    const key = draftKey(userId, chatSessionId);
    const existing = drafts.get(key);

    if (action === 'show_materials') {
      const filterQuery = materialId || text || null;
      return materialSelectionResponse(filterQuery);
    }
    if (action === 'reset_draft') {
      drafts.delete(key);
      return { type: 'ferro_dialogue', reply: '已重置铁电相场计算草稿。请选择一个材料模型；选择后会自动生成可运行的计算草稿。', draft: null, ui: { component: 'MaterialPresetGrid' } };
    }
    if (action === 'apply_material_preset') {
      const draft = existing || createDraft({ userId, chatSessionId });
      const before = structuredDraft(draft);
      applyMaterialPreset(draft, materialId, presetId || 'quick_2d', { overwritePreset: true, materialGroupId, variantId });
      fillFerroDraftDefaults(draft, clientPreferences);
      const validation = validateDraft(draft, presetId === 'custom');
      draft.status = validation.ready ? 'ready' : 'collecting';
      drafts.set(key, draft);
      return buildDraftResponse({ draft, validation, presetId: presetId || 'quick_2d', diff: diffDrafts(before, structuredDraft(draft), 'user_selection') });
    }
    if (action === 'patch_draft' || action === 'continue_from_result') {
      const draft = existing || createDraft({ userId, chatSessionId });
      if (context) applyContext(draft, context);
      const before = structuredDraft(draft);
      applyPatch(draft, patch || {}, action === 'continue_from_result' ? 'result_context' : 'user_patch');
      const validation = validateDraft(draft);
      draft.status = validation.ready ? 'ready' : 'collecting';
      drafts.set(key, draft);
      return buildDiffResponse({ draft, validation, diff: diffDrafts(before, structuredDraft(draft), action === 'continue_from_result' ? 'result_context' : 'user_patch') });
    }

    const intent = detectIntent(text, existing);
    if (!intent && !existing) return null;

    if (!existing) {
      const materialQuery = materialFilterFromText(text);
      const explicitModel = parseMaterialModel(text);
      const explicitVariant = parseCatalogVariantFromText(text);
      if (!explicitModel && !materialQuery) return materialSelectionResponse(null);
      if (explicitVariant) {
        const draft = createDraft({ userId, chatSessionId });
        const before = structuredDraft(draft);
        applyMaterialPreset(draft, explicitVariant.variant.materialModelId, 'quick_2d', { overwritePreset: true, text, materialGroupId: explicitVariant.family.familyId, variantId: explicitVariant.variant.variantId });
        fillFerroDraftDefaults(draft, clientPreferences);
        const validation = validateDraft(draft);
        draft.status = validation.ready ? 'ready' : 'collecting';
        drafts.set(key, draft);
        return buildDraftResponse({ draft, validation, presetId: 'quick_2d', diff: diffDrafts(before, structuredDraft(draft), 'user_selection') });
      }
      const familyOnly = parseCatalogFamilyFromText(text);
      if (familyOnly && !isLegacyBfoModelReference(text)) {
        return materialSelectionResponse(familyOnly.familyId);
      }
      const matches = filterFerroMaterials(materialQuery || explicitModel.modelKey);
      if (matches.length === 1 || (explicitModel && /10004|bens|haun|generate_input/i.test(text))) {
        const selected = matches.find((item) => item.modelKey === explicitModel?.modelKey) || matches[0] || listEnrichedFerroMaterialModels().find((item) => item.modelKey === explicitModel?.modelKey);
        const draft = createDraft({ userId, chatSessionId });
        const before = structuredDraft(draft);
        applyMaterialPreset(draft, selected.modelKey, 'quick_2d', { overwritePreset: true, text });
        fillFerroDraftDefaults(draft, clientPreferences);
        const validation = validateDraft(draft);
        draft.status = validation.ready ? 'ready' : 'collecting';
        drafts.set(key, draft);
        return buildDraftResponse({ draft, validation, presetId: 'quick_2d', diff: diffDrafts(before, structuredDraft(draft), 'user_selection') });
      }
      return materialSelectionResponse(materialQuery || (explicitModel && explicitModel.materialKey));
    }

    const draft = existing || createDraft({ userId, chatSessionId });

    const before = structuredDraft(draft);
    const changed = applyMessageToDraft(draft, text);
    drafts.set(key, draft);

    if (isConfirmation(text) && draft.status === 'ready') {
      draft.status = 'running';
      try {
        const result = await jobService.createAndRunJob({ userId, chatSessionId, request: draftToRequest(draft) });
        drafts.delete(key);
        return { type: 'ferro_result', ...result };
      } catch (err) {
        draft.status = 'ready';
        drafts.set(key, draft);
        throw err;
      }
    }

    const validation = validateDraft(draft);
    draft.status = validation.ready ? 'ready' : 'collecting';

    if (existing && before && before.status === 'ready' && (changed || diffDrafts(before, structuredDraft(draft), 'user_message').length)) {
      return buildDiffResponse({ draft, validation, diff: diffDrafts(before, structuredDraft(draft), 'user_message') });
    }

    if (validation.missingFields.length) {
      return { type: 'ferro_dialogue', reply: questionFor(validation.missingFields[0]), message: questionFor(validation.missingFields[0]), draft: publicLegacyDraft(draft), validation };
    }

    return { type: 'ferro_dialogue', reply: readySummary(draft), message: readySummary(draft), draft: publicLegacyDraft(draft), validation };
  }

  return { handleMessage };
}

function materialSelectionResponse(filterQuery = null) {
  const cards = buildMaterialCards(listEnrichedFerroMaterialModels(), { filter: filterQuery });
  return {
    type: 'ferro_materials',
    message: MATERIAL_FIRST_MESSAGE,
    reply: MATERIAL_FIRST_MESSAGE,
    draft: null,
    filter: { query: filterQuery || null },
    cards,
    materials: cards.length ? expandCardsToLegacyMaterials(cards) : filterFerroMaterials(filterQuery),
  };
}

function filterFerroMaterials(query) {
  const materials = listEnrichedFerroMaterialModels();
  if (!query) return materials;
  const tokens = materialFilterTokens(query);
  if (!tokens.length) return materials;
  return materials.filter((item) => {
    const haystack = materialSearchText(item);
    return tokens.length === 1 ? haystack.includes(tokens[0]) : tokens.every((token) => haystack.includes(token));
  });
}

function materialSearchText(item) {
  return [
    item.id, item.model, item.modelKey, item.materialKey, item.displayName, item.modelName,
    item.family, item.title, item.subtitle, item.formula, ...(item.tags || []), ...(item.badges || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function materialFilterTokens(query) {
  const normalized = String(query || '')
    .replace(/铁电|畴结构|畴|模拟|计算|材料|模型|相场|phase|field/gi, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [];
  const aliases = [];
  for (const token of normalized) {
    if (token === '铁酸铋') aliases.push('bfo', 'bifeo3');
    else if (token === '钛酸钡') aliases.push('bto', 'batio3');
    else if (token === '锆钛酸铅') aliases.push('pzt');
    else if (!['the', 'a', 'an'].includes(token)) aliases.push(token);
  }
  return aliases;
}

function materialFilterFromText(text) {
  const variant = parseCatalogVariantFromText(text);
  if (variant) return variant.family.familyId;
  const family = parseCatalogFamilyFromText(text);
  if (family) return family.familyId;
  const model = parseMaterialModel(text);
  if (model) {
    if (/10004|bens|haun|generate_input/i.test(text)) return model.modelKey;
    return model.materialKey;
  }
  return null;
}

function parseCatalogVariantFromText(text) {
  return findCatalogVariant({ text });
}

function parseCatalogFamilyFromText(text) {
  return findFamilyByText(text);
}

function createDraft({ userId, chatSessionId }) {
  return {
    userId,
    chatSessionId,
    status: 'collecting',
    system: 'ferroelectric',
    material: null,
    grid: null,
    run: null,
    initial: { type: 'random_small_perturbation', magn: 0.1, n_random: 15 },
    field: { enabled: false, appel30: 0.009, appel31: 0.001 },
    visualization: { mode: 'component', component: 'pz', plane: 'auto', inplaneComponents: 'auto', slice: 'xz', steps: 'all', outputPolicy: 'selected_only' },
    sources: { initial: 'global_default', field: 'global_default', visualization: 'global_default' },
    presetId: null,
  };
}

function detectIntent(text, existing) {
  if (existing) return true;
  const lowered = text.toLowerCase();
  return /(铁电|畴结构|极化分布|相场模拟|网格|输出间隔|面内角度|角度|箭头|可视化|美化|极化取向|再跑|对比)/.test(text) || parseMaterialModel(text) || parseGrid(text) || parseRun(text) || parseVisualizationMode(text) || lowered.startsWith('/ferro');
}

function applyMessageToDraft(draft, text) {
  let changed = false;
  const materialModel = parseMaterialModel(text);
  const explicitGrid = parseGrid(text);
  const explicitRun = parseRun(text);
  if (materialModel) {
    if (!explicitGrid && !explicitRun && !draft.grid && !draft.run) {
      applyMaterialPreset(draft, materialModel.modelKey, 'quick_2d', { overwritePreset: false, text });
    } else {
      draft.material = buildMaterialDraft({ materialKey: materialModel.materialKey, modelKey: materialModel.modelKey, text });
      draft.sources.material = 'user_message';
    }
    changed = true;
  }
  if (/默认/.test(text) && firstMissingField(draft) === 'material') {
    draft.material = buildMaterialDraft({ materialKey: 'pmn_pt', modelKey: 'pmn_pt_default', text });
    draft.sources.material = 'global_default';
    changed = true;
  }
  if (explicitGrid) {
    draft.grid = explicitGrid;
    draft.sources.grid = 'user_message';
    changed = true;
  }
  if (explicitRun) {
    draft.run = normalizeRun({ ...(draft.run || {}), ...explicitRun });
    draft.sources.run = 'user_message';
    changed = true;
  }
  const materialParams = parseMaterialParams(text);
  if (materialParams && draft.material) {
    draft.material = normalizeMaterial({ ...draft.material, ...materialParams });
    if (materialParams.xf !== undefined) draft.sources.xf = 'user_message';
    if (materialParams.temperature !== undefined || materialParams.tem !== undefined) draft.sources.temperature = 'user_message';
    changed = true;
  }
  const visualization = parseVisualizationUpdate(text);
  if (visualization) {
    draft.visualization = normalizeVisualization({ ...draft.visualization, ...visualization }, draft.grid);
    draft.sources.visualization = 'user_message';
    changed = true;
  }
  return changed;
}

function applyMaterialPreset(draft, materialId, presetId, { overwritePreset = false, text = '', materialGroupId = null, variantId = null } = {}) {
  const materials = listEnrichedFerroMaterialModels();
  const catalogSelection = findCatalogVariant({ variantId, materialModelId: materialId, familyId: materialGroupId });
  const family = catalogSelection && catalogSelection.family;
  const variant = catalogSelection && catalogSelection.variant;
  const modelId = variant && variant.materialModelId || materialId;
  const material = materials.find((item) => item.id === modelId || item.modelKey === modelId || item.materialKey === modelId)
    || (variant ? catalogVariantToMaterial(family, variant) : null)
    || materials.find((item) => item.id === materialId || item.modelKey === materialId || item.materialKey === materialId)
    || materials.find((item) => item.id === 'pmn_pt_default');
  if (!material) throw validationError('材料模型不存在');
  const materialPreset = (material.presets || []).find((item) => item.id === presetId) || (material.presets || []).find((item) => item.id === 'quick_2d');
  const preset = materialPreset || presetFromCatalog(presetId);
  if (!preset) throw validationError('材料预设不存在');
  draft.material = buildMaterialDraft({ materialKey: material.materialKey, modelKey: material.modelKey, text, materialMeta: material, family, variant });
  draft.material.family = family ? family.title : material.family;
  draft.material.label = family && variant ? family.title + ' / ' + variant.title : material.title + ' / ' + material.subtitle;
  draft.sources.material = 'user_selection';
  draft.sources.variant = variant ? 'user_selection' : undefined;
  draft.sources.xf = 'material_default';
  draft.sources.temperature = 'material_default';
  draft.presetId = preset.id;
  if (!preset.custom || overwritePreset) {
    if (preset.grid && (overwritePreset || !draft.grid)) {
      draft.grid = { ...preset.grid };
      draft.sources.grid = preset.id === 'standard_2d' ? 'standard_preset' : 'quick_preset';
    }
    if (preset.run && (overwritePreset || !draft.run)) {
      draft.run = normalizeRun(preset.run);
      draft.sources.run = preset.id === 'standard_2d' ? 'standard_preset' : 'quick_preset';
    }
    const defaultVisualization = family && family.defaultVisualization
      ? family.defaultVisualization
      : (materialPreset && materialPreset.visualization) || preset.visualization;
    if (defaultVisualization && (overwritePreset || !draft.visualization?.component)) {
      draft.visualization = normalizeVisualization({ ...draft.visualization, ...defaultVisualization }, draft.grid);
      draft.sources.visualization = preset.id === 'standard_2d' ? 'standard_preset' : 'quick_preset';
    }
    if (preset.initial) {
      draft.initial = { ...draft.initial, ...preset.initial };
      draft.sources.initial = 'global_default';
    }
    if (preset.field) {
      draft.field = { ...draft.field, ...preset.field };
      draft.sources.field = 'global_default';
    }
  }
}

function isLegacyBfoModelReference(text) {
  return /10004|bens|bfo\s*bens|bfo\s*10004/i.test(String(text || ''));
}

function catalogVariantToMaterial(family, variant) {
  return {
    id: variant.materialModelId,
    modelKey: variant.materialModelId,
    materialKey: family.familyId,
    displayName: family.title,
    modelName: variant.title,
    title: family.title,
    subtitle: variant.title,
    family: family.title,
    defaultParams: { temperature: variant.temperature || family.temperature, xf: variant.legacyXf },
    defaultXf: variant.legacyXf,
    defaultTem: variant.temperature || family.temperature,
    composition: family.composition,
  };
}

function fillFerroDraftDefaults(draft, clientPreferences) {
  if (!draft.visualization) draft.visualization = { mode: 'component', component: 'pz', plane: 'auto', inplaneComponents: 'auto', slice: 'xz', steps: 'all', outputPolicy: 'selected_only' };
  draft.visualization = normalizeVisualization(draft.visualization, draft.grid);
  if (!draft.initial) draft.initial = { type: 'random_small_perturbation', magn: 0.1, n_random: 15 };
  if (!draft.field) draft.field = { enabled: false };
  if (clientPreferences && !draft.grid && clientPreferences.grid) {
    draft.grid = normalizeGrid(clientPreferences.grid);
    draft.sources.grid = 'client_preferences';
  }
  if (clientPreferences && !draft.run && clientPreferences.run) {
    draft.run = normalizeRun(clientPreferences.run);
    draft.sources.run = 'client_preferences';
  }
  if (clientPreferences && clientPreferences.visualization && !draft.visualization.component) {
    draft.visualization = normalizeVisualization({ ...draft.visualization, ...clientPreferences.visualization }, draft.grid);
    draft.sources.visualization = 'client_preferences';
  }
}

function parseGrid(text) {
  const compact = String(text || '').match(/(?:尺寸|大小|网格)?\s*(\d+)\s*[xX×*＊]\s*(\d+)(?:\s*[xX×*＊]\s*(\d+))?/);
  if (compact) {
    const a = Number(compact[1]);
    const b = Number(compact[2]);
    const c = compact[3] ? Number(compact[3]) : null;
    if (c) return { nx: a, ny: b, nz: c };
    return /3d|三维/i.test(text) ? { nx: a, ny: b, nz: b } : { nx: a, ny: 1, nz: b };
  }
  const spaced = String(text || '').match(/(?:尺寸|大小|网格)\s*(\d+)\s+(\d+)\s+(\d+)/);
  if (spaced) return { nx: Number(spaced[1]), ny: Number(spaced[2]), nz: Number(spaced[3]) };
  return null;
}

function parseRun(text) {
  const normalized = String(text || '').replace(/一万/g, '10000').replace(/两万/g, '20000').replace(/二万/g, '20000').replace(/(\d+(?:\.\d+)?)\s*万/g, (_, n) => String(Math.round(Number(n) * 10000)));
  const kstepMatch = normalized.match(/(?:跑|运行|计算|总步数|步数)\s*(\d+)\s*步?/);
  const kprntMatch = normalized.match(/(?:每(?:隔)?|输出间隔|output\s*interval)\s*(\d+)\s*步?(?:输出|保存|打印)?/i);
  if (!kstepMatch && !kprntMatch) return null;
  const out = {};
  if (kstepMatch) out.steps = Number(kstepMatch[1]);
  if (kprntMatch) out.outputInterval = Number(kprntMatch[1]);
  return out;
}

function parseMaterial(text) {
  const materialModel = parseMaterialModel(text);
  if (/默认/.test(text) && /(材料|温度|成分|PMN)/i.test(text)) return buildMaterialDraft({ materialKey: 'pmn_pt', modelKey: 'pmn_pt_default', text });
  const params = parseMaterialParams(text);
  if (!materialModel && !params) return null;
  return buildMaterialDraft({ materialKey: materialModel?.materialKey || 'pmn_pt', modelKey: materialModel?.modelKey || 'pmn_pt_default', text });
}

function parseMaterialModel(text) {
  if (/PZT|锆钛酸铅/i.test(text)) return { materialKey: 'pzt', modelKey: 'pzt_haun_1989' };
  if (/BFO|BiFeO3|铁酸铋/i.test(text)) {
    if (/10004/i.test(text)) return { materialKey: 'bfo', modelKey: 'bfo_10004' };
    return { materialKey: 'bfo', modelKey: 'bfo_bens_coefficients' };
  }
  if (/BTO|BaTiO3|钛酸钡/i.test(text)) return { materialKey: 'bto', modelKey: 'bto_generate_input' };
  if (/PMN[-_\s]?PT/i.test(text)) return { materialKey: 'pmn_pt', modelKey: 'pmn_pt_default' };
  return null;
}

function parseMaterialParams(text) {
  const xf = String(text || '').match(/(?:xf|成分)\s*[:：=]?\s*(\d+(?:\.\d+)?)/i);
  const tem = String(text || '').match(/(?:温度|tem|T)\s*[:：=]?\s*(\d+(?:\.\d+)?)/i);
  if (!xf && !tem) return null;
  const out = {};
  if (xf) out.xf = Number(xf[1]);
  if (tem) out.temperature = Number(tem[1]);
  return out;
}

function buildMaterialDraft({ materialKey, modelKey, text = '', materialMeta = null, family = null, variant = null }) {
  const model = resolveFerroMaterialModel({ materialKey, modelKey });
  const params = parseMaterialParams(text) || {};
  const enriched = materialMeta || listEnrichedFerroMaterialModels().find((item) => item.modelKey === model.modelKey) || {};
  const temperature = params.temperature !== undefined ? params.temperature : (enriched.defaultParams && enriched.defaultParams.temperature !== undefined ? enriched.defaultParams.temperature : model.defaultInputs.tem);
  return normalizeMaterial({
    id: model.modelKey,
    family: enriched.family || model.displayName,
    model: model.modelKey,
    label: (enriched.title || model.displayName) + ' / ' + (enriched.subtitle || model.modelName),
    materialKey: model.materialKey,
    modelKey: model.modelKey,
    xf: params.xf !== undefined ? params.xf : (variant && variant.legacyXf !== undefined ? variant.legacyXf : model.defaultInputs.xf),
    temperature: variant && variant.temperature || temperature,
    materialGroupId: family && family.familyId,
    variantId: variant && variant.variantId,
    orderLabel: variant && variant.orderLabel,
    compositionDisplay: variant && variant.compositionDisplay,
    referenceLabel: variant && variant.referenceLabel,
    internalParams: variant && variant.legacyXf !== undefined ? { legacyXf: variant.legacyXf } : undefined,
    cardVariant: variant ? { ...variant } : undefined,
    composition: family && family.composition && family.composition.enabled
      ? { ...family.composition, value: variant && variant.compositionValue, display: variant && variant.compositionDisplay, legacyXf: variant && variant.legacyXf }
      : enriched.composition || { enabled: false, key: null, label: null, value: null },
    showCompositionInDraft: family ? Boolean(family.composition && family.composition.enabled) : Boolean(enriched.showCompositionInDraft),
  });
}

function normalizeMaterial(material) {
  if (!material) return null;
  const modelKey = material.modelKey || material.model || material.id;
  const materialKey = material.materialKey;
  const xf = material.xf !== undefined ? Number(material.xf) : undefined;
  const temperature = material.temperature !== undefined ? Number(material.temperature) : Number(material.tem);
  return {
    ...material,
    id: modelKey,
    model: modelKey,
    modelKey,
    materialKey,
    xf,
    temperature,
    tem: temperature,
    composition: material.composition || (['pmn_pt', 'pzt'].includes(materialKey) ? { enabled: true, key: 'xf', label: 'xf', value: xf } : { enabled: false, key: null, label: null, value: null }),
    showCompositionInDraft: material.showCompositionInDraft !== undefined ? material.showCompositionInDraft : ['pmn_pt', 'pzt'].includes(materialKey),
  };
}

function parseComponent(text) {
  if (/px/i.test(text)) return 'px';
  if (/py/i.test(text)) return 'py';
  if (/pz/i.test(text)) return 'pz';
  return null;
}

function parseVisualizationMode(text) {
  if (/八变体s*[+＋加和]?s*箭头|八变体.*箭头|variant_111_arrow/i.test(text)) return 'variant_111';
  if (/八变体|111.*变体|<111>|variant_111/i.test(text)) return 'variant_111';
  if (/角度s*[+＋加和]?s*箭头|加箭头|箭头叠加|angles*arrow/i.test(text)) return 'inplane_angle';
  if (/面内角度|角度颜色图|极化方向颜色图|方向色轮|颜色表示极化方向|别只看s*Px|可视化美化|极化取向更直观/i.test(text)) return 'inplane_angle';
  return null;
}

function parseVisualizationUpdate(text) {
  const mode = parseVisualizationMode(text);
  if (mode) return { mode, component: null };
  const component = parseComponent(text);
  if (component) return { mode: 'component', component };
  return null;
}

function applyPatch(draft, patch, source) {
  for (const [path, value] of Object.entries(flattenPatch(patch))) {
    if (path === 'grid' && value && typeof value === 'object') draft.grid = normalizeGrid(value);
    else if (path.startsWith('grid.')) draft.grid = normalizeGrid({ ...(draft.grid || {}), [path.split('.')[1]]: value });
    else if (path === 'run' && value && typeof value === 'object') draft.run = normalizeRun({ ...(draft.run || {}), ...value });
    else if (path.startsWith('run.')) draft.run = normalizeRun({ ...(draft.run || {}), [path.split('.')[1]]: value });
    else if (path === 'visualization.component') draft.visualization = normalizeVisualization({ ...draft.visualization, mode: 'component', component: String(value).toLowerCase() }, draft.grid);
    else if (path === 'visualization.mode') draft.visualization = normalizeVisualization({ ...draft.visualization, mode: String(value).toLowerCase(), component: String(value).toLowerCase() === 'component' ? (draft.visualization && draft.visualization.component) || 'pz' : null }, draft.grid);
    else if (path === 'visualization' && value && typeof value === 'object') draft.visualization = normalizeVisualization({ ...draft.visualization, ...value }, draft.grid);
    else if (path.startsWith('material.')) draft.material = normalizeMaterial({ ...(draft.material || {}), [path.split('.')[1]]: value });
  }
  draft.sources.patch = source;
}

function flattenPatch(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !key.includes('.')) {
      for (const [childKey, childValue] of Object.entries(value)) out[key + '.' + childKey] = childValue;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function validateDraft(draft, custom = false) {
  const missingFields = [];
  const warnings = [];
  const errors = [];
  if (!draft.material) missingFields.push('材料');
  if (!draft.grid) missingFields.push('网格');
  if (!draft.run) missingFields.push('总步数');
  const g = draft.grid;
  if (g) {
    for (const key of ['nx', 'ny', 'nz']) if (!Number.isInteger(g[key]) || g[key] <= 0) errors.push('网格 ' + key + ' 必须是正整数。');
    if (g.nx * g.ny * g.nz > BIG_GRID_WARNING) warnings.push('网格总点数较大，计算可能较慢。');
  }
  const r = draft.run;
  if (r) {
    if (!Number.isInteger(r.steps) || r.steps <= 0) errors.push('总步数必须是正整数。');
    if (!Number.isInteger(r.outputInterval) || r.outputInterval <= 0) errors.push('输出间隔必须是正整数。');
    if (Number.isInteger(r.steps) && Number.isInteger(r.outputInterval) && r.outputInterval > r.steps) errors.push('输出间隔不能大于总步数。请修改输出间隔或总步数。');
    if (Number.isInteger(r.steps) && Number.isInteger(r.outputInterval) && r.outputInterval <= r.steps && r.steps % r.outputInterval !== 0) warnings.push('总步数不能被输出间隔整除，最后一个输出可能不在终点。');
  }
  if (draft.visualization) {
    draft.visualization = normalizeVisualization(draft.visualization, draft.grid);
    if (!VISUALIZATION_MODES.has(draft.visualization.mode)) errors.push('可视化方式必须是 component / inplane_angle / variant_111。');
    if (draft.visualization.mode === 'component' && !COMPONENTS.has(String(draft.visualization.component || '').toLowerCase())) errors.push('component 模式下可视化分量必须是 px / py / pz。');
    if (draft.visualization.mode === 'inplane_angle' && !Array.isArray(draft.visualization.inplaneComponents)) warnings.push('面内模式将根据网格自动选择面内分量。');
  }
  if (draft.material) {
    try { resolveFerroMaterialModel(draft.material); } catch { errors.push('材料模型不在可用列表中。'); }
  }
  if (custom && (!draft.grid || !draft.run)) {
    if (!missingFields.includes('网格') && !draft.grid) missingFields.push('网格');
    if (!missingFields.includes('总步数') && !draft.run) missingFields.push('总步数');
  }
  return { ready: missingFields.length === 0 && errors.length === 0, missingFields, warnings, errors };
}

function buildDraftResponse({ draft, validation, presetId, diff }) {
  const material = draft.material || {};
  const presetName = presetId === 'standard_2d' ? '标准 2D 预设' : presetId === 'custom' ? '自定义预设' : '快速 2D 预设';
  const readyText = validation.ready ? '当前配置可直接运行。' : missingMessage(validation);
  return {
    type: 'ferro_draft',
    message: '已应用 ' + (material.label || material.modelKey || '材料模型') + ' 的' + presetName + '，' + readyText,
    reply: '已应用 ' + (material.label || material.modelKey || '材料模型') + ' 的' + presetName + '，' + readyText,
    draft: structuredDraft(draft),
    ui: buildDraftUi(draft, validation),
    diff: diff || [],
    validation,
  };
}

function buildDiffResponse({ draft, validation, diff }) {
  const firstError = validation.errors[0];
  const message = firstError || (validation.ready ? '已更新计算草稿。' : missingMessage(validation));
  return { type: 'ferro_diff', message, reply: message, diff: diff || [], draft: structuredDraft(draft), ui: buildDraftUi(draft, validation), validation };
}

function buildDraftUi(draft, validation) {
  return {
    component: 'FerroDraftCard',
    primaryAction: { label: '开始计算', enabled: Boolean(validation.ready), action: 'start_job' },
    secondaryActions: [
      { label: '修改网格', action: 'edit_grid' },
      { label: '修改步数', action: 'edit_run' },
      { label: 'Px', action: 'patch_draft', patch: { 'visualization.component': 'px' } },
      { label: 'Py', action: 'patch_draft', patch: { 'visualization.component': 'py' } },
      { label: 'Pz', action: 'patch_draft', patch: { 'visualization.component': 'pz' } },
      { label: '面内', action: 'patch_draft', patch: { 'visualization.mode': 'inplane_angle' } },
      { label: 'R相变体', action: 'patch_draft', patch: { 'visualization.mode': 'variant_111' } },
      { label: '快速预览', action: 'apply_material_preset', materialId: draft.material && draft.material.id, presetId: 'quick_2d' },
      { label: '标准计算', action: 'apply_material_preset', materialId: draft.material && draft.material.id, presetId: 'standard_2d' },
      { label: '高级参数', action: 'open_advanced_panel' },
      { label: '重置', action: 'reset_draft' },
    ],
  };
}

function diffDrafts(before, after, source) {
  const checks = [
    ['material', '材料', before?.material?.label, after?.material?.label],
    ['grid', '网格', formatGrid(before?.grid), formatGrid(after?.grid)],
    ['run.steps', '总步数', before?.run?.steps, after?.run?.steps],
    ['run.outputInterval', '输出间隔', before?.run?.outputInterval, after?.run?.outputInterval],
    ['visualization.mode', '可视化方式', formatVisualization(before?.visualization), formatVisualization(after?.visualization)],
    ['visualization.component', '可视化分量', before?.visualization?.component, after?.visualization?.component],
  ];
  return checks.filter(([, , from, to]) => from !== to && to !== undefined && to !== null).map(([path, label, from, to]) => ({ path, label, from: from ?? '未设置', to, source }));
}

function structuredDraft(draft) {
  const run = draft.run && normalizeRun(draft.run);
  return {
    status: draft.status,
    system: draft.system,
    material: draft.material && normalizeMaterial(draft.material),
    grid: draft.grid && normalizeGrid(draft.grid),
    run,
    visualization: normalizeVisualization(draft.visualization, draft.grid),
    parentJobId: draft.parentJobId || null,
    lastJobId: draft.lastJobId || null,
    initial: draft.initial,
    field: draft.field,
    sources: draft.sources || {},
    presetId: draft.presetId,
  };
}

function publicLegacyDraft(draft) {
  return {
    status: draft.status,
    system: draft.system,
    grid: draft.grid && normalizeGrid(draft.grid),
    material: draft.material && {
      materialKey: draft.material.materialKey,
      modelKey: draft.material.modelKey,
      xf: draft.material.xf,
      tem: draft.material.tem,
    },
    run: draft.run && { kstep: draft.run.steps, kprnt: draft.run.outputInterval },
    initial: { magn: draft.initial.magn, n_random: draft.initial.n_random },
    field: { appel30: draft.field.appel30, appel31: draft.field.appel31 },
    visualization: draft.visualization,
  };
}

function firstMissingField(draft) {
  if (!draft.grid) return 'grid';
  if (!draft.run) return 'run';
  if (!draft.material) return 'material';
  return null;
}

function questionFor(field) {
  if (field === 'grid' || field === '网格') return '我已识别为铁电相场计算任务。请选择一个材料模型；选择后会自动生成可运行的计算草稿，网格和步数也可以稍后修改。';
  if (field === 'run' || field === '总步数') return '当前草稿还缺少：总步数。可以直接输入“128×1×128，跑20000步，每5000步输出”。';
  if (field === 'material' || field === '材料') return '当前草稿还缺少：材料。请选择一个材料模型，或输入 PMN-PT / BTO / PZT Haun / BFO Bens；选择后会自动补齐推荐网格和步数。';
  return '请继续补充铁电计算参数。';
}

function missingMessage(validation) {
  if (!validation.missingFields.length) return '请检查参数。';
  return '当前草稿还缺少：' + validation.missingFields.join('、') + '。可以直接输入“128×1×128，跑20000步，每5000步输出”。';
}

function readySummary(draft) {
  const g = draft.grid;
  return [
    '铁电相场计算草稿已就绪。',
    '网格=' + g.nx + '×' + g.ny + '×' + g.nz + '，步数=' + draft.run.steps + '，输出间隔=' + draft.run.outputInterval + '。',
    '材料=' + materialDisplayName(draft.material) + '，模型=' + materialModelName(draft.material) + '，xf=' + draft.material.xf + '，温度=' + draft.material.tem + 'K，可视化=' + formatVisualization(draft.visualization) + '。',
    '点击“开始计算”或回复“开始计算”即可运行，或者直接说要修改哪一项。',
  ].join('\n');
}

function materialDisplayName(material) { return resolveFerroMaterialModel(material).displayName; }
function materialModelName(material) { return resolveFerroMaterialModel(material).modelName; }
function isConfirmation(text) { return /^(开始计算|开始|运行|确认|可以计算|run)$/i.test(String(text || '').trim()); }
function draftToRequest(draft) { return { grid: normalizeGrid(draft.grid), material: publicLegacyDraft(draft).material, run: publicLegacyDraft(draft).run, initial: publicLegacyDraft(draft).initial, field: publicLegacyDraft(draft).field, visualization: draft.visualization }; }
function isShortAnswer(text) { return String(text || '').trim().length <= 8; }
function draftKey(userId, chatSessionId) { return userId + '::' + (chatSessionId || 'default'); }
function validationError(message, statusCode = 400) { const err = new Error(message); err.statusCode = statusCode; return err; }
function normalizeGrid(grid) { return grid ? { nx: Number(grid.nx), ny: Number(grid.ny), nz: Number(grid.nz) } : null; }
function normalizeVisualization(visualization, grid) {
  const input = visualization || {};
  const rawMode = String(input.mode || '').toLowerCase();
  const normalizedMode = rawMode === 'angle_arrow' || rawMode === 'inplane_angle_arrow'
    ? 'inplane_angle'
    : rawMode === 'variant_111_arrow'
      ? 'variant_111'
      : rawMode;
  const mode = VISUALIZATION_MODES.has(normalizedMode) ? normalizedMode : (input.component ? 'component' : 'component');
  const component = mode === 'component' ? String(input.component || 'pz').toLowerCase() : null;
  return {
    mode,
    component,
    plane: input.plane || 'auto',
    inplaneComponents: Array.isArray(input.inplaneComponents) ? input.inplaneComponents : detectInplaneComponents(grid),
    slice: input.slice || 'xz',
    steps: input.steps || 'all',
    outputPolicy: input.outputPolicy === 'all_modes' || input.output_policy === 'all_modes' ? 'all_modes' : 'selected_only',
    overlay: { ...(input.overlay || {}), arrows: input.overlay && input.overlay.arrows === false ? false : true },
  };
}
function detectInplaneComponents(grid) {
  const g = grid || {};
  if (Number(g.ny) === 1) return ['px', 'pz'];
  if (Number(g.nx) === 1) return ['py', 'pz'];
  return ['px', 'py'];
}
function applyContext(draft, context) {
  if (!context) return;
  if (context.lastJobId) draft.lastJobId = context.lastJobId;
  if (context.parentJobId) draft.parentJobId = context.parentJobId;
}
function formatVisualization(visualization) {
  const rawMode = visualization && visualization.mode || 'component';
  const mode = rawMode === 'angle_arrow' || rawMode === 'inplane_angle_arrow' ? 'inplane_angle' : rawMode === 'variant_111_arrow' ? 'variant_111' : rawMode;
  if (mode === 'inplane_angle') return '面内';
  if (mode === 'variant_111') return 'R相变体';
  return visualization && visualization.component ? visualization.component : '未设置';
}
function normalizeRun(run) { if (!run) return null; const steps = Number(run.steps !== undefined ? run.steps : run.kstep); const outputInterval = Number(run.outputInterval !== undefined ? run.outputInterval : run.kprnt); return { steps, outputInterval, kstep: steps, kprnt: outputInterval }; }
function formatGrid(grid) { return grid ? grid.nx + '×' + grid.ny + '×' + grid.nz : undefined; }

module.exports = { createFerroDialogueService };
