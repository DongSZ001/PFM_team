#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const projectRoot = path.resolve(__dirname, '..', '..');
const defaultCatalogPath = path.join(projectRoot, 'pf_assistant', 'src', 'ferro', 'material-card-catalog.json');
const defaultBackupDir = path.join(projectRoot, 'pf_assistant', 'src', 'ferro', 'catalog-backups');
const defaultLogPath = path.join(projectRoot, 'tools', 'ferro-card-editor', 'logs', 'editor-audit.log');
const allowedModes = new Set(['single', 'landau_order', 'composition', 'model_source']);
const allowedVisualizationModes = new Set(['component', 'inplane_angle', 'variant_111']);

function createEditorServer({
  host = '127.0.0.1',
  port = 4317,
  catalogPath = defaultCatalogPath,
  backupDir = defaultBackupDir,
  logPath = defaultLogPath,
  repoModels = [],
} = {}) {
  if (host !== '127.0.0.1') throw new Error('ferro card editor 只允许绑定 127.0.0.1');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (req.method === 'GET' && url.pathname === '/api/catalog') {
        return json(res, 200, { catalog: readCatalog({ catalogPath }), validation: validateCatalog(readCatalog({ catalogPath }), { repoModels }) });
      }
      if (req.method === 'POST' && url.pathname === '/api/validate') {
        const body = await readBody(req);
        return json(res, 200, validateCatalog(body.catalog || body, { repoModels }));
      }
      if (req.method === 'POST' && url.pathname === '/api/save') {
        const body = await readBody(req);
        return json(res, 200, saveCatalog(body.catalog || body, { catalogPath, backupDir, logPath, repoModels, actor: 'local-editor' }));
      }
      if (req.method === 'POST' && url.pathname === '/api/reload') {
        const result = await postJson('http://127.0.0.1:3000/api/ferro/admin/reload-material-catalog', {});
        return json(res, 200, { reloaded: true, result });
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/public/'))) {
        return serveStatic(res, url.pathname === '/' ? '/public/index.html' : url.pathname);
      }
      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      return json(res, err.statusCode || 500, { error: err.message });
    }
  });
  server.host = host;
  server.port = port;
  server.catalogPath = catalogPath;
  return server;
}

function readCatalog({ catalogPath = defaultCatalogPath, allowedRoot = null } = {}) {
  const root = allowedRoot || path.dirname(catalogPath);
  const filePath = assertInside(catalogPath, root);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error('JSON 解析失败: ' + err.message);
  }
}

function saveCatalog(catalog, {
  catalogPath = defaultCatalogPath,
  backupDir = defaultBackupDir,
  logPath = defaultLogPath,
  repoModels = [],
  actor = 'local-editor',
  now = () => new Date(),
} = {}) {
  const target = assertInside(catalogPath, path.dirname(catalogPath));
  const validation = validateCatalog(catalog, { repoModels });
  if (!validation.valid) throw new Error('校验失败: ' + validation.errors.join('; '));

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = timestamp(now());
  const backupPath = path.join(backupDir, `material-card-catalog.${stamp}.json`);
  if (fs.existsSync(target)) fs.copyFileSync(target, backupPath);

  const tmpPath = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(catalog, null, 2) + '\n');
  JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
  fs.renameSync(tmpPath, target);

  appendAudit(logPath, { actor, action: 'save', catalogPath: target, backupPath, title: (catalog.families || []).map((item) => item.title).join(', ') });
  return { saved: true, catalogPath: target, backupPath, validation };
}

function validateCatalog(catalog, { repoModels = [] } = {}) {
  const errors = [];
  const warnings = [];
  if (!catalog || typeof catalog !== 'object') errors.push('catalog 必须是对象');
  const families = Array.isArray(catalog && catalog.families) ? catalog.families : [];
  if (!Array.isArray(catalog && catalog.families)) errors.push('families 必须是数组');

  const familyIds = new Set();
  const variantIds = new Set();
  const repoIds = new Set((repoModels || []).flatMap((model) => [model.modelKey, model.model_key, model.id, model.sourceSetKey, model.source_set_key].filter(Boolean)));

  for (const family of families) {
    if (!family.familyId) errors.push('familyId 不能为空');
    if (familyIds.has(family.familyId)) errors.push(`familyId 重复: ${family.familyId}`);
    familyIds.add(family.familyId);
    if (family.groupMode && !allowedModes.has(family.groupMode)) errors.push(`groupMode 不支持: ${family.groupMode}`);
    if (family.displayOrder !== undefined && family.displayOrder !== null && family.displayOrder !== '' && Number.isNaN(Number(family.displayOrder))) errors.push(`displayOrder 必须是数字: ${family.familyId}`);
    const variants = Array.isArray(family.variants) ? family.variants : [];
    if (family.visibleInRecommendation !== false && !variants.some((variant) => variant.visible !== false)) errors.push(`visible family 至少需要一个 visible variant: ${family.familyId}`);
    validateVisualization(family, errors, warnings);
    if (family.familyId === 'bfo') validateBfoFamily(family, warnings);
    for (const variant of variants) {
      if (!variant.variantId) errors.push(`variantId 不能为空: ${family.familyId}`);
      if (variant.variantId && variantIds.has(variant.variantId)) errors.push(`variantId 重复: ${variant.variantId}`);
      if (variant.variantId) variantIds.add(variant.variantId);
      if ((family.familyId === 'pmn_pt' || family.groupMode === 'composition') && variant.visible !== false && (variant.compositionValue === null || variant.compositionValue === undefined)) warnings.push(`PMN-PT compositionValue 不能为空: ${variant.variantId}`);
      const modelId = variant.materialModelId || variant.sourceSetKey;
      if (modelId && (!repoIds.size || (!repoIds.has(modelId) && !repoIds.has(stripLandauPrefix(modelId))))) warnings.push(`materialModelId 找不到: ${modelId}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateVisualization(family, errors, warnings) {
  const viz = family.defaultVisualization || {};
  if (!viz.mode) return;
  if (!allowedVisualizationModes.has(viz.mode)) errors.push(`defaultVisualization.mode 不支持: ${family.familyId}`);
  if (viz.mode === 'component' && !['px', 'py', 'pz'].includes(String(viz.component || '').toLowerCase())) errors.push(`component 必须是 px/py/pz: ${family.familyId}`);
  if (viz.mode === 'variant_111' && family.familyId !== 'bfo') warnings.push(`variant_111 通常只建议用于 BFO: ${family.familyId}`);
}

function validateBfoFamily(family, warnings) {
  const visible = (family.variants || []).filter((variant) => variant.visible !== false).map((variant) => variant.variantId);
  const expected = ['bfo_zhang2008_fourth', 'bfo_hsieh2016_sixth', 'bfo_cao2018_eighth'];
  if (visible.length !== expected.length || visible.some((id) => !expected.includes(id))) warnings.push('BFO 推荐卡建议只显示四阶/六阶/八阶三个 variants');
}

function assertInside(filePath, root) {
  const base = path.resolve(root);
  const target = path.resolve(filePath);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('非法路径');
  return target;
}

function appendAudit(logPath, record) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify({ time: new Date().toISOString(), ...record }) + '\n');
}

function timestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function stripLandauPrefix(value) {
  return String(value || '').replace(/^landau:/, '');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (err) { reject(new Error('JSON 解析失败: ' + err.message)); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const publicRoot = path.join(__dirname, 'public');
  const filePath = assertInside(path.join(__dirname, pathname), publicRoot);
  if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
  const type = filePath.endsWith('.css') ? 'text/css; charset=utf-8' : filePath.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(filePath));
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = JSON.stringify(payload || {});
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body ? JSON.parse(body) : {}));
    });
    req.on('error', reject);
    req.end(data);
  });
}

if (require.main === module) {
  if (process.env.PFM_ENABLE_FERRO_CARD_EDITOR !== '1') {
    console.error('请先设置 PFM_ENABLE_FERRO_CARD_EDITOR=1 再启动 ferro card editor。');
    process.exit(1);
  }
  const server = createEditorServer();
  server.listen(server.port, server.host, () => {
    console.log(`Ferro card editor: http://${server.host}:${server.port}`);
  });
}

module.exports = {
  createEditorServer,
  readCatalog,
  saveCatalog,
  validateCatalog,
};
