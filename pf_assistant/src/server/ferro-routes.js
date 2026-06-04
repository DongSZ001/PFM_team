'use strict';

const fs = require('fs');
const path = require('path');
const { createFerroJobService } = require('../ferro/job-service');
const { createFerroDialogueService } = require('../ferro/dialogue-service');
const defaultMaterialRepository = require('../ferro/material-repository');
const defaultLandauRepository = require('../ferro/landau-repository');
const { listEnrichedFerroMaterialModels } = require('../ferro/material-models');
const defaultMaterialCatalog = require('../ferro/material-card-catalog');
const { buildMaterialCards, expandCardsToLegacyMaterials } = defaultMaterialCatalog;
const defaultLandauEditor = require('../../../tools/ferro-landau-editor/server');

const FERRO_API_PATHS = Object.freeze(['/api/ferro/*']);

function isFerroApiPath(urlPath) {
  return urlPath.startsWith('/api/ferro/');
}

function createFerroApiHandler({
  requireAuth,
  readJsonBody,
  jsonResponse,
  service = createFerroJobService(),
  dialogueService = createFerroDialogueService({ jobService: service }),
  materialRepository = defaultMaterialRepository,
  landauRepository = defaultLandauRepository,
  materialCatalog = defaultMaterialCatalog,
  landauAdmin = null,
  env = process.env,
  logger = console,
} = {}) {
  if (typeof requireAuth !== 'function') throw new Error('requireAuth is required');
  if (typeof readJsonBody !== 'function') throw new Error('readJsonBody is required');
  if (typeof jsonResponse !== 'function') throw new Error('jsonResponse is required');

  return async function handleFerroRoute(req, res, url, urlPath) {
    if (!isFerroApiPath(urlPath)) return false;
    req.cookies = req.cookies || parseCookies(req.headers && req.headers.cookie);
    if (!requireAuth(req, res)) return true;

    try {
      const parts = urlPath.split('/').filter(Boolean);

      if (req.method === 'POST' && urlPath === '/api/ferro/admin/reload-material-catalog') {
        if (env.PFM_ENABLE_FERRO_CARD_EDITOR !== '1') {
          jsonResponse(res, 404, { error: 'Not found' });
          return true;
        }
        const nextCatalog = materialCatalog.reloadMaterialCardCatalog();
        jsonResponse(res, 200, { reloaded: true, version: nextCatalog && nextCatalog.version || null });
        return true;
      }

      if (urlPath.startsWith('/api/ferro/admin/landau/')) {
        if (env.PFM_ENABLE_FERRO_LANDAU_EDITOR !== '1') {
          jsonResponse(res, 404, { error: 'Not found' });
          return true;
        }
        const admin = landauAdmin || defaultLandauAdmin();
        if (req.method === 'GET' && urlPath === '/api/ferro/admin/landau/source-sets') {
          jsonResponse(res, 200, { sourceSets: admin.listSourceSets() });
          return true;
        }
        if (req.method === 'GET' && parts.length === 6 && parts[3] === 'landau' && parts[4] === 'source-sets') {
          const setKey = decodeURIComponent(parts[5]);
          jsonResponse(res, 200, { sourceSet: admin.getSourceSet(setKey), coefficients: admin.listCoefficientRecords(setKey) });
          return true;
        }
        if (req.method === 'POST' && urlPath === '/api/ferro/admin/landau/validate') {
          const body = await readJsonBody(req);
          jsonResponse(res, 200, admin.validate(body));
          return true;
        }
        if ((req.method === 'POST' || req.method === 'PUT') && urlPath === '/api/ferro/admin/landau/source-sets') {
          const body = await readJsonBody(req);
          jsonResponse(res, 200, admin.save(body));
          return true;
        }
        if (req.method === 'GET' && urlPath === '/api/ferro/admin/landau/export-markdown') {
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(admin.exportMarkdown());
          return true;
        }
      }

      if (req.method === 'GET' && urlPath === '/api/ferro/materials') {
        const models = materialRepository.listFerroParameterModels();
        const filter = url && url.searchParams ? url.searchParams.get('filter') : null;
        const enriched = listEnrichedFerroMaterialModels(models.map(publicMaterialModel));
        const cards = buildMaterialCards(enriched, { filter });
        const materials = mergeCatalogAndFallbackMaterials({ cards, enriched, filter });
        jsonResponse(res, 200, { type: 'ferro_material_recommendations', cards, materials });
        return true;
      }

      if (req.method === 'GET' && urlPath === '/api/ferro/landau/source-sets') {
        const sets = landauRepository.listFerroLandauSourceSets();
        jsonResponse(res, 200, sets.map(publicLandauSourceSet));
        return true;
      }

      if (req.method === 'GET' && parts.length === 6 && parts[2] === 'landau' && parts[3] === 'source-sets' && parts[5] === 'coefficients') {
        const setKey = decodeURIComponent(parts[4]);
        const sourceSet = landauRepository.getFerroLandauSourceSet(setKey);
        if (!sourceSet) {
          jsonResponse(res, 404, { error: '铁电 Landau 参数集不存在' });
          return true;
        }
        const records = landauRepository.listFerroLandauCoefficientRecords(setKey);
        jsonResponse(res, 200, records.map(publicLandauCoefficientRecord));
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/ferro/dialogue') {
        const body = await readJsonBody(req);
        const result = await dialogueService.handleMessage({
          userId: req.userId,
          chatSessionId: body.chatSessionId || body.chat_session_id || null,
          message: body.message || body.content || '',
          action: body.action || null,
          materialId: body.materialId || body.material_id || null,
          materialGroupId: body.materialGroupId || body.material_group_id || null,
          variantId: body.variantId || body.variant_id || null,
          presetId: body.presetId || body.preset_id || null,
          patch: body.patch || null,
          clientPreferences: body.clientPreferences || body.client_preferences || null,
          context: body.context || null,
        });
        jsonResponse(res, 200, result || { type: 'not_ferro' });
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/ferro/jobs') {
        const body = await readJsonBody(req);
        const result = await service.createAndRunJob({
          userId: req.userId,
          chatSessionId: body.chatSessionId || body.chat_session_id || null,
          request: body,
        });
        jsonResponse(res, 200, publicJobResult(result));
        return true;
      }

      if (req.method === 'POST' && parts.length === 5 && parts[2] === 'jobs' && parts[4] === 'visualizations') {
        const body = await readJsonBody(req);
        const result = await service.generateVisualizations({
          userId: req.userId,
          jobId: parts[3],
          visualization: {
            mode: body.mode,
            component: body.component || null,
            steps: Array.isArray(body.timesteps) && body.timesteps.length ? body.timesteps.join(',') : body.steps || 'all',
            outputPolicy: body.outputPolicy || body.output_policy || 'selected_only',
          },
        });
        jsonResponse(res, 200, result);
        return true;
      }

      if (req.method === 'GET' && parts.length === 4 && parts[2] === 'jobs') {
        const result = service.getJobResult(parts[3], req.userId);
        if (!result) {
          jsonResponse(res, 404, { error: '铁电计算任务不存在' });
          return true;
        }
        jsonResponse(res, 200, result);
        return true;
      }

      if (req.method === 'GET' && parts.length === 5 && parts[2] === 'jobs' && parts[4] === 'results') {
        const result = service.getJobResult(parts[3], req.userId);
        if (!result) {
          jsonResponse(res, 404, { error: '铁电计算结果不存在' });
          return true;
        }
        jsonResponse(res, 200, result);
        return true;
      }

      if (req.method === 'GET' && parts.length === 5 && parts[2] === 'assets') {
        const assetPath = service.resolveAssetPath(parts[3], decodeURIComponent(parts[4]), req.userId);
        res.writeHead(200, { 'Content-Type': contentTypeFor(assetPath), 'Cache-Control': 'private, max-age=3600' });
        res.end(fs.readFileSync(assetPath));
        return true;
      }

      jsonResponse(res, 404, { error: 'Not found' });
      return true;
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) logger.error('[ferro] route error:', err);
      jsonResponse(res, status, { error: err.message || '铁电相场计算失败' });
      return true;
    }
  };
}

function defaultLandauAdmin() {
  return {
    listSourceSets: () => defaultLandauRepository.listFerroLandauSourceSets(),
    getSourceSet: (setKey) => defaultLandauRepository.getFerroLandauSourceSet(setKey),
    listCoefficientRecords: (setKey) => defaultLandauRepository.listFerroLandauCoefficientRecords(setKey),
    validate: (payload) => defaultLandauEditor.validateLandauPayload(payload),
    save: (payload) => defaultLandauEditor.saveLandauPayload(payload),
    exportMarkdown: () => defaultLandauRepository.exportFerroLandauDatabaseToMarkdown(),
  };
}


function publicMaterialModel(model) {
  return {
    materialKey: model.material_key,
    displayName: model.display_name,
    modelKey: model.model_key,
    modelName: model.model_name,
    defaultXf: model.default_xf,
    defaultTem: model.default_tem,
    active: model.active,
    description: model.description || model.notes,
    notes: model.notes,
    tags: model.tags,
  };
}

function filterFerroMaterials(materials, filter) {
  if (!filter) return materials;
  const tokens = materialFilterTokens(filter);
  if (!tokens.length) return materials;
  return materials.filter((item) => {
    const haystack = materialSearchText(item);
    return tokens.length === 1 ? haystack.includes(tokens[0]) : tokens.every((token) => haystack.includes(token));
  });
}

function mergeCatalogAndFallbackMaterials({ cards, enriched, filter }) {
  const expanded = expandCardsToLegacyMaterials(cards);
  const fallback = filterFerroMaterials(enriched, filter);
  const byId = new Map();
  for (const item of expanded.concat(fallback)) {
    const id = item.id || item.modelKey || item.model;
    if (id && !byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

function materialSearchText(item) {
  return [
    item.id, item.model, item.modelKey, item.materialKey, item.displayName, item.modelName,
    item.family, item.title, item.subtitle, item.formula, ...(item.tags || []), ...(item.badges || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function materialFilterTokens(filter) {
  const raw = String(filter || '')
    .replace(/铁电|畴结构|畴|模拟|计算|材料|模型|相场|phase|field/gi, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [];
  const tokens = [];
  for (const token of raw) {
    if (token === '铁酸铋') tokens.push('bfo', 'bifeo3');
    else if (token === '钛酸钡') tokens.push('bto', 'batio3');
    else if (token === '锆钛酸铅') tokens.push('pzt');
    else if (!['the', 'a', 'an'].includes(token)) tokens.push(token);
  }
  return tokens;
}

function publicLandauSourceSet(row) {
  return {
    setKey: row.set_key,
    materialId: row.material_id,
    materialName: row.material_name,
    composition: row.composition,
    sourceRef: row.source_ref,
    order: row.polynomial_order,
    temperatureUnit: row.temperature_unit,
    variables: row.variables,
    notes: row.notes,
  };
}

function publicLandauCoefficientRecord(row) {
  return {
    setKey: row.source_set_key,
    coefficientId: row.coefficient_id,
    normalizedCoefficientId: row.normalized_coefficient_id,
    unitReported: row.unit_reported,
    valueExpression: row.value_expression,
    notes: row.notes,
  };
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function publicJobResult(result) {
  const { jobDir, caseDir, outputs, ...rest } = result;
  return { ...rest, outputs: (outputs || []).map((item) => ({ name: item.name })) };
}

function contentTypeFor(filePath) {
  if (path.extname(filePath).toLowerCase() === '.png') return 'image/png';
  return 'application/octet-stream';
}

module.exports = { FERRO_API_PATHS, createFerroApiHandler, isFerroApiPath };
