const assert = require('node:assert/strict');
const test = require('node:test');

const {
  redactSecrets,
  redactObjectDeep,
  assertNoSecretsForClient,
} = require('../pf_assistant/src/security/redactor');
const {
  isIdentityQuestion,
  buildIdentityResponse,
  toSafeProfile,
} = require('../pf_assistant/src/security/persona');

test('redactor removes secret-looking values from text and objects', () => {
  const text = 'minimax api_key=abc123456789 token: shhhhhhh123456789 USER.md Bearer abcdefghijklmnop';
  const redacted = redactSecrets(text);

  assert.match(redacted, /\[REDACTED_SECRET\]/);
  assert.match(redacted, /\[REDACTED_INTERNAL_FILE\]/);
  assert.doesNotMatch(redacted, /abcdefghijklmnop/);

  const obj = redactObjectDeep({
    content: 'see USER.md',
    metadata: {
      minimaxToken: 'secret-token-value',
      systemPrompt: 'developer only',
      nested: { apiKey: 'abc1234567890' },
    },
  });

  assert.equal(obj.content, 'see [REDACTED_INTERNAL_FILE]');
  assert.equal(obj.metadata.minimaxToken, '[REDACTED_SECRET]');
  assert.equal(obj.metadata.systemPrompt, '[REDACTED_INTERNAL]');
  assert.equal(obj.metadata.nested.apiKey, '[REDACTED_SECRET]');
});

test('assertNoSecretsForClient rejects unsafe payloads', () => {
  assert.throws(() => assertNoSecretsForClient({ apiKey: 'abc1234567890' }), /secret/i);
  assert.equal(assertNoSecretsForClient({ content: '铁电模拟完成' }), true);
});

test('identity persona never exposes raw user profile fields', () => {
  assert.equal(isIdentityQuestion('我是谁'), true);
  assert.equal(isIdentityQuestion('who am I?'), true);
  assert.equal(isIdentityQuestion('模拟铁电畴'), false);

  const safeProfile = toSafeProfile({
    contact_name: '张三',
    institution_name: 'Secret Lab',
    email: 'secret@example.edu',
  });
  assert.deepEqual(Object.keys(safeProfile).sort(), ['displayName', 'persona']);

  const answer = buildIdentityResponse(safeProfile);
  assert.match(answer, /PFM² 相场模拟专业助手/);
  assert.match(answer, /张三/);
  assert.doesNotMatch(answer, /Secret Lab|secret@example/);
});
