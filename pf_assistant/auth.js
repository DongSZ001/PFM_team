/**
 * Authentication routes and middleware
 *
 * Routes (all under /api/auth/*):
 *   POST   /api/auth/register           — register a new user (no email verification)
 *   POST   /api/auth/login              — login (sets HttpOnly cookie)
 *   POST   /api/auth/logout             — logout (clears cookie)
 *   GET    /api/auth/me                 — current user
 *   POST   /api/auth/forgot-password    — request a password-reset link
 *   POST   /api/auth/reset-password     — submit new password with token
 *   PATCH  /api/auth/me                 — update own profile (institution / role / intended_use / notes)
 *
 * Chat API under /chat/* is unchanged.
 */

const db = require('./database');
const mailer = require('./mailer');
const { classifyEmail } = require('./email-classifier');
const crypto = require('crypto');

// In-memory session store: sessionToken -> userId
const sessions = new Map();

// Session token expiry: 7 days
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

// Public origin for building password-reset links.
// Set PUBLIC_ORIGIN to the full URL where the app is served,
// e.g. http://47.93.53.231:3000/app.  Falls back to that value in dev.
const PUBLIC_ORIGIN_RAW = (process.env.PUBLIC_ORIGIN || 'http://47.93.53.231:3000/app').replace(/\/+$/, '');
// Normalize: PUBLIC_ORIGIN_PUBLIC is the full app URL (with /app suffix).
// If a legacy value without /app is provided, append it.
const PUBLIC_ORIGIN = PUBLIC_ORIGIN_RAW.endsWith('/app')
  ? PUBLIC_ORIGIN_RAW
  : `${PUBLIC_ORIGIN_RAW}/app`;

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============ Validation helpers ============

const INSTITUTION_TYPES = new Set([
  '高校',
  '科研院所',
  '医院 / 医学院',
  '企业研发部门',
  '其他教育或研究机构',
]);

const ROLES = new Set([
  'PI / 教授',
  '研究员',
  '博士后',
  '博士 / 硕士研究生',
  '实验室管理员',
  '企业研发人员',
  '其他',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validationError(message, code = 'VALIDATION') {
  const err = new Error(message);
  err.code = code;
  return err;
}

function validateRegisterPayload(body) {
  const out = {};
  const errors = [];

  // Required string fields
  const required = {
    email: '邮箱',
    password: '密码',
    confirmPassword: '确认密码',
    institutionName: '单位名称',
    institutionType: '单位类型',
    contactName: '联系人姓名',
    role: '身份 / 角色',
    intendedUse: '使用目的',
  };
  for (const [key, label] of Object.entries(required)) {
    const v = (body[key] || '').toString().trim();
    if (!v) errors.push(`${label}不能为空`);
    out[key] = v;
  }

  // Optional
  out.notes = (body.notes || '').toString().trim();

  // Email format
  if (out.email && !EMAIL_REGEX.test(out.email)) {
    errors.push('邮箱格式不正确');
  }

  // Password length
  if (out.password && out.password.length < 8) {
    errors.push('密码长度不能少于 8 位');
  }

  // Passwords match
  if (out.password !== out.confirmPassword) {
    errors.push('两次输入的密码不一致');
  }

  // Institution type
  if (out.institutionType && !INSTITUTION_TYPES.has(out.institutionType)) {
    errors.push('单位类型不合法');
  }

  // Role
  if (out.role && !ROLES.has(out.role)) {
    errors.push('身份 / 角色不合法');
  }

  // Intended use minimum length (advisory but enforced)
  if (out.intendedUse && out.intendedUse.length < 10) {
    errors.push('使用目的请至少输入 10 个字符');
  }

  // Email domain classification (only if format is OK)
  if (out.email && EMAIL_REGEX.test(out.email)) {
    const result = classifyEmail(out.email);
    if (result.category === 'rejected') {
      errors.push(result.reason || '请使用单位、教育或机构邮箱注册');
    }
  }

  return { values: out, errors };
}

// ============ Middleware ============

function requireAuth(req, res) {
  // Auth is exclusively via HttpOnly cookie. Do NOT trust any header.
  const token = req.cookies && req.cookies.session_token;

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

// ============ Auth Route Handlers ============

async function handleRegister(req, res, body) {
  const { values, errors } = validateRegisterPayload(body || {});

  if (errors.length) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: errors[0], errors }));
    return;
  }

  let user;
  try {
    user = db.createUser({
      email: values.email,
      password: values.password,
      institution_name: values.institutionName,
      institution_type: values.institutionType,
      contact_name: values.contactName,
      role: values.role,
      intended_use: values.intendedUse,
      notes: values.notes,
    });
  } catch (err) {
    if (err.code === 'EMAIL_DUPLICATE') {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '该邮箱已被注册' }));
      return;
    }
    if (err.code === 'EMAIL_REJECTED') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || '邮箱不被接受' }));
      return;
    }
    console.error('[auth] register error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '服务器错误，请稍后重试' }));
    return;
  }

  // Auto-login: set the session cookie right away.
  const token = generateSessionToken();
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL });
  db.touchLastLogin(user.id);

  // Fire-and-forget admin notification. Failures must not affect registration.
  mailer.sendNewUserNotification(user).catch((err) => {
    console.warn('[auth] admin notification error (non-fatal):', err.message);
  });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': buildSessionCookie(token),
  });
  res.end(JSON.stringify({
    success: true,
    user: db.toPublicUser(user),
    redirectTo: '/app/',
  }));
}

function handleLogin(req, res, body) {
  const email = (body && body.email || '').toString().trim();
  const password = (body && body.password || '').toString();

  if (!email || !password) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '邮箱和密码不能为空' }));
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '邮箱或密码错误' }));
    return;
  }

  const userRow = db.verifyUser(email, password);
  if (!userRow) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '邮箱或密码错误' }));
    return;
  }

  if (userRow.status === 'disabled') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '该账号已被禁用，请联系管理员' }));
    return;
  }

  db.touchLastLogin(userRow.id);

  const token = generateSessionToken();
  sessions.set(token, { userId: userRow.id, expiresAt: Date.now() + SESSION_TTL });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': buildSessionCookie(token),
  });
  res.end(JSON.stringify({
    success: true,
    user: db.toPublicUser(userRow),
    redirectTo: '/app/',
  }));
}

function handleLogout(req, res) {
  const token = req.cookies && req.cookies.session_token;
  if (token) sessions.delete(token);

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': clearSessionCookie(),
  });
  res.end(JSON.stringify({ success: true }));
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
  res.end(JSON.stringify(db.toPublicUser(user)));
}

function handleUpdateMe(req, res, body) {
  if (!requireAuth(req, res)) return;

  const patch = {};
  const allowed = {
    institutionName: 'institution_name',
    institutionType: 'institution_type',
    contactName: 'contact_name',
    role: 'role',
    intendedUse: 'intended_use',
    notes: 'notes',
  };
  for (const [apiKey, dbKey] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(body || {}, apiKey)) {
      patch[dbKey] = (body[apiKey] || '').toString().trim();
    }
  }

  if (patch.institution_type && !INSTITUTION_TYPES.has(patch.institution_type)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '单位类型不合法' }));
    return;
  }
  if (patch.role && !ROLES.has(patch.role)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '身份 / 角色不合法' }));
    return;
  }

  const user = db.updateUserProfile(req.userId, patch);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, user: db.toPublicUser(user) }));
}

async function handleForgotPassword(req, res, body) {
  const email = (body && body.email || '').toString().trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    // Always return 200 to avoid leaking which emails exist.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  const user = db.getUserByEmail(email);
  if (user && user.status === 'active') {
    const { token, expiresAt } = db.createPasswordResetToken(user.id);
    const resetUrl = `${PUBLIC_ORIGIN}/?reset=${encodeURIComponent(token)}`;
    try {
      const result = await mailer.sendPasswordResetEmail(user, resetUrl);
      console.log(`[auth] password reset link for ${email} (expires ${new Date(expiresAt).toISOString()})`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[auth] DEV reset URL: ${resetUrl}`);
      }
      if (result && result.resetUrl) {
        // When SMTP is not configured, also expose the URL in the response in dev.
        if (process.env.NODE_ENV !== 'production') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, devResetUrl: resetUrl, expiresAt }));
          return;
        }
      }
    } catch (err) {
      console.warn('[auth] password reset mail error (non-fatal):', err.message);
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

function handleResetPassword(req, res, body) {
  const token = (body && body.token || '').toString();
  const newPassword = (body && body.password || '').toString();
  const confirmPassword = (body && body.confirmPassword || '').toString();

  if (!token) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '重置令牌无效或已过期' }));
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '密码长度不能少于 8 位' }));
    return;
  }
  if (newPassword !== confirmPassword) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '两次输入的密码不一致' }));
    return;
  }

  const user = db.consumePasswordResetToken(token);
  if (!user) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '重置令牌无效或已过期' }));
    return;
  }

  db.updatePassword(user.id, newPassword);

  // Invalidate any existing sessions for this user (best-effort).
  for (const [t, s] of sessions.entries()) {
    if (s.userId === user.id) sessions.delete(t);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

// ============ Chat Routes (unchanged behaviour, kept for compatibility) ============

function handleGetSessions(req, res) {
  if (!requireAuth(req, res)) return;
  const sessions_list = db.getChatSessions(req.userId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(sessions_list.map((s) => ({
    id: s.id,
    title: s.title,
    openclaw_session_key: s.openclaw_session_key,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }))));
}

function handleCreateSession(req, res, body) {
  if (!requireAuth(req, res)) return;
  const { openclaw_session_key } = body || {};
  const session = db.createChatSession(req.userId, openclaw_session_key || null);
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
  res.end(JSON.stringify(messages.map((m) => ({
    role: m.role,
    content: m.content,
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
  if (session.openclaw_session_key) {
    db.setActiveSession(session.openclaw_session_key, req.userId, session_id);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ id: msg.id, created_at: msg.created_at }));
}

function handleGetActiveSession(req, res) {
  if (!requireAuth(req, res)) return;
  const session = db.findUserActiveSession(req.userId);
  if (!session) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ session_id: null, openclaw_session_key: null }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    session_id: session.id,
    openclaw_session_key: session.openclaw_session_key,
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

// ============ Cookie helpers ============

function buildSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `session_token=${token}; Path=/; HttpOnly; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict${secure}`;
}

// ============ Cookie parser ============

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const eq = cookie.indexOf('=');
    if (eq < 0) return;
    const name = cookie.slice(0, eq).trim();
    const value = cookie.slice(eq + 1).trim();
    if (name) cookies[name] = value;
  });
  return cookies;
}

// ============ Route dispatcher ============

function handleAuthRoute(req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "127.0.0.1:3000"));
  // Strip query string — already separated by URL.
  const pathParts = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  req.cookies = parseCookies(req.headers.cookie);

  // Collect body for methods that have one.
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
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

  return Promise.resolve(route());

  function route() {
    // /api/auth/*
    if (pathParts[0] === 'api' && pathParts[1] === 'auth') {
      // /api/auth/register
      if (pathParts[2] === 'register' && method === 'POST') {
        handleRegister(req, res, req.body);
        return true;
      }
      // /api/auth/login
      if (pathParts[2] === 'login' && method === 'POST') {
        handleLogin(req, res, req.body);
        return true;
      }
      // /api/auth/logout
      if (pathParts[2] === 'logout' && method === 'POST') {
        handleLogout(req, res);
        return true;
      }
      // /api/auth/me
      if (pathParts[2] === 'me' && method === 'GET') {
        handleMe(req, res);
        return true;
      }
      // /api/auth/me (PATCH — update profile)
      if (pathParts[2] === 'me' && method === 'PATCH') {
        handleUpdateMe(req, res, req.body);
        return true;
      }
      // /api/auth/forgot-password
      if (pathParts[2] === 'forgot-password' && method === 'POST') {
        handleForgotPassword(req, res, req.body);
        return true;
      }
      // /api/auth/reset-password
      if (pathParts[2] === 'reset-password' && method === 'POST') {
        handleResetPassword(req, res, req.body);
        return true;
      }
    }

    // /chat/* — unchanged
    if (pathParts[0] === 'chat' && pathParts[1] === 'sessions') {
      if (pathParts.length === 2) {
        if (method === 'GET') { handleGetSessions(req, res); return true; }
        if (method === 'POST') { handleCreateSession(req, res, req.body); return true; }
      }
      if (pathParts.length === 3 && pathParts[2] === 'active') {
        if (method === 'GET') { handleGetActiveSession(req, res); return true; }
      }
      if (pathParts.length === 3) {
        const sessionId = pathParts[2];
        if (method === 'GET') { handleGetSessionMessages(req, res, sessionId); return true; }
        if (method === 'DELETE') { handleDeleteSession(req, res, sessionId); return true; }
        if (method === 'PATCH') { handleUpdateSessionTitle(req, res, sessionId, req.body); return true; }
      }
      if (pathParts.length === 4) {
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
    if (pathParts[0] === 'chat' && pathParts[1] === 'save-message' && method === 'POST') {
      handleSaveMessage(req, res, req.body);
      return true;
    }

    return false; // Not handled
  }
}

module.exports = {
  handleAuthRoute,
  requireAuth,
  // exposed for testing
  _internal: {
    validateRegisterPayload,
    classifyEmail,
  },
};
