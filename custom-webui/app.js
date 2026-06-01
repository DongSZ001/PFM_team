/**
 * PFM2 相场模拟助手 - Web UI (with Auth & Persistence)
 * 连接 OpenClaw Gateway WebSocket，聊天记录持久化
 */

const API_BASE = 'http://47.93.53.231:3000';

// DOM Elements
const loginModal = document.getElementById('loginModal');
const authTitle = document.getElementById('authTitle');
const loginForm = document.getElementById('loginForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authOrg = document.getElementById('authOrg');
const orgGroup = document.getElementById('orgGroup');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const switchAuthMode = document.getElementById('switchAuthMode');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const connectionStatus = document.getElementById('connectionStatus');
const themeToggle = document.getElementById('themeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const sidebar = document.getElementById('sidebar');
const chatList = document.getElementById('chatList');

// State
let ws = null;
let isConnected = false;
let requestId = 0;
let currentUser = null;
let currentSessionKey = null;
let currentChatSessionId = null; // Our DB session ID
let isRegisterMode = false;
let isAIThinking = false;
let autoSaveEnabled = false;

// Initialize
function init() {
  setupEventListeners();
  loadTheme();
  checkAuth();
}

function setupEventListeners() {
  // Auth forms
  loginForm.addEventListener('submit', handleAuthSubmit);
  switchAuthMode.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthMode();
  });

  // Chat
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

// ============ Auth ============

async function checkAuth() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      showChatInterface();
      await loadChatSessions();
      // Try to recover existing session
      await recoverSession();
    } else {
      showLoginModal();
    }
  } catch {
    showLoginModal();
  }
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  authError.textContent = '';
  if (isRegisterMode) {
    authTitle.textContent = '注册';
    authSubmitBtn.textContent = '注册';
    switchAuthMode.textContent = '已有账号？登录';
    orgGroup.style.display = 'block';
  } else {
    authTitle.textContent = '登录';
    authSubmitBtn.textContent = '登录';
    switchAuthMode.textContent = '没有账号？立即注册';
    orgGroup.style.display = 'none';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  authError.textContent = '';
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = isRegisterMode ? '注册中...' : '登录中...';

  const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
  const body = isRegisterMode
    ? { organization: authOrg.value, email: authEmail.value, password: authPassword.value }
    : { email: authEmail.value, password: authPassword.value };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.error || '操作失败';
      return;
    }

    currentUser = data.user;
    showChatInterface();
    await loadChatSessions();
    // After login/register, create a new chat session
    await createNewChat();
  } catch (err) {
    authError.textContent = '网络错误，请稍后重试';
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = isRegisterMode ? '注册' : '登录';
  }
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  currentUser = null;
  currentChatSessionId = null;
  if (ws) { ws.close(); ws = null; }
  isConnected = false;
  showLoginModal();
}

function showLoginModal() {
  loginModal.style.display = 'flex';
  sidebar.style.display = 'none';
  logoutBtn.style.display = 'none';
  if (ws) { ws.close(); ws = null; }
  isConnected = false;
  updateStatus('disconnected');
}

function showChatInterface() {
  loginModal.style.display = 'none';
  sidebar.style.display = 'flex';
  logoutBtn.style.display = 'block';
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

  sessions.forEach(session => {
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
    // Inline rename
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
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': getSessionToken() },
        credentials: 'include',
        body: JSON.stringify({ title: newTitle })
      });
    } catch {}
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      titleEl.textContent = titleEl.textContent;
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
      headers: { 'X-Session-Token': getSessionToken() },
      credentials: 'include'
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
  currentSessionKey = null; // Force a new OpenClaw session for the new chat
  pendingSessionCreate = false;
  autoSaveEnabled = false;

  // Highlight active in sidebar
  document.querySelectorAll('.session-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sessionId === sessionId);
  });

  // Load messages
  try {
    const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      credentials: 'include'
    });
    if (res.ok) {
      const messages = await res.json();
      messagesContainer.innerHTML = '';
      if (messages.length === 0) {
        displayWelcome();
      } else {
        messages.forEach(msg => displayMessage(msg.content, msg.role === 'user' ? 'user' : 'assistant', true));
      }
    } else {
      displayWelcome();
    }
  } catch {
    displayWelcome();
  }

  // Note: Do NOT set currentSessionKey from the DB here.
  // The OpenClaw session key in the DB is from a previous gateway connection
  // and is no longer valid in the current WebSocket. We'll create a new
  // OpenClaw session on next hello-ok and bind it to this chat session.
  console.log('[session] Chat session ready, will create new OpenClaw session on next handshake');

  // If WebSocket is already connected (after hello-ok), create a new OpenClaw session now
  if (isConnected) {
    createOpenClawSession();
  }

  autoSaveEnabled = true;
}

async function createNewChat() {
  autoSaveEnabled = false;
  currentChatSessionId = null;
  currentSessionKey = null;
  messagesContainer.innerHTML = '';
  displayWelcome();

  // Deselect sidebar
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));

  // Create new session on server
  try {
    const res = await fetch(`${API_BASE}/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': getSessionToken() },
      credentials: 'include',
      body: JSON.stringify({})
    });
    if (res.ok) {
      const data = await res.json();
      currentChatSessionId = data.session_id;
      await loadChatSessions();
      // Highlight new session
      document.querySelectorAll('.session-item').forEach(el => {
        el.classList.toggle('active', el.dataset.sessionId === currentChatSessionId);
      });
    }
  } catch {}

  autoSaveEnabled = true;
}

async function recoverSession() {
  try {
    const res = await fetch(`${API_BASE}/chat/sessions`, { credentials: 'include' });
    if (!res.ok) return;
    const sessions = await res.json();

    if (sessions.length > 0) {
      // Use most recent session
      const recent = sessions[0];
      await switchToSession(recent.id);
    } else {
      await createNewChat();
    }
  } catch {}
}

// ============ Gateway Connection ============

function getSessionToken() {
  return localStorage.getItem('pfui_session_token') || '';
}

function connectGateway() {
  if (ws) { ws.close(); ws = null; }
  updateStatus('connecting');

  const wsUrl = `ws://${window.location.host}/`;
  console.log('[ws] Connecting to gateway via serve.js');
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[ws] Gateway WebSocket opened');
  };

  ws.onmessage = (event) => {
    handleMessage(event.data);
  };

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
let reconnectingSession = false;

function handleMessage(data) {
  try {
    const msg = JSON.parse(data);

    // Connection success
    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
      console.log('[ws] ✅ Gateway handshake complete');
      isConnected = true;
      updateStatus('connected');
      hideLoginModalIfVisible();

      // Bind existing OpenClaw session key if we have one
      if (currentSessionKey && currentChatSessionId) {
        console.log('[ws] Binding existing OpenClaw session to chat session');
        bindOpenClawSession(currentChatSessionId, currentSessionKey);
      } else {
        // Create new OpenClaw session
        createOpenClawSession();
      }
      return;
    }

    // Session create response
    if (msg.type === 'res' && msg.id === '1') {
      if (!msg.ok) {
        console.error('[ws] sessions.create failed:', msg.error);
        pendingSessionCreate = false;
        // Retry once
        if (!reconnectingSession) {
          reconnectingSession = true;
          setTimeout(() => createOpenClawSession(), 500);
        }
        return;
      }

      // Extract sessionKey
      let sk = null;
      if (msg.payload?.key) sk = msg.payload.key;
      if (msg.payload?.sessionKey) sk = msg.payload.sessionKey;
      if (msg.payload?.result?.sessionKey) sk = msg.payload.result.sessionKey;

      if (sk) {
        currentSessionKey = sk;
        pendingSessionCreate = false;
        reconnectingSession = false;
        console.log('[ws] ✅ OpenClaw session created:', sk);

        // Bind to our chat session
        if (currentChatSessionId) {
          bindOpenClawSession(currentChatSessionId, sk);
        }
      }
      return;
    }

    // Chat response
    if (msg.event === 'chat') {
      const payload = msg.payload || msg;
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

    // Agent event (streaming)
    if (msg.event === 'agent') {
      handleAgentEvent(msg.payload);
      return;
    }

    // Error event
    if (msg.event === 'error') {
      isAIThinking = false;
      removeTypingIndicator();
      return;
    }

    // Health/heartbeat ignore
    if (msg.event === 'health' || msg.event === 'heartbeat') return;

  } catch (error) {
    console.error('[ws] Parse error:', error);
  }
}

function handleAgentEvent(payload) {
  if (!payload) return;

  if (payload.content) {
    displayMessage(payload.content, 'assistant');
    if (autoSaveEnabled) {
      saveMessage(currentChatSessionId, 'assistant', payload.content);
    }
    isAIThinking = false;
    removeTypingIndicator();
    return;
  }

  if (payload.done || payload.stopReason) {
    isAIThinking = false;
    removeTypingIndicator();
  }
}

function createOpenClawSession() {
  if (!isConnected || pendingSessionCreate) return;
  pendingSessionCreate = true;

  const payload = {
    type: 'req',
    id: '1',
    method: 'sessions.create',
    params: {}
  };
  ws.send(JSON.stringify(payload));
}

async function bindOpenClawSession(chatSessionId, openclawSessionKey) {
  try {
    await fetch(`${API_BASE}/chat/sessions/${chatSessionId}/openclaw-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': getSessionToken() },
      credentials: 'include',
      body: JSON.stringify({ session_id: chatSessionId, openclaw_session_key: openclawSessionKey })
    });
    console.log('[session] OpenClaw key bound to chat session:', chatSessionId);
  } catch (err) {
    console.error('[session] Failed to bind OpenClaw key:', err);
  }
}

// ============ Send Message ============

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !isConnected) return;

  if (!currentSessionKey) {
    displayMessage('错误：会话未就绪，请稍候...', 'assistant');
    return;
  }

  messageInput.value = '';
  messageInput.style.height = 'auto';

  displayMessage(content, 'user');
  saveMessage(currentChatSessionId, 'user', content);

  const payload = {
    type: 'req',
    id: genId(),
    method: 'chat.send',
    params: {
      sessionKey: currentSessionKey,
      message: content,
      idempotencyKey: genId()
    }
  };

  ws.send(JSON.stringify(payload));
  showTypingIndicator();
  isAIThinking = true;
}

// ============ Message Persistence ============

let saveQueue = [];
let isSaving = false;

async function saveMessage(sessionId, role, content) {
  if (!sessionId || !autoSaveEnabled) return;
  // Backend expects snake_case fields
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
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': getSessionToken() },
      credentials: 'include',
      body: JSON.stringify(item)
    });
    // Update session list timestamp
    loadChatSessions();
  } catch (err) {
    console.error('[save] Failed to save message:', err);
    // Re-queue
    saveQueue.unshift(item);
  }
  processSaveQueue();
}

// ============ Display Helpers ============

function hideLoginModalIfVisible() {
  if (loginModal.style.display === 'flex') {
    loginModal.style.display = 'none';
  }
}

function displayWelcome() {
  const welcomeEl = document.createElement('div');
  welcomeEl.className = 'message welcome';
  welcomeEl.innerHTML = `
    <div class="message-avatar">🔬</div>
    <div class="message-content">
      <p>您好！我是 PFM2 相场模拟专业助手。</p>
      <p>我可以帮助您：</p>
      <ul>
        <li>相场模拟建模与参数优化</li>
        <li>MUMAX3/OOMMF 代码生成</li>
        <li>结果分析与可视化</li>
        <li>文献调研与理论咨询</li>
      </ul>
      <p>请开始您的提问！</p>
    </div>
  `;
  messagesContainer.appendChild(welcomeEl);
}

function displayMessage(content, role, skipScroll = false) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role === 'user' ? 'user' : ''}`;
  const avatar = role === 'user' ? '👤' : '🔬';
  const formattedContent = formatContent(content);
  messageEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">${formattedContent}</div>
  `;
  messagesContainer.appendChild(messageEl);
  if (!skipScroll) scrollToBottom();
}

function formatContent(text) {
  if (!text) return '';
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

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

function updateStatus(status) {
  connectionStatus.className = 'status ' + status;
  switch (status) {
    case 'connected':
      connectionStatus.textContent = '已连接';
      sendBtn.disabled = false;
      break;
    case 'connecting':
      connectionStatus.textContent = '连接中...';
      sendBtn.disabled = true;
      break;
    case 'disconnected':
      connectionStatus.textContent = '未连接';
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
