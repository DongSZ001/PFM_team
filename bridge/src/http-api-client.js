/**
 * OpenClaw Gateway HTTP API Client
 * Uses HTTP API instead of WebSocket to communicate with OpenClaw Gateway.
 */

const http = require('http');

// Minimal EventEmitter polyfill
class EventEmitter {
  constructor() { this._events = {}; }
  on(e, cb) { (this._events[e] = this._events[e] || []).push(cb); return this; }
  emit(e, ...args) { (this._events[e] || []).forEach(cb => cb(...args)); return this; }
  off(e, cb) { this._events[e] = (this._events[e] || []).filter(c => c !== cb); return this; }
}

class OcHttpClient extends EventEmitter {
  constructor({ gatewayUrl, token }) {
    super();
    this.gatewayUrl = gatewayUrl || 'http://127.0.0.1:18789';
    this.token = token || '';
    this.sessionKey = 'agent:main:main';
    this.authenticated = true;
    this.connected = true;
    this._lastMessageSeq = 0; // Track last seen message sequence
    this._pollInterval = null;
    this._pendingRequests = new Map(); // msgId -> {resolve, reject, chat_id}
  }

  async _invoke(tool, args = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.gatewayUrl);
      const body = JSON.stringify({
        tool,
        args,
        sessionKey: this.sessionKey,
      });

      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: '/tools/invoke',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.ok) {
              resolve(result.result);
            } else {
              reject(new Error(result.error?.message || 'Unknown error'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Send a message and wait for response via polling
   */
  async sendMessage(sessionKey, message) {
    const chatId = message.chat_id || 'default';
    const content = message.content || message;

    // Generate a unique request ID
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Store pending request
    const pending = {
      chat_id: chatId,
      resolve: null,
      reject: null,
      timestamp: Date.now()
    };

    // First, get current message count to know where we start
    let lastSeq = 0;
    try {
      const history = await this._invoke('sessions_history', {
        sessionKey: sessionKey || this.sessionKey,
        limit: 1
      });
      if (history && history.content && history.content.length > 0) {
        const lastMsg = history.content[0].messages[0];
        if (lastMsg && lastMsg.__openclaw && lastMsg.__openclaw.seq) {
          lastSeq = lastMsg.__openclaw.seq;
        }
      }
    } catch (e) {
      console.warn('[OcHttpClient] Failed to get initial history:', e.message);
    }

    // Send the message
    try {
      await this._invoke('sessions_send', {
        sessionKey: sessionKey || this.sessionKey,
        message: content
      });
    } catch (err) {
      throw new Error('Failed to send message: ' + err.message);
    }

    // Poll for response
    const maxPolls = 30; // 30 seconds max
    const pollDelay = 1000; // 1 second between polls

    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, pollDelay));

      try {
        const history = await this._invoke('sessions_history', {
          sessionKey: sessionKey || this.sessionKey,
          limit: 5
        });

        if (history && history.content && history.content.length > 0) {
          const session = history.content[0];
          
          // Find new messages after our lastSeq
          for (const msg of session.messages) {
            if (msg.__openclaw && msg.__openclaw.seq > lastSeq) {
              lastSeq = msg.__openclaw.seq;

              // Look for assistant response with actual text
              if (msg.role === 'assistant' && msg.content) {
                for (const block of msg.content) {
                  if (block.type === 'text' && block.text) {
                    // Found a text response!
                    const responseText = block.text;
                    
                    // Emit delta event for streaming
                    this.emit('agentDelta', {
                      sessionKey: sessionKey || this.sessionKey,
                      text: responseText
                    });
                    
                    // Return the complete response
                    return { text: responseText };
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[OcHttpClient] Poll error:', e.message);
      }
    }

    throw new Error('Timeout waiting for response');
  }

  /**
   * List sessions (for connection test)
   */
  async listSessions() {
    return { sessions: [] };
  }

  /**
   * Get message history
   */
  async getHistory(sessionKey, limit = 10) {
    const result = await this._invoke('sessions_history', {
      sessionKey: sessionKey || this.sessionKey,
      limit: limit
    });
    return result;
  }

  /**
   * Start polling for new messages (background mode)
   */
  startPolling(sessionKey, callback, intervalMs = 2000) {
    this.stopPolling();
    this._pollCallback = callback;
    this._pollInterval = setInterval(async () => {
      try {
        const history = await this.getHistory(sessionKey, 3);
        if (history && history.content && history.content.length > 0) {
          const session = history.content[0];
          for (const msg of session.messages) {
            if (msg.__openclaw && msg.__openclaw.seq > this._lastMessageSeq) {
              this._lastMessageSeq = msg.__openclaw.seq;
              if (msg.role === 'assistant' && msg.content) {
                for (const block of msg.content) {
                  if (block.type === 'text' && block.text) {
                    this._pollCallback(block.text);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  // No-op for compatibility
  subscribeSession(sessionKey) {
    return Promise.resolve();
  }

  isConnected() {
    return true;
  }
}

module.exports = { OcHttpClient };