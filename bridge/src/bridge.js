#!/usr/bin/env node
/**
 * nanobot-WebUI Bridge v4 - Complete Protocol Bridge
 * Bridges the React WebUI (nanobot protocol) to OpenClaw Gateway.
 */

const { OcGatewayClient } = require('./ws-client');
const { OcHttpClient } = require('./http-api-client');
const { NanobotServer } = require('./ws-server');
const { HttpServer } = require('./http-server');
const { SessionManager } = require('./session');

class Bridge {
  constructor() {
    this.sessionManager = new SessionManager();
    this.ocClient = null;
    this.nanobotServer = null;
    this.httpServer = null;
  }

  async start(opts = {}) {
    const gatewayUrl = opts.gatewayUrl || process.env.OC_GATEWAY_URL || 'ws://127.0.0.1:18789';
    const token = opts.token || process.env.OC_GATEWAY_TOKEN || '';
    const port = opts.port || parseInt(process.env.BRIDGE_PORT || '8765', 10);

    console.log('[bridge] Starting...');
    console.log(`[bridge] OpenClaw Gateway: ${gatewayUrl}`);
    console.log(`[bridge] Bridge port: ${port}`);

    // Connect to OpenClaw Gateway
    if (token) {
      // Try WebSocket first
      try {
        this.ocClient = new OcGatewayClient({ gatewayUrl, token });
        await this.ocClient.connect();
        console.log('[bridge] Connected to OpenClaw Gateway (WebSocket)');
        this._setupOcEventForwarding();
      } catch (err) {
        console.warn('[bridge] WebSocket connection failed:', err.message);
        console.warn('[bridge] Falling back to HTTP API...');
        // Fall back to HTTP API
        try {
          const httpUrl = gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
          this.ocClient = new OcHttpClient({ gatewayUrl: httpUrl, token });
          // Test HTTP connection
          await this.ocClient.listSessions();
          console.log('[bridge] Connected to OpenClaw Gateway (HTTP API)');
          this._useHttpMode = true;
        } catch (httpErr) {
          console.warn('[bridge] HTTP API connection failed:', httpErr.message);
          console.warn('[bridge] Running in STANDALONE MODE');
          this.ocClient = null;
        }
      }
    } else {
      console.log('[bridge] No token provided, running in STANDALONE MODE');
    }

    // Create nanobot WebSocket handler
    this.nanobotServer = new NanobotServer({
      port,
      ocClient: this.ocClient,
      sessionManager: this.sessionManager,
    });

    // Create HTTP server with shared WebSocket
    this.httpServer = new HttpServer({
      port,
      nanobotServer: this.nanobotServer,
      sessionManager: this.sessionManager,
    });
    this.httpServer.start();

    console.log('[bridge] Ready');
    console.log(`[bridge] Bootstrap: GET http://127.0.0.1:${port}/webui/bootstrap`);
    console.log(`[bridge] WebSocket: ws://127.0.0.1:${port}/`);
  }

  _setupOcEventForwarding() {
    if (!this.ocClient) return;

    // Handle streamed text deltas from agent responses
    this.ocClient.on('agentDelta', (data) => {
      this._routeAgentDelta(data);
    });

    // Handle agent completion / stream end
    this.ocClient.on('agent', (payload) => {
      this._routeAgentEvent(payload);
    });

    // Handle session messages
    this.ocClient.on('sessionMessage', (payload) => {
      this._routeOcMessage(payload);
    });

    // Handle chat events
    this.ocClient.on('chat', (payload) => {
      this._routeOcChat(payload);
    });
  }

  _sessionKeyToChatId(sessionKey) {
    for (const [chatId, session] of this.sessionManager._sessions || []) {
      if (session.ocSessionKey === sessionKey) return chatId;
    }
    // agent:main:main is broadcast to all sessions
    if (sessionKey === 'agent:main:main') return 'BROADCAST';
    return null;
  }

  _broadcastToAll(handler) {
    if (!this.nanobotServer) return;
    for (const [chatId, clients] of this.nanobotServer.clients) {
      for (const client of clients) {
        handler(chatId, client);
      }
    }
  }

  _routeAgentDelta(data) {
    if (!this.nanobotServer) return;
    const mapped = this._sessionKeyToChatId(data.sessionKey || '');
    if (!mapped) return;

    if (mapped === 'BROADCAST') {
      this._broadcastToAll((chatId) => {
        this.nanobotServer._sendToChat(chatId, {
          event: 'delta',
          chat_id: chatId,
          text: data.text,
        });
      });
      return;
    }

    this.nanobotServer._sendToChat(mapped, {
      event: 'delta',
      chat_id: mapped,
      text: data.text,
    });
  }

  _routeAgentEvent(payload) {
    if (!this.nanobotServer) return;
    const data = payload.data || {};
    // Send stream_end on agent item end
    if (data.phase === 'end' || payload.stream === 'item') {
      const mapped = this._sessionKeyToChatId(payload.sessionKey || '');
      if (mapped === 'BROADCAST') {
        this._broadcastToAll((chatId) => {
          this.nanobotServer._sendToChat(chatId, { event: 'stream_end', chat_id: chatId });
        });
      } else if (mapped) {
        this.nanobotServer._sendToChat(mapped, { event: 'stream_end', chat_id: mapped });
      }
    }
  }

  _routeOcMessage(payload) {
    if (!this.nanobotServer) return;
    const mapped = this._sessionKeyToChatId(payload.sessionKey || '');
    if (!mapped || mapped === 'BROADCAST') return;
    const content = payload.content || payload.text || '';
    if (content) {
      this.nanobotServer._sendToChat(mapped, { event: 'message', chat_id: mapped, text: content });
    }
  }

  _routeOcChat(payload) {
    if (!this.nanobotServer) return;
    const mapped = this._sessionKeyToChatId(payload.sessionKey || '');
    if (!mapped || mapped === 'BROADCAST') return;
    if (payload.delta) {
      this.nanobotServer._sendToChat(mapped, { event: 'delta', chat_id: mapped, text: payload.delta });
    }
    if (payload.finish || payload.stream_end) {
      this.nanobotServer._sendToChat(mapped, { event: 'stream_end', chat_id: mapped });
    }
  }

  stop() {
    console.log('[bridge] Shutting down...');
    if (this.nanobotServer) this.nanobotServer.stop();
    if (this.httpServer) this.httpServer.stop();
    if (this.ocClient) this.ocClient.close();
    console.log('[bridge] Stopped');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gateway-url' && args[i + 1]) {
      opts.gatewayUrl = args[++i];
    } else if (args[i] === '--token' && args[i + 1]) {
      opts.token = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (args[i] === '--help') {
      console.log('nanobot-WebUI Bridge');
      console.log('Usage: node bridge.js [--gateway-url <url>] [--token <token>] [--port <port>]');
      console.log('Env: OC_GATEWAY_URL, OC_GATEWAY_TOKEN, BRIDGE_PORT');
      process.exit(0);
    }
  }

  const bridge = new Bridge();
  bridge.start(opts).catch((err) => {
    console.error('[bridge] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => { bridge.stop(); process.exit(0); });
  process.on('SIGTERM', () => { bridge.stop(); process.exit(0); });
}

module.exports = { Bridge };
