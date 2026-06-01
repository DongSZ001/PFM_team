/**
 * nanobot WebSocket Protocol Server - Streaming Response Support
 */

const { WebSocket } = require('/usr/lib/node_modules/openclaw/node_modules/ws');
const crypto = require('crypto');

class NanobotServer {
  constructor({ port, ocClient, sessionManager }) {
    this.port = port;
    this.ocClient = ocClient;
    this.sessionManager = sessionManager;
    this.clients = new Map();  // chatId -> Set<ws>
    this.token = this._generateToken();
  }

  _handleWsUpgrade(ws, req) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => this._handleClose(ws));
    ws.on('error', (err) => console.error('[bridge] Client WS error:', err.message));

    const chatId = crypto.randomUUID();
    this.sessionManager.registerConnectionChat(ws, chatId);
    this._send(ws, { event: 'ready', chat_id: chatId, client_id: 'bridge-client' });
    console.log(`[bridge] Client connected, assigned chat_id=${chatId}`);
  }

  _handleMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const chatId = this.sessionManager.getChatByConnection(ws);
    const t = msg.type || msg.event;

    switch (t) {
      case 'new_chat':
        this._handleNewChat(ws, msg);
        break;
      case 'attach':
        this._handleAttach(ws, msg);
        break;
      case 'message':
        this._handleChatMessage(ws, msg);
        break;
    }
  }

  _handleNewChat(ws, msg) {
    const chatId = crypto.randomUUID();

    this.sessionManager.createSession(chatId);
    this.sessionManager.attachSession(chatId);
    this.sessionManager.registerConnectionChat(ws, chatId);
    this.clients.set(chatId, new Set([ws]));

    // Use agent:main:main as the OC session for all bridge clients
    // The bridge subscribes to agent:main:main and routes based on sessionKey
    if (this.ocClient && this.ocClient.authenticated) {
      this.ocClient.subscribeSession('agent:main:main').catch((err) => {
        console.error('[bridge] Failed to subscribe to agent:main:', err.message);
      });
    }

    this._send(ws, { event: 'attached', chat_id: chatId });
    console.log(`[bridge] new_chat: ${chatId}`);
  }

  _handleAttach(ws, msg) {
    const { chat_id } = msg;
    if (!chat_id) {
      this._send(ws, { event: 'error', detail: 'missing chat_id' });
      return;
    }

    let session = this.sessionManager.getSession(chat_id);
    if (!session) {
      session = this.sessionManager.createSession(chat_id);
    }
    this.sessionManager.attachSession(chat_id);
    this.sessionManager.registerConnectionChat(ws, chat_id);

    if (!this.clients.has(chat_id)) {
      this.clients.set(chat_id, new Set());
    }
    this.clients.get(chat_id).add(ws);

    // Subscribe to agent:main:main if not already
    if (this.ocClient && this.ocClient.authenticated) {
      this.ocClient.subscribeSession('agent:main:main').catch(() => {});
    }

    this._send(ws, { event: 'attached', chat_id });
    console.log(`[bridge] attach: ${chat_id}`);
  }

  async _handleChatMessage(ws, msg) {
    const { chat_id, content } = msg;
    if (!chat_id || !content) {
      this._send(ws, { event: 'error', chat_id, detail: 'missing content' });
      return;
    }

    const session = this.sessionManager.getSession(chat_id);
    if (!session) {
      this._send(ws, { event: 'error', chat_id, detail: 'session not found' });
      return;
    }

    console.log(`[bridge] message from ${chat_id}: ${content.slice(0, 80)}...`);

    if (this.ocClient && this.ocClient.authenticated) {
      try {
        // Send to agent:main:main (the main session)
        const res = await this.ocClient.sendMessage('agent:main:main', { content, chat_id });
        console.log(`[bridge] chat.send result:`, JSON.stringify(res).slice(0, 100));
        
        // Send response back to WebUI client
        if (res && res.text) {
          this._send(ws, { event: 'delta', chat_id, text: res.text });
        }
        this._send(ws, { event: 'stream_end', chat_id });
      } catch (err) {
        console.error('[bridge] Failed to send to OpenClaw:', err.message);
        this._send(ws, { event: 'error', chat_id, detail: err.message });
      }
    } else {
      // Standalone mode - echo back
      this._send(ws, { event: 'delta', chat_id, text: `[Standalone] Received: ${content.slice(0, 50)}` });
      this._send(ws, { event: 'stream_end', chat_id });
    }
  }

  _handleClose(ws) {
    const chatId = this.sessionManager.removeConnection(ws);
    if (chatId) {
      const clients = this.clients.get(chatId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.clients.delete(chatId);
        }
      }
    }
  }

  _send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  _sendToChat(chatId, obj) {
    const clients = this.clients.get(chatId);
    if (clients) {
      for (const client of clients) {
        this._send(client, obj);
      }
    }
  }

  _generateToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  getToken() {
    return this.token;
  }

  stop() {
    this.clients.clear();
  }
}

module.exports = { NanobotServer };
