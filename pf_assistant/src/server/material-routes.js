/**
 * Material parameter HTTP API routes.
 *
 * This module keeps material/parameter route dispatch out of serve.js while
 * preserving the existing HTTP paths and response shapes.
 */

'use strict';

const defaultMaterials = require('../materials/material-parameters');
const defaultResolver = require('../materials/parameter-resolver');

const MATERIAL_API_PATHS = Object.freeze([
  '/api/materials',
  '/api/materials/:id',
  '/api/materials/:id/parameter-sets',
  '/api/parameter-sets/:id',
  '/api/resolve-parameters',
  '/api/simulation-profiles',
]);

function isMaterialApiPath(urlPath) {
  return urlPath.startsWith('/api/materials') ||
    urlPath.startsWith('/api/parameter-sets') ||
    urlPath === '/api/resolve-parameters' ||
    urlPath === '/api/simulation-profiles';
}

function createMaterialApiHandler({
  materials = defaultMaterials,
  resolver = defaultResolver,
  jsonResponse,
  readJsonBody,
  logger = console,
} = {}) {
  if (typeof jsonResponse !== 'function') throw new Error('jsonResponse is required');
  if (typeof readJsonBody !== 'function') throw new Error('readJsonBody is required');

  return async function handleMaterialsRoute(req, res, url, urlPath) {
    try {
      const method = req.method;
      const parts = urlPath.split('/').filter(Boolean);

      if (parts[0] === 'api' && parts[1] === 'materials' && parts.length === 2 && method === 'GET') {
        const rows = materials.listMaterials();
        jsonResponse(res, 200, rows.map((m) => ({
          id: m.id,
          materialKey: m.material_key,
          displayName: m.display_name,
          stackStructure: m.stack_structure,
          parameterSetCount: m.parameter_set_count,
        })));
        return true;
      }

      if (parts[0] === 'api' && parts[1] === 'materials' && parts.length === 4 && parts[3] === 'parameter-sets' && method === 'GET') {
        const materialId = Number(parts[2]);
        if (!Number.isFinite(materialId)) { jsonResponse(res, 400, { error: 'invalid material id' }); return true; }
        const summary = materials.getMaterialSummary(materialId);
        if (!summary) { jsonResponse(res, 404, { error: 'material not found' }); return true; }
        jsonResponse(res, 200, { material: { id: summary.id, materialKey: summary.materialKey, displayName: summary.displayName }, parameterSets: summary.parameterSets });
        return true;
      }

      if (parts[0] === 'api' && parts[1] === 'materials' && parts.length === 3 && method === 'GET') {
        const materialId = Number(parts[2]);
        if (!Number.isFinite(materialId)) { jsonResponse(res, 400, { error: 'invalid material id' }); return true; }
        const summary = materials.getMaterialSummary(materialId);
        if (!summary) { jsonResponse(res, 404, { error: 'material not found' }); return true; }
        jsonResponse(res, 200, summary);
        return true;
      }

      if (parts[0] === 'api' && parts[1] === 'parameter-sets' && parts.length === 3 && method === 'GET') {
        const setId = Number(parts[2]);
        if (!Number.isFinite(setId)) { jsonResponse(res, 400, { error: 'invalid parameter set id' }); return true; }
        const detail = materials.getParameterSetDetail(setId);
        if (!detail) { jsonResponse(res, 404, { error: 'parameter set not found' }); return true; }
        const parametersByKey = {};
        for (const p of detail.parameters) parametersByKey[p.parameterKey] = p;
        jsonResponse(res, 200, {
          parameterSet: detail.parameterSet,
          material: detail.material,
          source: detail.source,
          parameters: parametersByKey,
          parameterList: detail.parameters,
          warnings: detail.parameters.filter((p) => p.importWarning).map((p) => ({ parameterKey: p.parameterKey, message: p.importWarning })),
        });
        return true;
      }

      if (parts[0] === 'api' && parts[1] === 'resolve-parameters' && parts.length === 2 && method === 'POST') {
        const body = await readJsonBody(req);
        const { materialId, parameterSetId, simulationType, targetEngine } = body || {};
        if (parameterSetId == null) { jsonResponse(res, 400, { error: 'parameterSetId is required' }); return true; }
        const result = resolver.resolveParameterSet({
          parameterSetId: Number(parameterSetId),
          simulationType: simulationType || 'general',
          targetEngine: targetEngine || null,
        });
        if (materialId != null && result.material && Number(materialId) !== result.material.id) {
          result.warnings.push(`materialId ${materialId} does not match parameter set's material (${result.material.id}). Using the parameter set's material.`);
        }
        jsonResponse(res, 200, result);
        return true;
      }

      if (parts[0] === 'api' && parts[1] === 'simulation-profiles' && parts.length === 2 && method === 'GET') {
        jsonResponse(res, 200, { profiles: resolver.listSimulationProfiles() });
        return true;
      }

      return false;
    } catch (err) {
      if (err && err.code === 'ERR_HTTP_HEADERS_SENT') return true;
      logger.error('[api/materials] error:', err && err.message);
      if (res.headersSent) return true;
      try { jsonResponse(res, 500, { error: (err && err.message) || 'internal error' }); } catch (_) { /* ignore */ }
      return true;
    }
  };
}

module.exports = {
  MATERIAL_API_PATHS,
  createMaterialApiHandler,
  isMaterialApiPath,
};
