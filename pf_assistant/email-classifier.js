/**
 * Email domain classifier
 * Pure function shared by frontend (hints) and backend (enforcement).
 * Backend MUST re-validate — frontend hints are advisory only.
 */

// Personal email providers — these are NEVER accepted for registration.
const PERSONAL_DOMAINS = new Set([
  'qq.com',
  'gmail.com',
  '163.com',
  '126.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
  'foxmail.com',
  'sina.com',
  'sohu.com',
  'yeah.net',
  // Chinese mobile carriers (treat as personal)
  '139.com',
  '189.cn',
  // International freemail
  'mail.ru',
  'protonmail.com',
  'proton.me',
  'aol.com',
  'live.com',
  'me.com',
  'msn.com',
]);

// Institutional patterns — used to mark the address as clearly
// belonging to an educational / research / government institution.
const INSTITUTIONAL_PATTERNS = [
  /\.edu(\.[a-z]{2,3})?$/i,        // .edu, .edu.cn, .edu.au, .edu.hk, ...
  /\.edu$/i,                       // .edu (kept for explicit)
  /\.ac\.[a-z]{2,3}$/i,             // .ac.uk, .ac.jp, .ac.kr, ...
  /\.gov(\.[a-z]{2,3})?$/i,         // .gov, .gov.cn
  /\.go\.[a-z]{2,3}$/i,             // .go.jp (Japanese government)
  /\.hospital$/i,                   // some hospital domains
  /\.org$/i,                        // .org — many academic / institutional
];

/**
 * Classify an email address.
 * @param {string} email
 * @returns {{ domain: string, category: 'rejected'|'institutional'|'uncertain', reason?: string }}
 */
function classifyEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw || !raw.includes('@')) {
    return { domain: '', category: 'rejected', reason: '邮箱格式无效' };
  }
  const [, domain] = raw.split('@');
  if (!domain || !domain.includes('.')) {
    return { domain: '', category: 'rejected', reason: '邮箱格式无效' };
  }

  if (PERSONAL_DOMAINS.has(domain)) {
    return {
      domain,
      category: 'rejected',
      reason: '请使用单位、教育或机构邮箱注册',
    };
  }

  for (const pattern of INSTITUTIONAL_PATTERNS) {
    if (pattern.test(domain)) {
      return { domain, category: 'institutional' };
    }
  }

  // Unrecognised — allow but mark as uncertain.
  return { domain, category: 'uncertain' };
}

module.exports = { classifyEmail, PERSONAL_DOMAINS, INSTITUTIONAL_PATTERNS };
