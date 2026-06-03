/**
 * PFM2 相场模拟助手 - Web UI
 *
 * Auth flow: /api/auth/*  (login / register / forgot / reset)
 * Chat:      /chat/*     (sessions / messages)
 * Gateway:   WebSocket   (chat.send / sessions.create)
 *
 * Cookie-based auth: the session_token is set by the server as HttpOnly
 * and travels automatically with every request via `credentials: 'include'`.
 * We DO NOT store or read any token in JS — there is no getSessionToken.
 */

// Use same-origin so this works in any deployment without code changes.
const API_BASE = window.location.origin;

// Personal email domains (mirrors backend's email-classifier.js).
// Used only for client-side hints — backend re-validates and is the source of truth.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'qq.com', 'gmail.com', '163.com', '126.com', 'outlook.com',
  'hotmail.com', 'yahoo.com', 'icloud.com', 'foxmail.com',
  'sina.com', 'sohu.com', 'yeah.net',
  '139.com', '189.cn', 'mail.ru', 'protonmail.com', 'proton.me',
  'aol.com', 'live.com', 'me.com', 'msn.com',
]);

// ============ DOM Elements ============

const landingPage = document.getElementById('landingPage');
const landingLoginBtn = document.getElementById('landingLoginBtn');
const landingRegisterBtn = document.getElementById('landingRegisterBtn');
const heroLoginBtn = document.getElementById('heroLoginBtn');
const heroRegisterBtn = document.getElementById('heroRegisterBtn');
const appShell = document.getElementById('app');
const authModal = document.getElementById('authModal');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');
const authSteps = document.querySelectorAll('.auth-step');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const connectionStatus = document.getElementById('connectionStatus');
const themeToggle = document.getElementById('themeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const sidebar = document.getElementById('sidebar');
const chatList = document.getElementById('chatList');

// ============ State ============

let ws = null;
let isConnected = false;
let requestId = 0;
let currentUser = null;
let currentSessionKey = null;
let currentChatSessionId = null;
let currentAuthStep = 'login';
let isAIThinking = false;
let autoSaveEnabled = false;

// ============ Init ============

function init() {
  setupEventListeners();
  loadTheme();
  checkAuth();
}

function setupEventListeners() {
  // Modal step switcher (delegated)
  authModal.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action="goto"]');
    if (t) {
      e.preventDefault();
      showAuthStep(t.dataset.target);
    }
  });

  // Login form
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitLogin();
  });

  // Register form
  document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitRegister();
  });

  // Forgot-password form
  document.getElementById('forgotForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForgot();
  });

  // Reset-password form
  document.getElementById('resetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitReset();
  });

  // Live email hint while typing in the register form
  const regEmail = document.getElementById('regEmail');
  if (regEmail) regEmail.addEventListener('input', updateEmailHint);

  // Landing auth entry points
  for (const btn of [landingLoginBtn, heroLoginBtn]) {
    if (btn) btn.addEventListener('click', () => openAuthModal('login'));
  }
  for (const btn of [landingRegisterBtn, heroRegisterBtn]) {
    if (btn) btn.addEventListener('click', () => openAuthModal('register'));
  }

  // Chat
  messagesContainer.addEventListener('click', handleMessageContentClick);
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  messageInput.addEventListener('input', autoResize);
  newChatBtn.addEventListener('click', createNewChat);
  themeToggle.addEventListener('click', toggleTheme);
  logoutBtn.addEventListener('click', handleLogout);
}

// ============ Auth: step routing ============

function showAuthStep(step) {
  currentAuthStep = step;
  clearAuthMessages();
  for (const el of authSteps) {
    el.style.display = el.dataset.step === step ? '' : 'none';
  }
  switch (step) {
    case 'login':
      authTitle.textContent = '登录';
      break;
    case 'register':
      authTitle.textContent = '创建账号';
      break;
    case 'forgot':
      authTitle.textContent = '重置密码';
      break;
    case 'reset':
      authTitle.textContent = '重置密码';
      break;
  }
}

function clearAuthMessages() {
  authError.textContent = '';
  authSuccess.textContent = '';
}

function showAuthError(msg) {
  authError.textContent = msg || '';
  authSuccess.textContent = '';
}

function showAuthSuccess(msg) {
  authSuccess.textContent = msg || '';
  authError.textContent = '';
}

function setAuthSubmitting(step, submitting) {
  const form = document.querySelector(`.auth-step[data-step="${step}"]`);
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = submitting;
  if (submitting) {
    btn.dataset.label = btn.textContent;
    btn.textContent = '正在处理...';
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
}

// ============ Auth: check session ============

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      await enterApp();
    } else {
      // Not logged in — decide which step to show (reset flow takes precedence if URL has ?reset=)
      handleUnauthenticatedLanding();
    }
  } catch {
    handleUnauthenticatedLanding();
  }
}

function getUnauthenticatedLandingAction(search) {
  const params = new URLSearchParams(search || '');
  return params.get('reset') ? 'show-reset-modal' : 'show-cover';
}

function showLandingPage() {
  if (landingPage) landingPage.style.display = 'flex';
  if (appShell) appShell.style.display = 'none';
  authModal.style.display = 'none';
  updateStatus('disconnected');
}

function openAuthModal(step = 'login') {
  showAuthStep(step);
  authModal.style.display = 'flex';
  const firstField = step === 'register'
    ? document.getElementById('regInstitutionName')
    : document.getElementById('loginEmail');
  if (firstField && typeof firstField.focus === 'function') setTimeout(() => firstField.focus(), 0);
}

function handleUnauthenticatedLanding() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('reset');
  if (getUnauthenticatedLandingAction(window.location.search) === 'show-reset-modal') {
    document.getElementById('resetToken').value = resetToken;
    openAuthModal('reset');
    return;
  }
  showLandingPage();
}

// ============ Auth: login ============

async function submitLogin() {
  clearAuthMessages();
  setAuthSubmitting('login', true);
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || '登录失败');
      return;
    }
    currentUser = data.user;
    enterApp();
  } catch (err) {
    showAuthError('网络错误，请稍后重试');
  } finally {
    setAuthSubmitting('login', false);
  }
}

// ============ Auth: register ============

async function submitRegister() {
  clearAuthMessages();

  // Client-side validation — the backend re-validates, this is just for UX.
  const data = {
    email: document.getElementById('regEmail').value.trim(),
    password: document.getElementById('regPassword').value,
    confirmPassword: document.getElementById('regConfirmPassword').value,
    institutionName: document.getElementById('regInstitutionName').value.trim(),
    institutionType: document.getElementById('regInstitutionType').value,
    contactName: document.getElementById('regContactName').value.trim(),
    role: document.getElementById('regRole').value,
    intendedUse: document.getElementById('regIntendedUse').value.trim(),
    notes: document.getElementById('regNotes').value.trim(),
  };

  const v = validateRegisterClient(data);
  if (v) {
    showAuthError(v);
    return;
  }

  setAuthSubmitting('register', true);
  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const payload = await res.json();
    if (!res.ok) {
      if (Array.isArray(payload.errors) && payload.errors.length) {
        showAuthError(payload.errors[0]);
      } else {
        showAuthError(payload.error || '注册失败');
      }
      return;
    }
    currentUser = payload.user;
    showAuthSuccess('注册成功，正在进入系统...');
    // Auto-login: server has already set the cookie, so we just enter the app.
    setTimeout(() => { enterApp(); }, 400);
  } catch (err) {
    showAuthError('网络错误，请稍后重试');
  } finally {
    setAuthSubmitting('register', false);
  }
}

function validateRegisterClient(d) {
  if (!d.email) return '邮箱不能为空';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return '邮箱格式不正确';
  const domain = (d.email.split('@')[1] || '').toLowerCase();
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return '请使用单位、教育或机构邮箱注册';
  if (!d.password) return '密码不能为空';
  if (d.password.length < 8) return '密码长度不能少于 8 位';
  if (d.password !== d.confirmPassword) return '两次输入的密码不一致';
  if (!d.institutionName) return '单位名称不能为空';
  if (!d.institutionType) return '请选择单位类型';
  if (!d.contactName) return '联系人姓名不能为空';
  if (!d.role) return '请选择身份 / 角色';
  if (!d.intendedUse) return '使用目的不能为空';
  if (d.intendedUse.length < 10) return '使用目的请至少输入 10 个字符';
  return null;
}

function updateEmailHint() {
  const el = document.getElementById('regEmail');
  const hint = document.getElementById('regEmailHint');
  const email = el.value.trim();
  hint.className = 'form-hint';
  hint.textContent = '';
  if (!email || !email.includes('@')) return;
  const domain = email.split('@')[1].toLowerCase();
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
    hint.classList.add('form-hint-warn');
    hint.textContent = '请使用单位、教育或机构邮箱注册';
  } else if (/\.edu(\.[a-z]{2,3})?$|\.ac\.[a-z]{2,3}$|\.gov(\.[a-z]{2,3})?$/i.test(domain)) {
    hint.classList.add('form-hint-ok');
    hint.textContent = '已识别为机构邮箱 ✓';
  } else if (domain) {
    hint.classList.add('form-hint-info');
    hint.textContent = '将作为不确定的机构邮箱提交，后端会自动归类';
  }
}

// ============ Auth: forgot password ============

async function submitForgot() {
  clearAuthMessages();
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError('请输入有效的邮箱地址');
    return;
  }
  setAuthSubmitting('forgot', true);
  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    // Always show the same success message — even if the email doesn't exist
    // (server returns 200 in both cases to avoid leaking).
    if (data && data.devResetUrl) {
      // Dev mode: surface the reset URL so the developer can test without SMTP.
      showAuthSuccess(
        '（开发模式）重置链接已生成，请在下方链接中复制使用：\n' + data.devResetUrl
      );
      return;
    }
    showAuthSuccess('如果该邮箱已注册，重置链接已发送。请检查邮箱（包括垃圾邮件）。');
  } catch (err) {
    showAuthError('网络错误，请稍后重试');
  } finally {
    setAuthSubmitting('forgot', false);
  }
}

// ============ Auth: reset password ============

async function submitReset() {
  clearAuthMessages();
  const token = document.getElementById('resetToken').value;
  const password = document.getElementById('resetPassword').value;
  const confirmPassword = document.getElementById('resetConfirmPassword').value;

  if (!token) {
    showAuthError('重置链接无效，请回到登录页重新申请');
    return;
  }
  if (!password || password.length < 8) {
    showAuthError('密码长度不能少于 8 位');
    return;
  }
  if (password !== confirmPassword) {
    showAuthError('两次输入的密码不一致');
    return;
  }

  setAuthSubmitting('reset', true);
  try {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password, confirmPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || '重置失败');
      return;
    }
    showAuthSuccess('密码已重置，请使用新密码登录。');
    // Clean up the URL param
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.toString());
    setTimeout(() => {
      document.getElementById('loginForm').reset();
      showAuthStep('login');
    }, 1200);
  } catch (err) {
    showAuthError('网络错误，请稍后重试');
  } finally {
    setAuthSubmitting('reset', false);
  }
}

// ============ Auth: logout ============

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {}
  currentUser = null;
  currentChatSessionId = null;
  if (ws) { ws.close(); ws = null; }
  isConnected = false;
  // Reset forms
  for (const f of document.querySelectorAll('.auth-step')) f.reset();
  showLandingPage();
}

// ============ App entry ============

function getEnterAppStepOrder() {
  return ['show-interface', 'load-chat-sessions', 'recover-session', 'connect-gateway'];
}

function showChatInterface() {
  if (landingPage) landingPage.style.display = 'none';
  if (appShell) appShell.style.display = 'flex';
  authModal.style.display = 'none';
  sidebar.style.display = 'flex';
  logoutBtn.style.display = 'block';
}

async function enterApp() {
  showChatInterface();
  await loadChatSessions();
  await recoverSession();
  connectGateway();
}

// ============ Chat Sessions ============

async function loadChatSessions() {
  try {
    const res = await fetch(`${API_BASE}/chat/sessions`, { credentials: 'include' });
    if (!res.ok) return;
    const sessions = await res.json();
    renderSessionList(sessions);
  } catch {}
}

function renderSessionList(sessions) {
  chatList.innerHTML = '';
  if (sessions.length === 0) return;

  sessions.forEach((session) => {
    const item = document.createElement('div');
    item.className = 'session-item' + (session.id === currentChatSessionId ? ' active' : '');
    item.dataset.sessionId = session.id;

    const titleEl = document.createElement('span');
    titleEl.className = 'session-item-title';
    titleEl.textContent = session.title;

    const timeEl = document.createElement('span');
    timeEl.className = 'session-time';
    timeEl.textContent = formatTime(session.updated_at);

    const delBtn = document.createElement('button');
    delBtn.className = 'session-item-delete';
    delBtn.textContent = '×';
    delBtn.title = '删除会话';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(session.id);
    });

    item.appendChild(titleEl);
    item.appendChild(timeEl);
    item.appendChild(delBtn);

    item.addEventListener('click', () => switchToSession(session.id));
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRenameSession(session.id, titleEl);
    });

    chatList.appendChild(item);
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

let renameInput = null;
function startRenameSession(sessionId, titleEl) {
  if (renameInput) {
    renameInput.blur();
    renameInput = null;
  }
  const input = document.createElement('input');
  input.className = 'session-item-title-input';
  input.value = titleEl.textContent;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newTitle = input.value.trim() || '新对话';
    input.replaceWith(titleEl);
    titleEl.textContent = newTitle;
    renameInput = null;
    try {
      await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {}
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      input.replaceWith(titleEl);
      renameInput = null;
    }
  });
  renameInput = input;
}

async function deleteSession(sessionId) {
  if (!confirm('确定删除该会话？')) return;
  try {
    await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (currentChatSessionId === sessionId) {
      currentChatSessionId = null;
      currentSessionKey = null;
      messagesContainer.innerHTML = '';
      displayWelcome();
    }
    await loadChatSessions();
  } catch {}
}

async function switchToSession(sessionId) {
  if (sessionId === currentChatSessionId) return;

  currentChatSessionId = sessionId;
  resetOpenClawSessionState();
  autoSaveEnabled = false;

  document.querySelectorAll('.session-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.sessionId === sessionId);
  });

  try {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      credentials: 'include',
    });
    if (res.ok) {
      const messages = await res.json();
      messagesContainer.innerHTML = '';
      if (messages.length === 0) {
        displayWelcome();
      } else {
        messages.forEach((msg) => displayMessage(msg.content, msg.role === 'user' ? 'user' : 'assistant', true));
      }
    } else {
      displayWelcome();
    }
  } catch {
    displayWelcome();
  }

  console.log('[session] Chat session ready, will create new OpenClaw session on next handshake');
  if (isConnected) createOpenClawSession();
  autoSaveEnabled = true;
}

async function createNewChat() {
  autoSaveEnabled = false;
  currentChatSessionId = null;
  resetOpenClawSessionState();
  messagesContainer.innerHTML = '';
  displayWelcome();

  document.querySelectorAll('.session-item').forEach((el) => el.classList.remove('active'));

  try {
    const res = await fetch(`${API_BASE}/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      currentChatSessionId = data.session_id;
      await loadChatSessions();
      document.querySelectorAll('.session-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.sessionId === currentChatSessionId);
      });
    }
  } catch {}

  autoSaveEnabled = true;
  if (isConnected) createOpenClawSession();
}

async function recoverSession() {
  try {
    const res = await fetch(`${API_BASE}/chat/sessions`, { credentials: 'include' });
    if (!res.ok) return;
    const sessions = await res.json();
    if (sessions.length > 0) {
      await switchToSession(sessions[0].id);
    } else {
      await createNewChat();
    }
  } catch {}
}

// ============ Gateway Connection ============

function connectGateway() {
  if (ws) { ws.close(); ws = null; }
  updateStatus('connecting');

  const wsUrl = `ws://${window.location.host}/`;
  console.log('[ws] Connecting to gateway via serve.js');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => console.log('[ws] Gateway WebSocket opened');
  ws.onmessage = (event) => handleMessage(event.data);
  ws.onclose = (event) => {
    console.log('[ws] Gateway WebSocket closed:', event.code);
    isConnected = false;
    updateStatus('disconnected');
  };
  ws.onerror = (error) => {
    console.error('[ws] Gateway WebSocket error:', error);
    updateStatus('disconnected');
  };
}

let pendingSessionCreate = false;
let pendingSessionCreateId = null;
let reconnectingSession = false;

function handleMessage(data) {
  try {
    const msg = JSON.parse(data);

    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
      console.log('[ws] ✅ Gateway handshake complete');
      isConnected = true;
      updateStatus('session-pending');
      hideAuthModalIfVisible();
      if (currentSessionKey && currentChatSessionId) {
        bindOpenClawSession(currentChatSessionId, currentSessionKey);
      } else {
        createOpenClawSession();
      }
      return;
    }

    if (msg.type === 'res' && msg.id === pendingSessionCreateId) {
      if (!msg.ok) {
        console.error('[ws] sessions.create failed:', msg.error);
        pendingSessionCreate = false;
        pendingSessionCreateId = null;
        if (!reconnectingSession) {
          reconnectingSession = true;
          setTimeout(() => createOpenClawSession(), 500);
        }
        return;
      }
      let sk = null;
      if (msg.payload?.key) sk = msg.payload.key;
      if (msg.payload?.sessionKey) sk = msg.payload.sessionKey;
      if (msg.payload?.result?.sessionKey) sk = msg.payload.result.sessionKey;
      if (sk) {
        currentSessionKey = sk;
        pendingSessionCreate = false;
        pendingSessionCreateId = null;
        reconnectingSession = false;
        console.log('[ws] ✅ OpenClaw session created:', sk);
        updateStatus('connected');
        if (currentChatSessionId) bindOpenClawSession(currentChatSessionId, sk);
      }
      return;
    }

    if (msg.type === 'res' && msg.ok === false) {
      console.error('[ws] request failed:', msg.error);
      isAIThinking = false;
      removeTypingIndicator();
      displayMessage('错误：' + (msg.error?.message || 'Gateway 请求失败'), 'assistant');
      return;
    }

    if (msg.event === 'chat') {
      const payload = msg.payload || msg;
      if (!isCurrentSessionPayload(payload)) return;
      if (payload.state === 'final') {
        if (payload.message?.content) {
          const text = payload.message.content[0]?.text || '';
          if (text && autoSaveEnabled) {
            displayMessage(text, 'assistant');
            saveMessage(currentChatSessionId, 'assistant', text);
          }
        }
        isAIThinking = false;
        removeTypingIndicator();
        return;
      }
      if (payload.state === 'error') {
        isAIThinking = false;
        removeTypingIndicator();
        displayMessage('错误：' + (payload.errorMessage || 'Unknown error'), 'assistant');
        return;
      }
      if (payload.state === 'done') {
        isAIThinking = false;
        removeTypingIndicator();
        return;
      }
      return;
    }

    if (msg.event === 'agent') {
      if (!isCurrentSessionPayload(msg.payload)) return;
      handleAgentEvent(msg.payload);
      return;
    }

    if (msg.event === 'error') {
      isAIThinking = false;
      removeTypingIndicator();
      return;
    }

    if (msg.event === 'health' || msg.event === 'heartbeat') return;
  } catch (error) {
    console.error('[ws] Parse error:', error);
  }
}

function handleAgentEvent(payload) {
  if (!payload) return;
  if (payload.content) {
    displayMessage(payload.content, 'assistant');
    if (autoSaveEnabled) saveMessage(currentChatSessionId, 'assistant', payload.content);
    isAIThinking = false;
    removeTypingIndicator();
    return;
  }
  if (payload.done || payload.stopReason) {
    isAIThinking = false;
    removeTypingIndicator();
  }
}

function resetOpenClawSessionState() {
  currentSessionKey = null;
  pendingSessionCreate = false;
  pendingSessionCreateId = null;
  reconnectingSession = false;
  if (isConnected) updateStatus('session-pending');
}

function createOpenClawSession() {
  if (!isConnected || pendingSessionCreate) return;
  pendingSessionCreate = true;
  pendingSessionCreateId = genId();
  updateStatus('session-pending');
  ws.send(JSON.stringify({
    type: 'req', id: pendingSessionCreateId, method: 'sessions.create', params: {},
  }));
}

async function bindOpenClawSession(chatSessionId, openclawSessionKey) {
  try {
    await fetch(`${API_BASE}/chat/sessions/${chatSessionId}/openclaw-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: chatSessionId, openclaw_session_key: openclawSessionKey }),
    });
    console.log('[session] OpenClaw key bound to chat session:', chatSessionId);
  } catch (err) {
    console.error('[session] Failed to bind OpenClaw key:', err);
  }
}

// ============ Send Message ============

function buildChatSendParams(sessionKey, content, idempotencyKey) {
  return {
    sessionKey,
    message: content,
    idempotencyKey,
  };
}

function isCurrentSessionPayload(payload, expectedSessionKey = currentSessionKey) {
  if (!payload || !payload.sessionKey) return true;
  return payload.sessionKey === expectedSessionKey;
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content) return;
  if (!isConnected) {
    displayMessage("错误：Gateway 未连接，请检查服务配置后刷新页面。", "assistant");
    return;
  }
  if (!currentSessionKey) {
    displayMessage('错误：会话未就绪，请稍候...', 'assistant');
    return;
  }

  messageInput.value = '';
  messageInput.style.height = 'auto';

  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);

  ws.send(JSON.stringify({
    type: 'req',
    id: genId(),
    method: 'chat.send',
    params: buildChatSendParams(currentSessionKey, content, genId()),
  }));
  showTypingIndicator();
  isAIThinking = true;
}

// ============ Message Persistence ============

let saveQueue = [];
let isSaving = false;

async function saveMessage(sessionId, role, content) {
  if (!sessionId || !autoSaveEnabled) return;
  saveQueue.push({ session_id: sessionId, role, content });
  if (!isSaving) processSaveQueue();
}

async function processSaveQueue() {
  if (saveQueue.length === 0) { isSaving = false; return; }
  isSaving = true;
  const item = saveQueue.shift();
  try {
    await fetch(`${API_BASE}/chat/save-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(item),
    });
    loadChatSessions();
  } catch (err) {
    console.error('[save] Failed to save message:', err);
    saveQueue.unshift(item);
  }
  processSaveQueue();
}

// ============ Display Helpers ============

function hideAuthModalIfVisible() {
  if (authModal.style.display === 'flex') authModal.style.display = 'none';
}

function displayWelcome() {
  const welcomeEl = document.createElement('div');
  welcomeEl.className = 'message welcome';
  welcomeEl.innerHTML = `
    <div class="message-avatar">🔬</div>
    <div class="message-content">
      <p>欢迎使用 PFM² 相场模拟专业助手。</p>
      <p>请描述你的模拟需求，例如材料体系、物理过程、边界条件或希望分析的问题。我可以辅助完成铁电畴、铁磁畴、击穿与储能等领域相关的模拟设计、计算调用、结果分析与理论解释</p>
    </div>
  `;
  messagesContainer.appendChild(welcomeEl);
}

function displayMessage(content, role, skipScroll = false) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user' : ''}`;
  const avatar = role === 'user' ? '👤' : '🔬';
  const formattedContent = formatContent(content, role);
  messageEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">${formattedContent}</div>
  `;
  messagesContainer.appendChild(messageEl);
  if (!skipScroll) scrollToBottom();
}

const chatRenderer = window.PFMChatRenderer || globalThis.PFMChatRenderer;
if (!chatRenderer) {
  throw new Error('PFMChatRenderer is not loaded');
}
const { formatContent, handleMessageContentClick } = chatRenderer;
function showTypingIndicator() {
  removeTypingIndicator();
  const typingEl = document.createElement('div');
  typingEl.className = 'message';
  typingEl.id = 'typingIndicator';
  typingEl.innerHTML = `
    <div class="message-avatar">🔬</div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingEl);
  scrollToBottom();
}

function removeTypingIndicator() {
  const existing = document.getElementById('typingIndicator');
  if (existing) existing.remove();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
}

function getGatewayReadinessLabel(websocketConnected, sessionReady) {
  if (!websocketConnected) return '未连接';
  if (!sessionReady) return '会话准备中';
  return '已连接';
}

function updateStatus(status) {
  connectionStatus.className = 'status ' + status;
  switch (status) {
    case 'connected':
      connectionStatus.textContent = getGatewayReadinessLabel(true, true);
      sendBtn.disabled = false;
      break;
    case 'session-pending':
      connectionStatus.textContent = getGatewayReadinessLabel(true, false);
      sendBtn.disabled = true;
      break;
    case 'connecting':
      connectionStatus.textContent = '连接中...';
      sendBtn.disabled = true;
      break;
    case 'disconnected':
      connectionStatus.textContent = getGatewayReadinessLabel(false, false);
      sendBtn.disabled = true;
      break;
  }
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('pfui_theme', isDark ? 'dark' : 'light');
}

function loadTheme() {
  const savedTheme = localStorage.getItem('pfui_theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    themeToggle.textContent = '☀️';
  } else {
    themeToggle.textContent = '🌙';
  }
}

function genId() {
  return String(++requestId);
}

// Start
init();
