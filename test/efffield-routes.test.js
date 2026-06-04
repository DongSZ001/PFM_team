const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');

test('efffield routes create jobs, return results, and serve png assets', async () => {
  const { createEfffieldApiHandler, isEfffieldApiPath } = require('../pf_assistant/src/server/efffield-routes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'efffield-routes-'));
  const pngPath = path.join(tmp, 'phase_map.png');
  fs.writeFileSync(pngPath, 'png');
  const calls = [];
  const service = {
    async createAndRunJob(payload) {
      calls.push(payload);
      return {
        id: 'eff_route_1',
        status: 'completed',
        system: 'dielectric',
        summary: 'done',
        assets: [{ name: 'phase_map.png', title: '相分布', url: '/api/efffield/assets/eff_route_1/phase_map.png' }],
        outputs: [{ name: 'effDielectricPermittivity.dat' }],
        effectiveTensor: { name: 'effDielectricPermittivity.dat', text: '1 0 0' },
      };
    },
    getJobResult(jobId) {
      if (jobId !== 'eff_route_1') return null;
      return { id: jobId, status: 'completed', assets: [] };
    },
    resolveAssetPath(jobId, filename) {
      assert.equal(jobId, 'eff_route_1');
      assert.equal(filename, 'phase_map.png');
      return pngPath;
    },
  };
  const handler = createEfffieldApiHandler({
    requireAuth: (req) => { req.userId = 'user-1'; return true; },
    readJsonBody,
    jsonResponse,
    service,
  });

  assert.equal(isEfffieldApiPath('/api/efffield/jobs'), true);
  assert.equal(isEfffieldApiPath('/api/materials'), false);

  const createReq = makeReq('POST', '/api/efffield/jobs', {
    system: 'dielectric',
    chatSessionId: 'chat-1',
  });
  const createRes = makeRes();
  assert.equal(await handler(createReq, createRes, new URL('http://x/api/efffield/jobs'), '/api/efffield/jobs'), true);
  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.status, 'completed');
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].chatSessionId, 'chat-1');

  const getRes = makeRes();
  assert.equal(await handler(makeReq('GET', '/api/efffield/jobs/eff_route_1'), getRes, null, '/api/efffield/jobs/eff_route_1'), true);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.id, 'eff_route_1');

  const assetRes = makeRes();
  assert.equal(await handler(makeReq('GET', '/api/efffield/assets/eff_route_1/phase_map.png'), assetRes, null, '/api/efffield/assets/eff_route_1/phase_map.png'), true);
  assert.equal(assetRes.status, 200);
  assert.equal(assetRes.headers['Content-Type'], 'image/png');
  assert.equal(assetRes.rawBody.toString(), 'png');
});

test('efffield routes parse auth cookies before requiring auth', async () => {
  const { createEfffieldApiHandler } = require('../pf_assistant/src/server/efffield-routes');
  const seen = [];
  const handler = createEfffieldApiHandler({
    requireAuth: (req) => { seen.push(req.cookies); req.userId = 'user-1'; return true; },
    readJsonBody,
    jsonResponse,
    service: {
      async createAndRunJob() { return { id: 'eff_cookie_1', status: 'completed', assets: [], outputs: [] }; },
      getJobResult() { return null; },
      resolveAssetPath() { throw new Error('unused'); },
    },
  });
  const req = makeReq('POST', '/api/efffield/jobs', { system: 'dielectric' });
  req.headers.cookie = 'session_token=abc123; theme=dark';
  const res = makeRes();

  assert.equal(await handler(req, res, null, '/api/efffield/jobs'), true);

  assert.deepEqual(seen[0], { session_token: 'abc123', theme: 'dark' });
});

test('efffield route handles chat dialogue messages before running jobs', async () => {
  const { createEfffieldApiHandler } = require('../pf_assistant/src/server/efffield-routes');
  const calls = [];
  const handler = createEfffieldApiHandler({
    requireAuth: (req) => { req.userId = 'user-1'; return true; },
    readJsonBody,
    jsonResponse,
    service: {
      async createAndRunJob() { throw new Error('unused'); },
      getJobResult() { return null; },
      resolveAssetPath() { throw new Error('unused'); },
    },
    dialogueService: {
      async handleMessage(payload) {
        calls.push(payload);
        return {
          type: 'efffield_dialogue',
          reply: '网格尺寸是多少？',
          draft: { system: 'dielectric', status: 'collecting' },
        };
      },
    },
  });

  const req = makeReq('POST', '/api/efffield/dialogue', {
    chatSessionId: 'chat-1',
    message: '我想做介电常数模拟',
  });
  const res = makeRes();

  assert.equal(await handler(req, res, null, '/api/efffield/dialogue'), true);
  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'efffield_dialogue');
  assert.equal(res.body.reply, '网格尺寸是多少？');
  assert.deepEqual(calls[0], {
    userId: 'user-1',
    chatSessionId: 'chat-1',
    message: '我想做介电常数模拟',
  });
});

test('efffield dialogue route returns not handled for ordinary chat', async () => {
  const { createEfffieldApiHandler } = require('../pf_assistant/src/server/efffield-routes');
  const handler = createEfffieldApiHandler({
    requireAuth: (req) => { req.userId = 'user-1'; return true; },
    readJsonBody,
    jsonResponse,
    service: {
      async createAndRunJob() { throw new Error('unused'); },
      getJobResult() { return null; },
      resolveAssetPath() { throw new Error('unused'); },
    },
    dialogueService: {
      async handleMessage() {
        return null;
      },
    },
  });

  const res = makeRes();
  assert.equal(await handler(makeReq('POST', '/api/efffield/dialogue', { message: '你好' }), res, null, '/api/efffield/dialogue'), true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { type: 'not_efffield' });
});

test('efffield routes create jobs from custom parameter.in panel payloads', async () => {
  const { createEfffieldApiHandler } = require('../pf_assistant/src/server/efffield-routes');
  const calls = [];
  const cleared = [];
  const handler = createEfffieldApiHandler({
    requireAuth: (req) => { req.userId = 'user-1'; return true; },
    readJsonBody,
    jsonResponse,
    service: {
      async createAndRunParameterJob(payload) {
        calls.push(payload);
        return { id: 'eff_param_1', status: 'completed', system: 'dielectric', summary: 'done', assets: [], outputs: [], effectiveTensor: null };
      },
      async createAndRunJob() { throw new Error('unused'); },
      getJobResult() { return null; },
      resolveAssetPath() { throw new Error('unused'); },
    },
    dialogueService: {
      clearDraft(payload) { cleared.push(payload); },
      async handleMessage() { throw new Error('unused'); },
    },
  });

  const res = makeRes();
  assert.equal(await handler(makeReq('POST', '/api/efffield/parameter-jobs', {
    chatSessionId: 'chat-1',
    parameterText: 'REALDIM 16 16 1\\nSYSDIM 16 16 1\\nCHOICESYS 2\\n',
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 1e-4, maxiter: 25 },
  }), res, null, '/api/efffield/parameter-jobs'), true);

  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'eff_param_1');
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].chatSessionId, 'chat-1');
  assert.match(calls[0].parameterText, /CHOICESYS 2/);
  assert.deepEqual(cleared, [{ userId: 'user-1', chatSessionId: 'chat-1' }]);
});


function makeReq(method, url, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = {};
  return req;
}

function makeRes() {
  return {
    headers: {},
    status: null,
    body: null,
    rawBody: Buffer.alloc(0),
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(value) {
      if (value === undefined) return;
      if (this.headers['Content-Type'] && this.headers['Content-Type'].includes('json')) {
        this.body = JSON.parse(value);
      } else {
        this.rawBody = Buffer.from(value);
      }
    },
  };
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk.toString();
  return raw ? JSON.parse(raw) : {};
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
