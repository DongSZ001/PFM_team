#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const projectRoot = path.resolve(__dirname, '..', '..');
const defaultBackupDir = path.join(projectRoot, 'pf_assistant_data', 'admin-backups', 'ferro-landau');
const defaultLogPath = path.join(projectRoot, 'pf_assistant_data', 'admin-logs', 'ferro-landau-editor.log');
const defaultRepository = require(path.join(projectRoot, 'pf_assistant', 'src', 'ferro', 'landau-repository'));

const REQUIRED_RUNNABLE = ['alpha1', 'alpha11', 'alpha12', 'Q11', 'Q12', 'Q44'];

function createLandauEditorServer({
  host = '127.0.0.1',
  port = 4318,
  repository = defaultRepository,
  backupDir = defaultBackupDir,
  logPath = defaultLogPath,
} = {}) {
  if (host !== '127.0.0.1') throw new Error('ferro Landau editor 只允许绑定 127.0.0.1');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (req.method === 'GET' && url.pathname === '/api/source-sets') {
        return json(res, 200, { sourceSets: repository.listFerroLandauSourceSets() });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/source-sets/')) {
        const setKey = decodeURIComponent(url.pathname.split('/').pop());
        return json(res, 200, {
          sourceSet: repository.getFerroLandauSourceSet(setKey),
          coefficients: repository.listFerroLandauCoefficientRecords(setKey),
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/validate') {
        const body = await readBody(req);
        return json(res, 200, validateLandauPayload(body));
      }
      if (req.method === 'POST' && url.pathname === '/api/save') {
        const body = await readBody(req);
        return json(res, 200, saveLandauPayload(body, { repository, backupDir, logPath, actor: 'local-landau-editor' }));
      }
      if (req.method === 'GET' && url.pathname === '/api/export-markdown') {
        return text(res, 200, repository.exportFerroLandauDatabaseToMarkdown(), 'text/markdown; charset=utf-8');
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
  return server;
}

function validateLandauPayload(payload) {
  const errors = [];
  const warnings = [];
  const sourceSet = payload.sourceSet || payload.source_set || {};
  const coefficients = payload.coefficients || payload.coefficientRecords || [];
  const setKey = sourceSet.set_key || sourceSet.setKey;
  if (!setKey) errors.push('set_key 不能为空');
  if (!sourceSet.material_id && !sourceSet.materialId) errors.push('material_id 不能为空');
  if (!sourceSet.material_name && !sourceSet.materialName) errors.push('material_name 不能为空');
  if (!Array.isArray(coefficients)) errors.push('coefficients 必须是数组');

  const seen = new Set();
  for (const coeff of Array.isArray(coefficients) ? coefficients : []) {
    const id = coeff.coefficient_id || coeff.coefficientId;
    const expr = coeff.value_expression || coeff.valueExpression;
    if (!id) errors.push('coefficient_id 不能为空');
    if (id && seen.has(id)) errors.push(`coefficient_id 重复: ${id}`);
    if (id) seen.add(id);
    if (!expr) errors.push(`value_expression 不能为空: ${id || 'unknown'}`);
    if (expr && !isSafeExpression(expr)) errors.push(`表达式不安全: ${id || expr}`);
  }
  for (const id of REQUIRED_RUNNABLE) {
    if (!seen.has(id)) warnings.push(`缺少可运行必需系数: ${id}`);
  }
  if (!['S11', 'S12', 'S44'].every((id) => seen.has(id)) && !['C11', 'C12', 'C44'].every((id) => seen.has(id))) {
    warnings.push('缺少完整弹性系数：需要 S11/S12/S44 或 C11/C12/C44');
  }
  return { valid: errors.length === 0, errors, warnings };
}

function saveLandauPayload(payload, { repository = defaultRepository, backupDir = defaultBackupDir, logPath = defaultLogPath, actor = 'local-landau-editor', now = () => new Date() } = {}) {
  const validation = validateLandauPayload(payload);
  if (!validation.valid) throw validationError('校验失败: ' + validation.errors.join('; '));
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `ferro-landau.${timestamp(now())}.md`);
  fs.writeFileSync(backupPath, repository.exportFerroLandauDatabaseToMarkdown());
  const sourceSet = payload.sourceSet || payload.source_set;
  const setKey = sourceSet.set_key || sourceSet.setKey;
  const savedSourceSet = repository.upsertFerroLandauSourceSet(sourceSet, { sourceFileName: 'ferro-landau-editor' });
  const savedCoefficients = repository.replaceFerroLandauCoefficientRecords(setKey, payload.coefficients || payload.coefficientRecords || [], { sourceFileName: 'ferro-landau-editor' });
  appendAudit(logPath, { actor, action: 'save_landau_set', setKey, backupPath, coefficientCount: savedCoefficients.length });
  return { saved: true, backupPath, validation, sourceSet: savedSourceSet, coefficientCount: savedCoefficients.length };
}

function isSafeExpression(expression) {
  const text = String(expression || '').trim();
  if (!text || /±|[{}]|where\b|require|process|global|Function|=>|;/i.test(text)) return false;
  return /^[0-9TtxsSigmacohqrtanepE+\-*/().,_\s]+$/.test(text);
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
  text(res, 200, fs.readFileSync(filePath), type);
}

function assertInside(filePath, root) {
  const base = path.resolve(root);
  const target = path.resolve(filePath);
  if (target !== base && !target.startsWith(base + path.sep)) throw validationError('非法路径');
  return target;
}

function json(res, status, body) {
  text(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function text(res, status, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
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

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

if (require.main === module) {
  if (process.env.PFM_ENABLE_FERRO_LANDAU_EDITOR !== '1') {
    console.error('请先设置 PFM_ENABLE_FERRO_LANDAU_EDITOR=1 再启动 ferro Landau editor。');
    process.exit(1);
  }
  const server = createLandauEditorServer();
  server.listen(server.port, server.host, () => {
    console.log(`Ferro Landau editor: http://${server.host}:${server.port}`);
  });
}

module.exports = {
  createLandauEditorServer,
  validateLandauPayload,
  saveLandauPayload,
  isSafeExpression,
};
