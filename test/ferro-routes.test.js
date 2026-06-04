const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');

test('ferro routes create jobs, return results, and serve png assets', async () => {
  const { createFerroApiHandler, isFerroApiPath } = require('../pf_assistant/src/server/ferro-routes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-routes-'));
  const png = path.join(tmp, 'Polar.0000002_pz.png');
  fs.writeFileSync(png, 'png');
  const service = {
    async createAndRunJob({ userId, chatSessionId, request }) {
      assert.equal(userId, 'user-1');
      assert.equal(chatSessionId, 'chat-1');
      assert.equal(request.grid.nx, 16);
      return { id: 'ferro_route_1', status: 'completed', summary: 'done', assets: [{ name: 'Polar.0000002_pz.png', title: 'Pz', url: '/api/ferro/assets/ferro_route_1/Polar.0000002_pz.png' }], outputs: [] };
    },
    getJobResult(jobId) {
      if (jobId !== 'ferro_route_1') return null;
      return { id: jobId, status: 'completed', assets: [] };
    },
    resolveAssetPath(jobId, file) {
      assert.equal(jobId, 'ferro_route_1');
      assert.equal(file, 'Polar.0000002_pz.png');
      return png;
    },
  };
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service,
    dialogueService: { async handleMessage() { return { type: 'not_ferro' }; } },
  });

  assert.equal(isFerroApiPath('/api/ferro/jobs'), true);
  const createRes = makeRes();
  await handler(makeReq('POST', '/api/ferro/jobs', { chatSessionId: 'chat-1', grid: { nx: 16 } }), createRes, null, '/api/ferro/jobs');
  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.id, 'ferro_route_1');

  const getRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/jobs/ferro_route_1'), getRes, null, '/api/ferro/jobs/ferro_route_1');
  assert.equal(getRes.body.status, 'completed');

  const assetRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/assets/ferro_route_1/Polar.0000002_pz.png'), assetRes, null, '/api/ferro/assets/ferro_route_1/Polar.0000002_pz.png');
  assert.equal(assetRes.headers['Content-Type'], 'image/png');
  assert.equal(assetRes.data.toString(), 'png');
});

test('ferro routes generate postprocess visualizations without rerunning jobs', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const calls = [];
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {
      async generateVisualizations({ userId, jobId, visualization }) {
        calls.push({ userId, jobId, visualization });
        return {
          jobId,
          result: {
            visualizations: [{ timestep: 2, mode: 'variant_111', component: null, components: ['px', 'py', 'pz'], overlay: { arrows: true, projectionComponents: ['px', 'pz'] }, label: 'R相变体 kt=2', url: '/api/ferro/assets/ferro_route_1/Polar.0000002_variant_111_arrow.png' }],
            legend: { mode: 'variant_111', label: 'R相 <111> 变体', url: '/api/ferro/assets/ferro_route_1/polar_variant_111_legend.png' },
          },
        };
      },
    },
    dialogueService: { async handleMessage() { return { type: 'not_ferro' }; } },
  });

  const res = makeRes();
  await handler(
    makeReq('POST', '/api/ferro/jobs/ferro_route_1/visualizations', { mode: 'variant_111', component: null, timesteps: [2] }),
    res,
    null,
    '/api/ferro/jobs/ferro_route_1/visualizations',
  );

  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jobId, 'ferro_route_1');
  assert.equal(calls[0].visualization.mode, 'variant_111');
  assert.equal(res.body.result.visualizations[0].mode, 'variant_111');
});


test('ferro routes list available material models', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    materialRepository: {
      listFerroParameterModels() {
        return [
          { material_key: 'pzt', display_name: 'PZT', model_key: 'pzt_haun_1989', model_name: 'PZT Haun 1989', default_xf: 0.48, default_tem: 300 },
        ];
      },
    },
  });

  const res = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials'), res, null, '/api/ferro/materials');

  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.body.cards), true);
  assert.equal(Array.isArray(res.body.materials), true);
  assert.equal(res.body.materials[0].id, 'pzt_haun_1989');
  assert.equal(res.body.materials[0].materialKey, 'pzt');
  assert.equal(res.body.materials[0].displayName, 'PZT');
  assert.equal(res.body.materials[0].defaultXf, 0.48);
  assert.equal(res.body.materials[0].composition.enabled, true);
  assert.equal(res.body.materials[0].defaultParams.temperature, 300);
  assert.equal(res.body.materials[0].presets.length, 3);
  assert.equal(res.body.materials[0].presets[0].id, 'quick_2d');
});

test('ferro routes filter material models by query text', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    materialRepository: {
      listFerroParameterModels() {
        return [
          { material_key: 'pzt', display_name: 'PZT', model_key: 'pzt_haun_1989', model_name: 'PZT Haun 1989', default_xf: 0.48, default_tem: 300 },
          { material_key: 'bfo', display_name: 'BFO', model_key: 'bfo_bens_coefficients', model_name: 'BFO Bens coefficients', default_xf: 1, default_tem: 298 },
          { material_key: 'bfo', display_name: 'BFO', model_key: 'bfo_10004', model_name: 'BFO 10004', default_xf: 1, default_tem: 298 },
          { material_key: 'bfo', display_name: 'BFO', model_key: 'landau:BFO_Hsieh2016_sixth', model_name: 'BFO Hsieh2016 sixth', source_label: 'Landau DB: BFO_Hsieh2016_sixth', formula_type: 'landau_database', default_xf: 1, default_tem: 298 },
          { material_key: 'pmn_pt', display_name: 'PMN-PT', model_key: 'landau:PMNPT_030_Khakpash2015', model_name: 'PMN-PT x=0.30', source_label: 'Landau DB: PMNPT_030_Khakpash2015', formula_type: 'landau_database', default_xf: 0.3, default_tem: 300 },
          { material_key: 'pmn_pt', display_name: 'PMN-PT', model_key: 'landau:PMNPT_042_Khakpash2015', model_name: 'PMN-PT x=0.42', source_label: 'Landau DB: PMNPT_042_Khakpash2015', formula_type: 'landau_database', default_xf: 0.42, default_tem: 300 },
          { material_key: 'pmn_pt', display_name: 'PMN-PT', model_key: 'landau:PMNPT_070_Khakpash2015', model_name: 'PMN-PT x=0.70', source_label: 'Landau DB: PMNPT_070_Khakpash2015', formula_type: 'landau_database', default_xf: 0.7, default_tem: 300 },
          { material_key: 'pto', display_name: 'PTO', model_key: 'landau:PTO_default', model_name: 'PTO default', source_label: 'Landau DB: PTO_default', formula_type: 'landau_database', default_tem: 300 },
          { material_key: 'pzt', display_name: 'PZT', model_key: 'pzt_haun_1989', model_name: 'PZT Haun 1989', default_xf: 0.48, default_tem: 300 },
          { material_key: 'bto', display_name: 'BaTiO3', model_key: 'bto_generate_input', model_name: 'BTO generate_input', default_tem: 298 },
        ];
      },
    },
  });

  const allRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials'), allRes, null, '/api/ferro/materials');
  assert.equal(allRes.status, 200);
  assert.deepEqual(allRes.body.cards.map((item) => item.familyId), ['bfo', 'pmn_pt', 'bto', 'pto', 'pzt']);

  const bfoRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials?filter=模拟%20BFO%20铁电畴'), bfoRes, new URL('http://local/api/ferro/materials?filter=模拟%20BFO%20铁电畴'), '/api/ferro/materials');
  assert.equal(bfoRes.status, 200);
  assert.deepEqual(bfoRes.body.cards.map((item) => item.familyId), ['bfo']);
  assert.deepEqual(bfoRes.body.cards[0].variants.map((item) => item.variantId), ['bfo_zhang2008_fourth', 'bfo_hsieh2016_sixth', 'bfo_cao2018_eighth']);

  const exactRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials?filter=PMN-PT'), exactRes, new URL('http://local/api/ferro/materials?filter=PMN-PT'), '/api/ferro/materials');
  assert.deepEqual(exactRes.body.cards.map((item) => item.familyId), ['pmn_pt']);
  assert.deepEqual(exactRes.body.cards[0].variants.map((item) => item.compositionValue), [0.3, 0.42, 0.7]);

  const ptoRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials?filter=PTO'), ptoRes, new URL('http://local/api/ferro/materials?filter=PTO'), '/api/ferro/materials');
  assert.deepEqual(ptoRes.body.cards.map((item) => item.familyId), ['pto']);
  assert.equal(ptoRes.body.cards[0].variants[0].materialModelId, 'landau:PTO_default');

  const pztRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials?filter=PZT'), pztRes, new URL('http://local/api/ferro/materials?filter=PZT'), '/api/ferro/materials');
  assert.deepEqual(pztRes.body.cards.map((item) => item.familyId), ['pzt']);
  assert.equal(pztRes.body.cards[0].composition.enabled, true);
});


test('ferro routes expose Landau source sets and coefficient records', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    landauRepository: {
      listFerroLandauSourceSets() {
        return [
          {
            set_key: 'PZT_Haun1989_composition',
            material_id: 'PZT',
            material_name: 'PbZr1-xTixO3',
            composition: '0 <= x <= 1',
            source_ref: '[9]',
            polynomial_order: 'sixth_order',
            temperature_unit: 'degree_C',
            variables: 'T, x',
            notes: 'Composition-dependent Haun formula.',
          },
        ];
      },
      getFerroLandauSourceSet(setKey) {
        if (setKey !== 'PZT_Haun1989_composition') return null;
        return { set_key: setKey };
      },
      listFerroLandauCoefficientRecords(setKey) {
        assert.equal(setKey, 'PZT_Haun1989_composition');
        return [
          {
            source_set_key: setKey,
            coefficient_id: 'alpha1',
            normalized_coefficient_id: 'alpha1',
            unit_reported: 'C^-2*m^2*N',
            value_expression: '(T-T0(x))/(2*epsilon0*C_curie(x))',
            notes: 'T in degree_C',
          },
        ];
      },
    },
  });

  const listRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/landau/source-sets'), listRes, null, '/api/ferro/landau/source-sets');
  assert.equal(listRes.status, 200);
  assert.deepEqual(listRes.body[0], {
    setKey: 'PZT_Haun1989_composition',
    materialId: 'PZT',
    materialName: 'PbZr1-xTixO3',
    composition: '0 <= x <= 1',
    sourceRef: '[9]',
    order: 'sixth_order',
    temperatureUnit: 'degree_C',
    variables: 'T, x',
    notes: 'Composition-dependent Haun formula.',
  });

  const coeffRes = makeRes();
  await handler(
    makeReq('GET', '/api/ferro/landau/source-sets/PZT_Haun1989_composition/coefficients'),
    coeffRes,
    null,
    '/api/ferro/landau/source-sets/PZT_Haun1989_composition/coefficients',
  );
  assert.equal(coeffRes.status, 200);
  assert.deepEqual(coeffRes.body[0], {
    setKey: 'PZT_Haun1989_composition',
    coefficientId: 'alpha1',
    normalizedCoefficientId: 'alpha1',
    unitReported: 'C^-2*m^2*N',
    valueExpression: '(T-T0(x))/(2*epsilon0*C_curie(x))',
    notes: 'T in degree_C',
  });

  const missingRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/landau/source-sets/missing/coefficients'), missingRes, null, '/api/ferro/landau/source-sets/missing/coefficients');
  assert.equal(missingRes.status, 404);
});

test('ferro dialogue route returns not handled for ordinary chat', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
  });
  const res = makeRes();
  await handler(makeReq('POST', '/api/ferro/dialogue', { message: '你好' }), res, null, '/api/ferro/dialogue');
  assert.deepEqual(res.body, { type: 'not_ferro' });
});

test('ferro admin reload material catalog is only available in editor mode', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  let reloaded = 0;
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'admin'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    materialCatalog: { reloadMaterialCardCatalog() { reloaded += 1; return { version: 1 }; } },
    env: { PFM_ENABLE_FERRO_CARD_EDITOR: '1' },
  });

  const res = makeRes();
  await handler(makeReq('POST', '/api/ferro/admin/reload-material-catalog', {}), res, null, '/api/ferro/admin/reload-material-catalog');
  assert.equal(res.status, 200);
  assert.equal(res.body.reloaded, true);
  assert.equal(reloaded, 1);

  const disabled = createFerroApiHandler({
    requireAuth(req) { req.userId = 'admin'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    materialCatalog: { reloadMaterialCardCatalog() { throw new Error('should not reload'); } },
    env: {},
  });
  const disabledRes = makeRes();
  await disabled(makeReq('POST', '/api/ferro/admin/reload-material-catalog', {}), disabledRes, null, '/api/ferro/admin/reload-material-catalog');
  assert.equal(disabledRes.status, 404);
});

test('ferro admin Landau endpoints are available only in Landau editor mode', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const saved = [];
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'admin'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    env: { PFM_ENABLE_FERRO_LANDAU_EDITOR: '1' },
    landauAdmin: {
      listSourceSets() { return [{ set_key: 'ABC_Test', material_id: 'ABC' }]; },
      getSourceSet(setKey) { return { set_key: setKey, material_id: 'ABC' }; },
      listCoefficientRecords(setKey) { return [{ source_set_key: setKey, coefficient_id: 'alpha1' }]; },
      validate(payload) { return { valid: Boolean(payload.sourceSet), errors: [], warnings: [] }; },
      save(payload) { saved.push(payload.sourceSet.set_key); return { saved: true, coefficientCount: payload.coefficients.length }; },
      exportMarkdown() { return '# Landau\n'; },
    },
  });

  const listRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/admin/landau/source-sets'), listRes, null, '/api/ferro/admin/landau/source-sets');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.sourceSets[0].set_key, 'ABC_Test');

  const detailRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/admin/landau/source-sets/ABC_Test'), detailRes, null, '/api/ferro/admin/landau/source-sets/ABC_Test');
  assert.equal(detailRes.body.sourceSet.set_key, 'ABC_Test');
  assert.equal(detailRes.body.coefficients[0].coefficient_id, 'alpha1');

  const validateRes = makeRes();
  await handler(makeReq('POST', '/api/ferro/admin/landau/validate', { sourceSet: { set_key: 'ABC_Test' } }), validateRes, null, '/api/ferro/admin/landau/validate');
  assert.equal(validateRes.body.valid, true);

  const saveRes = makeRes();
  await handler(makeReq('POST', '/api/ferro/admin/landau/source-sets', { sourceSet: { set_key: 'ABC_Test' }, coefficients: [{ coefficient_id: 'alpha1', value_expression: '1' }] }), saveRes, null, '/api/ferro/admin/landau/source-sets');
  assert.equal(saveRes.body.saved, true);
  assert.deepEqual(saved, ['ABC_Test']);

  const exportRes = makeRes();
  await handler(makeReq('GET', '/api/ferro/admin/landau/export-markdown'), exportRes, null, '/api/ferro/admin/landau/export-markdown');
  assert.equal(exportRes.headers['Content-Type'], 'text/markdown; charset=utf-8');
  assert.equal(exportRes.data.toString(), '# Landau\n');

  const disabled = createFerroApiHandler({
    requireAuth(req) { req.userId = 'admin'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    env: {},
    landauAdmin: { listSourceSets() { throw new Error('should not list'); } },
  });
  const disabledRes = makeRes();
  await disabled(makeReq('GET', '/api/ferro/admin/landau/source-sets'), disabledRes, null, '/api/ferro/admin/landau/source-sets');
  assert.equal(disabledRes.status, 404);
});

function makeReq(method, url, body) {
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = { cookie: 'sid=test' };
  req.body = body;
  req.push(null);
  return req;
}

function makeRes() {
  const res = new Writable({ write(chunk, _encoding, callback) { this.data = Buffer.concat([this.data || Buffer.alloc(0), Buffer.from(chunk)]); callback(); } });
  res.headers = {};
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
  res.end = (chunk) => { if (chunk) res.data = Buffer.concat([res.data || Buffer.alloc(0), Buffer.from(chunk)]); };
  return res;
}

test('ferro routes enrich arbitrary database materials with fallback cards and no frontend whitelist', async () => {
  const { createFerroApiHandler } = require('../pf_assistant/src/server/ferro-routes');
  const handler = createFerroApiHandler({
    requireAuth(req) { req.userId = 'user-1'; return true; },
    readJsonBody: async (req) => req.body,
    jsonResponse(res, status, body) { res.status = status; res.body = body; },
    service: {},
    dialogueService: { async handleMessage() { return null; } },
    materialRepository: {
      listFerroParameterModels() {
        return [
          { material_key: 'hzo', display_name: 'HZO', model_key: 'hzo_custom', model_name: 'HZO custom model', default_tem: 300, active: 1 },
          { material_key: 'bfo', display_name: 'BFO', model_key: 'bfo_10004', model_name: 'BFO 10004 model', default_xf: 1, default_tem: 380, active: 1 },
        ];
      },
    },
  });

  const res = makeRes();
  await handler(makeReq('GET', '/api/ferro/materials'), res, null, '/api/ferro/materials');

  assert.equal(res.status, 200);
  const hzo = res.body.materials.find((item) => item.id === 'hzo_custom');
  assert.equal(hzo.title, 'HZO');
  assert.equal(hzo.defaultParams.temperature, 300);
  assert.equal(hzo.composition.enabled, false);
  assert.equal(hzo.presets[0].id, 'quick_2d');
  const bfo = res.body.materials.find((item) => item.id === 'bfo_10004');
  assert.equal(bfo.defaultParams.temperature, 298);
  assert.equal(bfo.composition.enabled, false);
});
