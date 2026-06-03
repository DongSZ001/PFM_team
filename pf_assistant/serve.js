#!/usr/bin/env node
/**
 * PF_assistant WebUI Server bootstrap/orchestration entry.
 *
 * Starts the HTTP server and OpenClaw Gateway WebSocket bridge, wires shared
 * helpers, and keeps service-level lifecycle setup in one place.
 * Route-specific HTTP dispatch lives in src/server modules.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket: WsClient } = require('/usr/lib/node_modules/openclaw/node_modules/ws');
const paths = require('./src/config/paths');

const STATIC_PORT = 3000;
const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 18789;
const STATIC_DIR = paths.nanobotDistDir;
const CUSTOM_WEBUI_DIR = paths.customWebuiDir;
const CONTROL_UI_DIR = '/usr/lib/node_modules/openclaw/dist/control-ui';
const DEVICE_IDENTITY_PATH = '/home/admin/.openclaw/identity/device.json';
const SERVICE_STARTED_AT = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function getRequestBase(req) {
  const host = req.headers.host || "127.0.0.1:" + STATIC_PORT;
  return "http://" + host;
}

// Load auth + database modules
const db = require('./database');
const { handleAuthRoute } = require('./auth');
const mailer = require('./mailer');
const { readGatewayCredentials } = require('./gateway-config');
const { checkTcpPort } = require('./runtime-status');
const { createRuntimeApiHandler, isRuntimeApiPath } = require('./src/server/runtime-routes');
const { createAuthChatApiHandler, isAuthChatApiPath, isLegacyAuthPath } = require('./src/server/auth-chat-routes');
const { createMaterialApiHandler, isMaterialApiPath } = require('./src/server/material-routes');
const { createStaticProxyHandler } = require('./src/server/static-proxy-routes');

// Initialize database
db.initDb();

// Initialize mailer (loads SMTP config if env vars are set)
mailer.init();

// Periodically purge expired password-reset tokens (best-effort, runs every 6h).
const RESET_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  try {
    const removed = db.purgeExpiredResetTokens();
    if (removed > 0) console.log(`[db] Purged ${removed} expired reset token(s)`);
  } catch (err) {
    console.warn('[db] Reset-token purge failed:', err.message);
  }
}, RESET_PURGE_INTERVAL_MS).unref();

// ============ Device Identity Utilities ============

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function derivePublicKeyRaw(publicKeyPem) {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function signDevicePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key));
}

function buildDeviceAuthPayloadV3(params) {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const platform = params.platform || "";
  const deviceFamily = params.deviceFamily || "";
  return [
    "v3", params.deviceId, params.clientId, params.clientMode, params.role,
    scopes, String(params.signedAtMs), token, params.nonce, platform, deviceFamily
  ].join("|");
}

// Load device identity
let deviceIdentity = null;
const gatewayCredentials = readGatewayCredentials(process.env);
const DEVICE_TOKEN = gatewayCredentials.deviceToken;
const GATEWAY_PASSWORD = gatewayCredentials.gatewayPassword;
if (DEVICE_TOKEN) {
  console.log('[gateway] Device token configured via ' + gatewayCredentials.tokenSource);
} else {
  console.warn('[gateway] Device token is not configured. Set OC_GATEWAY_TOKEN or OC_DEVICE_TOKEN before starting WebUI.');
}
if (GATEWAY_PASSWORD) {
  console.log('[gateway] Gateway password configured');
}
try {
  if (fs.existsSync(DEVICE_IDENTITY_PATH)) {
    const raw = fs.readFileSync(DEVICE_IDENTITY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
      deviceIdentity = {
        deviceId: parsed.deviceId,
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem
      };
      console.log('[identity] Loaded device identity:', deviceIdentity.deviceId);
    }
  }
} catch (err) {
  console.error('[identity] Failed to load device identity:', err.message);
}

// ============ Static File Serving ============

function serveStatic(req, res, urlPath, baseDir) {
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(baseDir, urlPath);
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const headers = { 'Content-Type': contentType };
    if (['.html', '.js', '.css'].includes(ext)) {
      headers['Cache-Control'] = 'no-store, max-age=0';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function proxyRequest(req, res, targetHost, targetPort) {
  const url = new URL(req.url, getRequestBase(req));
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: `${targetHost}:${targetPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('Proxy unavailable');
  });

  req.pipe(proxyReq);
}

// ============ Gateway WebSocket Connection ============

function createGatewayConnection(ws, token) {
  let gatewayWs = null;
  let handshakeComplete = false;
  let challengeNonce = null;
  let signedAtMs = null;
  const scopes = ['operator.admin', 'operator.read', 'operator.write'];

  function connect() {
    gatewayWs = new WsClient(`ws://${GATEWAY_HOST}:${GATEWAY_PORT}/`);

    gatewayWs.on('open', () => {
      console.log('[ws] Gateway connected');
    });

    gatewayWs.on('message', (data) => {
      const msg = data.toString();

      if (msg.includes('connect.challenge')) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.payload && parsed.payload.nonce) {
            challengeNonce = parsed.payload.nonce;
            console.log('[ws] Got challenge, sending connect with device identity...');
            signedAtMs = Date.now();

            const clientId = 'openclaw-tui';
            const clientMode = 'ui';
            const role = 'operator';
            const platform = 'linux';

            const payload = buildDeviceAuthPayloadV3({
              deviceId: deviceIdentity.deviceId,
              clientId, clientMode, role, scopes,
              signedAtMs, token: DEVICE_TOKEN,
              nonce: challengeNonce, platform, deviceFamily: ''
            });

            const signature = signDevicePayload(deviceIdentity.privateKeyPem, payload);
            const device = {
              id: deviceIdentity.deviceId,
              publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
              signature, signedAt: signedAtMs, nonce: challengeNonce
            };

            gatewayWs.send(JSON.stringify({
              type: 'req', id: '1', method: 'connect',
              params: {
                minProtocol: 3, maxProtocol: 3,
                auth: { password: GATEWAY_PASSWORD, deviceToken: DEVICE_TOKEN },
                client: { id: clientId, displayName: 'openclaw-tui', version: '1.0.0', platform, mode: clientMode },
                role, scopes, caps: [], commands: [], permissions: {},
                device, locale: 'zh-CN', userAgent: 'PFM2-WebUI/1.0.0'
              }
            }));
            return;
          }
        } catch (e) {
          console.error('[ws] Challenge parse error:', e);
        }
      }

      if (msg.includes('hello-ok')) {
        handshakeComplete = true;
        console.log('[ws] ✅ HELLO-OK received from Gateway, forwarding to browser');
      } else if (msg.includes('connect.challenge')) {
        // already logged above
      } else if (msg.length < 500) {
        console.log('[ws] ← from Gateway:', msg.substring(0, 200));
      }

      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      } else {
        console.log('[ws] ⚠️ Browser socket not open, msg dropped');
      }
    });

    gatewayWs.on('close', (code, reason) => {
      console.log('[ws] Gateway closed:', code, reason);
      if (ws.readyState === ws.OPEN) ws.close();
    });

    gatewayWs.on('error', (err) => {
      console.error('[ws] Gateway error:', err.message);
    });
  }

  ws.on('message', (data) => {
    if (gatewayWs && gatewayWs.readyState === gatewayWs.OPEN) {
      gatewayWs.send(data.toString());
    }
  });

  ws.on('close', () => {
    console.log('[ws] Browser disconnected');
    if (gatewayWs) gatewayWs.close();
  });

  ws.on('error', (err) => {
    console.error('[ws] Browser error:', err.message);
    if (gatewayWs) gatewayWs.close();
  });

  connect();
  return gatewayWs;
}

// ============ WebSocket Server ============

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, getRequestBase(req));
  console.log('[ws] New browser connection:', url.pathname);

  // Route /webui /nanobot to bridge
  if (url.pathname.startsWith('/webui') || url.pathname.startsWith('/nanobot')) {
    const bridgeWs = new WsClient(`ws://127.0.0.1:8765${url.pathname}${url.search}`, {
      headers: req.headers,
    });
    bridgeWs.on('open', () => console.log('[ws-bridge] Connected'));
    bridgeWs.on('message', (data) => { if (ws.readyState === ws.OPEN) ws.send(data); });
    bridgeWs.on('close', () => ws.close());
    bridgeWs.on('error', (err) => { console.error('[ws-bridge] Error:', err.message); ws.close(); });
    ws.on('message', (data) => { if (bridgeWs.readyState === bridgeWs.OPEN) bridgeWs.send(data); });
    ws.on('close', () => bridgeWs.close());
    ws.on('error', () => bridgeWs.close());
    return;
  }

  if (!deviceIdentity) {
    console.error('[ws] No device identity available');
    ws.close(1008, 'no device identity');
    return;
  }

  createGatewayConnection(ws);
});

// ============ HTTP Server ============

// ============ Material Parameters API ============

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function getRuntimeReadiness() {
  return {
    startedAt: SERVICE_STARTED_AT,
    databaseReady: true,
    deviceIdentityLoaded: Boolean(deviceIdentity),
    gatewayConfigured: Boolean(DEVICE_TOKEN),
  };
}

const handleRuntimeRoute = createRuntimeApiHandler({
  jsonResponse,
  getRuntimeReadiness,
  gatewayStatusConfig: () => ({
    host: GATEWAY_HOST,
    port: GATEWAY_PORT,
    deviceIdentityLoaded: Boolean(deviceIdentity),
    gatewayConfigured: Boolean(DEVICE_TOKEN),
  }),
  checkGatewayReachable: (config) => checkTcpPort(config.host, config.port, 800),
});
const handleAuthChatRoute = createAuthChatApiHandler({ handleAuthRoute, jsonResponse });
const handleMaterialsRoute = createMaterialApiHandler({ jsonResponse, readJsonBody });
const handleStaticProxyRoute = createStaticProxyHandler({
  dirs: {
    customWebuiDir: CUSTOM_WEBUI_DIR,
    controlUiDir: CONTROL_UI_DIR,
    staticDir: STATIC_DIR,
  },
  bridge: { host: '127.0.0.1', port: 8765 },
  serveStatic,
  proxyRequest,
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, getRequestBase(req));
  const urlPath = url.pathname;

  const requestOrigin = req.headers.origin || getRequestBase(req);
  res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Cookie', 'session_token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (isRuntimeApiPath(urlPath)) {
    handleRuntimeRoute(req, res, url, urlPath).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
    return;
  }

  if (isAuthChatApiPath(urlPath)) {
    handleAuthChatRoute(req, res, url, urlPath);
    return;
  }

  // Handle /api/materials/* and /api/parameter-sets/* and /api/resolve-parameters
  if (isMaterialApiPath(urlPath)) {
    handleMaterialsRoute(req, res, url, urlPath).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
    return;
  }

  if (isLegacyAuthPath(urlPath)) {
    handleAuthChatRoute(req, res, url, urlPath);
    return;
  }

  handleStaticProxyRoute(req, res, urlPath);
});

server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade === 'websocket') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(STATIC_PORT, '0.0.0.0', () => {
  const publicHost = process.env.PUBLIC_ORIGIN || `http://47.93.53.231:3000`;
  console.log(`✅ PF_assistant WebUI: ${publicHost}`);
  console.log(`   Custom WebUI: /app/*`);
  console.log(`   Auth API: /api/auth/*`);
  console.log(`   Chat API: /chat/*`);
  if (deviceIdentity) {
    console.log(`   Device Identity: ✅ Loaded (${deviceIdentity.deviceId.substring(0, 16)}...)`);
  } else {
    console.log(`   Device Identity: ❌ Not loaded`);
  }
});
