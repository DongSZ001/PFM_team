/**
 * Auth and chat HTTP API route delegation.
 *
 * This module keeps auth/chat dispatch out of serve.js while preserving the
 * existing auth.js handler and legacy endpoint responses.
 */

'use strict';

const AUTH_CHAT_API_PATHS = Object.freeze(['/api/auth/*', '/chat/*']);
const LEGACY_AUTH_API_PATHS = Object.freeze(['/auth', '/auth/*']);

function isAuthChatApiPath(urlPath) {
  return urlPath.startsWith('/api/auth/') || urlPath.startsWith('/chat/');
}

function isLegacyAuthPath(urlPath) {
  return urlPath === '/auth' || urlPath.startsWith('/auth/');
}

function createAuthChatApiHandler({ handleAuthRoute, jsonResponse } = {}) {
  if (typeof handleAuthRoute !== 'function') throw new Error('handleAuthRoute is required');
  if (typeof jsonResponse !== 'function') throw new Error('jsonResponse is required');

  return async function handleAuthChatRoute(req, res, url, urlPath) {
    if (isAuthChatApiPath(urlPath)) {
      const handled = await handleAuthRoute(req, res);
      if (!handled) jsonResponse(res, 404, { error: 'Not found' });
      return true;
    }

    if (isLegacyAuthPath(urlPath)) {
      jsonResponse(res, 410, {
        error: 'Endpoint moved',
        message: '/auth/* 已迁移到 /api/auth/*, 请更新客户端.',
        newPrefix: '/api/auth/',
      });
      return true;
    }

    return false;
  };
}

module.exports = {
  AUTH_CHAT_API_PATHS,
  LEGACY_AUTH_API_PATHS,
  createAuthChatApiHandler,
  isAuthChatApiPath,
  isLegacyAuthPath,
};
