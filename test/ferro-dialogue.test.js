const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function seedLandauForDialogueTests() {
  const db = require('../pf_assistant/database');
  db.initDb();
  const repo = require('../pf_assistant/src/ferro/landau-repository');
  if (repo.getFerroLandauCounts().sourceSets > 0) return;
  repo.importFerroLandauDatabaseFromMarkdown(
    fs.readFileSync(path.join(__dirname, '..', 'ferroelectric_landau_coefficients_database.md'), 'utf8'),
    { sourceFileName: 'ferroelectric_landau_coefficients_database.md' },
  );
}

test('ferro dialogue collects parameters and runs a ferroelectric job', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const jobs = [];
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return {
          id: 'ferro_dialogue_1',
          status: 'completed',
          system: 'ferroelectric',
          summary: '铁电相场计算完成',
          assets: [],
          outputs: [],
        };
      },
    },
  });
  const ctx = { userId: 'user-1', chatSessionId: 'chat-1' };

  let response = await service.handleMessage({ ...ctx, message: '我想做一个铁电畴结构计算' });
  assert.equal(response.type, 'ferro_materials');
  assert.match(response.message, /请先选择材料/);
  assert.equal(response.draft, null);
  assert.equal(Array.isArray(response.materials), true);
  assert.equal(jobs.length, 0);

  response = await service.handleMessage({ ...ctx, action: 'apply_material_preset', materialId: 'pmn_pt_default', presetId: 'quick_2d' });
  assert.equal(response.type, 'ferro_draft');
  assert.equal(response.draft.status, 'ready');

  response = await service.handleMessage({ ...ctx, message: '64×1×64，跑 20000 步，每 5000 步输出' });
  assert.equal(response.type, 'ferro_diff');
  assert.deepEqual(response.draft.grid, { nx: 64, ny: 1, nz: 64 });
  assert.equal(response.draft.run.kstep, 20000);
  assert.equal(response.draft.run.kprnt, 5000);

  response = await service.handleMessage({ ...ctx, message: '默认温度和成分' });
  assert.equal(response.type, 'ferro_dialogue');
  assert.equal(response.draft.status, 'ready');
  assert.equal(response.draft.material.materialKey, 'pmn_pt');
  assert.equal(response.draft.material.modelKey, 'pmn_pt_default');
  assert.equal(response.draft.material.xf, 0.3);
  assert.equal(response.draft.material.tem, 300);
  assert.deepEqual(response.draft.visualization, {
    mode: 'inplane_angle',
    component: null,
    plane: 'auto',
    inplaneComponents: ['px', 'pz'],
    slice: 'xz',
    steps: 'all',
    outputPolicy: 'selected_only',
    overlay: { arrows: true },
  });

  response = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(response.type, 'ferro_result');
  assert.equal(response.id, 'ferro_dialogue_1');
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].request.grid, { nx: 64, ny: 1, nz: 64 });
  assert.deepEqual(jobs[0].request.run, { kstep: 20000, kprnt: 5000 });
});

test('ferro dialogue asks for material first and auto-drafts single matched material', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: { async createAndRunJob() { return { id: 'unused' }; } },
  });

  const generic = await service.handleMessage({ userId: 'material-first', chatSessionId: 'chat-a', message: '模拟铁电畴' });
  assert.equal(generic.type, 'ferro_materials');
  assert.equal(generic.draft, null);
  assert.match(generic.message, /我理解你想模拟铁电畴，请先选择材料/);
  assert.equal(generic.filter && generic.filter.query, null);

  const bto = await service.handleMessage({ userId: 'material-first', chatSessionId: 'chat-b', message: '模拟 BTO 铁电畴' });
  assert.equal(bto.type, 'ferro_draft');
  assert.equal(bto.draft.status, 'ready');
  assert.equal(bto.draft.material.materialKey, 'bto');
  assert.equal(bto.draft.material.modelKey, 'bto_generate_input');

  const bfoOptions = await service.handleMessage({ userId: 'material-first', chatSessionId: 'chat-bfo-options', message: '模拟 BFO 铁电畴' });
  assert.equal(bfoOptions.type, 'ferro_materials');
  assert.equal(bfoOptions.draft, null);
  assert.equal(bfoOptions.filter.query, 'bfo');
  assert.deepEqual(bfoOptions.cards.map((item) => item.familyId), ['bfo']);
  assert.deepEqual(bfoOptions.cards[0].variants.map((item) => item.variantId), ['bfo_zhang2008_fourth', 'bfo_hsieh2016_sixth', 'bfo_cao2018_eighth']);

  const bfo = await service.handleMessage({ userId: 'material-first', chatSessionId: 'chat-c', message: '模拟 BFO 10004 铁电畴' });
  assert.equal(bfo.type, 'ferro_draft');
  assert.equal(bfo.draft.material.modelKey, 'bfo_10004');
});

test('ferro dialogue selects BFO and PMN-PT catalog variants from text', async () => {
  seedLandauForDialogueTests();
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: { async createAndRunJob() { return { id: 'unused' }; } },
  });

  const sixth = await service.handleMessage({ userId: 'catalog-user', chatSessionId: 'bfo-sixth', message: '模拟 BFO 六阶' });
  assert.equal(sixth.type, 'ferro_draft');
  assert.equal(sixth.draft.material.variantId, 'bfo_hsieh2016_sixth');
  assert.equal(sixth.draft.material.orderLabel, '六阶 Landau 参数');
  assert.equal(sixth.draft.material.temperature, 298);
  assert.equal(sixth.draft.material.composition.enabled, false);
  assert.equal(sixth.draft.visualization.mode, 'variant_111');

  const fourth = await service.handleMessage({ userId: 'catalog-user', chatSessionId: 'bfo-fourth', message: '模拟 BFO 四阶' });
  assert.equal(fourth.draft.material.variantId, 'bfo_zhang2008_fourth');

  const eighth = await service.handleMessage({ userId: 'catalog-user', chatSessionId: 'bfo-eighth', message: '模拟 BFO 八阶' });
  assert.equal(eighth.draft.material.variantId, 'bfo_cao2018_eighth');

  const pmn = await service.handleMessage({ userId: 'catalog-user', chatSessionId: 'pmn-042', message: 'PMN-PT 0.42 快速预览' });
  assert.equal(pmn.type, 'ferro_draft');
  assert.equal(pmn.draft.material.variantId, 'pmnpt_042_khakpash2015');
  assert.equal(pmn.draft.material.composition.display, 'PT组分 xPT = 0.42');
  assert.equal(pmn.draft.material.composition.legacyXf, 0.42);
  assert.equal(JSON.stringify(pmn.draft.material).includes('xf=null'), false);
});


test('ferro dialogue parses BTO material model selection', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const jobs = [];
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return {
          id: 'ferro_bto_dialogue_1',
          status: 'completed',
          system: 'ferroelectric',
          summary: '铁电相场计算完成',
          assets: [],
          outputs: [],
        };
      },
    },
  });
  const ctx = { userId: 'user-bto', chatSessionId: 'chat-bto' };

  await service.handleMessage({ ...ctx, message: '我想做铁电畴结构计算' });
  await service.handleMessage({ ...ctx, message: '64×1×64，跑 5000 步，每 2500 步输出' });
  const ready = await service.handleMessage({ ...ctx, message: '材料换成 BTO，温度 298K' });

  assert.equal(ready.draft.status, 'ready');
  assert.equal(ready.draft.material.materialKey, 'bto');
  assert.equal(ready.draft.material.modelKey, 'bto_generate_input');
  assert.equal(ready.draft.material.xf, 1.0);
  assert.equal(ready.draft.material.tem, 298);
  assert.match(ready.reply, /BaTiO3/);
  assert.match(ready.reply, /当前配置可直接运行/);

  const result = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(result.type, 'ferro_result');
  assert.equal(jobs[0].request.material.materialKey, 'bto');
  assert.equal(jobs[0].request.material.modelKey, 'bto_generate_input');
});


test('ferro dialogue parses PZT and BFO material model selections', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob() {
        return { id: 'ferro_material_dialogue', status: 'completed', system: 'ferroelectric', summary: 'done', assets: [], outputs: [] };
      },
    },
  });

  const pztCtx = { userId: 'user-pzt', chatSessionId: 'chat-pzt' };
  await service.handleMessage({ ...pztCtx, message: '我想做铁电畴结构计算' });
  await service.handleMessage({ ...pztCtx, message: '64×1×64，跑 5000 步，每 2500 步输出' });
  const pztReady = await service.handleMessage({ ...pztCtx, message: '材料换成 PZT Haun 1989，xf=0.48，温度 300K' });
  assert.equal(pztReady.draft.material.materialKey, 'pzt');
  assert.equal(pztReady.draft.material.modelKey, 'pzt_haun_1989');
  assert.equal(pztReady.draft.material.xf, 0.48);
  assert.equal(pztReady.draft.material.tem, 300);
  assert.match(pztReady.reply, /PZT/);
  assert.match(pztReady.reply, /当前配置可直接运行/);

  const bfoCtx = { userId: 'user-bfo', chatSessionId: 'chat-bfo' };
  await service.handleMessage({ ...bfoCtx, message: '我想做铁电畴结构计算' });
  await service.handleMessage({ ...bfoCtx, message: '64×1×64，跑 5000 步，每 2500 步输出' });
  const bfoReady = await service.handleMessage({ ...bfoCtx, message: '用 BFO Bens 参数，温度 380K' });
  assert.equal(bfoReady.draft.material.materialKey, 'bfo');
  assert.equal(bfoReady.draft.material.modelKey, 'bfo_bens_coefficients');
  assert.equal(bfoReady.draft.material.xf, 1.0);
  assert.equal(bfoReady.draft.material.tem, 380);
  assert.match(bfoReady.reply, /BFO/);
  assert.match(bfoReady.reply, /当前配置可直接运行/);
});

test('ferro dialogue keeps ready draft retryable when job launch fails', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  let attempts = 0;
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob() {
        attempts += 1;
        if (attempts === 1) throw new Error('launch failed');
        return {
          id: 'ferro_retry_1',
          status: 'completed',
          system: 'ferroelectric',
          summary: '铁电相场计算完成',
          assets: [],
          outputs: [],
        };
      },
    },
  });
  const ctx = { userId: 'user-retry', chatSessionId: 'chat-retry' };

  await service.handleMessage({ ...ctx, action: 'apply_material_preset', materialId: 'pmn_pt_default', presetId: 'quick_2d' });
  await service.handleMessage({ ...ctx, message: '64×1×64，跑 5000 步，每 2500 步输出' });

  await assert.rejects(() => service.handleMessage({ ...ctx, message: '开始计算' }), /launch failed/);
  const response = await service.handleMessage({ ...ctx, message: '开始计算' });

  assert.equal(attempts, 2);
  assert.equal(response.type, 'ferro_result');
  assert.equal(response.id, 'ferro_retry_1');
});


test('ferro dialogue ignores ordinary chat when no draft is active', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob() {
        throw new Error('should not run');
      },
    },
  });
  const response = await service.handleMessage({ userId: 'user-2', chatSessionId: 'chat-2', message: '你好' });
  assert.equal(response, null);
});

test('ferro dialogue applies material presets as ready structured drafts without launching jobs', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const jobs = [];
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return { id: 'should_not_run', status: 'completed', assets: [], outputs: [] };
      },
    },
  });

  const response = await service.handleMessage({
    userId: 'preset-user',
    chatSessionId: 'preset-chat',
    action: 'apply_material_preset',
    materialId: 'bfo_bens_coefficients',
    presetId: 'quick_2d',
  });

  assert.equal(response.type, 'ferro_draft');
  assert.match(response.message, /快速 2D/);
  assert.equal(response.draft.status, 'ready');
  assert.equal(response.draft.material.id, 'bfo_bens_coefficients');
  assert.equal(response.draft.material.xf, 1);
  assert.equal(response.draft.material.temperature, 298);
  assert.deepEqual(response.draft.grid, { nx: 64, ny: 1, nz: 64 });
  assert.deepEqual(response.draft.run, { steps: 10000, outputInterval: 2000, kstep: 10000, kprnt: 2000 });
  assert.equal(response.draft.visualization.mode, 'variant_111');
  assert.equal(response.draft.visualization.component, null);
  assert.equal(response.validation.ready, true);
  assert.equal(response.ui.component, 'FerroDraftCard');
  assert.equal(response.ui.primaryAction.enabled, true);
  assert.equal(jobs.length, 0);
});

test('ferro dialogue patches ready drafts and returns compact diffs with validation errors', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: {
      async createAndRunJob() {
        return { id: 'ferro_patch_1', status: 'completed', assets: [], outputs: [] };
      },
    },
  });
  const ctx = { userId: 'patch-user', chatSessionId: 'patch-chat' };

  await service.handleMessage({ ...ctx, action: 'apply_material_preset', materialId: 'bfo_bens_coefficients', presetId: 'quick_2d' });
  const updated = await service.handleMessage({
    ...ctx,
    message: '改成128×1×128，跑20000步，每5000步输出，看Pz',
  });

  assert.equal(updated.type, 'ferro_diff');
  assert.equal(updated.message, '已更新计算草稿。');
  assert.deepEqual(updated.draft.grid, { nx: 128, ny: 1, nz: 128 });
  assert.equal(updated.draft.run.steps, 20000);
  assert.equal(updated.draft.run.outputInterval, 5000);
  assert.equal(updated.draft.visualization.component, 'pz');
  assert.deepEqual(updated.diff.map((item) => item.path), ['grid', 'run.steps', 'run.outputInterval', 'visualization.mode', 'visualization.component']);
  assert.equal(updated.validation.ready, true);

  const invalid = await service.handleMessage({ ...ctx, message: '跑10000步，每20000步输出' });
  assert.equal(invalid.type, 'ferro_diff');
  assert.equal(invalid.validation.ready, false);
  assert.match(invalid.message, /输出间隔不能大于总步数/);
  assert.match(invalid.validation.errors[0], /输出间隔不能大于总步数/);
  assert.equal(invalid.ui.primaryAction.enabled, false);
});

test('ferro dialogue uses 298 K BFO defaults, hides BFO composition, and parses angle modes', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: { async createAndRunJob() { return { id: 'ferro_angle', status: 'completed', assets: [], outputs: [] }; } },
  });
  const ctx = { userId: 'bfo-ui-user', chatSessionId: 'bfo-ui-chat' };

  const draft = await service.handleMessage({ ...ctx, action: 'apply_material_preset', materialId: 'bfo_10004', presetId: 'quick_2d' });
  assert.equal(draft.draft.material.temperature, 298);
  assert.equal(draft.draft.material.composition.enabled, false);
  assert.equal(draft.draft.visualization.mode, 'variant_111');
  assert.equal(draft.draft.visualization.component, null);

  const angle = await service.handleMessage({ ...ctx, message: '加箭头，可视化美化一下' });
  assert.equal(angle.type, 'ferro_diff');
  assert.equal(angle.draft.visualization.mode, 'inplane_angle');
  assert.equal(angle.draft.visualization.overlay.arrows, true);
  assert.equal(angle.draft.visualization.component, null);
  assert.equal(angle.diff.some((item) => item.path === 'visualization.mode'), true);
});

test('ferro dialogue preserves explicit BFO temperature and supports result continuation context', async () => {
  const { createFerroDialogueService } = require('../pf_assistant/src/ferro/dialogue-service');
  const service = createFerroDialogueService({
    jobService: { async createAndRunJob() { return { id: 'ferro_context', status: 'completed', assets: [], outputs: [] }; } },
  });
  const ctx = { userId: 'continue-user', chatSessionId: 'continue-chat' };

  const ready = await service.handleMessage({ ...ctx, message: '材料换成 BFO 10004，温度380K，64×1×64，跑10000步，每2000步输出，看面内角度' });
  assert.equal(ready.draft.material.tem, 380);
  assert.equal(ready.draft.visualization.mode, 'variant_111');

  const response = await service.handleMessage({
    ...ctx,
    action: 'continue_from_result',
    context: { lastJobId: 'ferro_old', parentJobId: 'ferro_parent' },
    patch: { grid: { nx: 128, ny: 1, nz: 128 } },
  });
  assert.equal(response.type, 'ferro_diff');
  assert.equal(response.draft.parentJobId, 'ferro_parent');
  assert.equal(response.draft.lastJobId, 'ferro_old');
  assert.deepEqual(response.draft.grid, { nx: 128, ny: 1, nz: 128 });
});
