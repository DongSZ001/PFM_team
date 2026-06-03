#!/usr/bin/env node
const { WebSocket } = require('/usr/lib/node_modules/openclaw/node_modules/ws');

const baseUrl = process.env.PF_WEBUI_BASE || 'http://127.0.0.1:3000';
const timeoutMs = Number(process.env.PF_SMOKE_TIMEOUT_MS || 15000);
const sendChat = !process.argv.includes('--skip-chat');

function withTimeout(promise, label, ms = timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getJson(path) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, { headers: { 'User-Agent': 'pf-webui-smoke-check/1.0' } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(path + ' returned non-JSON body: ' + text.slice(0, 120));
  }
  if (!res.ok) {
    throw new Error(path + ' returned HTTP ' + res.status + ': ' + JSON.stringify(body));
  }
  return body;
}

function wsUrlFromBase(urlString) {
  const url = new URL(urlString);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  url.search = '';
  return url.toString();
}

function waitForGatewayFlow() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrlFromBase(baseUrl));
    const result = { helloOk: false, sessionKey: null, chatAccepted: false };
    const sessionReqId = 'smoke-session-' + Date.now();
    const chatReqId = 'smoke-chat-' + Date.now();

    function closeAndResolve() {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close();
      resolve(result);
    }

    ws.on('open', () => {});
    ws.on('error', (err) => reject(err));
    ws.on('close', () => {
      if (!result.helloOk) reject(new Error('WebSocket closed before hello-ok'));
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (_) {
        return;
      }

      if (msg.type === 'res' && msg.ok && msg.payload && msg.payload.type === 'hello-ok') {
        result.helloOk = true;
        ws.send(JSON.stringify({ type: 'req', id: sessionReqId, method: 'sessions.create', params: {} }));
        return;
      }

      if (msg.type === 'res' && msg.id === sessionReqId) {
        if (!msg.ok) reject(new Error('sessions.create failed: ' + JSON.stringify(msg.error)));
        result.sessionKey = msg.payload?.key || msg.payload?.sessionKey || msg.payload?.result?.sessionKey;
        if (!result.sessionKey) reject(new Error('sessions.create response did not include a session key'));
        if (!sendChat) closeAndResolve();
        ws.send(JSON.stringify({
          type: 'req',
          id: chatReqId,
          method: 'chat.send',
          params: {
            sessionKey: result.sessionKey,
            message: 'smoke check: please acknowledge briefly',
            idempotencyKey: 'smoke-' + Date.now(),
          },
        }));
        return;
      }

      if (msg.type === 'res' && msg.id === chatReqId) {
        if (!msg.ok) reject(new Error('chat.send failed: ' + JSON.stringify(msg.error)));
        result.chatAccepted = true;
        closeAndResolve();
      }
    });
  });
}

async function main() {
  const health = await withTimeout(getJson('/health'), '/health');
  if (!health.ok) throw new Error('/health did not report ok: ' + JSON.stringify(health));

  const gateway = await withTimeout(getJson('/api/gateway-status'), '/api/gateway-status');
  if (!gateway.gateway || gateway.gateway.reachable !== true) {
    throw new Error('/api/gateway-status did not report reachable gateway: ' + JSON.stringify(gateway));
  }

  const wsResult = await withTimeout(waitForGatewayFlow(), 'websocket gateway flow');
  if (!wsResult.helloOk || !wsResult.sessionKey) {
    throw new Error('WebSocket flow incomplete: ' + JSON.stringify(wsResult));
  }
  if (sendChat && !wsResult.chatAccepted) {
    throw new Error('chat.send was not accepted: ' + JSON.stringify(wsResult));
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    health: { ok: health.ok },
    gateway: { reachable: gateway.gateway.reachable, status: gateway.gateway.status },
    websocket: wsResult,
  }, null, 2));
}

main().catch((err) => {
  console.error('[smoke-check] failed:', err.message);
  process.exit(1);
});
