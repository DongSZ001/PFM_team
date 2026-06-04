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
let activeEfffieldDialogue = false;
let activeFerroDialogue = false;
let ferroMaterialModelsCache = null;
let currentFerroDraft = null;
let lastFerroResult = null;
let ferroRunHistory = [];

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
  messagesContainer.addEventListener('click', handleChatMessageClick);
  messagesContainer.addEventListener('input', handleEfffieldPanelInput);
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
      const messages = await hydrateSavedChatMessages(await res.json());
      messagesContainer.innerHTML = '';
      if (messages.length === 0) {
        displayWelcome();
      } else {
        messages.forEach((msg) => renderSavedChatMessage(msg));
      }
      rehydrateFerroStateFromMessages(sessionId, messages);
    } else {
      initializeFerroModuleState(sessionId);
      displayWelcome();
    }
  } catch {
    initializeFerroModuleState(sessionId);
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
      initializeFerroModuleState(currentChatSessionId);
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

function parseEfffieldCommand(content) {
  const text = String(content || '').trim();
  const lowered = text.toLowerCase();
  const isSlashCommand = lowered === '/eff' || lowered.startsWith('/eff ') || lowered === '/effective' || lowered.startsWith('/effective ');
  const isChineseDielectricRequest = /介电/.test(text) && /(模拟|计算|分布|常数)/.test(text);
  if (!isSlashCommand && !isChineseDielectricRequest) return null;

  const options = {};
  let system = 'dielectric';
  if (isSlashCommand) {
    const tokens = text.split(/\s+/).filter(Boolean);
    system = (tokens[1] || 'dielectric').toLowerCase();
    for (const token of tokens.slice(2)) {
      const idx = token.indexOf('=');
      if (idx <= 0) continue;
      options[token.slice(0, idx).toLowerCase()] = token.slice(idx + 1);
    }
  } else {
    const size = text.match(/(?:尺寸|大小|网格)?\s*(\d+)\s*[xX×*＊]\s*(\d+)(?:\s*[xX×*＊]\s*(\d+))?/);
    if (size) {
      options.nx = size[1];
      options.ny = size[2];
      if (size[3]) options.nz = size[3];
    }
    const radius = text.match(/半径\s*[:：=]?\s*(\d+(?:\.\d+)?)/);
    if (radius) options.radius = radius[1];
    const field = text.match(/(?:电场|field)\s*[:：=]?\s*([-+\d.]+)\s*[,，]\s*([-+\d.]+)\s*[,，]\s*([-+\d.]+)/i);
    if (field) options.field = field.slice(1, 4).join(',');
  }

  if (system !== 'dielectric') return { error: '目前只支持 dielectric 介电有效场计算' };
  const nx = parseIntegerOption(options.nx, 128);
  const ny = parseIntegerOption(options.ny, nx);
  const nz = parseIntegerOption(options.nz, 1);
  const radius = parseNumberOption(options.radius, Math.floor(Math.min(nx, ny) / 4));
  const field = parseVectorOption(options.field || options.electricfield, [1, 0, 0]);
  return {
    system: 'dielectric',
    grid: { nx, ny, nz },
    structure: { type: options.shape || 'circle', radius },
    load: { electricField: field },
    solver: {
      tol: parseNumberOption(options.tol, 1e-3),
      maxiter: parseIntegerOption(options.maxiter, 300),
    },
  };
}

function parseIntegerOption(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function parseNumberOption(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseVectorOption(value, fallback) {
  if (!value) return fallback;
  const parts = String(value).split(',').map((item) => Number(item));
  return parts.length === 3 && parts.every((item) => Number.isFinite(item)) ? parts : fallback;
}


function parseFerroCommand(content) {
  const text = String(content || '').trim();
  const lowered = text.toLowerCase();
  const isSlashCommand = lowered === '/ferro' || lowered.startsWith('/ferro ');
  const isChineseFerroRequest = /(铁电|畴结构|极化分布|相场模拟)/.test(text) && /(模拟|计算|分布|运行|生成|畴)/.test(text);
  if (!isSlashCommand && !isChineseFerroRequest) return null;
  const materialFilter = detectFerroMaterialFilter(text);
  return { system: 'ferroelectric', ...(materialFilter ? { materialFilter, hasMaterial: true } : {}) };
}

function detectFerroMaterialFilter(content) {
  const text = String(content || '');
  if (/BFO|BiFeO3|铁酸铋/i.test(text)) return /10004/i.test(text) ? 'BFO 10004' : 'BFO';
  if (/BTO|BaTiO3|钛酸钡/i.test(text)) return 'BTO';
  if (/PZT|锆钛酸铅/i.test(text)) return 'PZT';
  if (/PMN[-_\s]?PT/i.test(text)) return 'PMN-PT';
  if (/HZO/i.test(text)) return 'HZO';
  if (/KNN/i.test(text)) return 'KNN';
  if (/PTO|PbTiO3/i.test(text)) return 'PTO';
  return null;
}

function getFerroSessionStorage() {
  try {
    if (window.sessionStorage) return window.sessionStorage;
  } catch {}
  try {
    if (globalThis.sessionStorage) return globalThis.sessionStorage;
  } catch {}
  return null;
}

function ferroDraftStorageKey(chatSessionId = currentChatSessionId) {
  return 'ferroDraft:' + (chatSessionId || 'default');
}

function rememberFerroDraft(chatSessionId, draft) {
  if (!draft) return;
  currentFerroDraft = draft;
  const storage = getFerroSessionStorage();
  if (storage) storage.setItem(ferroDraftStorageKey(chatSessionId), JSON.stringify(draft));
  if (draft.status === 'ready') saveFerroPreferences(draft);
}

function persistFerroDraftForSession(chatSessionId, draft) {
  if (!draft) return;
  const storage = getFerroSessionStorage();
  if (storage) storage.setItem(ferroDraftStorageKey(chatSessionId), JSON.stringify(draft));
  if (!chatSessionId || chatSessionId === currentChatSessionId) currentFerroDraft = draft;
  if (draft.status === 'ready') saveFerroPreferences(draft);
}

function getStoredFerroDraft(chatSessionId = currentChatSessionId) {
  const storage = getFerroSessionStorage();
  if (!storage) return currentFerroDraft;
  const key = ferroDraftStorageKey(chatSessionId);
  try {
    const raw = storage.getItem(key);
    if (raw) {
      currentFerroDraft = JSON.parse(raw);
      return currentFerroDraft;
    }
    return currentFerroDraft;
  } catch {
    storage.removeItem(key);
    return currentFerroDraft;
  }
}

function clearStoredFerroDraft(chatSessionId = currentChatSessionId) {
  currentFerroDraft = null;
  const storage = getFerroSessionStorage();
  if (storage) storage.removeItem(ferroDraftStorageKey(chatSessionId));
}

function initializeFerroModuleState(chatSessionId = currentChatSessionId) {
  activeFerroDialogue = false;
  currentFerroDraft = null;
  lastFerroResult = null;
  ferroRunHistory = [];
  const storage = getFerroSessionStorage();
  if (storage && chatSessionId) storage.setItem(ferroDraftStorageKey(chatSessionId), 'null');
}

function restoreFerroDraftFromSessionStorage(chatSessionId = currentChatSessionId) {
  activeFerroDialogue = false;
  currentFerroDraft = null;
  lastFerroResult = null;
  ferroRunHistory = [];
  const draft = getStoredFerroDraft(chatSessionId);
  if (draft) {
    currentFerroDraft = draft;
    activeFerroDialogue = Boolean(draft.status);
  }
  return draft;
}

function isFerroDialogueActive() {
  return Boolean(activeFerroDialogue);
}

function ferroInitializationMessage() {
  return '正在初始化 ferro 会话，请稍候…';
}

function isFerroConfirmation(content) {
  return /^(开始计算|开始|运行|确认|可以计算|run)$/i.test(String(content || '').trim());
}

function hasReadyFerroDraft(chatSessionId = currentChatSessionId) {
  const draft = getStoredFerroDraft(chatSessionId);
  return Boolean(draft && draft.status === 'ready');
}

function buildFerroJobRequestFromDraft(draft) {
  const request = {
    grid: draft.grid,
    material: draft.material,
    run: draft.run,
    initial: draft.initial,
    field: draft.field,
    visualization: draft.visualization,
  };
  const parentJobId = draft.parentJobId || draft.lastJobId || (lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id));
  if (parentJobId) request.parentJobId = parentJobId;
  return request;
}

function getFerroLocalStorage() {
  try {
    if (window.localStorage) return window.localStorage;
  } catch {}
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {}
  return null;
}

function loadFerroPreferences() {
  const storage = getFerroLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem('pf-assistant.ferro.lastPreset');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveFerroPreferences(draft) {
  const storage = getFerroLocalStorage();
  if (!storage || !draft) return;
  const run = draft.run || {};
  const material = draft.material || {};
  try {
    storage.setItem('pf-assistant.ferro.lastPreset', JSON.stringify({
      grid: draft.grid,
      run: {
        steps: run.steps !== undefined ? run.steps : run.kstep,
        outputInterval: run.outputInterval !== undefined ? run.outputInterval : run.kprnt,
      },
      visualization: draft.visualization,
      materialId: material.id || material.modelKey || material.model,
      presetId: draft.presetId,
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
}

function shouldRouteToFerroDialogue(content, hasActiveDraft = activeFerroDialogue, chatSessionId = currentChatSessionId) {
  const text = String(content || '').trim();
  if (looksLikeEfffieldDialogueIntent(text)) return false;
  const followsFerroResult = Boolean(lastFerroResult && /(继续|再跑|重跑|优化|改|换|增加|减少|网格|步数|输出|角度|箭头|面内|可视化|对比|报告|component|angle|arrow|grid|step|run)/i.test(text));
  return Boolean(
    hasActiveDraft ||
    followsFerroResult ||
    parseFerroCommand(content) ||
    (isFerroConfirmation(content) && hasReadyFerroDraft(chatSessionId))
  );
}

function buildFerroDialogueRequest(message, chatSessionId, extra = {}) {
  const request = { message, chatSessionId, ...extra };
  const clientPreferences = loadFerroPreferences();
  if (clientPreferences) request.clientPreferences = clientPreferences;
  return request;
}

async function fetchFerroMaterialModels(filter = null) {
  const cacheKey = filter ? String(filter) : '__all__';
  if (!ferroMaterialModelsCache || typeof ferroMaterialModelsCache !== 'object' || Array.isArray(ferroMaterialModelsCache)) ferroMaterialModelsCache = {};
  if (ferroMaterialModelsCache[cacheKey]) return ferroMaterialModelsCache[cacheKey];
  const query = filter ? '?filter=' + encodeURIComponent(String(filter)) : '';
  const res = await fetch(API_BASE + '/api/ferro/materials' + query, { credentials: 'include' });
  if (!res.ok) return { cards: [], materials: [] };
  const data = await res.json();
  const payload = Array.isArray(data) ? { cards: [], materials: data } : { cards: data.cards || [], materials: data.materials || [] };
  ferroMaterialModelsCache[cacheKey] = payload;
  return payload;
}

function buildFerroMaterialRecommendation(payload) {
  const cards = Array.isArray(payload && payload.cards) ? payload.cards : [];
  const list = Array.isArray(payload) ? payload : Array.isArray(payload && payload.materials) ? payload.materials : [];
  if (!cards.length && !list.length) return null;
  return { type: 'ferro_material_recommendations', cards, models: list, materials: list };
}

function shouldOfferFerroMaterialRecommendations(content, wasActiveDraft = activeFerroDialogue) {
  return Boolean(!wasActiveDraft && parseFerroCommand(content));
}

function rememberFerroResult(data, draftFallback = null, chatSessionId = currentChatSessionId) {
  if (!data) return;
  const draft = data.draftSnapshot || data.draft || draftFallback || currentFerroDraft;
  if (draft) {
    persistFerroDraftForSession(chatSessionId, {
      ...draft,
      status: draft.status || 'ready',
      lastJobId: data.jobId || data.id || draft.lastJobId,
      parentJobId: data.parentJobId || draft.parentJobId,
    });
  }
  if (!chatSessionId || chatSessionId === currentChatSessionId) {
    lastFerroResult = data;
    ferroRunHistory = [...ferroRunHistory, data].slice(-8);
    activeFerroDialogue = true;
  }
}

function buildStructuredFerroResultMessage(data, chatSessionId, draftFallback = null) {
  const draftSnapshot = data.draftSnapshot || data.draft || draftFallback || null;
  return {
    type: 'ferro_result',
    role: 'assistant',
    content: data.summary || data.message || '铁电相场计算完成，已生成极化分布图片。',
    metadata: {
      type: 'ferro_result',
      ...data,
      chatSessionId: data.chatSessionId || chatSessionId || null,
      draftSnapshot,
      result: data.result || { timesteps: [], visualizations: [] },
      followupChips: data.followupChips || [],
    },
  };
}

async function saveStructuredAssistantMessage(chatSessionId, structuredMessage) {
  if (!structuredMessage) return;
  const metadata = structuredMessage.metadata || structuredMessage;
  const content = structuredMessage.content || metadata.summary || metadata.message || '铁电相场计算完成，已生成极化分布图片。';
  await saveMessage(chatSessionId, 'assistant', content, metadata);
}

async function startFerroJobFromDraft(draft) {
  if (!draft || isAIThinking) return;
  const sourceChatSessionId = currentChatSessionId;
  const sourceSessionKey = currentSessionKey;
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/ferro/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...buildFerroJobRequestFromDraft(draft),
        chatSessionId: sourceChatSessionId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('铁电相场计算启动失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    const structuredMessage = buildStructuredFerroResultMessage(data, sourceChatSessionId, draft);
    await saveStructuredAssistantMessage(sourceChatSessionId, structuredMessage);
    rememberFerroResult(structuredMessage.metadata, draft, sourceChatSessionId);
    if (currentChatSessionId === sourceChatSessionId && currentSessionKey === sourceSessionKey) {
      displayMessage(structuredMessage.metadata, 'assistant');
    } else {
      markSessionHasUpdate(sourceChatSessionId);
    }
  } catch {
    displayMessage('铁电相场计算启动失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}

async function submitFerroDialogueRequest(payload, userVisibleText) {
  if (isAIThinking) return;
  if (userVisibleText) {
    displayMessage(userVisibleText, 'user');
    saveMessage(currentChatSessionId, 'user', userVisibleText);
  }
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/ferro/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildFerroDialogueRequest(payload.message || '', currentChatSessionId, payload)),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('铁电相场参数向导失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    handleFerroDialogueResponse(data, payload.message || '');
  } catch {
    displayMessage('铁电相场参数向导失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}

function handleFerroDialogueResponse(data, originalContent) {
  if (data.type === 'not_ferro') {
    activeFerroDialogue = false;
    clearStoredFerroDraft(currentChatSessionId);
    if (originalContent) sendGatewayMessage(originalContent, { alreadyDisplayed: true });
    return;
  }
  if (data.type === 'ferro_result') {
    const structuredMessage = buildStructuredFerroResultMessage(data, currentChatSessionId, currentFerroDraft);
    rememberFerroResult(structuredMessage.metadata, currentFerroDraft, currentChatSessionId);
    displayMessage(structuredMessage.metadata, 'assistant');
    saveStructuredAssistantMessage(currentChatSessionId, structuredMessage);
    return;
  }
  activeFerroDialogue = Boolean(data.draft && data.draft.status !== 'completed');
  if (data.draft) rememberFerroDraft(currentChatSessionId, data.draft);
  displayMessage(data.type || data.draft || data.diff ? data : (data.reply || data.message || '请继续补充铁电相场计算参数。'), 'assistant');
  saveMessage(currentChatSessionId, 'assistant', data.message || data.reply || '铁电相场计算草稿已更新');
}

async function runFerroDialogue(content) {
  const offerMaterialRecommendations = shouldOfferFerroMaterialRecommendations(content, activeFerroDialogue);
  const command = parseFerroCommand(content);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);
  if (offerMaterialRecommendations && !getStoredFerroDraft(currentChatSessionId)) {
    displayMessage(ferroInitializationMessage(), 'assistant');
  }
  showTypingIndicator();
  try {
    const storedDraft = getStoredFerroDraft(currentChatSessionId);
    if (isFerroConfirmation(content) && storedDraft && storedDraft.status === 'ready') {
      removeTypingIndicator();
      await startFerroJobFromDraft(storedDraft);
      return;
    }

    const res = await fetch(API_BASE + '/api/ferro/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildFerroDialogueRequest(content, currentChatSessionId)),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('铁电相场参数向导失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    if (data.type === 'not_ferro') {
      handleFerroDialogueResponse(data, content);
      return;
    }
    if (offerMaterialRecommendations && data.type === 'ferro_dialogue') {
      const filter = command && command.materialFilter ? command.materialFilter : data.filter && data.filter.query;
      const recommendation = buildFerroMaterialRecommendation(await fetchFerroMaterialModels(filter));
      if (recommendation && filter) recommendation.filter = { query: filter };
      if (recommendation) displayMessage(recommendation, 'assistant');
    }
    handleFerroDialogueResponse(data, content);
  } catch (err) {
    displayMessage('铁电相场参数向导失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}



function looksLikeEfffieldDialogueIntent(content) {
  const text = String(content || '').trim();
  if (/(parameter\.in|参数文件|输入文件|面板模式|自定义输入|自定义参数|高级面板)/i.test(text) && /(有效场|efffield|effective|介电|热传导|热导|扩散|电导|磁性|磁导|弹性|压电|压磁|磁电)/i.test(text)) return true;
  return hasEfffieldIntentContext(text) && (
    /(介电|电场分布|电势分布|电位移|permittivity|dielectric)/i.test(text)
    || /(热传导|热导|导热|热流|温度场|温度梯度|thermal)/i.test(text)
    || /(扩散|浓度场|浓度梯度|浓度分布|扩散通量|diffusion|diffusivity)/i.test(text)
    || /(电导|电传导|电流分布|电流密度|electrical conduction|electrical conductivity)/i.test(text)
    || /(磁性|磁导|磁场|磁感应|magnetic|permeability)/i.test(text)
    || /(弹性|压电|压磁|磁电|磁电耦合|elastic|piezoelectric|piezomagnetic|magnetoelectric)/i.test(text)
  )
    || text.toLowerCase() === '/eff' || text.toLowerCase().startsWith('/eff ')
    || text.toLowerCase() === '/effective' || text.toLowerCase().startsWith('/effective ');
}

function hasEfffieldIntentContext(text) {
  return /(有效场|模拟|仿真|计算|求|做|研究|分析|看看|生成|得到|预测|评估|分布|场|通量|常数|系数|张量)/i.test(String(text || ''));
}

function shouldRouteToEfffieldDialogue(content, hasActiveDraft = activeEfffieldDialogue) {
  return Boolean(hasActiveDraft || looksLikeEfffieldDialogueIntent(content));
}

function buildEfffieldDialogueRequest(message, chatSessionId) {
  return { message, chatSessionId };
}

async function runEfffieldDialogue(content) {
  messageInput.value = '';
  messageInput.style.height = 'auto';
  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/efffield/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildEfffieldDialogueRequest(content, currentChatSessionId)),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('有效场参数向导失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    if (data.type === 'not_efffield') {
      activeEfffieldDialogue = false;
      sendGatewayMessage(content, { alreadyDisplayed: true });
      return;
    }
    if (data.type === 'efffield_result') {
      activeEfffieldDialogue = false;
      displayMessage(data, 'assistant');
      saveMessage(currentChatSessionId, 'assistant', data.summary || '有效场计算完成');
      return;
    }
    if (data.type === 'efffield_parameter_panel') {
      activeEfffieldDialogue = true;
      displayMessage(data, 'assistant');
      saveMessage(currentChatSessionId, 'assistant', data.reply || '已打开有效场 parameter.in 面板。');
      return;
    }
    if (data.type === 'efffield_mode_choice') {
      activeEfffieldDialogue = true;
      displayMessage(data, 'assistant');
      saveMessage(currentChatSessionId, 'assistant', data.reply || '请选择有效场参数输入方式。');
      return;
    }
    activeEfffieldDialogue = data.type === 'efffield_dialogue' && data.draft && data.draft.status !== 'completed';
    displayMessage(data.reply || '请继续补充有效场计算参数。', 'assistant');
    saveMessage(currentChatSessionId, 'assistant', data.reply || '请继续补充有效场计算参数。');
  } catch (err) {
    displayMessage('有效场参数向导失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}

async function runEfffieldCommand(content, request) {
  messageInput.value = '';
  messageInput.style.height = 'auto';
  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/efffield/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...request, chatSessionId: currentChatSessionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('有效场计算失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    displayMessage({ type: 'efffield_result', ...data }, 'assistant');
    saveMessage(currentChatSessionId, 'assistant', data.summary || '有效场计算完成');
  } catch (err) {
    displayMessage('有效场计算失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}


function buildChatSendParams(sessionKey, content, idempotencyKey) {
  return {
    sessionKey,
    message: content,
    idempotencyKey,
  };
}

const PFM_ASSISTANT_PERSONA = Object.freeze({
  id: 'pfm2-phase-field-assistant',
  name: 'PFM² 相场模拟专业助手',
  description: '我可以协助你进行相场模拟建模、参数配置、铁电/有效场计算与结果分析。',
});

function isIdentityQuestion(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return false;
  return /^(我是谁|你知道我是谁吗|who am i|whoami|what is my identity|tell me who i am)[？?!.。]*$/.test(text)
    || /^(你是谁|who are you|what are you)[？?!.。]*$/.test(text);
}

function buildIdentityResponse(profile = {}) {
  const displayName = String(profile.displayName || '').trim();
  const prefix = displayName ? displayName + '，' : '';
  return prefix + '我是 ' + PFM_ASSISTANT_PERSONA.name + '。' + PFM_ASSISTANT_PERSONA.description;
}

async function fetchSafeProfile() {
  try {
    const res = await fetch(API_BASE + '/api/me/safe-profile', { credentials: 'include' });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function isCurrentSessionPayload(payload, expectedSessionKey = currentSessionKey) {
  if (!payload || !expectedSessionKey) return false;
  const actual = payload.originSessionKey || payload.sessionKey || payload.chatSessionId || payload.sessionId;
  if (!actual) {
    console.warn('[ws] 检测到缺少会话标识的消息，已忽略');
    return false;
  }
  if (actual === expectedSessionKey) return true;
  console.warn('[ws] 检测到跨会话消息，已忽略', actual, '(expected', expectedSessionKey + ')');
  return false;
}

function sendGatewayMessage(content, { alreadyDisplayed = false } = {}) {
  if (!isConnected) {
    displayMessage("错误：Gateway 未连接，请检查服务配置后刷新页面。", "assistant");
    return;
  }
  if (!currentSessionKey) {
    displayMessage('错误：会话未就绪，请稍候...', 'assistant');
    return;
  }

  if (!alreadyDisplayed) {
    messageInput.value = '';
    messageInput.style.height = 'auto';
    displayMessage(content, 'user');
    saveMessage(currentChatSessionId, 'user', content);
  }

  ws.send(JSON.stringify({
    type: 'req',
    id: genId(),
    method: 'chat.send',
    params: buildChatSendParams(currentSessionKey, content, genId()),
  }));
  showTypingIndicator();
  isAIThinking = true;
}

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content) return;
  if (isIdentityQuestion(content)) {
    handleIdentityQuestion(content);
    return;
  }
  if (shouldRouteToFerroDialogue(content)) {
    runFerroDialogue(content);
    return;
  }
  if (shouldRouteToEfffieldDialogue(content)) {
    runEfffieldDialogue(content);
    return;
  }
  sendGatewayMessage(content);
}

async function handleIdentityQuestion(content) {
  messageInput.value = '';
  messageInput.style.height = 'auto';
  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);
  const profile = await fetchSafeProfile();
  const response = buildIdentityResponse(profile);
  displayMessage(response, 'assistant');
  saveMessage(currentChatSessionId, 'assistant', response, { type: 'identity_response', persona: PFM_ASSISTANT_PERSONA });
}

// ============ Message Persistence ============

let saveQueue = [];
let isSaving = false;

async function saveMessage(sessionId, role, content, metadata = null) {
  if (!sessionId || !autoSaveEnabled) return;
  const item = { session_id: sessionId, role, content };
  if (metadata) {
    item.metadata = metadata;
    item.structuredPayload = metadata;
  }
  saveQueue.push(item);
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

function messageStructuredPayload(message) {
  return message && (message.metadata || message.structuredPayload || message.structured_payload) || null;
}

async function hydrateSavedChatMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return Promise.all(list.map(hydrateSavedChatMessage));
}

async function hydrateSavedChatMessage(message) {
  const payload = messageStructuredPayload(message);
  if (!payload || payload.type !== 'ferro_result') return message;
  const result = payload.result || {};
  if ((Array.isArray(result.visualizations) && result.visualizations.length) || !payload.jobId) return message;
  const restored = await restoreFerroResultFromJobId(payload.jobId);
  if (!restored) return message;
  return {
    ...message,
    metadata: { ...payload, ...restored, type: 'ferro_result' },
    structuredPayload: { ...payload, ...restored, type: 'ferro_result' },
  };
}

async function restoreFerroResultFromJobId(jobId) {
  if (!jobId) return null;
  try {
    const res = await fetch(API_BASE + '/api/ferro/jobs/' + encodeURIComponent(jobId) + '/results', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return { type: 'ferro_result', ...data };
  } catch {
    return null;
  }
}

function renderSavedChatMessage(message) {
  const role = message && message.role === 'user' ? 'user' : 'assistant';
  const payload = messageStructuredPayload(message);
  if (payload && payload.type === 'ferro_result') {
    displayMessage({ type: 'ferro_result', ...payload }, role, true);
    return;
  }
  displayMessage(message && message.content || '', role, true);
}

function rehydrateFerroStateFromMessages(sessionId, messages) {
  const ferroResults = (Array.isArray(messages) ? messages : [])
    .map((message) => messageStructuredPayload(message))
    .filter((payload) => payload && payload.type === 'ferro_result');
  const lastResult = ferroResults[ferroResults.length - 1];
  if (lastResult) {
    lastFerroResult = lastResult;
    currentFerroDraft = lastResult.draftSnapshot || null;
    ferroRunHistory = ferroResults.slice(-5);
    activeFerroDialogue = true;
    if (currentFerroDraft) persistFerroDraftForSession(sessionId, currentFerroDraft);
    return;
  }
  restoreFerroDraftFromSessionStorage(sessionId);
}

function markSessionHasUpdate(sessionId) {
  if (!sessionId || typeof document === 'undefined') return;
  document.querySelectorAll('.session-item').forEach((el) => {
    if (el.dataset && el.dataset.sessionId === sessionId) el.classList.add('has-update');
  });
}

// ============ Display Helpers ============

function handleChatMessageClick(event) {
  if (handleEfffieldActionClick(event)) return;
  if (handleFerroActionClick(event)) return;
  if (handleFerroMaterialChoiceClick(event)) return;
  handleMessageContentClick(event);
}

function handleEfffieldActionClick(event) {
  const button = event.target && event.target.closest && event.target.closest('[data-efffield-action]');
  if (!button || button.disabled) return false;
  event.preventDefault();
  const action = button.dataset.efffieldAction;
  const panel = button.closest && button.closest('[data-efffield-parameter-panel]');
  if (action === 'choose_dialogue_mode') {
    submitEfffieldModeChoice('对话问答', button.dataset.efffieldSystem || 'dielectric');
    return true;
  }
  if (action === 'choose_parameter_panel') {
    submitEfffieldModeChoice('面板输入', button.dataset.efffieldSystem || 'dielectric');
    return true;
  }
  if (!panel) return false;
  if (action === 'run_parameter_panel') {
    startEfffieldParameterPanelJob(panel);
    return true;
  }
  if (action === 'validate_parameter_panel') {
    const payload = readEfffieldParameterPanel(panel);
    const missing = [];
    if (!/^\s*SYSDIM\s+\d+\s+\d+\s+\d+/im.test(payload.parameterText)) missing.push('SYSDIM');
    if (!/^\s*CHOICESYS\s+\d+/im.test(payload.parameterText)) missing.push('CHOICESYS');
    displayMessage(missing.length ? 'parameter.in 还缺少：' + missing.join('、') : 'parameter.in 基本格式通过。运行时会由有效场程序继续做完整校验。', 'assistant');
    return true;
  }
  if (action === 'refresh_parameter_template') {
    messageInput.value = '打开有效场 parameter.in 面板';
    messageInput.focus();
    return true;
  }
  return false;
}

function submitEfffieldModeChoice(choice, system) {
  const prefix = system && system !== 'dielectric' ? system + ' 有效场，' : '';
  runEfffieldDialogue(prefix + choice);
}

function handleEfffieldPanelInput(event) {
  const target = event && event.target;
  const input = target && target.dataset && target.dataset.efffieldParamKey
    ? target
    : target && target.closest ? target.closest('[data-efffield-param-key]') : target;
  if (!input || !input.dataset || !input.dataset.efffieldParamKey) return false;
  const panel = input.closest && input.closest('[data-efffield-parameter-panel]');
  if (!panel) return false;
  const textarea = panel.querySelector && panel.querySelector('[data-efffield-parameter-text]');
  if (!textarea) return false;
  const key = String(input.dataset.efffieldParamKey || '').toUpperCase();
  const value = String(input.value || '').trim();
  if (key === 'PHASE_BLOCK') {
    const phaseId = String(input.dataset.efffieldPhaseId || '1').trim();
    const lineKey = String(input.dataset.efffieldLineKey || 'STIFFNESS').toUpperCase();
    textarea.value = replaceEfffieldPhaseBlock(textarea.value, phaseId, lineKey, value);
    return true;
  }
  if (key === 'PHASE1' || key === 'PHASE2') {
    const phaseId = key === 'PHASE1' ? '1' : '2';
    const lineKey = String(input.dataset.efffieldLineKey || 'PERMITTIVITY').toUpperCase();
    textarea.value = replaceEfffieldPhaseParameterLine(textarea.value, phaseId, lineKey, value);
    return true;
  }
  if (key === 'SOLVER_TOL' || key === 'SOLVER_MAXITER') {
    updateEfffieldPanelSolver(panel, input.dataset.efffieldSolverKey, value);
    return true;
  }
  textarea.value = replaceEfffieldParameterLine(textarea.value, key, value);
  return true;
}

function replaceEfffieldPhaseBlock(text, phaseId, lineKey, value) {
  const normalizedLineKey = String(lineKey || '').toUpperCase();
  const normalizedPhaseId = String(phaseId || '').trim();
  const lines = String(text || '').split('\n');
  const replacement = buildEfffieldBlockReplacement(normalizedLineKey, value);
  let phaseStart = -1;
  let phaseEnd = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (firstEfffieldLineToken(lines[i]) !== 'PHASEID') continue;
    const tokens = stripEfffieldInlineComment(lines[i]).trim().split(/\s+/);
    if (tokens[1] === normalizedPhaseId) {
      phaseStart = i;
      phaseEnd = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (firstEfffieldLineToken(lines[j]) === 'PHASEID') {
          phaseEnd = j;
          break;
        }
      }
      break;
    }
  }
  if (phaseStart < 0) {
    const suffix = lines.length && lines[lines.length - 1].trim() === '' ? [] : [''];
    return lines.concat(suffix, ['PHASEID ' + normalizedPhaseId].concat(replacement)).join('\n');
  }
  for (let i = phaseStart + 1; i < phaseEnd; i += 1) {
    const parsedKey = firstEfffieldLineToken(lines[i]);
    if (parsedKey !== normalizedLineKey) continue;
    let blockEnd = i + 1;
    while (blockEnd < phaseEnd) {
      const nextKey = firstEfffieldLineToken(lines[blockEnd]);
      if (nextKey && isEfffieldParameterKeyword(nextKey)) break;
      blockEnd += 1;
    }
    lines.splice(i, blockEnd - i, ...replacement);
    return lines.join('\n');
  }
  lines.splice(phaseEnd, 0, ...replacement);
  return lines.join('\n');
}

function buildEfffieldBlockReplacement(lineKey, value) {
  const normalizedLineKey = String(lineKey || '').toUpperCase();
  const valueLines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (valueLines.length > 1) return [normalizedLineKey].concat(valueLines);
  return [normalizedLineKey + (valueLines[0] ? ' ' + valueLines[0] : '')];
}

function replaceEfffieldParameterLine(text, key, value) {
  const normalizedKey = String(key || '').toUpperCase();
  const lines = String(text || '').split('\n');
  const replacement = normalizedKey + (value ? ' ' + value : '');
  for (let i = 0; i < lines.length; i += 1) {
    const parsedKey = firstEfffieldLineToken(lines[i]);
    if (parsedKey === normalizedKey) {
      lines[i] = replacement;
      return lines.join('\n');
    }
  }
  const suffix = lines.length && lines[lines.length - 1].trim() === '' ? [] : [''];
  return lines.concat(suffix, [replacement]).join('\n');
}

function replaceEfffieldPhaseParameterLine(text, phaseId, lineKey, value) {
  const normalizedLineKey = String(lineKey || '').toUpperCase();
  const normalizedPhaseId = String(phaseId || '').trim();
  const lines = String(text || '').split('\n');
  let insidePhase = false;
  let insertAt = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const parsedKey = firstEfffieldLineToken(lines[i]);
    if (parsedKey === 'PHASEID') {
      const tokens = stripEfffieldInlineComment(lines[i]).trim().split(/\s+/);
      insidePhase = tokens[1] === normalizedPhaseId;
      if (insidePhase) insertAt = i + 1;
      continue;
    }
    if (!insidePhase) continue;
    if (parsedKey === normalizedLineKey) {
      lines[i] = normalizedLineKey + (value ? ' ' + value : '');
      return lines.join('\n');
    }
    if (parsedKey) insertAt = i + 1;
  }
  const hasPhase = lines.some((line) => firstEfffieldLineToken(line) === 'PHASEID' && stripEfffieldInlineComment(line).trim().split(/\s+/)[1] === normalizedPhaseId);
  const replacement = normalizedLineKey + (value ? ' ' + value : '');
  if (!hasPhase) {
    const suffix = lines.length && lines[lines.length - 1].trim() === '' ? [] : [''];
    return lines.concat(suffix, ['PHASEID ' + normalizedPhaseId, replacement]).join('\n');
  }
  lines.splice(insertAt, 0, replacement);
  return lines.join('\n');
}

function firstEfffieldLineToken(line) {
  const cleaned = stripEfffieldInlineComment(line).trim();
  return cleaned ? cleaned.split(/\s+/)[0].toUpperCase() : '';
}

function isEfffieldParameterKeyword(key) {
  return [
    'REALDIM', 'SYSDIM', 'CHOICESYS', 'NPHASES', 'CHOICESTRUCT', 'OUTDIST',
    'CHOICEELABC', 'STRAIN', 'STRESS', 'ELECFIELD', 'MAGFIELD', 'TEMGRAD',
    'CONCGRAD', 'PHASEID', 'PERMITTIVITY', 'PERMEABILITY', 'DIFFUSIVITY',
    'THERMCOND', 'ELECCOND', 'STIFFNESS', 'PIEZOELEC', 'PIEZOMAG', 'MAGELEC',
  ].includes(String(key || '').toUpperCase());
}

function stripEfffieldInlineComment(line) {
  const raw = String(line || '');
  const hash = raw.indexOf('#');
  const bang = raw.indexOf('!');
  const indexes = [hash, bang].filter((index) => index >= 0);
  return indexes.length ? raw.slice(0, Math.min(...indexes)) : raw;
}

function updateEfffieldPanelSolver(panel, solverKey, value) {
  const key = String(solverKey || '').trim();
  if (!key || !panel || !panel.dataset) return;
  const solver = parsePanelJson(panel.dataset.efffieldPanelSolver, {}) || {};
  const number = Number(value);
  solver[key] = Number.isFinite(number) ? number : value;
  panel.dataset.efffieldPanelSolver = JSON.stringify(solver);
}

function readEfffieldParameterPanel(panel) {
  const textarea = panel.querySelector && panel.querySelector('[data-efffield-parameter-text]');
  return {
    parameterText: textarea ? textarea.value : '',
    system: panel.dataset.efffieldPanelSystem || 'dielectric',
    grid: parsePanelJson(panel.dataset.efffieldPanelGrid, null),
    structure: parsePanelJson(panel.dataset.efffieldPanelStructure, null),
    solver: parsePanelJson(panel.dataset.efffieldPanelSolver, null),
  };
}

function parsePanelJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function startEfffieldParameterPanelJob(panel) {
  const payload = readEfffieldParameterPanel(panel);
  if (!payload.parameterText.trim()) {
    displayMessage('parameter.in 内容不能为空。', 'assistant');
    return;
  }
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/efffield/parameter-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        chatSessionId: currentChatSessionId,
        parameterText: payload.parameterText,
        structure: payload.structure,
        solver: payload.solver,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('有效场 parameter.in 计算失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    activeEfffieldDialogue = false;
    displayMessage({ type: 'efffield_result', ...data }, 'assistant');
    saveMessage(currentChatSessionId, 'assistant', data.summary || '有效场计算完成');
  } catch {
    displayMessage('有效场 parameter.in 计算失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}

function handleFerroActionClick(event) {
  const button = event.target && event.target.closest && event.target.closest('[data-ferro-action]');
  if (!button || button.disabled) return false;
  event.preventDefault();
  const action = button.dataset.ferroAction;
  if (action === 'start_job') {
    const draft = getStoredFerroDraft(currentChatSessionId);
    if (draft && draft.status === 'ready') startFerroJobFromDraft(draft);
    return true;
  }
  if (action === 'apply_material_preset') {
    const card = button.closest && button.closest('[data-ferro-material-family-card]');
    const selected = card && card.querySelector && card.querySelector('[data-ferro-action="select_material_variant"].is-active');
    submitFerroDialogueRequest({
      action,
      materialId: button.dataset.materialId || selected && selected.dataset.materialId,
      materialGroupId: button.dataset.materialGroupId || card && card.dataset.materialGroupId,
      variantId: button.dataset.variantId || selected && selected.dataset.variantId,
      presetId: button.dataset.presetId,
    }, button.textContent.trim());
    return true;
  }
  if (action === 'select_material_variant') {
    const card = button.closest && button.closest('[data-ferro-material-family-card]');
    if (card) {
      card.querySelectorAll('[data-ferro-action="select_material_variant"]').forEach((item) => item.classList.toggle('is-active', item === button));
      card.querySelectorAll('[data-selected-variant-output]').forEach((item) => {
        const variantId = button.dataset.variantId || '';
        const title = button.dataset.variantTitle || '';
        const detail = button.dataset.variantDetail || '';
        item.innerHTML = '<strong>' + escapeHtmlForDom(title || variantId) + '</strong><span>' + escapeHtmlForDom(detail || '') + '</span>';
      });
    }
    return true;
  }
  if (action === 'patch_draft') {
    submitFerroDialogueRequest({ action, patch: { [button.dataset.patchPath]: button.dataset.patchValue } }, button.textContent.trim());
    return true;
  }
  if (action === 'set_result_view') {
    setFerroResultView(button);
    return true;
  }
  if (action === 'followup_chip') {
    handleFerroFollowupChip(button);
    return true;
  }
  if (action === 'reset_draft') {
    clearStoredFerroDraft(currentChatSessionId);
    lastFerroResult = null;
    ferroRunHistory = [];
    submitFerroDialogueRequest({ action }, '重置铁电计算草稿');
    return true;
  }
  if (action === 'edit_grid') {
    messageInput.value = '请修改网格，例如 128×1×128';
    messageInput.focus();
    return true;
  }
  if (action === 'edit_run') {
    messageInput.value = '跑20000步，每5000步输出';
    messageInput.focus();
    return true;
  }
  return false;
}

function escapeHtmlForDom(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function setFerroResultView(button) {
  const mode = button.dataset.ferroViewMode || 'component';
  const component = button.dataset.ferroViewComponent || null;
  const jobId = button.dataset.jobId || lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id);
  if (!lastFerroResult) {
    displayMessage('当前没有可切换的铁电结果。', 'assistant');
    return;
  }
  const nextResult = cloneFerroResult(lastFerroResult);
  nextResult.draftSnapshot = nextResult.draftSnapshot || {};
  nextResult.draftSnapshot.visualization = {
    ...(nextResult.draftSnapshot.visualization || {}),
    mode,
    component: mode === 'component' ? component || 'pz' : null,
    overlay: {
      ...((nextResult.draftSnapshot.visualization || {}).overlay || {}),
      arrows: true,
    },
  };
  if (hasFerroVisualization(nextResult.result, mode, component)) {
    rememberFerroResult(nextResult, nextResult.draftSnapshot);
    displayMessage(nextResult, 'assistant');
    saveStructuredAssistantMessage(currentChatSessionId, buildStructuredFerroResultMessage(nextResult, currentChatSessionId, nextResult.draftSnapshot));
    return;
  }
  if (!jobId) {
    displayMessage('当前结果缺少 jobId，无法生成新的可视化图片。', 'assistant');
    return;
  }
  showTypingIndicator();
  try {
    const res = await fetch(API_BASE + '/api/ferro/jobs/' + encodeURIComponent(jobId) + '/visualizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode, component: mode === 'component' ? component || 'pz' : null, timesteps: nextResult.result && nextResult.result.timesteps || [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      displayMessage('生成该可视化失败：' + (data.error || '未知错误'), 'assistant');
      return;
    }
    nextResult.result = data.result || nextResult.result;
    nextResult.assets = data.assets || nextResult.assets;
    nextResult.outputs = data.outputs || nextResult.outputs;
    rememberFerroResult(nextResult, nextResult.draftSnapshot);
    displayMessage(nextResult, 'assistant');
    saveStructuredAssistantMessage(currentChatSessionId, buildStructuredFerroResultMessage(nextResult, currentChatSessionId, nextResult.draftSnapshot));
  } catch {
    displayMessage('生成该可视化失败：网络或服务错误', 'assistant');
  } finally {
    removeTypingIndicator();
  }
}

function cloneFerroResult(result) {
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { ...result };
  }
}

function hasFerroVisualization(result, mode, component) {
  const visualizations = result && Array.isArray(result.visualizations) ? result.visualizations : [];
  return visualizations.some((item) => {
    if (mode === 'component') return item.mode === 'component' && item.component === component;
    const normalized = normalizeFerroVisualizationRecord ? normalizeFerroVisualizationRecord(item) : item;
    const itemMode = normalized && normalized.mode;
    return itemMode === mode;
  });
}

function handleFerroFollowupChip(button) {
  const chipAction = button.dataset.chipAction || '';
  const draft = getStoredFerroDraft(currentChatSessionId) || {};
  if (chipAction === 'set_visualization_mode') {
    submitFerroDialogueRequest({
      action: 'patch_draft',
      context: { lastJobId: lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id) },
      patch: { 'visualization.mode': button.dataset.chipMode || 'inplane_angle' },
    }, button.textContent.trim());
    return;
  }
  if (chipAction === 'set_component') {
    submitFerroDialogueRequest({
      action: 'patch_draft',
      context: { lastJobId: lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id) },
      patch: { 'visualization.component': button.dataset.chipComponent || 'pz' },
    }, button.textContent.trim());
    return;
  }
  if (chipAction === 'refine_grid') {
    const grid = draft.grid || {};
    const doubled = {
      nx: Math.max(1, Number(grid.nx || 64) * 2),
      ny: Math.max(1, Number(grid.ny || 1)),
      nz: Math.max(1, Number(grid.nz || 64) * 2),
    };
    submitFerroDialogueRequest({
      action: 'patch_draft',
      context: { lastJobId: lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id) },
      patch: { grid: doubled },
    }, button.textContent.trim());
    return;
  }
  if (chipAction === 'increase_steps') {
    const run = draft.run || {};
    const currentSteps = Number(run.steps || run.kstep || 10000);
    submitFerroDialogueRequest({
      action: 'patch_draft',
      context: { lastJobId: lastFerroResult && (lastFerroResult.jobId || lastFerroResult.id) },
      patch: { 'run.steps': Math.max(currentSteps + 1, Math.round(currentSteps * 1.5)) },
    }, button.textContent.trim());
    return;
  }
  if (chipAction === 'compare_previous') {
    const count = ferroRunHistory.length;
    displayMessage(count > 1 ? `已保留最近 ${count} 次铁电运行，可继续指定要对比的变量或时间步。` : '当前只有一次铁电运行结果；再跑一个变体后我可以帮你对比。', 'assistant');
    return;
  }
  if (chipAction === 'generate_report') {
    displayMessage('已保留本次铁电结果上下文。请继续说明报告侧重点，例如材料参数、畴结构演化或可视化对比。', 'assistant');
  }
}

function handleFerroMaterialChoiceClick(event) {
  const button = event.target && event.target.closest && event.target.closest('[data-ferro-material-command]');
  if (!button) return false;
  event.preventDefault();
  const command = button.dataset.ferroMaterialCommand || '';
  if (!command || isAIThinking) return true;
  runFerroDialogue(command);
  return true;
}
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
const { formatContent, handleMessageContentClick, normalizeFerroVisualizationRecord } = chatRenderer;
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
