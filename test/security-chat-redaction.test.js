const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

test('chat save-message redacts secrets before database and JSONL mirror persistence', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-chat-security-'));
  const tempDb = path.join(tempRoot, 'app.db');
  const userDataRoot = path.join(tempRoot, 'users');
  const script = String.raw`
const { Readable } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./pf_assistant/database');
const { handleAuthRoute } = require('./pf_assistant/auth');

function makeReq(method, url, body, cookie = '') {
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1:3000', cookie };
  if (body) req.push(JSON.stringify(body));
  req.push(null);
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; },
    end(body = '') { this.body = String(body || ''); },
  };
}

async function call(method, url, body, cookie) {
  const req = makeReq(method, url, body, cookie);
  const res = makeRes();
  await handleAuthRoute(req, res);
  return res;
}

(async () => {
  db.initDb();
  const user = db.createUser({
    email: 'security-user@example.edu',
    password: 'secret123',
    institution_name: 'Security Lab',
    institution_type: '高校',
    contact_name: 'Safe User',
    role: '博士 / 硕士研究生',
    intended_use: 'security regression testing',
  });
  const login = await call('POST', '/api/auth/login', { email: 'security-user@example.edu', password: 'secret123' });
  const cookie = String(login.headers['Set-Cookie'] || login.headers['set-cookie']).split(';')[0];
  const safeProfile = await call('GET', '/api/me/safe-profile', null, cookie);
  const session = db.createChatSession(user.id, 'Security');
  await call('POST', '/chat/save-message', {
    session_id: session.id,
    role: 'assistant',
    content: 'USER.md minimax api_key=abc1234567890 Bearer abcdefghijklmnop',
    metadata: {
      type: 'debug',
      apiKey: 'abc1234567890',
      systemPrompt: 'internal developer prompt',
      nested: { token: 'shhhhhhh123456789' },
    },
  }, cookie);

  const message = db.getChatMessages(session.id)[0];
  const mirrorRoot = process.env.PFM_USER_DATA_ROOT;
  const mirrorFile = findFile(mirrorRoot, 'messages.jsonl');
  console.log(JSON.stringify({
    safeProfile: JSON.parse(safeProfile.body),
    content: message.content,
    metadata: JSON.parse(message.metadata_json),
    mirror: fs.readFileSync(mirrorFile, 'utf8'),
  }));
  db.closeDbForTests();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function findFile(root, filename) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return full;
    }
  }
  return null;
}
`;

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PF_ASSISTANT_DB_PATH: tempDb,
      PFM_USER_DATA_ROOT: userDataRoot,
    },
    encoding: 'utf8',
  }).trim().split('\n').filter((line) => line.startsWith('{')).pop();

  const parsed = JSON.parse(output);
  const serialized = JSON.stringify(parsed);
  assert.deepEqual(Object.keys(parsed.safeProfile).sort(), ['displayName', 'persona']);
  assert.doesNotMatch(JSON.stringify(parsed.safeProfile), /Security Lab|security-user@example/);
  assert.match(parsed.content, /\[REDACTED_INTERNAL_FILE\]/);
  assert.match(parsed.content, /\[REDACTED_SECRET\]/);
  assert.equal(parsed.metadata.apiKey, '[REDACTED_SECRET]');
  assert.equal(parsed.metadata.systemPrompt, '[REDACTED_INTERNAL]');
  assert.equal(parsed.metadata.nested.token, '[REDACTED_SECRET]');
  assert.doesNotMatch(serialized, /abc1234567890|abcdefghijklmnop|USER\.md|internal developer prompt|shhhhhhh/);
});
