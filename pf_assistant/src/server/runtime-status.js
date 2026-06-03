const net = require('net');

const SERVICE_NAME = 'pf-assistant-webui';

function checkStatus(enabled, okLabel = 'ok', missingLabel = 'missing') {
  return { status: enabled ? okLabel : missingLabel };
}

function buildRuntimeStatus(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : now;
  const checks = {
    database: checkStatus(Boolean(options.databaseReady)),
    deviceIdentity: checkStatus(Boolean(options.deviceIdentityLoaded)),
    gatewayCredentials: checkStatus(Boolean(options.gatewayConfigured)),
  };
  const ok = Object.values(checks).every((check) => check.status === 'ok');

  return {
    service: SERVICE_NAME,
    ok,
    uptimeMs: Math.max(0, now - startedAt),
    timestamp: new Date(now).toISOString(),
    checks,
  };
}

function buildGatewayStatus(options = {}) {
  const reachable = Boolean(options.reachable);
  return {
    service: SERVICE_NAME,
    gateway: {
      host: options.host || '127.0.0.1',
      port: options.port || 18789,
      reachable,
      status: reachable ? 'reachable' : 'unreachable',
    },
    checks: {
      deviceIdentity: checkStatus(Boolean(options.deviceIdentityLoaded)),
      gatewayCredentials: checkStatus(Boolean(options.gatewayConfigured)),
    },
  };
}

function checkTcpPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    function finish(value) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

module.exports = {
  SERVICE_NAME,
  buildRuntimeStatus,
  buildGatewayStatus,
  checkTcpPort,
};
