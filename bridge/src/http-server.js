/**
 * HTTP Server with WebSocket upgrade for nanobot-WebUI Bridge.
 */

const http = require('http');
const { WebSocketServer } = require('/usr/lib/node_modules/openclaw/node_modules/ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

class HttpServer {
  constructor({ port, nanobotServer, sessionManager }) {
    this.port = port;
    this.nanobotServer = nanobotServer;
    this.sessionManager = sessionManager;
    this.server = null;
    this.wss = null;
  }

  start() {
    this.server = http.createServer((req, res) => this._handle(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (this.nanobotServer && this.nanobotServer.token &&
          token !== this.nanobotServer.token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        if (this.nanobotServer) {
          this.nanobotServer._handleWsUpgrade(ws, req);
        }
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[bridge] HTTP/WS server listening on 0.0.0.0:${this.port}`);
    });

    this.server.on('error', (err) => {
      console.error('[bridge] HTTP server error:', err.message);
    });
  }

  _handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname === '/webui/bootstrap') {
        return this._handleBootstrap(req, res);
      }
      if (pathname === '/api/sessions') {
        return this._handleSessions(req, res);
      }
      if (pathname.startsWith('/api/projects')) {
        return this._handleProjects(req, res);
      }
      if (pathname.startsWith('/api/memos')) {
        return this._handleMemos(req, res);
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      console.error('[bridge] HTTP handler error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  _handleBootstrap(req, res) {
    const data = {
      token: this.nanobotServer ? this.nanobotServer.getToken() : 'bridge-token',
      ws_path: '/',
      expires_in: 86400,
      model_name: process.env.OC_MODEL_NAME || null,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  _handleSessions(req, res) {
    const sessions = this.sessionManager.listSessions();
    const cleaned = sessions.map((s) => ({
      key: `websocket:${s.chatId}`,
      chat_id: s.chatId,
      created_at: new Date(s.createdAt).toISOString(),
      updated_at: new Date(s.createdAt).toISOString(),
      preview: '',
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: cleaned }));
  }

  _handleProjects(req, res) {
    const workspace = process.env.OC_WORKSPACE || path.join(os.homedir(), '.openclaw', 'workspace');
    const manifestPath = path.join(workspace, 'projects', 'project-manifest.json');
    let manifest = { version: 1, updated: null, dashboardTitle: 'Research Dashboard', roots: {}, categories: [], projects: [], scanReport: null };
    try {
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      }
    } catch (err) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(manifest));
  }

  _handleMemos(req, res) {
    const workspace = process.env.OC_WORKSPACE || path.join(os.homedir(), '.openclaw', 'workspace');
    const memoPath = path.join(workspace, 'memos', 'memo-state.json');
    let memoState = { memos: [] };
    try {
      if (fs.existsSync(memoPath)) {
        memoState = JSON.parse(fs.readFileSync(memoPath, 'utf8'));
      }
    } catch (err) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(memoState));
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = { HttpServer };
