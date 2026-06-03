/**
 * Runtime health and gateway status HTTP routes.
 *
 * The route handler receives runtime state providers from serve.js so this
 * module can be tested without starting the HTTP server.
 */

'use strict';

const { buildRuntimeStatus, buildGatewayStatus } = require('./runtime-status');

const RUNTIME_API_PATHS = Object.freeze(['/health', '/api/gateway-status']);

function isRuntimeApiPath(urlPath) {
  return RUNTIME_API_PATHS.includes(urlPath);
}

function createRuntimeApiHandler({
  jsonResponse,
  getRuntimeReadiness,
  gatewayStatusConfig,
  checkGatewayReachable,
  logger = console,
} = {}) {
  if (typeof jsonResponse !== 'function') throw new Error('jsonResponse is required');
  if (typeof getRuntimeReadiness !== 'function') throw new Error('getRuntimeReadiness is required');
  if (typeof gatewayStatusConfig !== 'function') throw new Error('gatewayStatusConfig is required');
  if (typeof checkGatewayReachable !== 'function') throw new Error('checkGatewayReachable is required');

  return async function handleRuntimeRoute(req, res, url, urlPath) {
    if (urlPath === '/health' && req.method === 'GET') {
      const status = buildRuntimeStatus(getRuntimeReadiness());
      jsonResponse(res, status.ok ? 200 : 503, status);
      return true;
    }

    if (urlPath === '/api/gateway-status' && req.method === 'GET') {
      try {
        const config = gatewayStatusConfig();
        const reachable = await checkGatewayReachable(config);
        jsonResponse(res, 200, buildGatewayStatus({ ...config, reachable }));
      } catch (err) {
        logger.error('[api/gateway-status] error:', err && err.message);
        jsonResponse(res, 500, { error: 'gateway status check failed' });
      }
      return true;
    }

    return false;
  };
}

module.exports = {
  RUNTIME_API_PATHS,
  createRuntimeApiHandler,
  isRuntimeApiPath,
};
