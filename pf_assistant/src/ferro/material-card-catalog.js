'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'material-card-catalog.json');
let catalog = loadCatalogFromDisk();

function loadMaterialCardCatalog() {
  return catalog;
}

function reloadMaterialCardCatalog() {
  catalog = loadCatalogFromDisk();
  return catalog;
}

function buildMaterialCards(models = [], { filter = null, selected = {} } = {}) {
  const repoModels = (models || []).map(normalizeRepoModel);
  const modelMap = new Map(repoModels.flatMap((model) => modelLookupKeys(model).map((key) => [key, model])));
  const cards = [];
  for (const family of catalog.families || []) {
    if (family.visibleInRecommendation === false) continue;
    if (filter && !familyMatchesFilter(family, filter)) continue;
    if (!familyHasAvailableModel(family, models)) continue;
    const card = buildConfiguredFamilyCard(family, modelMap, selected);
    if (card) cards.push(card);
  }

  const consumedModelIds = collectReferencedModelIds(catalog);
  const hiddenModelIds = collectExplicitHiddenModelIds(catalog);
  const familyHidePolicies = collectFamilyHidePolicies(catalog);
  const fallbackCandidates = repoModels.filter((model) => {
    if (model.active === false) return false;
    if (consumedModelIds.has(model.id)) return false;
    if (hiddenModelIds.has(model.id)) return false;
    if (familyHidePolicies.has(model.familyId)) return false;
    if (filter && !modelMatchesFilter(model, filter)) return false;
    return true;
  });
  for (const group of groupByFamily(fallbackCandidates)) {
    const card = buildFallbackFamilyCard(group, catalog.defaultPresets || {}, selected);
    if (card) cards.push(card);
  }

  return sortMaterialCards(cards);
}

function expandCardsToLegacyMaterials(cards) {
  return (cards || []).flatMap((card) => (card.variants || []).map((variant) => ({
    id: variant.materialModelId,
    model: variant.materialModelId,
    modelKey: variant.materialModelId,
    materialKey: card.familyId,
    displayName: card.title,
    modelName: variant.title,
    title: card.title,
    subtitle: variant.title,
    family: card.title,
    badges: card.tags,
    tags: card.tags,
    defaultTem: variant.temperature || card.temperature,
    defaultXf: variant.legacyXf !== undefined ? variant.legacyXf : card.composition && card.composition.value,
    defaultParams: legacyDefaultParams(card, variant),
    composition: card.composition,
    showCompositionInCard: Boolean(card.composition && card.composition.enabled),
    showCompositionInDraft: Boolean(card.composition && card.composition.enabled),
    variantId: variant.variantId,
    materialGroupId: card.familyId,
    presets: (card.actions || []).map((action) => ({ id: action.presetId, label: action.label, custom: action.custom })),
  })));
}

function findCatalogVariant({ variantId = null, materialModelId = null, familyId = null, text = '' } = {}) {
  const normalizedText = normalizeText(text);
  for (const family of catalog.families || []) {
    if (familyId && family.familyId !== familyId) continue;
    for (const variant of family.variants || []) {
      if (variant.visible === false) continue;
      if (variantId && variant.variantId === variantId) return { family, variant };
      if (materialModelId && variant.materialModelId === materialModelId) return { family, variant };
      if (normalizedText && variantMatchesText(variant, normalizedText)) return { family, variant };
    }
  }
  return null;
}

function findFamilyById(familyId) {
  return (catalog.families || []).find((family) => family.familyId === familyId) || null;
}

function findFamilyByText(text = '') {
  const tokens = materialFilterTokens(text);
  if (!tokens.length) return null;
  const matches = (catalog.families || []).filter((family) => familyMatchesTokens(family, tokens));
  return matches.length === 1 ? matches[0] : null;
}

function presetFromCatalog(presetId = 'quick_2d') {
  const preset = (catalog.defaultPresets || {})[presetId] || (catalog.defaultPresets || {}).quick_2d;
  return preset ? { id: presetId, ...preset } : null;
}

function publicVariant(variant, family, modelMap) {
  const model = modelMap.get(variant.materialModelId) || modelMap.get(stripLandauPrefix(variant.materialModelId)) || modelMap.get(variant.sourceSetKey);
  return {
    variantId: variant.variantId,
    materialModelId: variant.materialModelId,
    sourceSetKey: variant.sourceSetKey,
    buttonLabel: variant.buttonLabel,
    title: variant.title,
    order: variant.order,
    orderLabel: variant.orderLabel,
    compositionValue: variant.compositionValue,
    compositionDisplay: variant.compositionDisplay,
    legacyXf: variant.legacyXf,
    temperature: variant.temperature || family.temperature,
    referenceLabel: variant.referenceLabel,
    shortDescription: variant.shortDescription,
    visible: variant.visible !== false,
    available: Boolean(model),
  };
}

function buildConfiguredFamilyCard(family, modelMap, selected = {}) {
  const variants = (family.variants || [])
    .filter((variant) => variant.visible !== false)
    .map((variant) => publicVariant(variant, family, modelMap))
    .filter(Boolean);
  if (!variants.length) return null;
  const selectedVariantId = selected[family.familyId] || family.defaultVariantId || variants[0].variantId;
  return {
    cardType: 'material_family',
    cardSource: 'catalog',
    familyId: family.familyId,
    title: family.title,
    subtitle: family.subtitle,
    groupMode: family.groupMode,
    displayOrder: family.displayOrder || 999,
    temperature: family.temperature,
    composition: normalizeCardComposition(family.composition),
    selectedVariantId,
    defaultVariantId: family.defaultVariantId,
    tags: family.tags || [],
    description: family.description || '',
    defaultVisualization: family.defaultVisualization,
    hideOtherModelsInFamily: Boolean(family.hideOtherModelsInFamily),
    variants,
    actions: presetActions(catalog.defaultPresets || {}),
  };
}

function buildFallbackFamilyCard(group, defaultPresets, selected = {}) {
  const models = group.models.filter((model) => model.active !== false);
  if (!models.length) return null;
  const first = models[0];
  const variants = models.map((model, index) => fallbackVariant(model, models.length, index));
  const composition = fallbackComposition(models);
  const defaultVariantId = variants[0].variantId;
  return {
    cardType: 'material_family',
    cardSource: 'fallback',
    familyId: group.familyId,
    title: first.title || first.displayName || group.title,
    subtitle: first.subtitle || first.modelName || `${first.title || group.title} phase-field model`,
    groupMode: variants.length > 1 ? 'model_source' : 'single',
    displayOrder: 200,
    temperature: first.temperature || 300,
    composition,
    selectedVariantId: selected[group.familyId] || defaultVariantId,
    defaultVariantId,
    tags: first.tags && first.tags.length ? first.tags : [first.title || group.title, '可计算'],
    description: first.description || `${first.title || group.title} phase-field model.`,
    defaultVisualization: defaultVisualizationForModel(first),
    variants,
    actions: presetActions(defaultPresets),
  };
}

function fallbackVariant(model, groupSize, index) {
  return {
    variantId: safeId(model.familyId + '_' + (model.id || model.modelKey || index)),
    materialModelId: model.id,
    sourceSetKey: stripLandauPrefix(model.id),
    buttonLabel: groupSize === 1 ? '默认' : (model.modelName || model.subtitle || model.id),
    title: model.modelName || model.subtitle || model.id,
    order: index + 1,
    compositionValue: model.composition && model.composition.enabled ? model.composition.value : undefined,
    compositionDisplay: compositionDisplayForModel(model),
    legacyXf: model.composition && model.composition.enabled ? model.composition.value : undefined,
    temperature: model.temperature,
    referenceLabel: model.sourceLabel || model.referenceLabel,
    shortDescription: model.description || `${model.modelName || model.id} phase-field model.`,
    visible: true,
    available: true,
  };
}

function familyMatchesFilter(family, filter) {
  const tokens = materialFilterTokens(filter);
  if (!tokens.length) return true;
  return familyMatchesTokens(family, tokens);
}

function familyMatchesTokens(family, tokens) {
  const haystack = normalizeText([
    family.familyId,
    family.title,
    family.subtitle,
    family.description,
    ...(family.tags || []),
    ...(family.variants || []).flatMap((variant) => [variant.variantId, variant.title, variant.buttonLabel, variant.referenceLabel, variant.compositionDisplay]),
  ].filter(Boolean).join(' '));
  return tokens.some((token) => haystack.includes(token));
}

function familyHasAvailableModel(family, models = []) {
  if (!models || models.length === 0) return true;
  return models.map(normalizeRepoModel).some((model) => model.familyId === normalizeFamilyId(family.familyId)
    || (family.variants || []).some((variant) => modelLookupKeys(model).includes(variant.materialModelId)
      || modelLookupKeys(model).includes(stripLandauPrefix(variant.materialModelId))
      || modelLookupKeys(model).includes(variant.sourceSetKey)));
}

function materialFilterTokens(query) {
  const text = normalizeText(query)
    .replace(/模拟|计算|铁电|畴结构|畴|材料|模型|相场|phase|field/g, ' ');
  const raw = text.match(/[a-z0-9.]+|[\u4e00-\u9fff]+/g) || [];
  const out = [];
  for (const token of raw) {
    if (token === '铁酸铋') out.push('bfo', 'bifeo3');
    else if (token === 'pmnpt') out.push('pmnpt', 'pmn-pt', 'pmn_pt');
    else out.push(token);
  }
  return out;
}

function variantMatchesText(variant, normalizedText) {
  const haystack = normalizeText([
    variant.variantId,
    variant.materialModelId,
    variant.sourceSetKey,
    variant.title,
    variant.buttonLabel,
    variant.orderLabel,
    variant.referenceLabel,
    variant.compositionDisplay,
  ].filter(Boolean).join(' '));
  if (haystack && normalizedText.includes(haystack)) return true;
  if (/bfo/.test(normalizedText)) {
    if (/四阶|4阶|zhang|2008|fourth/.test(normalizedText)) return variant.variantId === 'bfo_zhang2008_fourth';
    if (/六阶|6阶|hsieh|2016|sixth/.test(normalizedText)) return variant.variantId === 'bfo_hsieh2016_sixth';
    if (/八阶|8阶|cao|2018|eighth/.test(normalizedText)) return variant.variantId === 'bfo_cao2018_eighth';
  }
  if (/pmn/.test(normalizedText) || /pt组分|xpt/.test(normalizedText)) {
    if (/0\.?30|030/.test(normalizedText)) return variant.variantId === 'pmnpt_030_khakpash2015';
    if (/0\.?42|042/.test(normalizedText)) return variant.variantId === 'pmnpt_042_khakpash2015';
    if (/0\.?70|070/.test(normalizedText)) return variant.variantId === 'pmnpt_070_khakpash2015';
  }
  return false;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[-_\s]+/g, '');
}

function normalizeRepoModel(model) {
  const id = model.modelKey || model.model_key || model.id || model.materialModelId;
  const materialKey = model.materialKey || model.material_key || model.materialId || model.material_id;
  const family = model.family || model.displayName || model.display_name || model.title || materialKey || id;
  const familyId = normalizeFamilyId(materialKey || family);
  const composition = normalizeModelComposition(model, familyId);
  const temperature = numberOr(model.defaultTem, model.default_tem, model.defaultParams && model.defaultParams.temperature, model.temperature, 300);
  return {
    ...model,
    id,
    modelKey: id,
    materialKey,
    familyId,
    displayName: model.displayName || model.display_name || model.title || family,
    title: model.title || model.displayName || model.display_name || family,
    modelName: model.modelName || model.model_name || model.subtitle || id,
    subtitle: model.subtitle || model.modelName || model.model_name || id,
    defaultXf: numberOr(model.defaultXf, model.default_xf, model.defaultParams && model.defaultParams.xf),
    temperature,
    composition,
    description: model.description || model.notes,
    sourceLabel: model.sourceLabel || model.source_label,
    tags: model.tags || model.badges || [],
    active: model.active !== 0 && model.active !== false,
  };
}

function normalizeModelComposition(model, familyId) {
  const explicit = model.composition || {};
  const enabled = explicit.enabled !== undefined ? explicit.enabled : ['pmn_pt', 'pzt', 'knn'].includes(familyId);
  if (!enabled) return { enabled: false, key: null, label: null, value: null };
  const key = explicit.key || explicit.legacyKey || (familyId === 'pzt' ? 'x' : 'xf');
  const value = numberOr(explicit.value, model.defaultXf, model.default_xf, model.defaultParams && model.defaultParams[key], model.defaultParams && model.defaultParams.xf);
  return { ...explicit, enabled: true, key, label: explicit.label || key, value: value ?? null };
}

function fallbackComposition(models) {
  const first = models.find((model) => model.composition && model.composition.enabled);
  if (!first) return { enabled: false, key: null, label: null, value: null };
  return { ...first.composition };
}

function normalizeCardComposition(composition) {
  if (!composition || composition.enabled === false) return { enabled: false };
  return { ...composition, enabled: true };
}

function compositionDisplayForModel(model) {
  if (!model.composition || !model.composition.enabled || model.composition.value === null || model.composition.value === undefined) return undefined;
  return `${model.composition.label || model.composition.key} = ${model.composition.value}`;
}

function defaultVisualizationForModel(model) {
  if (model.familyId === 'bfo') return { mode: 'variant_111', component: null, overlay: { arrows: true } };
  const preset = (model.presets || []).find((item) => item.id === 'quick_2d' && item.visualization);
  return preset && preset.visualization || { mode: 'component', component: 'pz', overlay: { arrows: true } };
}

function collectReferencedModelIds(cardCatalog) {
  const ids = new Set();
  for (const family of cardCatalog.families || []) {
    for (const variant of family.variants || []) {
      if (variant.materialModelId) ids.add(variant.materialModelId);
      if (variant.materialModelId) ids.add(stripLandauPrefix(variant.materialModelId));
      if (variant.sourceSetKey) ids.add(variant.sourceSetKey);
    }
  }
  return ids;
}

function collectExplicitHiddenModelIds(cardCatalog) {
  const ids = new Set();
  for (const family of cardCatalog.families || []) {
    for (const variant of family.variants || []) {
      if (variant.visible === false && variant.materialModelId) ids.add(variant.materialModelId);
      if (variant.visible === false && variant.materialModelId) ids.add(stripLandauPrefix(variant.materialModelId));
      if (variant.visible === false && variant.sourceSetKey) ids.add(variant.sourceSetKey);
    }
  }
  return ids;
}

function collectFamilyHidePolicies(cardCatalog) {
  const ids = new Set();
  for (const family of cardCatalog.families || []) {
    if (family.hideOtherModelsInFamily) ids.add(normalizeFamilyId(family.familyId));
  }
  return ids;
}

function modelLookupKeys(model) {
  return [model.id, model.modelKey, stripLandauPrefix(model.id), stripLandauPrefix(model.modelKey), model.sourceSetKey, model.source_set_key]
    .filter(Boolean);
}

function modelMatchesFilter(model, filter) {
  const tokens = materialFilterTokens(filter);
  if (!tokens.length) return true;
  const haystack = normalizeText([
    model.familyId,
    model.materialKey,
    model.displayName,
    model.title,
    model.modelName,
    model.subtitle,
    model.id,
    ...(model.tags || []),
  ].filter(Boolean).join(' '));
  return tokens.some((token) => haystack.includes(token));
}

function groupByFamily(models) {
  const groups = new Map();
  for (const model of models) {
    const key = model.familyId || normalizeFamilyId(model.displayName || model.materialKey || model.id);
    if (!groups.has(key)) groups.set(key, { familyId: key, title: model.displayName || model.title || key, models: [], order: groups.size });
    groups.get(key).models.push(model);
  }
  return [...groups.values()];
}

function sortMaterialCards(cards) {
  return cards.sort((a, b) => {
    const order = (a.displayOrder || 999) - (b.displayOrder || 999);
    if (order) return order;
    return String(a.title || a.familyId).localeCompare(String(b.title || b.familyId));
  });
}

function presetActions(defaultPresets) {
  return Object.entries(defaultPresets || {}).map(([presetId, preset]) => ({
    label: preset.label || presetId,
    presetId,
    custom: Boolean(preset.custom),
  }));
}

function legacyDefaultParams(card, variant) {
  const temperature = variant.temperature || card.temperature;
  const params = { temperature };
  if (card.composition && card.composition.enabled) {
    const key = card.composition.legacyKey || card.composition.key || 'xf';
    const value = variant.legacyXf !== undefined ? variant.legacyXf : variant.compositionValue;
    if (value !== undefined && value !== null) params[key] = value;
  }
  return params;
}

function normalizeFamilyId(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (key === 'pmnpt') return 'pmn_pt';
  if (key === 'ba_tio3' || key === 'batio3' || key === 'batío3') return 'bto';
  return key;
}

function safeId(value) {
  return String(value || 'material').toLowerCase().replace(/^landau:/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'material';
}

function numberOr(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return Number(value);
  }
  return undefined;
}

function stripLandauPrefix(value) {
  return String(value || '').replace(/^landau:/, '');
}

function loadCatalogFromDisk() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

module.exports = {
  loadMaterialCardCatalog,
  reloadMaterialCardCatalog,
  buildMaterialCards,
  expandCardsToLegacyMaterials,
  findCatalogVariant,
  findFamilyById,
  findFamilyByText,
  presetFromCatalog,
  materialFilterTokens,
  normalizeFamilyId,
};
