'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');

const DEFAULT_USER_DATA_ROOT = path.join(paths.projectRoot, 'pf_assistant_data', 'users');

function getConfiguredRoot(options = {}) {
  return path.resolve(options.root || process.env.PFM_USER_DATA_ROOT || DEFAULT_USER_DATA_ROOT);
}

function getUserKey(reqOrUser) {
  const source = reqOrUser && (reqOrUser.userId || reqOrUser.id || reqOrUser.user_id || reqOrUser.email || reqOrUser.username);
  if (!source) throw validationError('userId is required for user workspace');
  const digest = crypto.createHash('sha256').update(String(source)).digest('hex').slice(0, 24);
  return 'u_' + digest;
}

function ensureUserWorkspace(user, options = {}) {
  const root = getConfiguredRoot(options);
  const userKey = getUserKey(user);
  const userRoot = safeJoin(root, userKey, '非法 userKey');
  fs.mkdirSync(userRoot, { recursive: true });
  fs.mkdirSync(path.join(userRoot, 'chat-history'), { recursive: true });
  fs.mkdirSync(path.join(userRoot, 'ferroelectric-simulation'), { recursive: true });
  const manifestPath = path.join(userRoot, 'user-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    writeJson(manifestPath, {
      userKey,
      createdAt: Date.now(),
      schemaVersion: 1,
    });
  }
  return { root: userRoot, userKey, manifestPath };
}

function getUserWorkspaceRoot(user, options = {}) {
  return ensureUserWorkspace(user, options).root;
}

function getChatHistoryDir(user, chatSessionId, options = {}) {
  const workspace = ensureUserWorkspace(user, options);
  const safeChat = safeSegment(chatSessionId, '非法 chatSessionId');
  const dir = safeJoin(path.join(workspace.root, 'chat-history'), safeChat, '非法 chatSessionId');
  fs.mkdirSync(dir, { recursive: true });
  const sessionPath = path.join(dir, 'session.json');
  if (!fs.existsSync(sessionPath)) {
    writeJson(sessionPath, { chatSessionId: safeChat, userKey: workspace.userKey, createdAt: Date.now() });
  }
  return dir;
}

function appendChatHistoryMirror(user, chatSessionId, message, options = {}) {
  const dir = getChatHistoryDir(user, chatSessionId, options);
  const createdAt = message.createdAt || message.created_at || Date.now();
  const record = {
    id: message.id || null,
    role: message.role,
    content: message.content || '',
    type: message.type || message.metadata?.type || message.structuredPayload?.type || null,
    metadata: message.metadata || message.structuredPayload || null,
    structuredPayload: message.structuredPayload || message.metadata || null,
    chatSessionId,
    createdAt,
  };
  fs.appendFileSync(path.join(dir, 'messages.jsonl'), JSON.stringify(record) + '\n');
  return record;
}

function writeChatSnapshot(user, chatSessionId, messages, options = {}) {
  const dir = getChatHistoryDir(user, chatSessionId, options);
  const snapshot = {
    chatSessionId,
    updatedAt: Date.now(),
    messages: Array.isArray(messages) ? messages : [],
  };
  writeJson(path.join(dir, 'messages.snapshot.json'), snapshot);
  return snapshot;
}

function createFerroJobWorkspace(user, chatSessionId, jobId, options = {}) {
  const workspace = ensureUserWorkspace(user, options);
  const safeChat = safeSegment(chatSessionId || 'default', '非法 chatSessionId');
  const safeJob = safeSegment(jobId, '非法 jobId');
  if (!/^ferro_[A-Za-z0-9_-]+$/.test(safeJob)) throw validationError('非法 jobId');
  const root = path.join(workspace.root, 'ferroelectric-simulation');
  const chatDir = safeJoin(root, safeChat, '非法 chatSessionId');
  const jobDir = safeJoin(chatDir, safeJob, '非法 jobId');
  const paths = {
    jobDir,
    caseDir: jobDir,
    executableDir: path.join(jobDir, 'executable'),
    sourceDir: path.join(jobDir, 'source'),
    materialsDir: path.join(jobDir, 'materials'),
    outputsDir: path.join(jobDir, 'outputs'),
    visualizationsDir: path.join(jobDir, 'visualizations'),
    logsDir: path.join(jobDir, 'logs'),
    inputPath: path.join(jobDir, 'input.in'),
    resultPath: path.join(jobDir, 'result.json'),
    resultIndexPath: path.join(jobDir, 'result-index.json'),
    manifestPath: path.join(jobDir, 'manifest.json'),
    requestPath: path.join(jobDir, 'request.json'),
  };
  for (const dir of [jobDir, paths.executableDir, paths.sourceDir, paths.materialsDir, paths.outputsDir, paths.visualizationsDir, paths.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

function writeFerroJobManifest(user, chatSessionId, jobId, manifest, options = {}) {
  const paths = createFerroJobWorkspace(user, chatSessionId, jobId, options);
  writeJson(paths.manifestPath, { ...manifest, userKey: getUserKey(user), chatSessionId, jobId });
  return paths.manifestPath;
}

function writeFerroMaterialSnapshot(user, chatSessionId, jobId, snapshot, options = {}) {
  const paths = createFerroJobWorkspace(user, chatSessionId, jobId, options);
  writeJson(path.join(paths.materialsDir, 'material_snapshot.json'), snapshot || {});
  if (snapshot && snapshot.landau) writeJson(path.join(paths.materialsDir, 'landau_coefficients_snapshot.json'), snapshot.landau);
  if (snapshot && snapshot.cardVariant) writeJson(path.join(paths.materialsDir, 'card_variant_snapshot.json'), snapshot.cardVariant);
  return path.join(paths.materialsDir, 'material_snapshot.json');
}

function writeFerroResultJson(user, chatSessionId, jobId, ferroResult, options = {}) {
  const paths = createFerroJobWorkspace(user, chatSessionId, jobId, options);
  writeJson(paths.resultPath, ferroResult || {});
  return paths.resultPath;
}

function findFerroJobByIdForUser(user, jobId, options = {}) {
  const workspace = ensureUserWorkspace(user, options);
  const safeJob = safeSegment(jobId, '非法 jobId');
  const root = path.join(workspace.root, 'ferroelectric-simulation');
  if (!fs.existsSync(root)) return null;
  for (const chatId of fs.readdirSync(root)) {
    const candidate = path.join(root, chatId, safeJob);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

function assertJobBelongsToUser(user, jobId, options = {}) {
  const jobDir = findFerroJobByIdForUser(user, jobId, options);
  if (!jobDir) throw validationError('铁电计算任务不存在', 404);
  return jobDir;
}

function resolveFerroAssetPath(user, jobId, filename, options = {}) {
  const jobDir = assertJobBelongsToUser(user, jobId, options);
  if (!/^(Polar\.\d{7}(_[A-Za-z0-9_-]+)?\.dat|Polar\.\d{7}_[A-Za-z0-9_-]+\.png|polar_angle_legend\.png|polar_variant_111_legend\.png|[A-Za-z0-9_.-]+\.(json|txt|log))$/.test(filename || '')) {
    throw validationError('非法文件名');
  }
  const locations = [
    path.join(jobDir, 'visualizations', filename),
    path.join(jobDir, 'outputs', filename),
    path.join(jobDir, 'logs', filename),
    path.join(jobDir, filename),
  ];
  const root = fs.realpathSync(jobDir);
  for (const candidate of locations) {
    if (!fs.existsSync(candidate)) continue;
    const real = fs.realpathSync(candidate);
    if (real === root || real.startsWith(root + path.sep)) return real;
  }
  throw validationError('文件不存在', 404);
}

function safeSegment(value, message) {
  const text = String(value || '').trim();
  if (!text || text === '.' || text === '..' || /[\\/]/.test(text) || text.includes('..')) throw validationError(message);
  if (!/^[A-Za-z0-9_.:-]+$/.test(text)) throw validationError(message);
  return text;
}

function safeJoin(root, segment, message) {
  const base = path.resolve(root);
  const target = path.resolve(base, safeSegment(segment, message));
  if (!target.startsWith(base + path.sep) && target !== base) throw validationError(message);
  return target;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  DEFAULT_USER_DATA_ROOT,
  getUserKey,
  getUserWorkspaceRoot,
  ensureUserWorkspace,
  getChatHistoryDir,
  appendChatHistoryMirror,
  writeChatSnapshot,
  createFerroJobWorkspace,
  writeFerroJobManifest,
  writeFerroMaterialSnapshot,
  writeFerroResultJson,
  resolveFerroAssetPath,
  findFerroJobByIdForUser,
  assertJobBelongsToUser,
};
