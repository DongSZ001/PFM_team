const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

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

function loadCustomUiSandbox() {
  const rendererJs = fs.readFileSync(path.join(__dirname, '../custom-webui/js/chat-renderer.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../custom-webui/js/app.js'), 'utf8');
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    window: {
      location: { origin: 'http://localhost:3000', host: 'localhost:3000', search: '', href: 'http://localhost:3000/app/' },
      matchMedia: () => ({ matches: false }),
      history: { replaceState() {} },
    },
    document: {
      getElementById: () => ({ addEventListener() {}, style: {}, classList: { toggle() {}, contains: () => false }, textContent: '', value: '' }),
      querySelectorAll: () => [],
      documentElement: { classList: { toggle() {}, contains: () => false, add() {} } },
    },
    localStorage: { getItem: () => null, setItem() {} },
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
  return sandbox;
}

test('custom UI builds chat.send params with string message content', () => {
  const sandbox = loadCustomUiSandbox();
  assert.equal(typeof sandbox.buildChatSendParams, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.buildChatSendParams('session-1', 'hello', 'idem-1'))), {
    sessionKey: 'session-1',
    message: 'hello',
    idempotencyKey: 'idem-1',
  });
});

test('custom UI accepts only events for the current OpenClaw session', () => {
  const sandbox = loadCustomUiSandbox();

  assert.equal(typeof sandbox.isCurrentSessionPayload, 'function');
  assert.equal(sandbox.isCurrentSessionPayload({ sessionKey: 'agent:main:webui' }, 'agent:main:webui'), true);
  assert.equal(sandbox.isCurrentSessionPayload({ sessionKey: 'agent:main:doz' }, 'agent:main:webui'), false);
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
