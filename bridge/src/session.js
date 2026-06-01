/**
 * Session Manager for nanobot-WebUI Bridge
 */

class SessionManager {
  constructor() {
    this._sessions = new Map();
    this._connectionMap = new WeakMap();
  }

  createSession(chatId) {
    const session = {
      chatId,
      ocSessionKey: `webui:${chatId}`,
      createdAt: Date.now(),
      runId: null,
    };
    this._sessions.set(chatId, session);
    return session;
  }

  getSession(chatId) {
    return this._sessions.get(chatId);
  }

  attachSession(chatId) {
    const session = this._sessions.get(chatId);
    if (session) {
      session.attachedAt = Date.now();
    }
    return session;
  }

  registerConnectionChat(ws, chatId) {
    this._connectionMap.set(ws, chatId);
  }

  getChatByConnection(ws) {
    return this._connectionMap.get(ws);
  }

  removeConnection(ws) {
    const chatId = this._connectionMap.get(ws);
    this._connectionMap.delete(ws);
    return chatId;
  }

  setOcRunId(chatId, runId) {
    const session = this._sessions.get(chatId);
    if (session) {
      session.runId = runId;
    }
  }

  listSessions() {
    return Array.from(this._sessions.values());
  }
}

module.exports = { SessionManager };
