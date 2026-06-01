/**
 * Authentication routes and middleware
 */

const db = require('./database');
const crypto = require('crypto');

// In-memory session store: sessionToken -> userId
const sessions = new Map();

// Session token expiry: 7 days
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============ Middleware ============

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.cookies?.session_token;

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '未登录' }));
    return false;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话已过期，请重新登录' }));
    return false;
  }

  req.userId = session.userId;
  req.sessionToken = token;
  return true;
}

// ============ Auth Routes ============

function handleRegister(req, res, body) {
  try {
    const { organization, email, password } = body;

    // Validation
    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邮箱和密码不能为空' }));
      return;
    }

    if (password.length < 6) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '密码长度不能少于6位' }));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邮箱格式不正确' }));
      return;
    }

    const user = db.createUser(organization || '', email, password);

    // Auto-login after registration
    const token = generateSessionToken();
    sessions.set(token, {
      userId: user.id,
      expiresAt: Date.now() + SESSION_TTL
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict`
    });
    res.end(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        organization: user.organization
      }
    }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleLogin(req, res, body) {
  try {
    const { email, password } = body;

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邮箱和密码不能为空' }));
      return;
    }

    const user = db.verifyUser(email, password);
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '邮箱或密码错误' }));
      return;
    }

    const token = generateSessionToken();
    sessions.set(token, {
      userId: user.id,
      expiresAt: Date.now() + SESSION_TTL
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict`
    });
    res.end(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        organization: user.organization
      }
    }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '服务器错误' }));
  }
}

function handleMe(req, res) {
  if (!requireAuth(req, res)) return;

  const user = db.getUserById(req.userId);
  if (!user) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '用户不存在' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: user.id,
    email: user.email,
    organization: user.organization
  }));
}

function handleLogout(req, res) {
  const token = req.headers['x-session-token'] || req.cookies?.session_token;
  if (token) {
    sessions.delete(token);
  }

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': 'session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict'
  });
  res.end(JSON.stringify({ success: true }));
}

function handleGetSessions(req, res) {
  if (!requireAuth(req, res)) return;

  const sessions_list = db.getChatSessions(req.userId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(sessions_list.map(s => ({
    id: s.id,
    title: s.title,
    openclaw_session_key: s.openclaw_session_key,
    created_at: s.created_at,
    updated_at: s.updated_at
  }))));
}

function handleCreateSession(req, res, body) {
  if (!requireAuth(req, res)) return;

  const { openclaw_session_key } = body || {};
  const session = db.createChatSession(req.userId, openclaw_session_key || null);

  // Register active session mapping
  if (openclaw_session_key) {
    db.setActiveSession(openclaw_session_key, req.userId, session.id);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ session_id: session.id }));
}

function handleGetSessionMessages(req, res, sessionId) {
  if (!requireAuth(req, res)) return;

  const session = db.getChatSession(sessionId, req.userId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话不存在' }));
    return;
  }

  const messages = db.getChatMessages(sessionId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(messages.map(m => ({
    role: m.role,
    content: m.content
  }))));
}

function handleUpdateSessionTitle(req, res, sessionId, body) {
  if (!requireAuth(req, res)) return;

  const { title } = body;
  if (!title) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '标题不能为空' }));
    return;
  }

  const result = db.updateChatSessionTitle(sessionId, req.userId, title);
  if (result.changes === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话不存在' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

function handleDeleteSession(req, res, sessionId) {
  if (!requireAuth(req, res)) return;

  const session = db.getChatSession(sessionId, req.userId);
  if (session && session.openclaw_session_key) {
    db.removeActiveSession(session.openclaw_session_key);
  }

  const result = db.deleteChatSession(sessionId, req.userId);
  if (result.changes === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话不存在' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

function handleSaveMessage(req, res, body) {
  if (!requireAuth(req, res)) return;

  const { session_id, role, content } = body;
  if (!session_id || !role || !content) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少必要参数' }));
    return;
  }

  const session = db.getChatSession(session_id, req.userId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话不存在' }));
    return;
  }

  const msg = db.saveChatMessage(session_id, role, content);

  // Update openclaw session key if provided and session doesn't have one
  if (session.openclaw_session_key) {
    db.setActiveSession(session.openclaw_session_key, req.userId, session_id);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: msg.id, created_at: msg.created_at }));
}

function handleGetActiveSession(req, res) {
  if (!requireAuth(req, res)) return;

  // Find user's most recent session with an OpenClaw key
  const session = db.findUserActiveSession(req.userId);
  if (!session) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ session_id: null, openclaw_session_key: null }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    session_id: session.id,
    openclaw_session_key: session.openclaw_session_key
  }));
}

function handleBindOpenClawSession(req, res, body) {
  if (!requireAuth(req, res)) return;

  const { session_id, openclaw_session_key } = body;
  if (!session_id || !openclaw_session_key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少必要参数' }));
    return;
  }

  const session = db.getChatSession(session_id, req.userId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '会话不存在' }));
    return;
  }

  db.updateChatSessionOpenclawKey(session_id, req.userId, openclaw_session_key);
  db.setActiveSession(openclaw_session_key, req.userId, session_id);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

// Parse cookies from header
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = (rest.join('=') || '').trim();
  });
  return cookies;
}

// Route handler - call this from serve.js
function handleAuthRoute(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  // Attach cookie parser
  req.cookies = parseCookies(req.headers.cookie);

  // Collect body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          req.body = body ? JSON.parse(body) : {};
        } catch {
          req.body = {};
        }
        resolve(route());
      });
    });
  }

  // GET/DELETE/PATCH — synchronous, wrap in resolved Promise for uniform API
  return Promise.resolve(route());

  function route() {
    // /auth/register
    if (pathParts[0] === 'auth' && pathParts[1] === 'register' && method === 'POST') {
      handleRegister(req, res, req.body);
      return true;
    }

    // /auth/login
    if (pathParts[0] === 'auth' && pathParts[1] === 'login' && method === 'POST') {
      handleLogin(req, res, req.body);
      return true;
    }

    // /auth/me
    if (pathParts[0] === 'auth' && pathParts[1] === 'me' && method === 'GET') {
      handleMe(req, res);
      return true;
    }

    // /auth/logout
    if (pathParts[0] === 'auth' && pathParts[1] === 'logout' && method === 'POST') {
      handleLogout(req, res);
      return true;
    }

    // /chat/sessions
    if (pathParts[0] === 'chat' && pathParts[1] === 'sessions') {
      if (pathParts.length === 2) {
        if (method === 'GET') {
          handleGetSessions(req, res);
          return true;
        }
        if (method === 'POST') {
          handleCreateSession(req, res, req.body);
          return true;
        }
      }

      // /chat/sessions/:id
      if (pathParts.length === 3) {
        const sessionId = pathParts[2];

        // /chat/sessions/:id/messages
        if (pathParts[2] === 'active') {
          // /chat/sessions/active - get user's most recent active session
          handleGetActiveSession(req, res);
          return true;
        }

        if (pathParts[2] === 'messages') {
          // This won't match here, but we handle elsewhere
        }

        if (method === 'GET') {
          handleGetSessionMessages(req, res, sessionId);
          return true;
        }
        if (method === 'DELETE') {
          handleDeleteSession(req, res, sessionId);
          return true;
        }
        if (method === 'PATCH') {
          handleUpdateSessionTitle(req, res, sessionId, req.body);
          return true;
        }
      }

      // /chat/sessions/:id/messages
      if (pathParts.length === 4 && pathParts[2] !== 'active') {
        const sessionId = pathParts[2];
        if (pathParts[3] === 'messages' && method === 'GET') {
          handleGetSessionMessages(req, res, sessionId);
          return true;
        }
        if (pathParts[3] === 'openclaw-key' && method === 'POST') {
          handleBindOpenClawSession(req, res, req.body);
          return true;
        }
      }
    }

    // /chat/save-message
    if (pathParts[0] === 'chat' && pathParts[1] === 'save-message' && method === 'POST') {
      handleSaveMessage(req, res, req.body);
      return true;
    }

    return false; // Not handled
  }
}

module.exports = { handleAuthRoute, requireAuth };
