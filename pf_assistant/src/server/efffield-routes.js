'use strict';

const fs = require('fs');
const path = require('path');
const { createEfffieldJobService } = require('../efffield/job-service');
const { createEfffieldDialogueService } = require('../efffield/dialogue-service');

const EFFFIELD_API_PATHS = Object.freeze(['/api/efffield/*']);

function isEfffieldApiPath(urlPath) {
  return urlPath.startsWith('/api/efffield/');
}

function createEfffieldApiHandler({
  requireAuth,
  readJsonBody,
  jsonResponse,
  service = createEfffieldJobService(),
  dialogueService = createEfffieldDialogueService({ jobService: service }),
  logger = console,
} = {}) {
  if (typeof requireAuth !== 'function') throw new Error('requireAuth is required');
  if (typeof readJsonBody !== 'function') throw new Error('readJsonBody is required');
  if (typeof jsonResponse !== 'function') throw new Error('jsonResponse is required');

  return async function handleEfffieldRoute(req, res, url, urlPath) {
    if (!isEfffieldApiPath(urlPath)) return false;
    req.cookies = req.cookies || parseCookies(req.headers && req.headers.cookie);
    if (!requireAuth(req, res)) return true;

    try {
      const parts = urlPath.split('/').filter(Boolean);
      if (req.method === 'POST' && urlPath === '/api/efffield/dialogue') {
        const body = await readJsonBody(req);
        const result = await dialogueService.handleMessage({
          userId: req.userId,
          chatSessionId: body.chatSessionId || body.chat_session_id || null,
          message: body.message || body.content || '',
        });
        jsonResponse(res, 200, result || { type: 'not_efffield' });
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/efffield/jobs') {
        const body = await readJsonBody(req);
        const result = await service.createAndRunJob({
          userId: req.userId,
          chatSessionId: body.chatSessionId || body.chat_session_id || null,
          request: body,
        });
        jsonResponse(res, 200, publicJobResult(result));
        return true;
      }

      if (req.method === 'POST' && urlPath === '/api/efffield/parameter-jobs') {
        const body = await readJsonBody(req);
        const chatSessionId = body.chatSessionId || body.chat_session_id || null;
        const result = await service.createAndRunParameterJob({
          userId: req.userId,
          chatSessionId,
          parameterText: body.parameterText || body.parameter_text || '',
          structure: body.structure,
          solver: body.solver,
        });
        if (dialogueService && typeof dialogueService.clearDraft === 'function') {
          dialogueService.clearDraft({ userId: req.userId, chatSessionId });
        }
        jsonResponse(res, 200, publicJobResult(result));
        return true;
      }

      if (req.method === 'GET' && parts.length === 4 && parts[2] === 'jobs') {
        const result = service.getJobResult(parts[3]);
        if (!result) {
          jsonResponse(res, 404, { error: '计算任务不存在' });
          return true;
        }
        jsonResponse(res, 200, result);
        return true;
      }

      if (req.method === 'GET' && parts.length === 5 && parts[2] === 'jobs' && parts[4] === 'results') {
        const result = service.getJobResult(parts[3]);
        if (!result) {
          jsonResponse(res, 404, { error: '计算结果不存在' });
          return true;
        }
        jsonResponse(res, 200, result);
        return true;
      }

      if (req.method === 'GET' && parts.length === 5 && parts[2] === 'assets') {
        const assetPath = service.resolveAssetPath(parts[3], decodeURIComponent(parts[4]));
        res.writeHead(200, {
          'Content-Type': contentTypeFor(assetPath),
          'Cache-Control': 'private, max-age=3600',
        });
        res.end(fs.readFileSync(assetPath));
        return true;
      }

      jsonResponse(res, 404, { error: 'Not found' });
      return true;
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) logger.error('[efffield] route error:', err);
      jsonResponse(res, status, { error: err.message || '有效场计算失败' });
      return true;
    }
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
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function publicJobResult(result) {
  const { jobDir, caseDir, outputs, ...rest } = result;
  return {
    ...rest,
    outputs: (outputs || []).map((item) => ({ name: item.name })),
  };
}

function contentTypeFor(filePath) {
  if (path.extname(filePath).toLowerCase() === '.png') return 'image/png';
  return 'application/octet-stream';
}

module.exports = {
  EFFFIELD_API_PATHS,
  createEfffieldApiHandler,
  isEfffieldApiPath,
};
