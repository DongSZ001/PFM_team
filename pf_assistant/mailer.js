/**
 * Admin notification mailer.
 *
 * Design goals:
 *   - Never block the calling flow (registration / password reset).
 *   - Work out-of-the-box without SMTP — log to console if not configured.
 *   - Support multiple admin recipients via comma-separated ADMIN_NOTIFY_EMAIL.
 *
 * Environment variables (all optional):
 *   SMTP_HOST          e.g. smtp.qq.com
 *   SMTP_PORT          587 (default) or 465
 *   SMTP_USER          SMTP auth user (single sender mailbox)
 *   SMTP_PASS          SMTP auth password / authorization code
 *   SMTP_FROM          From address (defaults to SMTP_USER)
 *   SMTP_SECURE        "true" to use port 465 with TLS
 *   ADMIN_NOTIFY_EMAIL Comma-separated list of admin recipients
 *   PUBLIC_ORIGIN      Public site origin (used inside notification email)
 *
 * Hard rules:
 *   - SMTP_PASS is NEVER logged.
 *   - Email send failures NEVER throw out of this module.
 *   - Multiple recipients are parsed once at init() time.
 */

let transporter = null;
let nodemailerModule = null;
let initDone = false;
let adminRecipients = [];

/**
 * Parse ADMIN_NOTIFY_EMAIL into a clean array of valid email addresses.
 * Accepts: "a@x.com,b@x.com , c@x.com" → ["a@x.com", "b@x.com", "c@x.com"]
 */
function parseAdminRecipients(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeRecipients(list) {
  return Array.from(new Set(list.filter((e) => EMAIL_REGEX.test(e))));
}

function init() {
  if (initDone) return;
  initDone = true;

  // Parse admin recipients (independent of SMTP — we may want to log only).
  adminRecipients = sanitizeRecipients(parseAdminRecipients(process.env.ADMIN_NOTIFY_EMAIL));
  if (adminRecipients.length === 0) {
    console.log('[mail] ADMIN_NOTIFY_EMAIL not set or empty — new-user notifications will be logged only.');
  } else {
    console.log(`[mail] Admin notification recipients (${adminRecipients.length}): ${adminRecipients.join(', ')}`);
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user) {
    console.log('[mail] SMTP not configured — admin notifications will be logged only.');
    console.log('[mail] To enable email delivery, set SMTP_HOST / SMTP_USER / SMTP_PASS.');
    return;
  }

  try {
    // Lazy require — keep the dependency optional at the import level.
    nodemailerModule = require('nodemailer');
  } catch (err) {
    console.warn('[mail] SMTP env vars are set but nodemailer is not installed.');
    console.warn('[mail] Run `npm install nodemailer` in pf_assistant/ to enable email delivery.');
    return;
  }

  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  // SMTP_SECURE is a string env var — never use it directly as a boolean.
  // Default to "true" when port is 465 (QQ mailbox recommended), otherwise "false".
  let secure;
  if (typeof process.env.SMTP_SECURE === 'string') {
    secure = process.env.SMTP_SECURE.toLowerCase() === 'true';
  } else {
    secure = port === 465;
  }

  transporter = nodemailerModule.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  // Verify connection on startup but don't crash if it fails.
  transporter.verify().then(
    () => console.log(`[mail] SMTP ready: ${host}:${port} (secure=${secure})`),
    (err) => console.warn(`[mail] SMTP verify failed (${err.message}) — will retry on each send.`)
  );
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNewUserText(user, publicOrigin) {
  const lines = [
    '新用户注册通知 — PF Assistant',
    '',
    `单位名称:   ${user.institution_name || '(未填)'}`,
    `单位类型:   ${user.institution_type || '(未填)'}`,
    `联系人姓名: ${user.contact_name || '(未填)'}`,
    `邮箱:       ${user.email}`,
    `邮箱域名:   ${user.email_domain || '(未知)'}`,
    `邮箱域名分类: ${user.email_domain_category || 'uncertain'}`,
    `身份 / 角色: ${user.role || '(未填)'}`,
    `使用目的:   ${user.intended_use || '(未填)'}`,
  ];
  if (user.notes) lines.push(`备注:       ${user.notes}`);
  lines.push(`注册时间:   ${new Date(user.created_at).toISOString()}`);
  lines.push(`系统地址:   ${publicOrigin}`);
  return lines.join('\n');
}

function formatNewUserHtml(user, publicOrigin) {
  const row = (label, value) =>
    `<tr><td style="padding:6px 12px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(value || '(未填)')}</td></tr>`;

  const created = new Date(user.created_at).toISOString();

  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111827;max-width:640px;">',
    '<h2 style="margin:0 0 16px 0;color:#111827;">新用户注册通知</h2>',
    '<p style="margin:0 0 16px 0;color:#374151;">PF Assistant 收到一条新用户注册申请，详情如下：</p>',
    '<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">',
    row('单位名称', user.institution_name),
    row('单位类型', user.institution_type),
    row('联系人姓名', user.contact_name),
    row('邮箱', user.email),
    row('邮箱域名', user.email_domain),
    row('邮箱域名分类', user.email_domain_category),
    row('身份 / 角色', user.role),
    row('使用目的', user.intended_use),
    user.notes ? row('备注', user.notes) : '',
    row('注册时间', created),
    row('系统地址', publicOrigin),
    '</table>',
    '<p style="margin:16px 0 0 0;color:#6b7280;font-size:12px;">本邮件为系统自动通知，无需回复。注册流程为「注册即开通」，用户当前状态为 active。</p>',
    '</div>',
  ].join('');
}

function logNotificationFallback(subject, to, text) {
  console.log('─'.repeat(60));
  console.log('[mail] Admin notification (logged — SMTP not configured):');
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body:\n${text.split('\n').map((l) => '    ' + l).join('\n')}`);
  console.log('─'.repeat(60));
}

/**
 * Send a new-user-registration notification to all configured admin recipients.
 * ALWAYS resolves — never throws. Caller does not need to try/catch.
 */
async function sendNewUserNotification(user) {
  init();

  const publicOrigin = (process.env.PUBLIC_ORIGIN || 'http://47.93.53.231:3000').replace(/\/+$/, '');
  const subject = '新用户注册通知 - PF Assistant';
  const text = formatNewUserText(user, publicOrigin);
  const html = formatNewUserHtml(user, publicOrigin);

  if (adminRecipients.length === 0) {
    console.log('[mail] ADMIN_NOTIFY_EMAIL not set — skipping new-user notification.');
    return { sent: false, reason: 'no-admin-email' };
  }

  if (!transporter) {
    // No SMTP — log so admin can see registrations even without email.
    logNotificationFallback(subject, adminRecipients.join(', '), text);
    return { sent: false, reason: 'smtp-not-configured', logged: true, recipients: adminRecipients };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: adminRecipients.join(', '),
      subject,
      text,
      html,
    });
    console.log(`[mail] Admin notification sent to ${adminRecipients.length} recipient(s): ${adminRecipients.join(', ')}`);
    return { sent: true, recipients: adminRecipients };
  } catch (err) {
    // NEVER let the caller see this — registration must not be affected.
    // Don't print the underlying error to avoid leaking SMTP_PASS in error messages.
    console.warn(`[mail] Failed to send admin notification: ${err.message}`);
    console.warn(`[mail] Registration NOT affected. Falling back to log:`);
    console.log(text);
    return { sent: false, reason: 'send-failed', error: err.message, logged: true, recipients: adminRecipients };
  }
}

/**
 * Send a password-reset link to the user.
 * If SMTP is not configured, the link is logged to console.
 */
async function sendPasswordResetEmail(user, resetUrl) {
  init();

  const subject = '[PFM2 WebUI] 密码重置';
  const text = [
    `${user.contact_name || user.email} 您好，`,
    '',
    '我们收到了您的密码重置请求。',
    '请点击下面的链接重置密码（1 小时内有效）：',
    '',
    resetUrl,
    '',
    '如果您没有请求重置密码，请忽略本邮件，您的账号仍然安全。',
  ].join('\n');

  if (!transporter) {
    console.log('─'.repeat(60));
    console.log('[mail] Password reset link (logged — SMTP not configured):');
    console.log(`  To:      ${user.email}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Link:    ${resetUrl}`);
    console.log('─'.repeat(60));
    return { sent: false, reason: 'smtp-not-configured', logged: true, resetUrl };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject,
      text,
    });
    console.log(`[mail] Password reset email sent to ${user.email}`);
    return { sent: true };
  } catch (err) {
    console.warn(`[mail] Failed to send reset email: ${err.message}`);
    console.warn(`[mail] Reset link: ${resetUrl}`);
    return { sent: false, reason: 'send-failed', error: err.message, logged: true, resetUrl };
  }
}

module.exports = {
  init,
  sendNewUserNotification,
  sendPasswordResetEmail,
  // exposed for tests / debugging
  _internal: {
    parseAdminRecipients,
    sanitizeRecipients,
    getAdminRecipients: () => [...adminRecipients],
  },
};
