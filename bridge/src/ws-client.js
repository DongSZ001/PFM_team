/**
 * OpenClaw Gateway WebSocket Client - Debug Version
 */

const WebSocket = require('/usr/lib/node_modules/openclaw/node_modules/ws');
const { EventEmitter } = require('events');

class OcGatewayClient extends EventEmitter {
  constructor({ gatewayUrl, token }) {
    super();
    this.gatewayUrl = gatewayUrl || 'ws://127.0.0.1:18789';
    this.token = token || '';
    this.ws = null;
    this.connected = false;
    this.authenticated = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.subscribedSessions = new Set();
    this._debug = process.env.DEBUG;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[OcClient] Connecting to ${this.gatewayUrl}...`);

      const wsUrl = new URL(this.gatewayUrl);
      if (this.token) wsUrl.searchParams.set('token', this.token);

      this.ws = new WebSocket(wsUrl.toString(), {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });

      this.ws.on('open', () => console.log('[OcClient] WS opened'));
      this.ws.on('message', (data) => this._handleMessage(data));
      this.ws.on('error', (err) => console.error('[OcClient] WS error:', err.message));
      this.ws.on('close', (code, reason) => {
        console.log(`[OcClient] WS closed: ${code} ${reason}`);
        this.connected = false;
        this.authenticated = false;
        this.emit('close', code, reason);
      });

      const onMessage = (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          this.ws.off('message', onMessage);
          this._sendConnect(msg.payload, resolve, reject);
        }
      };
      this.ws.on('message', onMessage);

      setTimeout(() => {
        if (!this.authenticated) {
          reject(new Error('Connect timeout'));
          try { this.ws.close(); } catch {}
        }
      }, 15000);
    });
  }

  _sendConnect(challengePayload, resolve, reject) {
    // If using deviceToken, don't send device object (which requires signature)
    // The token itself should be enough for authentication
    const params = {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'cli', version: '1.0.0', platform: 'linux', mode: 'cli' },
      role: 'operator', scopes: ['operator.read', 'operator.write'],
      auth: this.token ? { deviceToken: this.token } : {},
      locale: 'zh-CN', userAgent: 'nanobot-bridge/1.0',
    };
    
    // Only add device if NOT using deviceToken (to avoid signature requirement)
    if (!this.token) {
      params.device = { id: '3895db502f7fc204ac839227be2e6ce8a12985d744bc9221dfbd003ddfa629cc', publicKey: 'P4Okg_lzKpiULb0SbiRMautbBAj8FIJUAtbL2tqmSIM' };
    }
    
    const connectReq = {
      type: 'req',
      id: this._nextId(),
      method: 'connect',
      params: params,
    };

    const onRes = (data) => {
      let res;
      try { res = JSON.parse(data.toString()); } catch { return; }
      if (res.type === 'res' && res.id === connectReq.id) {
        this.ws.off('message', onRes);
        if (res.ok) {
          console.log('[OcClient] Authenticated!');
          console.log('[OcClient] hello-ok payload:', JSON.stringify(res.payload));
          this.authenticated = true;
          this.connected = true;
          this._startEventLoop();
          resolve(res);
        } else {
          reject(new Error(`Auth failed: ${JSON.stringify(res.error)}`));
        }
      }
    };
    this.ws.on('message', onRes);
    this.ws.send(JSON.stringify(connectReq));

    setTimeout(() => {
      if (!this.authenticated) reject(new Error('Auth timeout'));
    }, 10000);
  }

  _startEventLoop() {
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleMessage(msg);
      } catch {}
    });
  }

  _handleMessage(msg) {
    if (msg.type === 'res' && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      console.log('[OcClient] Response:', JSON.stringify(msg));
      pending.resolve(msg);
      return;
    }
    if (msg.type === 'event') {
      this._handleEvent(msg.event, msg.payload || {});
    }
  }

  _handleEvent(event, payload) {
    if (this._debug) {
      console.log('[OcClient] EVENT:', event, 'keys:', Object.keys(payload).join(','));
    }

    switch (event) {
      case 'session.message':
        this.emit('sessionMessage', payload);
        break;
      case 'chat':
        this.emit('chat', payload);
        break;
      case 'agent': {
        // Agent event structure:
        // { sessionKey, runId, stream, data: { itemId, phase, kind, title, delta, content, ... } }
        const data = payload.data || {};
        
        if (this._debug) {
          // Print all keys of data to find where text lives
          const dataStr = JSON.stringify(data).slice(0, 200);
          if (dataStr !== '{}') console.log('[OcClient] agent data:', dataStr);
        }
        
        // Try various delta extraction strategies
        let text = null;
        if (typeof data.delta === 'string' && data.delta.length > 0) {
          text = data.delta;
        } else if (typeof data.content === 'string' && data.content.length > 0) {
          text = data.content;
        } else if (typeof data.text === 'string' && data.text.length > 0) {
          text = data.text;
        } else if (typeof data === 'string' && data.length > 0) {
          text = data;
        }
        
        if (text) {
          console.log('[OcClient] agentDelta text:', text.slice(0, 80));
          this.emit('agentDelta', {
            sessionKey: payload.sessionKey,
            runId: payload.runId,
            text: text,
          });
        }
        
        // Check for final stream end
        if (data.phase === 'end' && data.kind === 'message') {
          console.log('[OcClient] agent stream END');
          this.emit('agentEnd', { sessionKey: payload.sessionKey, runId: payload.runId });
        }
        break;
      }
      case 'tick':
        break;
      default:
        this.emit('event', event, payload);
    }
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[OcClient] Sending:', JSON.stringify(obj).slice(0, 200));
      this.ws.send(JSON.stringify(obj));
    }
  }

  _nextId() {
    return `${Date.now()}-${++this.requestId}`;
  }

  async _call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this._nextId();
      this.pendingRequests.set(id, { resolve, reject });
      this._send({ type: 'req', id, method, params });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Method ${method} timed out`));
        }
      }, 30000);
    });
  }

  async createSession(sessionKey) {
    return this._call('sessions.create', { key: sessionKey });
  }

  async sendMessage(sessionKey, message) {
    const msg = typeof message === 'string' ? { content: message } : message;
    // Gateway expects: { sessionKey, message: { content: "..." } }
    return this._call('chat.send', { sessionKey, message: msg });
  }

  async subscribeSession(sessionKey) {
    if (!this.subscribedSessions.has(sessionKey)) {
      await this._call('sessions.subscribe', { sessionKey });
      this.subscribedSessions.add(sessionKey);
    }
  }

  async listSessions() {
    return this._call('sessions.list');
  }

  async abort(sessionKey) {
    return this._call('sessions.abort', { sessionKey });
  }

  close() {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}

module.exports = { OcGatewayClient };
