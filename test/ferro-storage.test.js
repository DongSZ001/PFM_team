const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('user workspace creates path-safe chat and ferro job directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-user-workspace-'));
  const storage = require('../pf_assistant/src/storage/user-workspace');
  const user = { id: 'user/email@example.edu' };

  const userKey = storage.getUserKey(user);
  assert.match(userKey, /^u_[a-f0-9]{24}$/);
  assert.equal(userKey.includes('@'), false);
  assert.equal(userKey.includes('/'), false);

  const workspace = storage.ensureUserWorkspace(user, { root });
  assert.equal(fs.existsSync(path.join(workspace.root, 'user-manifest.json')), true);
  assert.equal(fs.existsSync(path.join(workspace.root, 'chat-history')), true);
  assert.equal(fs.existsSync(path.join(workspace.root, 'ferroelectric-simulation')), true);

  const chatDir = storage.getChatHistoryDir(user, 'chat_1', { root });
  assert.equal(chatDir.startsWith(workspace.root + path.sep), true);

  const job = storage.createFerroJobWorkspace(user, 'chat_1', 'ferro_1', { root });
  assert.equal(job.jobDir.startsWith(workspace.root + path.sep), true);
  for (const dir of [job.executableDir, job.sourceDir, job.materialsDir, job.outputsDir, job.visualizationsDir, job.logsDir]) {
    assert.equal(fs.existsSync(dir), true, dir);
  }
});

test('user workspace rejects path traversal and mirrors chat messages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-user-workspace-'));
  const storage = require('../pf_assistant/src/storage/user-workspace');
  const user = { id: 'user-1' };

  assert.throws(() => storage.getChatHistoryDir(user, '../bad', { root }), /非法 chatSessionId/);
  assert.throws(() => storage.createFerroJobWorkspace(user, 'chat_1', '../bad', { root }), /非法 jobId/);

  const message = storage.appendChatHistoryMirror(user, 'chat_1', {
    id: 'msg_1',
    role: 'assistant',
    content: 'done',
    metadata: { type: 'ferro_result', jobId: 'ferro_1', result: { visualizations: [{ mode: 'component', component: 'pz' }] } },
  }, { root });
  assert.equal(message.chatSessionId, 'chat_1');

  const jsonl = path.join(storage.getChatHistoryDir(user, 'chat_1', { root }), 'messages.jsonl');
  const lines = fs.readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].metadata.type, 'ferro_result');

  storage.writeChatSnapshot(user, 'chat_1', lines, { root });
  assert.equal(fs.existsSync(path.join(path.dirname(jsonl), 'messages.snapshot.json')), true);
});
