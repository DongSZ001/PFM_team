/**
 * Static UI and bridge proxy route dispatch.
 *
 * The actual static/proxy helpers stay in serve.js; this module owns the
 * path dispatch order so it can be tested independently.
 */

'use strict';

const STATIC_PROXY_ROUTE_LABELS = Object.freeze(['custom-webui', 'control-ui', 'bridge-proxy', 'static-fallback']);

function createStaticProxyHandler({ dirs, bridge, serveStatic, proxyRequest } = {}) {
  if (!dirs) throw new Error('dirs is required');
  if (!bridge) throw new Error('bridge is required');
  if (typeof serveStatic !== 'function') throw new Error('serveStatic is required');
  if (typeof proxyRequest !== 'function') throw new Error('proxyRequest is required');

  return function handleStaticProxyRoute(req, res, urlPath) {
    if (urlPath.startsWith('/app/') || urlPath === '/app') {
      const customPath = urlPath.replace(/^\/app/, '') || '/index.html';
      serveStatic(req, res, customPath, dirs.customWebuiDir);
      return true;
    }

    if (urlPath.startsWith('/control/') || urlPath === '/control') {
      const controlPath = urlPath.replace(/^\/control/, '') || '/index.html';
      serveStatic(req, res, controlPath, dirs.controlUiDir);
      return true;
    }

    if (urlPath.startsWith('/webui/') || urlPath.startsWith('/api/')) {
      proxyRequest(req, res, bridge.host, bridge.port);
      return true;
    }

    serveStatic(req, res, urlPath, dirs.staticDir);
    return true;
  };
}

module.exports = {
  STATIC_PROXY_ROUTE_LABELS,
  createStaticProxyHandler,
};
