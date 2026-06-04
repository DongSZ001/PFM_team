const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const os = require('node:os');
const { execFileSync } = require('node:child_process');


test('chat renderer renders efffield result cards with escaped images and tensor text', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderEfffieldResultCard({
    summary: '介电有效场计算完成',
    effectiveTensor: { name: 'effDielectricPermittivity.dat', text: '1 0 0\n0 1 0' },
    assets: [
      { title: '相分布', url: '/api/efffield/assets/eff_1/phase_map.png' },
      { title: '<bad>', url: 'javascript:alert(1)' },
    ],
  });

  assert.match(html, /efffield-result-card/);
  assert.match(html, /介电有效场计算完成/);
  assert.match(html, /effDielectricPermittivity.dat/);
  assert.match(html, /phase_map.png/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(html, /&lt;bad&gt;/);
});

test('gateway credentials prefer OC_GATEWAY_TOKEN and keep OC_DEVICE_TOKEN compatibility', () => {
  const { readGatewayCredentials } = require('../pf_assistant/gateway-config');

  assert.deepEqual(readGatewayCredentials({
    OC_GATEWAY_TOKEN: 'gateway-token',
    OC_DEVICE_TOKEN: 'legacy-token',
    OC_GATEWAY_PASSWORD: 'gateway-password',
  }), {
    deviceToken: 'gateway-token',
    gatewayPassword: 'gateway-password',
    tokenSource: 'OC_GATEWAY_TOKEN',
  });

  assert.deepEqual(readGatewayCredentials({
    OC_DEVICE_TOKEN: 'legacy-token',
  }), {
    deviceToken: 'legacy-token',
    gatewayPassword: '',
    tokenSource: 'OC_DEVICE_TOKEN',
  });
});

test('project navigation docs describe current module ownership and legacy upgrade status', () => {
  const navigationPath = path.resolve(__dirname, '../docs/PROJECT_NAVIGATION.md');
  const readmeSource = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  const upgradeSource = fs.readFileSync(path.resolve(__dirname, '../docs/history/UPGRADE-v2-user-chat.md'), 'utf8');
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../worklog/modefiy.md'), 'utf8');

  assert.equal(fs.existsSync(navigationPath), true);
  const navigationSource = fs.readFileSync(navigationPath, 'utf8');

  assert.match(navigationSource, /serve.js.*启动与编排入口/s);
  assert.match(navigationSource, /src\/server\/.*HTTP route/s);
  assert.match(navigationSource, /src\/materials\/.*材料领域/s);
  assert.match(navigationSource, /custom-webui\/.*页面展示/s);
  assert.match(navigationSource, /worklog\/.*迭代记录/s);
  assert.equal(readmeSource.includes('docs/PROJECT_NAVIGATION.md'), true);
  assert.match(upgradeSource, /历史升级记录/);
  assert.equal(upgradeSource.includes('../PROJECT_NAVIGATION.md'), true);
  assert.match(indexSource, /Round 33/);
});

test('cleanup audit documents confirmed unused nanobot brand assets', () => {
  const auditPath = path.resolve(__dirname, '../docs/PF_ASSISTANT_CLEANUP_AUDIT.md');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/nanobot/web/dist/index.html'), 'utf8');
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../worklog/modefiy.md'), 'utf8');

  assert.equal(fs.existsSync(auditPath), true);
  const audit = fs.readFileSync(auditPath, 'utf8');

  for (const asset of [
    'nanobot_apple_touch.png',
    'nanobot_favicon_32.png',
    'nanobot_icon.png',
    'nanobot_logo.png',
    'nanobot_logo.webp',
  ]) {
    assert.equal(fs.existsSync(path.resolve(__dirname, '../pf_assistant/nanobot/web/dist/brand', asset)), false, asset);
    assert.equal(audit.includes(asset), true, asset);
  }

  assert.equal(indexHtml.includes('/brand/research_assistant_icon.svg'), true);
  assert.equal(audit.includes('confirmed unused by user'), true);
  assert.equal(audit.includes('research_assistant_icon.svg'), true);
  assert.match(indexSource, /Round 38/);
});

test('pf_assistant directory classification documents top-level responsibilities', () => {
  const directoryDocPath = path.resolve(__dirname, '../docs/PF_ASSISTANT_DIRECTORY.md');
  const projectNavigation = fs.readFileSync(path.resolve(__dirname, '../docs/PROJECT_NAVIGATION.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../worklog/modefiy.md'), 'utf8');

  assert.equal(fs.existsSync(directoryDocPath), true);
  const source = fs.readFileSync(directoryDocPath, 'utf8');

  for (const category of [
    'Runtime Entry',
    'Business Modules',
    'Compatibility Facades',
    'Runtime State',
    'Dependencies',
    'Scripts and Tools',
    'Bundled Static Assets',
  ]) {
    assert.match(source, new RegExp(category));
  }

  for (const entry of [
    'serve.js', 'auth.js', 'database.js', 'mailer.js', 'email-classifier.js',
    'gateway-config.js', 'runtime-status.js', 'unit-converter.js',
    'parameter-resolver.js', 'parameter-definitions-seed.js', 'material-parameters.js',
    'src/', 'scripts/', 'data/', 'logs/', 'node_modules/', 'nanobot/',
    'start.env', 'start.env.example', 'start.sh', 'schema.sql', 'package.json', 'package-lock.json',
  ]) {
    assert.equal(source.includes(entry), true, entry);
  }

  assert.equal(projectNavigation.includes('docs/PF_ASSISTANT_DIRECTORY.md'), true);
  assert.equal(readmeSource.includes('docs/PF_ASSISTANT_DIRECTORY.md'), true);
  assert.match(indexSource, /Round 37/);
});

test('backend directory keeps historical upgrade docs outside runtime package', () => {
  const legacyUpgradePath = path.resolve(__dirname, '../pf_assistant/UPGRADE.md');
  const historyUpgradePath = path.resolve(__dirname, '../docs/history/UPGRADE-v2-user-chat.md');
  const projectNavigation = fs.readFileSync(path.resolve(__dirname, '../docs/PROJECT_NAVIGATION.md'), 'utf8');
  const readmeSource = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../worklog/modefiy.md'), 'utf8');

  assert.equal(fs.existsSync(legacyUpgradePath), false);
  assert.equal(fs.existsSync(historyUpgradePath), true);
  const historySource = fs.readFileSync(historyUpgradePath, 'utf8');
  assert.match(historySource, /历史升级记录/);
  assert.equal(historySource.includes('../PROJECT_NAVIGATION.md'), true);
  assert.equal(projectNavigation.includes('docs/history/UPGRADE-v2-user-chat.md'), true);
  assert.equal(readmeSource.includes('docs/history/UPGRADE-v2-user-chat.md'), true);
  assert.match(indexSource, /Round 36/);
});

test('scripts navigation documents operational script categories and commands', () => {
  const scriptsReadmePath = path.resolve(__dirname, '../pf_assistant/scripts/README.md');
  const projectNavigation = fs.readFileSync(path.resolve(__dirname, '../docs/PROJECT_NAVIGATION.md'), 'utf8');
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../worklog/modefiy.md'), 'utf8');

  assert.equal(fs.existsSync(scriptsReadmePath), true);
  const source = fs.readFileSync(scriptsReadmePath, 'utf8');

  for (const phrase of ['Import Scripts', 'Seed Scripts', 'Derivation Scripts', 'Smoke Check Scripts']) {
    assert.match(source, new RegExp(phrase));
  }
  for (const scriptName of [
    'import-magnetic-parameters.js',
    'seed-canonical-materials.js',
    'seed-tdf-materials.js',
    'derive-magnetoelastic.js',
    'smoke-check-webui.js',
  ]) {
    assert.match(source, new RegExp(scriptName));
    assert.match(source, new RegExp('node scripts/' + scriptName));
  }
  assert.equal(projectNavigation.includes('pf_assistant/scripts/README.md'), true);
  assert.match(indexSource, /Round 35/);
});

test('root backend compatibility facades document their src implementation targets', () => {
  const facades = [
    ['pf_assistant/gateway-config.js', './src/server/gateway-config'],
    ['pf_assistant/runtime-status.js', './src/server/runtime-status'],
    ['pf_assistant/unit-converter.js', './src/materials/converters/unit-converter'],
    ['pf_assistant/parameter-resolver.js', './src/materials/resolvers/parameter-resolver'],
    ['pf_assistant/parameter-definitions-seed.js', './src/materials/definitions/default-parameter-definitions'],
    ['pf_assistant/material-parameters.js', './src/materials/repositories/material-parameters-repository'],
  ];

  for (const [relativeFile, target] of facades) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', relativeFile), 'utf8');
    assert.match(source, /Compatibility facade/);
    assert.match(source, /Do not add implementation logic here/);
    assert.equal(source.includes("module.exports = require('" + target + "')"), true, relativeFile);
  }
});

test('backend structure exposes src modules while preserving legacy require paths', () => {
  const paths = require('../pf_assistant/src/config/paths');
  const srcGateway = require('../pf_assistant/src/server/gateway-config');
  const legacyGateway = require('../pf_assistant/gateway-config');
  const srcRuntime = require('../pf_assistant/src/server/runtime-status');
  const legacyRuntime = require('../pf_assistant/runtime-status');
  const srcUnit = require('../pf_assistant/src/materials/unit-converter');
  const legacyUnit = require('../pf_assistant/unit-converter');
  const srcResolver = require('../pf_assistant/src/materials/parameter-resolver');
  const legacyResolver = require('../pf_assistant/parameter-resolver');

  assert.equal(paths.projectRoot, path.resolve(__dirname, '..'));
  assert.equal(paths.backendRoot, path.resolve(__dirname, '../pf_assistant'));
  assert.equal(paths.customWebuiDir, path.resolve(__dirname, '../custom-webui'));
  assert.equal(paths.databaseFile, path.resolve(__dirname, '../pf_assistant/data/app.db'));
  assert.equal(paths.startEnvFile, path.resolve(__dirname, '../pf_assistant/start.env'));
  assert.equal(paths.logsDir, path.resolve(__dirname, '../pf_assistant/logs'));

  assert.equal(legacyGateway.readGatewayCredentials, srcGateway.readGatewayCredentials);
  assert.equal(legacyRuntime.buildRuntimeStatus, srcRuntime.buildRuntimeStatus);
  assert.equal(legacyUnit.convert, srcUnit.convert);
  assert.equal(legacyResolver.resolveParameterSet, srcResolver.resolveParameterSet);
});

test('material API routes live in server module and serve.js delegates to it', () => {
  const materialRoutes = require('../pf_assistant/src/server/material-routes');
  const serveSource = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/serve.js'), 'utf8');

  assert.equal(typeof materialRoutes.createMaterialApiHandler, 'function');
  assert.equal(typeof materialRoutes.isMaterialApiPath, 'function');
  assert.equal(materialRoutes.isMaterialApiPath('/api/materials'), true);
  assert.equal(materialRoutes.isMaterialApiPath('/api/materials/1/parameter-sets'), true);
  assert.equal(materialRoutes.isMaterialApiPath('/api/parameter-sets/1'), true);
  assert.equal(materialRoutes.isMaterialApiPath('/api/resolve-parameters'), true);
  assert.equal(materialRoutes.isMaterialApiPath('/api/simulation-profiles'), true);
  assert.equal(materialRoutes.isMaterialApiPath('/api/gateway-status'), false);
  assert.match(serveSource, /createMaterialApiHandler/);
  assert.match(serveSource, /isMaterialApiPath/);
});

test('runtime routes live in server module and expose injected health and gateway status handlers', async () => {
  const runtimeRoutes = require('../pf_assistant/src/server/runtime-routes');
  const serveSource = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/serve.js'), 'utf8');
  const jsonResponse = (res, status, body) => { res.status = status; res.body = body; };
  const handler = runtimeRoutes.createRuntimeApiHandler({
    jsonResponse,
    getRuntimeReadiness: () => ({
      startedAt: 123,
      databaseReady: true,
      deviceIdentityLoaded: true,
      gatewayConfigured: true,
    }),
    gatewayStatusConfig: () => ({
      host: '127.0.0.1',
      port: 18789,
      deviceIdentityLoaded: true,
      gatewayConfigured: true,
    }),
    checkGatewayReachable: async () => true,
    logger: { error() {} },
  });

  assert.deepEqual(runtimeRoutes.RUNTIME_API_PATHS, ['/health', '/api/gateway-status']);
  assert.equal(runtimeRoutes.isRuntimeApiPath('/health'), true);
  assert.equal(runtimeRoutes.isRuntimeApiPath('/api/gateway-status'), true);
  assert.equal(runtimeRoutes.isRuntimeApiPath('/api/materials'), false);

  const healthRes = {};
  assert.equal(await handler({ method: 'GET' }, healthRes, null, '/health'), true);
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.ok, true);
  assert.equal(healthRes.body.service, 'pf-assistant-webui');
  assert.equal(healthRes.body.checks.database.status, 'ok');
  assert.equal(healthRes.body.checks.gatewayCredentials.status, 'ok');

  const gatewayRes = {};
  assert.equal(await handler({ method: 'GET' }, gatewayRes, null, '/api/gateway-status'), true);
  assert.equal(gatewayRes.status, 200);
  assert.equal(gatewayRes.body.gateway.reachable, true);
  assert.equal(gatewayRes.body.gateway.port, 18789);

  assert.match(serveSource, /createRuntimeApiHandler/);
  assert.match(serveSource, /isRuntimeApiPath/);
});

test('auth chat routes live in server module and preserve delegation and legacy responses', async () => {
  const authChatRoutes = require('../pf_assistant/src/server/auth-chat-routes');
  const serveSource = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/serve.js'), 'utf8');
  const calls = [];
  const handler = authChatRoutes.createAuthChatApiHandler({
    handleAuthRoute: async (req, res) => {
      calls.push(req.url);
      if (req.url === '/api/auth/missing') return false;
      res.status = 204;
      return true;
    },
    jsonResponse: (res, status, body) => { res.status = status; res.body = body; },
  });

  assert.deepEqual(authChatRoutes.AUTH_CHAT_API_PATHS, ['/api/auth/*', '/chat/*']);
  assert.deepEqual(authChatRoutes.LEGACY_AUTH_API_PATHS, ['/auth', '/auth/*']);
  assert.equal(authChatRoutes.isAuthChatApiPath('/api/auth/me'), true);
  assert.equal(authChatRoutes.isAuthChatApiPath('/chat/sessions'), true);
  assert.equal(authChatRoutes.isAuthChatApiPath('/api/materials'), false);
  assert.equal(authChatRoutes.isLegacyAuthPath('/auth'), true);
  assert.equal(authChatRoutes.isLegacyAuthPath('/auth/login'), true);
  assert.equal(authChatRoutes.isLegacyAuthPath('/api/auth/login'), false);

  const delegatedRes = {};
  assert.equal(await handler({ url: '/api/auth/me' }, delegatedRes, null, '/api/auth/me'), true);
  assert.deepEqual(calls, ['/api/auth/me']);
  assert.equal(delegatedRes.status, 204);

  const missingRes = {};
  assert.equal(await handler({ url: '/api/auth/missing' }, missingRes, null, '/api/auth/missing'), true);
  assert.equal(missingRes.status, 404);
  assert.deepEqual(missingRes.body, { error: 'Not found' });

  const legacyRes = {};
  assert.equal(await handler({ url: '/auth/login' }, legacyRes, null, '/auth/login'), true);
  assert.equal(legacyRes.status, 410);
  assert.equal(legacyRes.body.newPrefix, '/api/auth/');

  assert.match(serveSource, /createAuthChatApiHandler/);
  assert.match(serveSource, /isAuthChatApiPath/);
  assert.match(serveSource, /isLegacyAuthPath/);
});

test('static and proxy routes live in server module and preserve dispatch order', () => {
  const staticProxyRoutes = require('../pf_assistant/src/server/static-proxy-routes');
  const serveSource = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/serve.js'), 'utf8');
  const calls = [];
  const handler = staticProxyRoutes.createStaticProxyHandler({
    dirs: {
      customWebuiDir: '/custom-webui',
      controlUiDir: '/control-ui',
      staticDir: '/static-dist',
    },
    bridge: { host: '127.0.0.1', port: 8765 },
    serveStatic: (req, res, routePath, baseDir) => calls.push(['static', routePath, baseDir]),
    proxyRequest: (req, res, host, port) => calls.push(['proxy', host, port]),
  });

  assert.deepEqual(staticProxyRoutes.STATIC_PROXY_ROUTE_LABELS, ['custom-webui', 'control-ui', 'bridge-proxy', 'static-fallback']);
  assert.equal(handler({}, {}, '/app'), true);
  assert.equal(handler({}, {}, '/app/js/app.js'), true);
  assert.equal(handler({}, {}, '/control'), true);
  assert.equal(handler({}, {}, '/webui/index.html'), true);
  assert.equal(handler({}, {}, '/api/unknown'), true);
  assert.equal(handler({}, {}, '/favicon.ico'), true);

  assert.deepEqual(calls, [
    ['static', '/index.html', '/custom-webui'],
    ['static', '/js/app.js', '/custom-webui'],
    ['static', '/index.html', '/control-ui'],
    ['proxy', '127.0.0.1', 8765],
    ['proxy', '127.0.0.1', 8765],
    ['static', '/favicon.ico', '/static-dist'],
  ]);
  assert.match(serveSource, /createStaticProxyHandler/);
});

test('serve.js documents bootstrap role and delegates route dispatch to server modules', () => {
  const serveSource = fs.readFileSync(path.resolve(__dirname, '../pf_assistant/serve.js'), 'utf8');

  assert.match(serveSource, /bootstrap\/orchestration entry/i);
  assert.match(serveSource, /Route-specific HTTP dispatch lives in src\/server/i);
  assert.equal(serveSource.includes('handleStaticProxyRoute(req, res, urlPath)'), true);
  assert.doesNotMatch(serveSource, /Serve Custom WebUI/);
  assert.doesNotMatch(serveSource, /Serve Control UI/);
  assert.doesNotMatch(serveSource, /Proxy to Bridge/);
  assert.equal(serveSource.includes("urlPath.startsWith('/app/')"), false);
  assert.equal(serveSource.includes("urlPath.startsWith('/control/')"), false);
  assert.equal(serveSource.includes("urlPath.startsWith('/webui/')"), false);
});

test('material API route handler returns stable list and resolve responses with injected dependencies', async () => {
  const materialRoutes = require('../pf_assistant/src/server/material-routes');
  const calls = [];
  const jsonResponse = (res, status, body) => { res.status = status; res.body = body; };
  const readJsonBody = async () => ({ materialId: 99, parameterSetId: 7, simulationType: 'skyrmion', targetEngine: 'mumax3' });
  const handler = materialRoutes.createMaterialApiHandler({
    jsonResponse,
    readJsonBody,
    materials: {
      listMaterials: () => [{
        id: 1,
        material_key: 'pt_co_ta',
        display_name: 'Pt/Co/Ta',
        stack_structure: 'Pt/Co/Ta',
        parameter_set_count: 2,
      }],
    },
    resolver: {
      resolveParameterSet: (params) => {
        calls.push(params);
        return { material: { id: 1 }, warnings: [] };
      },
      listSimulationProfiles: () => ({ basic: { name: 'basic' } }),
    },
    logger: { error() {} },
  });

  assert.deepEqual(materialRoutes.MATERIAL_API_PATHS, [
    '/api/materials',
    '/api/materials/:id',
    '/api/materials/:id/parameter-sets',
    '/api/parameter-sets/:id',
    '/api/resolve-parameters',
    '/api/simulation-profiles',
  ]);

  const listRes = {};
  assert.equal(await handler({ method: 'GET' }, listRes, null, '/api/materials'), true);
  assert.equal(listRes.status, 200);
  assert.deepEqual(listRes.body, [{
    id: 1,
    materialKey: 'pt_co_ta',
    displayName: 'Pt/Co/Ta',
    stackStructure: 'Pt/Co/Ta',
    parameterSetCount: 2,
  }]);

  const resolveRes = {};
  assert.equal(await handler({ method: 'POST' }, resolveRes, null, '/api/resolve-parameters'), true);
  assert.equal(resolveRes.status, 200);
  assert.deepEqual(calls[0], { parameterSetId: 7, simulationType: 'skyrmion', targetEngine: 'mumax3' });
  assert.deepEqual(resolveRes.body.warnings, ["materialId 99 does not match parameter set's material (1). Using the parameter set's material."]);
});

test('materials modules are grouped by definitions converters and resolvers with compatibility exports', () => {
  const definitions = require('../pf_assistant/src/materials/definitions/default-parameter-definitions');
  const legacyDefinitions = require('../pf_assistant/parameter-definitions-seed');
  const converter = require('../pf_assistant/src/materials/converters/unit-converter');
  const srcConverterCompat = require('../pf_assistant/src/materials/unit-converter');
  const legacyConverter = require('../pf_assistant/unit-converter');
  const resolver = require('../pf_assistant/src/materials/resolvers/parameter-resolver');
  const srcResolverCompat = require('../pf_assistant/src/materials/parameter-resolver');
  const legacyResolver = require('../pf_assistant/parameter-resolver');

  assert.ok(Array.isArray(definitions.DEFAULT_PARAMETER_DEFINITIONS));
  assert.equal(legacyDefinitions.DEFAULT_PARAMETER_DEFINITIONS, definitions.DEFAULT_PARAMETER_DEFINITIONS);
  assert.equal(srcConverterCompat.convert, converter.convert);
  assert.equal(legacyConverter.convert, converter.convert);
  assert.equal(srcResolverCompat.resolveParameterSet, resolver.resolveParameterSet);
  assert.equal(legacyResolver.resolveParameterSet, resolver.resolveParameterSet);
  assert.ok(resolver.SIMULATION_PROFILES.mumax3_skyrmion_basic);
});

test('material parameters repository lives under src with legacy compatibility', () => {
  const repository = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const compat = require('../pf_assistant/src/materials/material-parameters');
  const legacy = require('../pf_assistant/material-parameters');
  const expectedFns = [
    'makeMaterialKey',
    'upsertMaterial',
    'listMaterials',
    'upsertSource',
    'listParameterDefinitions',
    'upsertParameterSet',
    'writeParameterValue',
    'createImportBatch',
    'recordImportWarning',
    'getMaterialSummary',
    'getParameterSetDetail',
  ];

  for (const fn of expectedFns) {
    assert.equal(typeof repository[fn], 'function', fn);
    assert.equal(compat[fn], repository[fn], fn);
    assert.equal(legacy[fn], repository[fn], fn);
  }

  assert.equal(repository.makeMaterialKey('Pt/Co/Ta'), 'pt_co_ta');
  assert.equal(repository.makeMaterialKey('  BaTiO3  '), 'batio3');
});

test('material records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const materialRecords = require('../pf_assistant/src/materials/repositories/material-records');
  const shared = require('../pf_assistant/src/materials/repositories/shared');
  const materialFns = ['upsertMaterial', 'getMaterialById', 'getMaterialByKey', 'listMaterials'];

  for (const fn of materialFns) {
    assert.equal(typeof materialRecords[fn], 'function', fn);
    assert.equal(aggregate[fn], materialRecords[fn], fn);
  }

  assert.equal(shared.makeMaterialKey, aggregate.makeMaterialKey);
  assert.equal(shared.makeMaterialKey('Fe / Co / Ni'), 'fe_co_ni');
  assert.equal(typeof shared.getDb, 'function');
  assert.equal(typeof shared.now, 'function');
});

test('source records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const sourceRecords = require('../pf_assistant/src/materials/repositories/source-records');
  const sourceFns = ['splitAuthors', 'upsertSource', 'getSourceById'];

  for (const fn of sourceFns) {
    assert.equal(typeof sourceRecords[fn], 'function', fn);
    assert.equal(aggregate[fn], sourceRecords[fn], fn);
  }

  assert.deepEqual(sourceRecords.splitAuthors('Wang; Li; Zhang'), {
    firstAuthor: 'Wang',
    authors: 'Wang; Li; Zhang',
  });
  assert.deepEqual(sourceRecords.splitAuthors(''), { firstAuthor: null, authors: null });
});

test('parameter definition records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const parameterDefinitions = require('../pf_assistant/src/materials/repositories/parameter-definition-records');
  const definitionFns = ['listParameterDefinitions', 'getParameterDefinitionByKey', 'getParameterDefinitionById'];

  for (const fn of definitionFns) {
    assert.equal(typeof parameterDefinitions[fn], 'function', fn);
    assert.equal(aggregate[fn], parameterDefinitions[fn], fn);
  }
});

test('parameter set records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const parameterSets = require('../pf_assistant/src/materials/repositories/parameter-set-records');
  const setFns = [
    'upsertParameterSet',
    'getParameterSetById',
    'listParameterSetsForMaterial',
    'getParameterSetsForMaterialWithSource',
  ];

  for (const fn of setFns) {
    assert.equal(typeof parameterSets[fn], 'function', fn);
    assert.equal(aggregate[fn], parameterSets[fn], fn);
  }
});

test('parameter value records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const parameterValues = require('../pf_assistant/src/materials/repositories/parameter-value-records');
  const valueFns = ['writeParameterValue', 'getValuesForSet'];

  for (const fn of valueFns) {
    assert.equal(typeof parameterValues[fn], 'function', fn);
    assert.equal(aggregate[fn], parameterValues[fn], fn);
  }
});

test('import batch records repository is split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const importBatches = require('../pf_assistant/src/materials/repositories/import-batch-records');
  const importFns = [
    'createImportBatch',
    'finalizeImportBatch',
    'recordImportWarning',
    'listImportWarnings',
  ];

  for (const fn of importFns) {
    assert.equal(typeof importBatches[fn], 'function', fn);
    assert.equal(aggregate[fn], importBatches[fn], fn);
  }
});

test('material parameter query helpers are split out and re-exported by aggregate repository', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const queries = require('../pf_assistant/src/materials/repositories/material-parameter-queries');
  const queryFns = ['toApiParameter', 'getMaterialSummary', 'getParameterSetDetail'];

  for (const fn of queryFns) {
    assert.equal(typeof queries[fn], 'function', fn);
    assert.equal(aggregate[fn], queries[fn], fn);
  }
});

test('material parameters repository documents and preserves its aggregate export contract', () => {
  const aggregate = require('../pf_assistant/src/materials/repositories/material-parameters-repository');
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pf_assistant/src/materials/repositories/material-parameters-repository.js'),
    'utf8',
  );
  const expectedExports = [
    'createImportBatch',
    'finalizeImportBatch',
    'getMaterialById',
    'getMaterialByKey',
    'getMaterialSummary',
    'getParameterDefinitionById',
    'getParameterDefinitionByKey',
    'getParameterSetById',
    'getParameterSetDetail',
    'getParameterSetsForMaterialWithSource',
    'getSourceById',
    'getValuesForSet',
    'listImportWarnings',
    'listMaterials',
    'listParameterDefinitions',
    'listParameterSetsForMaterial',
    'makeMaterialKey',
    'recordImportWarning',
    'splitAuthors',
    'toApiParameter',
    'upsertMaterial',
    'upsertParameterSet',
    'upsertSource',
    'writeParameterValue',
  ];

  assert.deepEqual(Object.keys(aggregate).sort(), expectedExports);
  assert.match(source, /compatibility aggregator/i);
  assert.match(source, /Record-level SQL lives in the sibling modules/i);
});

test('material repository can run against an isolated sqlite database path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-material-db-'));
  const tempDb = path.join(tempDir, 'material-test.db');
  const script = [
    "const assert = require('node:assert/strict');",
    "const db = require('./pf_assistant/database');",
    "assert.equal(db.getDbPath(), process.env.PF_ASSISTANT_DB_PATH);",
    "db.initDb();",
    "const repo = require('./pf_assistant/src/materials/repositories/material-parameters-repository');",
    "const material = repo.upsertMaterial({ displayName: 'Round18 Material', materialFamily: 'ferromagnetic' });",
    "assert.equal(material.material_key, 'round18_material');",
    "assert.equal(repo.listMaterials().some((m) => m.material_key === 'round18_material'), true);",
    "assert.equal(repo.listParameterDefinitions().some((p) => p.parameter_key === 'Ms'), true);",
    "db.closeDbForTests();",
  ].join('\n');

  execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(fs.existsSync(tempDb), true);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../pf_assistant/data/app.db')), true);
});

test('chat message persistence stores structured ferro metadata', () => {
  const tempDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-chat-metadata-db-')), 'app.db');
  const script = [
    "const db = require('./pf_assistant/database');",
    "db.initDb();",
    "const user = db.createUser({ email: 'metadata-user@example.edu', password: 'secret123', institution_name: 'Metadata Lab', institution_type: 'university', contact_name: 'User', role: 'researcher', intended_use: 'ferro tests' });",
    "const session = db.createChatSession(user.id, 'Ferro');",
    "db.saveChatMessage(session.id, 'assistant', '铁电相场计算完成，已生成极化分布图片。', { type: 'ferro_result', jobId: 'ferro_meta_1', result: { visualizations: [{ mode: 'component', component: 'pz', url: '/api/ferro/assets/ferro_meta_1/Polar.0002000_pz.png' }] } });",
    "const messages = db.getChatMessages(session.id);",
    "console.log(JSON.stringify({ metadata: JSON.parse(messages[0].metadata_json) }));",
    "db.closeDbForTests();",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PF_ASSISTANT_DB_PATH: tempDb },
    encoding: 'utf8',
  }).trim().split('\n').filter((line) => line.startsWith('{')).pop();

  const parsed = JSON.parse(output);
  assert.equal(parsed.metadata.type, 'ferro_result');
  assert.equal(parsed.metadata.jobId, 'ferro_meta_1');
  assert.equal(parsed.metadata.result.visualizations[0].component, 'pz');
});

function loadCustomUiSandbox() {
  const rendererJs = fs.readFileSync(path.join(__dirname, '../custom-webui/js/chat-renderer.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../custom-webui/js/app.js'), 'utf8');
  const elements = new Map();
  const makeClassList = () => {
    const classes = new Set();
    return {
      add: (...items) => items.forEach((item) => classes.add(item)),
      remove: (...items) => items.forEach((item) => classes.delete(item)),
      toggle: (item, force) => force === undefined ? (classes.has(item) ? classes.delete(item) : classes.add(item)) : (force ? classes.add(item) : classes.delete(item)),
      contains: (item) => classes.has(item),
    };
  };
  const makeElement = (id = '') => ({
    id,
    children: [],
    dataset: {},
    style: {},
    classList: makeClassList(),
    textContent: '',
    value: '',
    innerHTML: '',
    addEventListener() {},
    appendChild(child) { this.children.push(child); },
    remove() { this.removed = true; },
    focus() {},
    closest: () => null,
  });
  const getElement = (id) => {
    const key = String(id || '');
    if (!elements.has(key)) elements.set(key, makeElement(key));
    return elements.get(key);
  };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    window: {
      location: { origin: 'http://localhost:3000', host: 'localhost:3000', search: '', href: 'http://localhost:3000/app/' },
      matchMedia: () => ({ matches: false }),
      history: { replaceState() {} },
    },
    document: {
      getElementById: getElement,
      querySelectorAll: () => [],
      createElement: (tag) => ({ ...makeElement(), tagName: String(tag || '').toUpperCase() }),
      documentElement: { classList: { toggle() {}, contains: () => false, add() {} } },
    },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: (() => {
      const store = new Map();
      return {
        getItem: (key) => store.has(String(key)) ? store.get(String(key)) : null,
        setItem: (key, value) => store.set(String(key), String(value)),
        removeItem: (key) => store.delete(String(key)),
      };
    })(),
    URLSearchParams,
    URL,
    WebSocket: function WebSocket() {},
    fetch: async () => ({ ok: false }),
    setTimeout,
  };

  vm.createContext(sandbox);
  vm.runInContext(rendererJs, sandbox);
  vm.runInContext(appJs, sandbox);
  sandbox.formatContent = sandbox.PFMChatRenderer.formatContent;
  sandbox.__elements = elements;
  return sandbox;
}

test('custom UI parses efffield slash commands into dielectric job requests', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.parseEfffieldCommand, 'function');
  const parsed = sandbox.parseEfffieldCommand('/eff dielectric nx=64 ny=48 radius=12 field=1,0,0 tol=0.001 maxiter=200');
  assert.equal(parsed.system, 'dielectric');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.grid)), { nx: 64, ny: 48, nz: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.structure)), { type: 'circle', radius: 12 });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.load)), { electricField: [1, 0, 0] });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.solver)), { tol: 0.001, maxiter: 200 });
  assert.equal(sandbox.parseEfffieldCommand('普通对话'), null);
});

test('custom UI parses Chinese dielectric natural-language requests', () => {
  const sandbox = loadCustomUiSandbox();
  const parsed = sandbox.parseEfffieldCommand('介电常数模拟，尺寸32×32，半径5');
  assert.equal(parsed.system, 'dielectric');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.grid)), { nx: 32, ny: 32, nz: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.structure)), { type: 'circle', radius: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.load)), { electricField: [1, 0, 0] });
});



test('custom UI routes transport efffield requests through dialogue endpoint', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('热传导有效场模拟，尺寸16×16×16', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('扩散模拟，尺寸16×16', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('电导计算，尺寸16×16', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('我想要计算介电电场分布', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('研究扩散模拟', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('帮我看看热流分布', false), true);
});

test('custom UI routes efffield drafts through dialogue endpoint', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.shouldRouteToEfffieldDialogue, 'function');
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('我想做介电常数模拟', false), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('半径改成 3', true), true);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('普通对话', false), false);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.buildEfffieldDialogueRequest('尺寸 32×32', 'chat-1'))), {
    message: '尺寸 32×32',
    chatSessionId: 'chat-1',
  });
});

test('custom UI builds chat.send params with string message content', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.buildChatSendParams, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.buildChatSendParams('session-1', 'hello', 'idem-1'))), {
    sessionKey: 'session-1',
    message: 'hello',
    idempotencyKey: 'idem-1',
  });
});

test('custom UI answers identity questions locally without Gateway identity leakage', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.isIdentityQuestion, 'function');
  assert.equal(typeof sandbox.buildIdentityResponse, 'function');

  assert.equal(sandbox.isIdentityQuestion('我是谁'), true);
  assert.equal(sandbox.isIdentityQuestion('who am I?'), true);
  assert.equal(sandbox.isIdentityQuestion('模拟铁电畴'), false);

  const answer = sandbox.buildIdentityResponse({ displayName: 'Alice', institution: 'Hidden Lab' });
  assert.match(answer, /PFM² 相场模拟专业助手/);
  assert.match(answer, /Alice/);
  assert.doesNotMatch(answer, /Hidden Lab|USER\.md|api[_-]?key|token/i);
});

test('custom UI accepts only events for the current OpenClaw session', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.isCurrentSessionPayload, 'function');
  assert.equal(sandbox.isCurrentSessionPayload({ sessionKey: 'agent:main:webui' }, 'agent:main:webui'), true);
  assert.equal(sandbox.isCurrentSessionPayload({ sessionKey: 'agent:main:doz' }, 'agent:main:webui'), false);
  assert.equal(sandbox.isCurrentSessionPayload({ originSessionKey: 'agent:main:doz' }, 'agent:main:webui'), false);
  assert.equal(sandbox.isCurrentSessionPayload({ chatSessionId: 'agent:main:doz' }, 'agent:main:webui'), false);
  assert.equal(sandbox.isCurrentSessionPayload({ content: 'missing session' }, 'agent:main:webui'), false);
});

test('runtime status summarizes service readiness without exposing secrets', () => {
  const { buildRuntimeStatus } = require('../pf_assistant/runtime-status');

  const status = buildRuntimeStatus({
    now: 1000,
    startedAt: 250,
    deviceIdentityLoaded: true,
    gatewayConfigured: true,
    databaseReady: true,
  });

  assert.equal(status.service, 'pf-assistant-webui');
  assert.equal(status.ok, true);
  assert.equal(status.uptimeMs, 750);
  assert.equal(status.checks.database.status, 'ok');
  assert.equal(status.checks.deviceIdentity.status, 'ok');
  assert.equal(status.checks.gatewayCredentials.status, 'ok');
  assert.equal(JSON.stringify(status).includes('token'), false);
});

test('custom UI distinguishes websocket connected from OpenClaw session ready', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.getGatewayReadinessLabel, 'function');
  assert.equal(sandbox.getGatewayReadinessLabel(false, false), '未连接');
  assert.equal(sandbox.getGatewayReadinessLabel(true, false), '会话准备中');
  assert.equal(sandbox.getGatewayReadinessLabel(true, true), '已连接');
});


test('custom UI enters app by preparing chat session before connecting gateway', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.getEnterAppStepOrder, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.getEnterAppStepOrder())), [
    'show-interface',
    'load-chat-sessions',
    'recover-session',
    'connect-gateway',
  ]);
});


test('custom UI renders landing cover and keeps auth modal hidden by default', () => {
  const html = fs.readFileSync(path.join(__dirname, '../custom-webui/index.html'), 'utf8');

  assert.match(html, /id="landingPage"/);
  assert.match(html, /id="landingLoginBtn"/);
  assert.match(html, /id="landingRegisterBtn"/);
  assert.match(html, /PFM² 相场模拟助手/);
  assert.match(html, /面向复杂材料体系的智能模拟与分析平台/);
  assert.equal(html.includes('assets/images/2.webp') || html.includes('custom-webui/assets/images/2.webp'), true);
  assert.match(html, /id="authModal"[^>]*style="display:\s*none/);
});

test('custom UI unauthenticated landing action shows cover instead of modal', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.getUnauthenticatedLandingAction, 'function');
  assert.equal(sandbox.getUnauthenticatedLandingAction(''), 'show-cover');
  assert.equal(sandbox.getUnauthenticatedLandingAction('?reset=abc'), 'show-reset-modal');
});

test('custom UI renders assistant markdown as professional data panels', () => {
  const sandbox = loadCustomUiSandbox();
  const source = [
    '## 材料参数',
    '',
    '| 参数 | SI 值 | 显示值 | 单位 | 备注 |',
    '|---|---:|---:|---|---|',
    '| Msat | 8.0e5 | 800 | kA/m | saturation |',
    '| alpha | — | — | — | missing |',
    '',
    'missingParameters: ["alpha"]',
    '',
    'Dind = 7.27 × 10^-4 J/m² = 0.727 mJ/m²',
    '',
    '```mumax3',
    'Msat = 8e5',
    'Aex = 1e-11',
    '```',
  ].join('\n');

  const html = sandbox.formatContent(source, 'assistant');
  assert.match(html, /class="[^"]*chat-markdown/);
  assert.match(html, /data-table parameter-table/);
  assert.match(html, /<code class="parameter-code">Msat<\/code>/);
  assert.match(html, /class="warning-box"/);
  assert.match(html, /missingParameters/);
  assert.match(html, /class="unit-conversion-box"/);
  assert.match(html, /class="code-block"/);
  assert.match(html, /data-copy-code=/);
  assert.match(html, /mumax3/);
});


test('chat response CSS defines readable light and dark theme tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../custom-webui/css/styles.css'), 'utf8');
  const requiredTokens = [
    '--chat-page-bg',
    '--chat-panel-bg',
    '--chat-panel-bg-soft',
    '--chat-panel-border',
    '--chat-text-primary',
    '--chat-text-secondary',
    '--chat-text-muted',
    '--chat-heading',
    '--chat-accent',
    '--chat-accent-soft',
    '--chat-table-bg',
    '--chat-table-header-bg',
    '--chat-table-row-bg',
    '--chat-table-row-hover',
    '--chat-table-border',
    '--chat-code-bg',
    '--chat-code-text',
    '--chat-inline-code-bg',
    '--chat-inline-code-text',
    '--chat-warning-bg',
    '--chat-warning-border',
    '--chat-warning-text',
    '--chat-conversion-bg',
    '--chat-conversion-border',
    '--chat-conversion-text',
    '--chat-shadow',
  ];

  for (const token of requiredTokens) {
    assert.match(css, new RegExp(token.replace('--', '--')));
  }
  assert.match(css, /:root\s*\{[\s\S]*--chat-panel-bg:\s*#ffffff/i);
  assert.match(css, /\.dark\s*\{[\s\S]*--chat-panel-bg:\s*#151822/i);
  assert.match(css, /\.dark\s*\{[\s\S]*--chat-text-primary:\s*#e6e8ef/i);
});

test('chat response CSS uses theme tokens for structured assistant panels', () => {
  const css = fs.readFileSync(path.join(__dirname, '../custom-webui/css/styles.css'), 'utf8');

  assert.match(css, /\.message:not\(\.user\):not\(\.welcome\) \.message-content\s*\{[\s\S]*background:\s*var\(--chat-panel-bg\)/);
  assert.match(css, /\.chat-markdown\s*\{[\s\S]*color:\s*var\(--chat-text-primary\)/);
  assert.match(css, /\.data-table\s*\{[\s\S]*background:\s*var\(--chat-table-bg\)/);
  assert.match(css, /\.data-table th\s*\{[\s\S]*background:\s*var\(--chat-table-header-bg\)/);
  assert.match(css, /\.code-block\s*\{[\s\S]*background:\s*var\(--chat-code-bg\)/);
  assert.match(css, /\.warning-box\s*\{[\s\S]*background:\s*var\(--chat-warning-bg\)/);
  assert.match(css, /\.unit-conversion-box\s*\{[\s\S]*background:\s*var\(--chat-conversion-bg\)/);
});

test('custom UI renders API markdown tables without breaking parameter tables', () => {
  const sandbox = loadCustomUiSandbox();
  const apiSource = [
    '| API | 调用 | 状态 | 期望 |',
    '|---|---|---|---|',
    '| chat.send | POST /gateway | ok | accepted |',
  ].join('\n');
  const parameterSource = [
    '| 参数 | SI 值 | 显示值 | 单位 |',
    '|---|---:|---:|---|',
    '| Aex | 1.0e-11 | 10 | pJ/m |',
  ].join('\n');

  assert.match(sandbox.formatContent(apiSource, 'assistant'), /data-table api-test-table/);
  assert.match(sandbox.formatContent(parameterSource, 'assistant'), /data-table parameter-table/);
});


test('custom UI renders compact parameter tables without compacting API or long tables', () => {
  const sandbox = loadCustomUiSandbox();
  const compactSource = [
    '| 参数 | 值 | 单位 |',
    '|---|---:|---|',
    '| Msat | 6.97 × 10^5 | A/m |',
    '| Aex | 1.6 × 10^-11 | J/m |',
    '| Ku1 | -1.1 × 10^5 | J/m³ |',
  ].join('\n');
  const apiSource = [
    '| API | 调用 | 状态 | 期望 |',
    '|---|---|---|---|',
    '| chat.send | POST /gateway | ok | accepted |',
  ].join('\n');
  const longSource = [
    '| 材料 | 参数 | 值 | 单位 | 备注 | 文献 |',
    '|---|---|---:|---|---|---|',
    '| Pt/Co/Ta | Dind | 9.87e-4 | J/m² | long explanation with several words | reference record |',
  ].join('\n');

  const compactHtml = sandbox.formatContent(compactSource, 'assistant');
  const apiHtml = sandbox.formatContent(apiSource, 'assistant');
  const longHtml = sandbox.formatContent(longSource, 'assistant');

  assert.match(compactHtml, /class="table-scroll compact-table-wrapper"/);
  assert.match(compactHtml, /class="data-table parameter-table compact-table"/);
  assert.match(compactHtml, /<code class="parameter-code">Msat<\/code>/);
  assert.doesNotMatch(apiHtml, /compact-table/);
  assert.doesNotMatch(longHtml, /compact-table/);
});

test('custom UI renders mechanical parameter notes as material note boxes', () => {
  const sandbox = loadCustomUiSandbox();
  const html = sandbox.formatContent('力学参数: c11=292.3 GPa, c12=150.7 GPa, c44=70.8 GPa, λ100=λ111=-4.6×10^-5', 'assistant');

  assert.match(html, /class="material-note-box"/);
  assert.match(html, /力学参数/);
  assert.match(html, /<code>c11<\/code>/);
  assert.match(html, /292.3 GPa/);
});

test('chat response CSS supports compact tables and material note boxes with theme tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../custom-webui/css/styles.css'), 'utf8');

  assert.match(css, /--chat-note-bg/);
  assert.match(css, /--chat-note-border/);
  assert.match(css, /--chat-note-text/);
  assert.match(css, /\.compact-table-wrapper\s*\{[\s\S]*width:\s*fit-content/);
  assert.match(css, /\.compact-table\s*\{[\s\S]*width:\s*auto/);
  assert.match(css, /\.parameter-table\.compact-table th:nth-child\(2\)[\s\S]*text-align:\s*right/);
  assert.match(css, /\.material-note-box\s*\{[\s\S]*background:\s*var\(--chat-note-bg\)/);
});


test('chat renderer module is loaded before app and exposes expected API', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.PFMChatRenderer, 'object');
  assert.equal(typeof sandbox.PFMChatRenderer.formatContent, 'function');
  assert.equal(typeof sandbox.PFMChatRenderer.handleMessageContentClick, 'function');
});

test('chat renderer escapes raw HTML and event attributes', () => {
  const { formatContent } = require('../custom-webui/js/chat-renderer');
  const html = formatContent('<img src=x onerror="alert(1)"> **safe** `code`', 'assistant');

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /onerror=&quot;alert\(1\)&quot;/);
  assert.match(html, /&lt;img/);
  assert.ok(html.includes('<strong>safe</strong>'));
  assert.ok(html.includes('<code>code</code>'));
});

test('chat renderer renders ferro result cards with safe image assets', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.formatContent({
    type: 'ferro_result',
    summary: '铁电相场计算完成',
    assets: [
      { title: 'Pz 分布', url: '/api/ferro/assets/ferro_1/Polar.0005000_pz.png' },
      { title: '<bad>', url: 'javascript:alert(1)' },
    ],
  });
  assert.match(html, /铁电相场计算结果/);
  assert.match(html, /Polar.0005000_pz.png/);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.match(html, /&lt;bad&gt;/);
});

test('custom UI routes ferro drafts through dialogue endpoint', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.shouldRouteToFerroDialogue, 'function');
  assert.equal(sandbox.shouldRouteToFerroDialogue('我想做铁电畴结构计算', false), true);
  assert.equal(sandbox.shouldRouteToFerroDialogue('64×1×64，跑 20000 步', true), true);
  assert.equal(sandbox.shouldRouteToFerroDialogue('普通对话', false), false);
  assert.equal(sandbox.shouldRouteToFerroDialogue('计算介电常数', true), false);
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('计算介电常数', false), true);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.parseFerroCommand('模拟 BFO 铁电畴'))), {
    system: 'ferroelectric',
    materialFilter: 'BFO',
    hasMaterial: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.buildFerroDialogueRequest('64×1×64', 'chat-1'))), {
    message: '64×1×64',
    chatSessionId: 'chat-1',
  });
});

test('custom UI fetches ferro material models for dialogue recommendations with optional filter', async () => {
  const calls = [];
  const sandbox = loadCustomUiSandbox();
  sandbox.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ([
        {
          materialKey: 'pzt',
          displayName: 'PZT',
          modelKey: 'pzt_haun_1989',
          modelName: 'Haun 1989',
          defaultXf: 0.48,
          defaultTem: 300,
        },
      ]),
    };
  };

  const models = await sandbox.fetchFerroMaterialModels();
  const filtered = await sandbox.fetchFerroMaterialModels('模拟 BFO 铁电畴');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://localhost:3000/api/ferro/materials');
  assert.equal(calls[1].url, 'http://localhost:3000/api/ferro/materials?filter=%E6%A8%A1%E6%8B%9F%20BFO%20%E9%93%81%E7%94%B5%E7%95%B4');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(models.materials[0].modelKey, 'pzt_haun_1989');
  assert.equal(filtered.materials[0].modelKey, 'pzt_haun_1989');
});

test('custom UI initializes ferro state for new sessions and exposes first-input loading text', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.initializeFerroModuleState, 'function');
  assert.equal(sandbox.sessionStorage.getItem('ferroDraft:chat-new'), null);
  sandbox.initializeFerroModuleState('chat-new');

  assert.equal(sandbox.sessionStorage.getItem('ferroDraft:chat-new'), 'null');
  assert.equal(sandbox.isFerroDialogueActive(), false);
  assert.equal(sandbox.ferroInitializationMessage(), '正在初始化 ferro 会话，请稍候…');
});

test('custom UI restores saved structured ferro result messages as result cards', async () => {
  const sandbox = loadCustomUiSandbox();
  const saved = {
    role: 'assistant',
    content: '铁电相场计算完成，已生成极化分布图片。',
    metadata: {
      type: 'ferro_result',
      jobId: 'ferro_saved_1',
      chatSessionId: 'chat-saved',
      draftSnapshot: {
        status: 'ready',
        visualization: { mode: 'variant_111_arrow', component: null },
        material: { label: 'BFO / Bens' },
        grid: { nx: 64, ny: 1, nz: 64 },
        run: { steps: 10000, outputInterval: 2000 },
      },
      result: {
        timesteps: [2000],
        visualizations: [
          { timestep: 2000, mode: 'variant_111_arrow', component: null, label: 'R相变体 kt=2000', url: '/api/ferro/assets/ferro_saved_1/Polar.0002000_variant_111_arrow.png' },
        ],
        legend: { mode: 'variant_111', label: 'R相 <111> 变体', url: '/api/ferro/assets/ferro_saved_1/polar_variant_111_legend.png' },
      },
    },
  };

  assert.equal(typeof sandbox.renderSavedChatMessage, 'function');
  assert.equal(typeof sandbox.rehydrateFerroStateFromMessages, 'function');
  sandbox.renderSavedChatMessage(saved);
  sandbox.rehydrateFerroStateFromMessages('chat-saved', [saved]);

  const messages = sandbox.__elements.get('messages');
  assert.equal(messages.children.length, 1);
  assert.match(messages.children[0].innerHTML, /ferro-result-card/);
  assert.match(messages.children[0].innerHTML, /R相变体/);
  assert.equal(sandbox.hasReadyFerroDraft('chat-saved'), true);
});

test('custom UI hydrates saved ferro result metadata from jobId when images are missing', async () => {
  const sandbox = loadCustomUiSandbox();
  const calls = [];
  sandbox.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        type: 'ferro_result',
        jobId: 'ferro_saved_2',
        draftSnapshot: { status: 'ready', visualization: { mode: 'component', component: 'pz' } },
        result: {
          timesteps: [2000],
          visualizations: [{ timestep: 2000, mode: 'component', component: 'pz', label: 'Pz kt=2000', url: '/api/ferro/assets/ferro_saved_2/Polar.0002000_pz.png' }],
        },
      }),
    };
  };

  const hydrated = await sandbox.hydrateSavedChatMessage({
    role: 'assistant',
    content: 'done',
    metadata: { type: 'ferro_result', jobId: 'ferro_saved_2' },
  });

  assert.equal(calls[0].url, 'http://localhost:3000/api/ferro/jobs/ferro_saved_2/results');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(hydrated.metadata.result.visualizations[0].component, 'pz');
});

test('chat renderer renders ferro material recommendation buttons', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.formatContent({
    type: 'ferro_material_recommendations',
    models: [
      {
        materialKey: 'pzt',
        displayName: 'PZT',
        modelKey: 'pzt_haun_1989',
        modelName: 'Haun 1989',
        defaultXf: 0.48,
        defaultTem: 300,
      },
      {
        materialKey: 'bfo',
        displayName: 'BFO',
        modelKey: 'bfo_bens_coefficients',
        modelName: 'Bens coefficients',
        defaultTem: 380,
      },
    ],
  });

  assert.match(html, /ferro-material-recommendations/);
  assert.match(html, /data-ferro-material-command="材料换成 PZT Haun 1989，xf=0.48，温度 300K"/);
  assert.match(html, /PZT/);
  assert.match(html, /BFO/);
  assert.doesNotMatch(html, /javascript:/);
});

test('chat renderer filters ferro material recommendation cards inline', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderMaterialRecommendationMessage({
    type: 'ferro_material_recommendations',
    filter: { query: 'BFO' },
    models: [
      { materialKey: 'pzt', displayName: 'PZT', modelKey: 'pzt_haun_1989', modelName: 'Haun 1989', defaultXf: 0.48, defaultTem: 300 },
      { materialKey: 'bfo', displayName: 'BFO', modelKey: 'bfo_bens_coefficients', modelName: 'Bens coefficients', defaultTem: 298 },
    ],
  });

  assert.match(html, /ferro-material-recommendations/);
  assert.match(html, /BFO/);
  assert.doesNotMatch(html, /PZT/);
  assert.doesNotMatch(html, /ferro-draft-card/);
});

test('chat renderer shows runnable Landau database material models as inline cards', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderMaterialRecommendationMessage({
    type: 'ferro_material_recommendations',
    filter: { query: 'BFO' },
    models: [
      {
        id: 'landau:BFO_Hsieh2016_sixth',
        materialKey: 'bfo',
        displayName: 'BFO',
        modelKey: 'landau:BFO_Hsieh2016_sixth',
        modelName: 'BFO Hsieh2016 sixth',
        family: 'BFO',
        title: 'BFO',
        subtitle: 'BFO Hsieh2016 sixth',
        defaultParams: { temperature: 298 },
        displayParams: [{ label: 'T', value: '298 K' }],
        badges: ['BFO', 'Landau DB', '可计算'],
        presets: [{ id: 'quick_2d', label: '快速预览' }],
      },
    ],
  });

  assert.match(html, /ferro-material-card/);
  assert.match(html, /BFO Hsieh2016 sixth/);
  assert.match(html, /Landau DB/);
  assert.match(html, /data-material-id="landau:BFO_Hsieh2016_sixth"/);
  assert.match(html, /data-ferro-action="apply_material_preset"/);
});
test('custom UI routes start confirmation when a ready ferro draft is stored', () => {
  const sandbox = loadCustomUiSandbox();
  const draft = {
    status: 'ready',
    system: 'ferroelectric',
    grid: { nx: 64, ny: 1, nz: 64 },
    material: { xf: 0.3, tem: 298 },
    run: { kstep: 5000, kprnt: 2500 },
    initial: { magn: 0.1, n_random: 15 },
    field: { appel30: 0.009, appel31: 0.001 },
    visualization: { component: 'pz', slice: 'xz', steps: 'all' },
  };

  sandbox.rememberFerroDraft('chat-1', draft);

  assert.equal(sandbox.shouldRouteToFerroDialogue('开始计算', false, 'chat-1'), true);
  assert.equal(sandbox.shouldRouteToFerroDialogue('普通对话', false, 'chat-1'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.buildFerroJobRequestFromDraft(draft))), {
    grid: { nx: 64, ny: 1, nz: 64 },
    material: { xf: 0.3, tem: 298 },
    run: { kstep: 5000, kprnt: 2500 },
    initial: { magn: 0.1, n_random: 15 },
    field: { appel30: 0.009, appel31: 0.001 },
    visualization: { component: 'pz', slice: 'xz', steps: 'all' },
  });
});

test('chat renderer renders ferro material preset grid and draft cards with escaped values', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const materialsHtml = renderer.renderMaterialPresetGrid([
    {
      id: 'bfo_bens_coefficients',
      family: 'BFO',
      title: '<BFO>',
      subtitle: 'BFO Bens coefficients',
      defaultParams: { temperature: 298 },
      composition: { enabled: false },
      displayParams: [{ label: 'T', value: '298 K', highlight: true }],
      badges: ['BFO', '2D'],
      presets: [{ id: 'quick_2d', label: '快速预览' }, { id: 'standard_2d', label: '标准计算' }, { id: 'custom', label: '自定义', custom: true }],
    },
  ]);
  assert.match(materialsHtml, /ferro-material-card/);
  assert.match(materialsHtml, /data-ferro-action="apply_material_preset"/);
  assert.match(materialsHtml, /data-material-id="bfo_bens_coefficients"/);
  assert.doesNotMatch(materialsHtml, /<BFO>/);
  assert.match(materialsHtml, /&lt;BFO&gt;/);

  const draftHtml = renderer.renderFerroDraftCard({
    status: 'ready',
    material: { id: 'bfo_bens_coefficients', family: 'BFO', label: 'BFO / Bens coefficients', temperature: 298, composition: { enabled: false } },
    grid: { nx: 64, ny: 1, nz: 64 },
    run: { steps: 10000, outputInterval: 2000 },
    visualization: { mode: 'inplane_angle', component: null, inplaneComponents: ['px', 'pz'] },
    field: { enabled: false },
    initial: { type: 'random_small_perturbation' },
    sources: { material: 'user_selection', grid: 'quick_preset', run: 'quick_preset', visualization: 'quick_preset' },
  }, null, { ready: true, missingFields: [], warnings: [], errors: [] });
  assert.match(draftHtml, /ferro-draft-card/);
  assert.match(draftHtml, /铁电相场计算草稿/);
  assert.match(draftHtml, /data-ferro-action="start_job"/);
  assert.match(draftHtml, /64×1×64/);
  assert.match(draftHtml, /2000, 4000, 6000, 8000, 10000/);
});

test('chat renderer renders single-variant fallback ferro family cards', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderMaterialRecommendationMessage({
    type: 'ferro_material_recommendations',
    cards: [
      {
        cardType: 'material_family',
        cardSource: 'fallback',
        familyId: 'pto',
        title: 'PTO',
        subtitle: 'PbTiO3 phase-field model',
        groupMode: 'single',
        temperature: 300,
        composition: { enabled: false },
        selectedVariantId: 'pto_default',
        defaultVariantId: 'pto_default',
        variants: [{ variantId: 'pto_default', materialModelId: 'landau:PTO_default', buttonLabel: '默认', title: 'PTO default', visible: true }],
        actions: [{ label: '快速预览', presetId: 'quick_2d' }],
      },
    ],
  });

  assert.match(html, /PTO/);
  assert.match(html, /data-ferro-material-family-card/);
  assert.match(html, /data-ferro-action="select_material_variant"/);
  assert.match(html, /data-variant-id="pto_default"/);
  assert.match(html, /data-ferro-action="apply_material_preset"/);
  assert.match(html, /data-material-group-id="pto"/);
});

test('chat renderer renders ferro diff cards compactly', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderFerroDiffCard([
    { path: 'visualization.component', label: '可视化分量', from: 'pz', to: 'px' },
  ], { ready: true, errors: [], warnings: [] });
  assert.match(html, /ferro-diff-card/);
  assert.match(html, /可视化分量/);
  assert.match(html, /Pz/);
  assert.match(html, /Px/);
});

test('chat renderer keeps ferro cards inline and hides non-composition xf while exposing slim visualization controls', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderFerroDraftCard({
    status: 'ready',
    material: { id: 'bfo_10004', family: 'BFO', label: 'BFO / BFO 10004', temperature: 298, composition: { enabled: false } },
    grid: { nx: 64, ny: 1, nz: 64 },
    run: { steps: 10000, outputInterval: 2000 },
    visualization: { mode: 'angle_arrow', component: null, inplaneComponents: ['px', 'pz'] },
    field: { enabled: false },
    initial: { type: 'random_small_perturbation' },
    sources: {},
  }, null, { ready: true, missingFields: [], warnings: [], errors: [] });
  assert.match(html, /chat-inline-card/);
  assert.match(html, /面内角度|面内/);
  assert.match(html, /Px-Pz|Px–Pz/);
  assert.doesNotMatch(html, /xf\s*=/i);
  assert.match(html, /data-patch-path="visualization.mode" data-patch-value="inplane_angle"/);
  assert.match(html, /data-patch-path="visualization.mode" data-patch-value="variant_111"/);
  assert.doesNotMatch(html, /data-patch-value="inplane_angle_arrow"/);
  assert.doesNotMatch(html, /data-patch-value="variant_111_arrow"/);
});

test('chat renderer renders ferro result followup chips and slim mode tabs', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderFerroResultCard({
    type: 'ferro_result',
    jobId: 'ferro_1',
    message: '计算完成。下面是当前结果。',
    draftSnapshot: { material: { label: 'BFO / BFO 10004', temperature: 298 }, grid: { nx: 64, ny: 1, nz: 64 }, run: { steps: 10000, outputInterval: 2000 }, visualization: { mode: 'inplane_angle' } },
    result: { timesteps: [2000], visualizations: [{ timestep: 2000, mode: 'inplane_angle', label: '面内角度颜色映射 kt=2000', components: ['px', 'pz'], url: '/api/ferro/assets/ferro_1/Polar.0002000_inplane_angle.png' }], legend: { mode: 'inplane_angle', url: '/api/ferro/assets/ferro_1/polar_angle_legend.png' } },
    followupChips: [{ label: '查看面内角度', action: 'set_visualization_mode', mode: 'inplane_angle' }, { label: '角度+箭头', action: 'set_visualization_mode', mode: 'angle_arrow' }],
  });
  assert.match(html, /ferro-followup-chips/);
  assert.match(html, /ferro-mode-tabs/);
  assert.match(html, /面内/);
  assert.match(html, /R相变体/);
  assert.match(html, /箭头：默认显示/);
  assert.match(html, /角度\+箭头/);
  assert.match(html, /ferro-angle-legend/);
  assert.doesNotMatch(html, /data-ferro-view-mode="inplane_angle_arrow"/);
  assert.doesNotMatch(html, /data-ferro-view-mode="variant_111_arrow"/);
});

test('chat renderer filters ferro result images by active view mode and uses compact gallery', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const result = {
    type: 'ferro_result',
    jobId: 'ferro_1',
    draftSnapshot: { visualization: { mode: 'component', component: 'pz' } },
    result: {
      timesteps: [2000, 4000, 6000, 8000, 10000],
      visualizations: [
        { timestep: 2000, mode: 'component', component: 'pz', components: ['pz'], label: 'Pz 分量 kt=2000', url: '/api/ferro/assets/ferro_1/Polar.0002000_pz.png' },
        { timestep: 2000, mode: 'inplane_angle', components: ['px', 'pz'], label: '面内角度 kt=2000', url: '/api/ferro/assets/ferro_1/Polar.0002000_inplane_angle.png' },
        { timestep: 2000, mode: 'inplane_angle_arrow', components: ['px', 'pz'], projectionComponents: ['px', 'pz'], label: '面内角度+箭头 kt=2000', url: '/api/ferro/assets/ferro_1/Polar.0002000_inplane_angle_arrow.png' },
        { timestep: 2000, mode: 'variant_111_arrow', components: ['px', 'py', 'pz'], projectionComponents: ['px', 'pz'], label: 'BFO八变体+箭头 kt=2000', url: '/api/ferro/assets/ferro_1/Polar.0002000_variant_111_arrow.png' },
      ],
      legend: { mode: 'variant_111', label: 'R-BFO <111> 八变体图例', url: '/api/ferro/assets/ferro_1/polar_variant_111_legend.png' },
    },
  };

  assert.deepEqual(renderer.selectVisibleFerroImages(result.result, { mode: 'component', component: 'pz' }).map((item) => item.label), ['Pz 分量 kt=2000']);
  assert.deepEqual(renderer.selectVisibleFerroImages(result.result, { mode: 'variant_111', component: null, overlay: { arrows: true } }).map((item) => item.label), ['BFO八变体+箭头 kt=2000']);

  const html = renderer.renderFerroResultCard(result);
  assert.match(html, /ferro-result-gallery/);
  assert.match(html, /data-count="1"/);
  assert.match(html, /Pz 分量 kt=2000/);
  assert.doesNotMatch(html, /面内角度 kt=2000/);
  assert.doesNotMatch(html, /BFO八变体\+箭头 kt=2000/);
  assert.match(html, /data-ferro-view-mode="variant_111"/);
  assert.doesNotMatch(html, /data-ferro-view-mode="variant_111_arrow"/);
  assert.match(html, /target="_blank"/);
});

test('chat renderer renders efffield parameter.in panel card with escaped textarea and actions', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderEfffieldParameterPanelCard({
    system: 'dielectric',
    parameterText: 'REALDIM 16 16 1\\n<script>alert(1)</script>',
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 300 },
  });

  assert.match(html, /efffield-parameter-panel/);
  assert.match(html, /textarea/);
  assert.match(html, /data-efffield-action="run_parameter_panel"/);
  assert.match(html, /data-efffield-action="refresh_parameter_template"/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
});

test('chat renderer renders efffield parameter panel as a draft card with summary table', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderEfffieldParameterPanelCard({
    system: 'dielectric',
    parameterText: [
      '# 有效场 parameter.in 自定义输入模板',
      'REALDIM 16 16 1 # 真实物理尺寸',
      'SYSDIM 16 16 1 # 网格尺寸',
      'CHOICESYS 2 # 物理系统',
      'NPHASES 2',
      'CHOICESTRUCT 2',
      'OUTDIST true',
      'ELECFIELD 1 0 0',
      'PHASEID 1',
      'PERMITTIVITY 2 2 2 0 0 0 # 相1材料参数',
      'PHASEID 2',
      'PERMITTIVITY 80 80 80 0 0 0 # 相2材料参数',
      '',
    ].join('\n'),
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 300 },
  });

  assert.match(html, /有效场 parameter.in 草稿/);
  assert.match(html, /efffield-draft-summary-grid/);
  assert.match(html, /efffield-run-preview/);
  assert.match(html, /efffield-kv-table/);
  assert.match(html, /<th>REALDIM<\/th>/);
  assert.match(html, /<th>SYSDIM<\/th>/);
  assert.match(html, /<th>CHOICESYS<\/th>/);
  assert.match(html, /<th>ELECFIELD<\/th>/);
  assert.match(html, /<th>相1材料参数<\/th>/);
  assert.match(html, /可运行/);
});


test('chat renderer renders coupled efffield material matrix editors', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderEfffieldParameterPanelCard({
    system: 'piezoelectric',
    parameterText: [
      'REALDIM 16 16 1',
      'SYSDIM 16 16 1',
      'CHOICESYS 3',
      'NPHASES 2',
      'CHOICESTRUCT 2',
      'OUTDIST true',
      'CHOICEELABC 1',
      'STRAIN 1e-3 0 0 0 0 0',
      'ELECFIELD 1 0 0',
      'PHASEID 1',
      'STIFFNESS',
      '1 2 3 4 5 6',
      '7 8 9 10 11',
      '12 13 14 15',
      '16 17 18',
      '19 20',
      '21',
      'PERMITTIVITY 5 5 5 0 0 0',
      'PIEZOELEC',
      '1 0 0 0 0 0',
      '0 1 0 0 0 0',
      '0 0 1 0 0 0',
      'PHASEID 2',
      'STIFFNESS 1 1 1 0 0 0 1 1 0 0 0 1 0 0 0 1 0 0 1 0 1',
      'PERMITTIVITY 50 50 50 0 0 0',
      'PIEZOELEC 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
    ].join('\n'),
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 300 },
  });

  assert.match(html, /efffield-matrix-editor/);
  assert.match(html, /data-efffield-param-key="PHASE_BLOCK"/);
  assert.match(html, /data-efffield-line-key="STIFFNESS"/);
  assert.match(html, /data-efffield-line-key="PIEZOELEC"/);
  assert.match(html, /相1 STIFFNESS/);
});

test('chat renderer renders editable efffield parameter panel inputs', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.renderEfffieldParameterPanelCard({
    system: 'dielectric',
    parameterText: [
      'REALDIM 16 16 1',
      'SYSDIM 16 16 1',
      'CHOICESYS 2',
      'OUTDIST true',
      'ELECFIELD 1 0 0',
      'PHASEID 1',
      'PERMITTIVITY 2 2 2 0 0 0',
      'PHASEID 2',
      'PERMITTIVITY 80 80 80 0 0 0',
    ].join('\n'),
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 300 },
  });

  assert.match(html, /data-efffield-param-key="REALDIM"/);
  assert.match(html, /data-efffield-param-key="SYSDIM"/);
  assert.match(html, /data-efffield-param-key="ELECFIELD"/);
  assert.match(html, /data-efffield-param-key="PHASE1"/);
  assert.match(html, /data-efffield-param-key="PHASE2"/);
  assert.match(html, /efffield-panel-input/);
});

test('custom UI syncs coupled material block edits into parameter text', () => {
  const sandbox = loadCustomUiSandbox();
  const textarea = { value: 'REALDIM 16 16 1\nSYSDIM 16 16 1\nCHOICESYS 3\nPHASEID 1\nSTIFFNESS\n1 2 3 4 5 6\n7 8 9 10 11\nPHASEID 2\nSTIFFNESS 9 9 9 0 0 0\n' };
  const panel = { querySelector: (selector) => selector === '[data-efffield-parameter-text]' ? textarea : null };
  const input = {
    dataset: { efffieldParamKey: 'PHASE_BLOCK', efffieldPhaseId: '1', efffieldLineKey: 'STIFFNESS' },
    value: '3 3 3 0 0 0\n4 4 0 0 0',
    closest: (selector) => selector === '[data-efffield-parameter-panel]' ? panel : null,
  };

  assert.equal(sandbox.handleEfffieldPanelInput({ target: input }), true);
  assert.equal(textarea.value.includes('PHASEID 1\nSTIFFNESS\n3 3 3 0 0 0\n4 4 0 0 0\nPHASEID 2'), true);
  assert.doesNotMatch(textarea.value, /1 2 3 4 5 6/);
});

test('custom UI syncs efffield panel field edits into parameter text', () => {
  const sandbox = loadCustomUiSandbox();
  const textarea = { value: 'REALDIM 16 16 1\nSYSDIM 16 16 1\nCHOICESYS 2\nOUTDIST true\nELECFIELD 1 0 0\nPHASEID 1\nPERMITTIVITY 2 2 2 0 0 0\nPHASEID 2\nPERMITTIVITY 80 80 80 0 0 0\n' };
  const panel = { querySelector: (selector) => selector === '[data-efffield-parameter-text]' ? textarea : null };
  const input = {
    dataset: { efffieldParamKey: 'ELECFIELD' },
    value: '0 1 0',
    closest: (selector) => selector === '[data-efffield-parameter-panel]' ? panel : null,
  };
  const event = { target: input };

  assert.equal(typeof sandbox.handleEfffieldPanelInput, 'function');
  assert.equal(sandbox.handleEfffieldPanelInput(event), true);
  assert.match(textarea.value, /^ELECFIELD 0 1 0$/m);
  assert.doesNotMatch(textarea.value, /^ELECFIELD 1 0 0$/m);
});
test('custom UI sends efffield parameter panel jobs from chat card buttons', async () => {
  const sandbox = loadCustomUiSandbox();
  const fetchCalls = [];
  sandbox.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, json: async () => ({ id: 'eff_param_ui', status: 'completed', summary: 'done', assets: [], outputs: [] }) };
  };
  const textarea = { value: 'REALDIM 16 16 1\\nSYSDIM 16 16 1\\nCHOICESYS 2\\n' };
  const card = {
    querySelector: (selector) => selector === '[data-efffield-parameter-text]' ? textarea : null,
    dataset: {
      efffieldPanelSystem: 'dielectric',
      efffieldPanelGrid: JSON.stringify({ nx: 16, ny: 16, nz: 1 }),
      efffieldPanelStructure: JSON.stringify({ type: 'circle', radius: 4 }),
      efffieldPanelSolver: JSON.stringify({ tol: 0.001, maxiter: 300 }),
    },
  };
  const button = {
    disabled: false,
    dataset: { efffieldAction: 'run_parameter_panel' },
    textContent: '开始计算',
    closest: (selector) => selector === '[data-efffield-action]' ? button : selector === '[data-efffield-parameter-panel]' ? card : null,
  };
  const event = { target: button, preventDefault() { this.defaultPrevented = true; } };

  assert.equal(sandbox.handleEfffieldActionClick(event), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'http://localhost:3000/api/efffield/parameter-jobs');
  const body = JSON.parse(fetchCalls[0].options.body);
  assert.match(body.parameterText, /CHOICESYS 2/);
  assert.deepEqual(body.structure, { type: 'circle', radius: 4 });
  assert.equal(sandbox.shouldRouteToEfffieldDialogue('请分析刚才的结果', false), false);
});

test('chat renderer renders efffield mode choice buttons', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const html = renderer.formatContent({ type: 'efffield_mode_choice', choice: { system: 'dielectric' } });

  assert.match(html, /efffield-mode-choice/);
  assert.match(html, /data-efffield-action="choose_dialogue_mode"/);
  assert.match(html, /data-efffield-action="choose_parameter_panel"/);
  assert.match(html, /对话问答/);
  assert.match(html, /面板输入/);
});

test('chat renderer renders a larger styled efffield parameter editor', () => {
  const renderer = require('../custom-webui/js/chat-renderer');
  const css = fs.readFileSync(path.resolve(__dirname, '../custom-webui/css/styles.css'), 'utf8');
  const html = renderer.renderEfffieldParameterPanelCard({
    system: 'dielectric',
    parameterText: 'REALDIM 16 16 1\nSYSDIM 16 16 1\nCHOICESYS 2\n',
    grid: { nx: 16, ny: 16, nz: 1 },
    structure: { type: 'circle', radius: 4 },
    solver: { tol: 0.001, maxiter: 300 },
  });

  assert.match(html, /efffield-editor-shell/);
  assert.match(html, /efffield-editor-toolbar/);
  assert.match(html, /efffield-draft-summary-grid/);
  assert.match(css, /min-height:\s*clamp\(420px,\s*60vh,\s*720px\)/);
  assert.match(css, /\.efffield-parameter-panel\s*{[\s\S]*width:\s*min\(100%,\s*1040px\)/);
});

test('custom UI sends efffield mode choice buttons through dialogue endpoint', async () => {
  const sandbox = loadCustomUiSandbox();
  const fetchCalls = [];
  sandbox.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, json: async () => ({ type: 'efffield_dialogue', reply: '好的。先确定计算维度：你要做二维还是三维？', draft: { system: 'dielectric', status: 'collecting' } }) };
  };
  const button = {
    disabled: false,
    dataset: { efffieldAction: 'choose_dialogue_mode', efffieldSystem: 'dielectric' },
    textContent: '对话问答',
    closest: (selector) => selector === '[data-efffield-action]' ? button : null,
  };
  const event = { target: button, preventDefault() { this.defaultPrevented = true; } };

  assert.equal(sandbox.handleEfffieldActionClick(event), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'http://localhost:3000/api/efffield/dialogue');
  assert.match(JSON.parse(fetchCalls[0].options.body).message, /对话问答/);
});
