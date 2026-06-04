const assert = require('node:assert/strict');
const test = require('node:test');

test('efffield dialogue asks for missing dielectric parameters before running', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const jobs = [];
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return {
          id: 'eff_dialogue_1',
          status: 'completed',
          system: 'dielectric',
          summary: '介电有效场计算完成',
          assets: [],
          outputs: [],
        };
      },
    },
  });
  const ctx = { userId: 'user-1', chatSessionId: 'chat-1' };

  let response = await service.handleMessage({ ...ctx, message: '我想做介电常数模拟' });
  assert.equal(response.type, 'efffield_mode_choice');
  assert.equal(response.choice.system, 'dielectric');
  assert.equal(jobs.length, 0);

  response = await service.handleMessage({ ...ctx, message: '对话问答' });
  assert.equal(response.type, 'efffield_dialogue');
  assert.match(response.reply, /二维还是三维/);
  assert.equal(response.draft.system, 'dielectric');

  response = await service.handleMessage({ ...ctx, message: '三维' });
  assert.match(response.reply, /网格尺寸/);
  assert.equal(response.draft.dimension, 3);

  response = await service.handleMessage({ ...ctx, message: '尺寸 32×32×32' });
  assert.match(response.reply, /初始结构/);
  assert.deepEqual(response.draft.grid, { nx: 32, ny: 32, nz: 32 });

  response = await service.handleMessage({ ...ctx, message: '球形夹杂，半径 5' });
  assert.match(response.reply, /两相介电常数/);
  assert.deepEqual(response.draft.structure, { type: 'sphere', radius: 5 });

  response = await service.handleMessage({ ...ctx, message: '基体 2，夹杂 80' });
  assert.match(response.reply, /外加电场/);
  assert.deepEqual(response.draft.phases, [
    { id: 1, permittivity: 2 },
    { id: 2, permittivity: 80 },
  ]);

  response = await service.handleMessage({ ...ctx, message: '默认' });
  assert.match(response.reply, /回复“开始计算”/);
  assert.equal(response.draft.status, 'ready');
  assert.deepEqual(response.draft.load.electricField, [1, 0, 0]);

  response = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(response.id, 'eff_dialogue_1');
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].request.grid, { nx: 32, ny: 32, nz: 32 });
  assert.deepEqual(jobs[0].request.structure, { type: 'sphere', radius: 5 });
  assert.deepEqual(jobs[0].request.phases, [
    { id: 1, permittivity: 2 },
    { id: 2, permittivity: 80 },
  ]);
});

test('efffield dialogue lets users modify a ready draft before confirmation', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const jobs = [];
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return { id: 'eff_dialogue_2', status: 'completed', assets: [], outputs: [] };
      },
    },
  });
  const ctx = { userId: 'user-2', chatSessionId: 'chat-2' };

  await service.handleMessage({ ...ctx, message: '介电常数模拟，三维，尺寸 32×32×32，球形夹杂，半径 5，基体 2，夹杂 80' });
  let response = await service.handleMessage({ ...ctx, message: '半径改成 3' });
  assert.equal(response.type, 'efffield_dialogue');
  assert.match(response.reply, /半径=3/);
  assert.equal(response.draft.structure.radius, 3);

  response = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(jobs[0].request.structure.radius, 3);
});

test('efffield dialogue ignores non-efffield chat when no draft is active', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob() {
        throw new Error('should not run');
      },
    },
  });

  const response = await service.handleMessage({ userId: 'user-3', chatSessionId: 'chat-3', message: '你好' });

  assert.equal(response, null);
});

test('efffield dialogue lets users cancel an active wizard and returns to ordinary chat', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob() {
        throw new Error('should not run');
      },
    },
  });
  const ctx = { userId: 'user-cancel-efffield', chatSessionId: 'chat-cancel-efffield' };

  let response = await service.handleMessage({ ...ctx, message: '计算介电常数' });
  assert.equal(response.type, 'efffield_mode_choice');

  response = await service.handleMessage({ ...ctx, message: '退出有效场' });
  assert.equal(response.type, 'efffield_cancelled');
  assert.match(response.reply, /已退出/);

  response = await service.handleMessage({ ...ctx, message: '你好' });
  assert.equal(response, null);
});

test('efffield dialogue switches to a new module intent while a wizard is active', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob() {
        throw new Error('should not run');
      },
    },
  });
  const ctx = { userId: 'user-switch-efffield', chatSessionId: 'chat-switch-efffield' };

  let response = await service.handleMessage({ ...ctx, message: '计算介电常数' });
  assert.equal(response.type, 'efffield_mode_choice');

  response = await service.handleMessage({ ...ctx, message: '你好' });
  assert.equal(response, null);

  response = await service.handleMessage({ ...ctx, message: '计算压电有效场' });
  assert.equal(response.type, 'efffield_mode_choice');
  assert.equal(response.choice.system, 'piezoelectric');

  response = await service.handleMessage({ ...ctx, message: '对话问答' });
  assert.equal(response.type, 'efffield_dialogue');
  assert.equal(response.draft.system, 'piezoelectric');
  assert.match(response.reply, /二维还是三维/);
});

test('efffield dialogue collects thermal transport parameters', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const jobs = [];
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return { id: 'eff_thermal_1', status: 'completed', system: 'thermal', assets: [], outputs: [] };
      },
    },
  });
  const ctx = { userId: 'user-thermal', chatSessionId: 'chat-thermal' };

  let response = await service.handleMessage({ ...ctx, message: '我想做三维热传导有效场模拟，尺寸 16×16×16，球形夹杂半径 3，基体 1，夹杂 20' });
  assert.equal(response.type, 'efffield_dialogue');
  assert.match(response.reply, /开始计算/);
  assert.equal(response.draft.system, 'thermal');

  response = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(jobs[0].request.system, 'thermal');
  assert.deepEqual(jobs[0].request.phases, [
    { id: 1, conductivity: 1 },
    { id: 2, conductivity: 20 },
  ]);
  assert.deepEqual(jobs[0].request.load.vector, [1, 0, 0]);
});

test('efffield dialogue uses physical load names and units in prompts', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });

  const cases = [
    { message: '介电模拟，尺寸16×16，圆形夹杂半径3，基体2，夹杂80', expected: /外加电场.*V\/m/ },
    { message: '热传导模拟，尺寸16×16，圆形夹杂半径3，基体1，夹杂20', expected: /温度梯度.*K\/m/ },
    { message: '扩散模拟，尺寸16×16，圆形夹杂半径3，基体1，夹杂10', expected: /浓度梯度/ },
    { message: '电导模拟，尺寸16×16，圆形夹杂半径3，基体1，夹杂50', expected: /外加电场.*V\/m/ },
  ];

  for (const [index, item] of cases.entries()) {
    const response = await service.handleMessage({
      userId: 'user-units',
      chatSessionId: 'chat-units-' + index,
      message: item.message,
    });
    assert.match(response.reply, item.expected, item.message);
    assert.doesNotMatch(response.reply, /外加载荷/);
  }
});


test('efffield dialogue collects advanced parameter options and flexible load text', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const jobs = [];
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return { id: 'eff_advanced_dialogue', status: 'completed', assets: [], outputs: [] };
      },
    },
  });
  const ctx = { userId: 'user-advanced-dialogue', chatSessionId: 'chat-advanced-dialogue' };

  let response = await service.handleMessage({
    ...ctx,
    message: '高级介电模拟，二维，尺寸16×16，物理尺寸 2.5 3.5 1，圆形夹杂半径4，基体张量 2 3 4 0.1 0.2 0.3，夹杂张量 80 90 100 1 2 3，电场沿x方向1e8，不输出分布，收敛精度1e-5，最大迭代700',
  });
  assert.equal(response.type, 'efffield_dialogue');
  assert.match(response.reply, /开始计算/);
  assert.deepEqual(response.draft.realdim, [2.5, 3.5, 1]);
  assert.equal(response.draft.outdist, false);
  assert.deepEqual(response.draft.load.vector, [100000000, 0, 0]);
  assert.deepEqual(response.draft.solver, { tol: 1e-5, maxiter: 700 });
  assert.deepEqual(response.draft.phases, [
    { id: 1, permittivity: [2, 3, 4, 0.1, 0.2, 0.3] },
    { id: 2, permittivity: [80, 90, 100, 1, 2, 3] },
  ]);

  response = await service.handleMessage({ ...ctx, message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].request.realdim, [2.5, 3.5, 1]);
  assert.equal(jobs[0].request.outdist, false);
});

test('efffield dialogue accepts component-style gradient input', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { return { id: 'unused', status: 'completed' }; } },
  });

  const response = await service.handleMessage({
    userId: 'user-flex-field',
    chatSessionId: 'chat-flex-field',
    message: '热传导模拟，尺寸16×16，圆形夹杂半径3，基体1，夹杂20，温度梯度 x=0 y=100 z=0',
  });

  assert.match(response.reply, /开始计算/);
  assert.deepEqual(response.draft.load.vector, [0, 100, 0]);
});


test('efffield dialogue lets ready drafts enter targeted edit mode for load and realdim', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { return { id: 'unused', status: 'completed' }; } },
  });
  const ctx = { userId: 'user-edit-targets', chatSessionId: 'chat-edit-targets' };

  let response = await service.handleMessage({
    ...ctx,
    message: '高级介电模拟，三维，尺寸16×16×16，物理尺寸 2.5 2.5 1，立方夹杂半径4，基体500，夹杂20，电场沿x方向1，不输出分布',
  });
  assert.match(response.reply, /开始计算/);
  assert.deepEqual(response.draft.load.vector, [1, 0, 0]);

  response = await service.handleMessage({ ...ctx, message: '修改外加电场' });
  assert.match(response.reply, /外加电场方向/);
  assert.equal(response.draft.status, 'collecting');

  response = await service.handleMessage({ ...ctx, message: '沿 y 方向 1e8' });
  assert.match(response.reply, /开始计算/);
  assert.deepEqual(response.draft.load.vector, [0, 100000000, 0]);

  response = await service.handleMessage({ ...ctx, message: '修改 REALDIM' });
  assert.match(response.reply, /REALDIM/);

  response = await service.handleMessage({ ...ctx, message: '5 5 5' });
  assert.match(response.reply, /REALDIM=5×5×5/);
  assert.deepEqual(response.draft.realdim, [5, 5, 5]);
});


test('efffield dialogue accepts direction edits without the word along', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { return { id: 'unused', status: 'completed' }; } },
  });
  const ctx = { userId: 'user-edit-direction', chatSessionId: 'chat-edit-direction' };

  await service.handleMessage({
    ...ctx,
    message: '介电模拟，三维，尺寸16×16×16，立方夹杂半径4，基体500，夹杂20，电场沿x方向1',
  });
  await service.handleMessage({ ...ctx, message: '修改外加电场' });
  const response = await service.handleMessage({ ...ctx, message: 'y方向 1e8' });

  assert.match(response.reply, /开始计算/);
  assert.deepEqual(response.draft.load.vector, [0, 100000000, 0]);
});

test('efffield dialogue collects magnetic and template-coupled systems', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const jobs = [];
  const service = createEfffieldDialogueService({
    jobService: {
      async createAndRunJob(payload) {
        jobs.push(payload);
        return { id: 'eff_more_modules', status: 'completed', assets: [], outputs: [] };
      },
    },
  });

  let response = await service.handleMessage({
    userId: 'user-more-modules',
    chatSessionId: 'magnetic',
    message: '磁性有效场模拟，二维，尺寸16×16，圆形夹杂半径3，基体1，夹杂20，磁场 y方向 1',
  });
  assert.match(response.reply, /开始计算/);
  assert.equal(response.draft.system, 'magnetic');
  assert.deepEqual(response.draft.phases, [
    { id: 1, permeability: 1 },
    { id: 2, permeability: 20 },
  ]);
  assert.deepEqual(response.draft.load.vector, [0, 1, 0]);

  response = await service.handleMessage({ userId: 'user-more-modules', chatSessionId: 'magnetic', message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(jobs.at(-1).request.system, 'magnetic');

  response = await service.handleMessage({
    userId: 'user-more-modules',
    chatSessionId: 'piezo',
    message: '压电有效场模拟，二维，尺寸16×16，圆形夹杂半径3，电场 x方向 1e6',
  });
  assert.match(response.reply, /开始计算/);
  assert.equal(response.draft.system, 'piezoelectric');
  assert.equal(response.draft.phases, null);

  response = await service.handleMessage({ userId: 'user-more-modules', chatSessionId: 'piezo', message: '开始计算' });
  assert.equal(response.type, 'efffield_result');
  assert.equal(jobs.at(-1).request.system, 'piezoelectric');
  assert.deepEqual(jobs.at(-1).request.load.vector, [1000000, 0, 0]);
});

test('efffield dialogue opens a chat-invoked parameter.in panel with generated template', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });

  const response = await service.handleMessage({
    userId: 'user-panel',
    chatSessionId: 'chat-panel',
    message: '打开有效场 parameter.in 面板，介电三维尺寸16×16×16球形夹杂半径4，基体2，夹杂80，电场沿y方向1',
  });

  assert.equal(response.type, 'efffield_parameter_panel');
  assert.match(response.reply, /parameter.in 面板/);
  assert.equal(response.panel.system, 'dielectric');
  assert.match(response.panel.parameterText, /CHOICESYS 2/);
  assert.match(response.panel.parameterText, /ELECFIELD 0 1 0/);
  assert.deepEqual(response.panel.structure, { type: 'sphere', radius: 4 });
  assert.deepEqual(response.panel.grid, { nx: 16, ny: 16, nz: 16 });
});

test('efffield dialogue offers mode choice for coupled module requests', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });

  const cases = [
    { userId: 'user-elastic-choice', chatSessionId: 'chat-elastic-choice', message: '计算弹性应力分布', system: 'elastic' },
    { userId: 'user-piezo-choice', chatSessionId: 'chat-piezo-choice', message: '计算压电有效场', system: 'piezoelectric' },
    { userId: 'user-piezomag-choice', chatSessionId: 'chat-piezomag-choice', message: '研究压磁模拟', system: 'piezomagnetic' },
    { userId: 'user-magelec-choice', chatSessionId: 'chat-magelec-choice', message: '研究磁电耦合模拟', system: 'magnetoelectric' },
  ];

  for (const item of cases) {
    const response = await service.handleMessage(item);
    assert.equal(response.type, 'efffield_mode_choice', item.message);
    assert.equal(response.choice.system, item.system, item.message);
  }
});

test('efffield dialogue accepts flexible natural-language module intents', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });

  const cases = [
    { userId: 'user-flex-dielectric', chatSessionId: 'chat-flex-dielectric', message: '我想要计算介电电场分布', system: 'dielectric' },
    { userId: 'user-flex-diffusion', chatSessionId: 'chat-flex-diffusion', message: '研究扩散模拟', system: 'diffusion' },
    { userId: 'user-flex-thermal', chatSessionId: 'chat-flex-thermal', message: '帮我看看热流分布', system: 'thermal' },
  ];

  for (const item of cases) {
    const response = await service.handleMessage(item);
    assert.equal(response.type, 'efffield_mode_choice', item.message);
    assert.equal(response.choice.system, item.system, item.message);
  }
});

test('efffield dialogue asks users to choose dialogue wizard or parameter panel for initial requests', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });
  const ctx = { userId: 'user-mode-choice', chatSessionId: 'chat-mode-choice' };

  let response = await service.handleMessage({ ...ctx, message: '计算介电常数' });
  assert.equal(response.type, 'efffield_mode_choice');
  assert.match(response.reply, /对话问答/);
  assert.match(response.reply, /面板输入/);
  assert.equal(response.choice.system, 'dielectric');

  response = await service.handleMessage({ ...ctx, message: '面板输入' });
  assert.equal(response.type, 'efffield_parameter_panel');
  assert.equal(response.panel.system, 'dielectric');
  assert.match(response.panel.parameterText, /CHOICESYS 2/);
});

test('efffield dialogue enters question wizard after mode choice', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });
  const ctx = { userId: 'user-mode-dialogue', chatSessionId: 'chat-mode-dialogue' };

  await service.handleMessage({ ...ctx, message: '计算介电常数' });
  const response = await service.handleMessage({ ...ctx, message: '对话问答' });

  assert.equal(response.type, 'efffield_dialogue');
  assert.match(response.reply, /二维还是三维/);
  assert.equal(response.draft.system, 'dielectric');
});

test('efffield parameter panel template includes Chinese comments for users', async () => {
  const { createEfffieldDialogueService } = require('../pf_assistant/src/efffield/dialogue-service');
  const service = createEfffieldDialogueService({
    jobService: { async createAndRunJob() { throw new Error('unused'); } },
  });

  const response = await service.handleMessage({
    userId: 'user-commented-panel',
    chatSessionId: 'chat-commented-panel',
    message: '打开有效场 parameter.in 面板，介电二维尺寸16×16圆形夹杂半径4，基体2，夹杂80',
  });

  assert.equal(response.type, 'efffield_parameter_panel');
  assert.match(response.panel.parameterText, /# 有效场 parameter.in 自定义输入模板/);
  assert.match(response.panel.parameterText, /REALDIM 16 16 1\s+# 真实物理尺寸/);
  assert.match(response.panel.parameterText, /SYSDIM 16 16 1\s+# 网格尺寸/);
  assert.match(response.panel.parameterText, /CHOICESYS 2\s+# 物理系统/);
  assert.match(response.panel.parameterText, /PERMITTIVITY 2 2 2 0 0 0\s+# 相1材料参数/);
});
