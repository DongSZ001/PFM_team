'use strict';

const SECRET_KEY_RE = /(?:api[_-]?key|access[_-]?key|token|secret|password|authorization|credential|cookie|minimax)/i;
const INTERNAL_KEY_RE = /(?:systemPrompt|developerPrompt|workspace|user\.md|debug|internal|rawProfile|profileDump|configDump)/i;
const INTERNAL_FILE_RE = /\b(?:USER\.md|\.env(?:\.[\w-]+)?|start\.env)\b/g;

function looksLikeOpaqueSecret(value) {
  const text = String(value || '');
  if (text.length < 32) return false;
  if (/^[a-f0-9]{32,}$/i.test(text)) return true;
  if (/^[A-Za-z0-9_-]{32,}$/.test(text) && /[A-Z]/.test(text) && /[a-z]/.test(text) && /\d/.test(text)) return true;
  if (/^[A-Za-z0-9._~+/=-]{48,}$/.test(text)) return true;
  return false;
}

function redactSecrets(input) {
  if (input === null || input === undefined) return input;
  let text = String(input);
  text = text.replace(INTERNAL_FILE_RE, '[REDACTED_INTERNAL_FILE]');
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED_SECRET]');
  text = text.replace(
    /\b((?:api[_-]?key|access[_-]?key|token|secret|password|authorization|credential|minimax(?:[_\s-]?api)?(?:[_\s-]?key)?)\s*[:=]\s*["']?)([A-Za-z0-9._~+/=-]{6,})(["']?)/gi,
    '$1[REDACTED_SECRET]$3'
  );
  text = text.replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, '[REDACTED_SECRET]');
  text = text.replace(/\b[A-Za-z0-9._~+/=-]{48,}\b/g, (match) => (
    looksLikeOpaqueSecret(match) ? '[REDACTED_SECRET]' : match
  ));
  return text;
}

function redactObjectDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED_CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactObjectDeep(item, seen));
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = '[REDACTED_SECRET]';
      continue;
    }
    if (INTERNAL_KEY_RE.test(key)) {
      out[key] = '[REDACTED_INTERNAL]';
      continue;
    }
    out[key] = redactObjectDeep(child, seen);
  }
  return out;
}

function assertNoSecretsForClient(payload) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const redacted = redactSecrets(serialized);
  if (redacted !== serialized || SECRET_KEY_RE.test(serialized) || INTERNAL_FILE_RE.test(serialized)) {
    throw new Error('Payload contains client-visible secret or internal context');
  }
  return true;
}

module.exports = {
  redactSecrets,
  redactObjectDeep,
  assertNoSecretsForClient,
  _internal: {
    looksLikeOpaqueSecret,
  },
};
