# Round 2 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

This round added **real email notifications for new user registrations** to the
PF Assistant backend:

1. Installed `nodemailer` and enabled real SMTP delivery (QQ Mailbox).
2. Rewrote `mailer.js` to support **multiple admin recipients**, send both
   **HTML and text** versions of the notification, and include all 11
   required fields.
3. Tightened the `PUBLIC_ORIGIN` environment variable semantics in
   `auth.js` so the password-reset URL no longer produces duplicated
   `/app/app/`.
4. Added a `start.sh` startup script and a `start.env` / `start.env.example`
   pair so SMTP credentials, admin recipients, and the public origin are
   managed declaratively.
5. Verified that registration still succeeds (status `active`) even when
   the SMTP send fails.

This change **does not** introduce email verification, admin review, or
account activation. The flow remains "register and use" — the email is a
**fire-and-forget notification** to admins.

## 1. Email Notification Requirements

When a new user registers successfully, an email must be sent to a fixed list
of admin recipients containing:

| # | Field            | Source                                  |
|---|------------------|------------------------------------------|
| 1 | 单位名称         | `institution_name`                       |
| 2 | 单位类型         | `institution_type`                       |
| 3 | 联系人姓名       | `contact_name`                           |
| 4 | 邮箱             | `email`                                  |
| 5 | 邮箱域名         | `email_domain`                           |
| 6 | 邮箱域名分类     | `email_domain_category`                  |
| 7 | 身份 / 角色      | `role`                                   |
| 8 | 使用目的         | `intended_use`                           |
| 9 | 备注             | `notes` (optional)                       |
| 10 | 注册时间        | `created_at`                             |
| 11 | 系统地址        | `PUBLIC_ORIGIN`                          |

The email subject is `新用户注册通知 - PF Assistant`.

Hard rules:

- **Non-blocking**: send failure must not affect registration.
- **No SMTP_PASS** in code, frontend, or logs.
- **Multiple recipients** via comma-separated `ADMIN_NOTIFY_EMAIL`.
- **SMTP_USER** is a single sender mailbox (not the recipient list).
- **HTTP-safe cookies**: do not force `NODE_ENV=production` while the site
  is served over plain HTTP.

## 2. Files Modified

### `pf_assistant/package.json`
- Added `nodemailer@^8.0.10` to dependencies.
- `npm install nodemailer` was run inside `pf_assistant/`.

### `pf_assistant/mailer.js` (rewritten)
Key additions:

- `parseAdminRecipients(raw)` — splits a comma-separated string, trims,
  filters empties.
- `sanitizeRecipients(list)` — keeps only valid emails (regex) and dedupes.
- `adminRecipients` cached at `init()` time.
- `formatNewUserText(user, publicOrigin)` — 11-field plain-text body.
- `formatNewUserHtml(user, publicOrigin)` — 11-field HTML body inside a
  styled `<table>`, with proper HTML escaping on all user-supplied values.
- `sendNewUserNotification(user)` — sends to all admin recipients via
  `to: adminRecipients.join(', ')`, with `text` + `html` parts.
- `SMTP_SECURE` is parsed as a string, not used as a raw boolean.
- All errors are caught inside the function; the function never throws
  out, so the existing `try/catch` boundary in `auth.js` is still correct.

### `pf_assistant/auth.js` (minimal change)
Changed `PUBLIC_ORIGIN` from "base host" to "full app URL":

```javascript
// Old:
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || 'http://47.93.53.231:3000').replace(/\/+$/, '');
const resetUrl = `${PUBLIC_ORIGIN}/app/?reset=${encodeURIComponent(token)}`;
// → with PUBLIC_ORIGIN=http://host:port/app this produced /app/app/

// New:
const PUBLIC_ORIGIN_RAW = (process.env.PUBLIC_ORIGIN || 'http://47.93.53.231:3000/app').replace(/\/+$/, '');
const PUBLIC_ORIGIN = PUBLIC_ORIGIN_RAW.endsWith('/app')
  ? PUBLIC_ORIGIN_RAW
  : `${PUBLIC_ORIGIN_RAW}/app`;
const resetUrl = `${PUBLIC_ORIGIN}/?reset=${encodeURIComponent(token)}`;
```

This makes the env value match the public site origin exactly (e.g.
`http://47.93.53.231:3000/app`) and the reset URL no longer has a
duplicated `/app/`.

## 3. Files Created

### `pf_assistant/start.sh` (executable)
Loads env vars from `start.env` and starts `node serve.js`:

- Sets safe defaults for `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `PUBLIC_ORIGIN`.
- Comments out `NODE_ENV=production` with a note explaining why.
- Logs non-sensitive config (e.g. `SMTP_PASS=<set, length=16>`) so the
  password value is never echoed.

Usage:

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant
./start.sh
```

### `pf_assistant/start.env` (chmod 600, gitignored)
Holds the real credentials. Currently contains:

```text
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=1552403457@qq.com
SMTP_PASS=<QQ SMTP authorization code>
SMTP_FROM=1552403457@qq.com
ADMIN_NOTIFY_EMAIL=1552403457@qq.com,784240290@qq.com,18835389791@163.com,654083218@qq.com
PUBLIC_ORIGIN=http://47.93.53.231:3000/app
```

This file is matched by the existing `.gitignore` rule `.env.*`, so it
is **not** committed to the repo.

### `pf_assistant/start.env.example` (trackable)
Same shape as `start.env` but with `SMTP_PASS=` empty. Provides a
ready-to-copy template for new environments. The `!.env.example` rule in
`.gitignore` keeps it tracked.

## 4. How to Add or Modify Notification Recipients

There are two supported ways.

### Option A — Edit `start.env` (recommended for runtime changes)

1. Open `/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/start.env`.
2. Edit the `ADMIN_NOTIFY_EMAIL=` line. Format:
   - Comma-separated.
   - Spaces around commas are allowed (auto-trimmed).
   - Empty entries are dropped.
   - Invalid emails are filtered out.
   - Duplicates are removed.

   ```text
   ADMIN_NOTIFY_EMAIL=alice@example.com,bob@example.com,carol@example.com
   ```

3. Restart the server:

   ```bash
   pkill -f "node.*serve\.js"
   cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant
   ./start.sh
   ```

4. Confirm in the log:

   ```text
   [mail] Admin notification recipients (N): a@x.com, b@x.com, c@x.com
   ```

   Where `N` matches the number of distinct valid addresses.

### Option B — Inline export (one-off, not persistent)

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant

export SMTP_HOST=smtp.qq.com
export SMTP_PORT=465
export SMTP_SECURE=true
export SMTP_USER=1552403457@qq.com
export SMTP_PASS=<QQ authorization code>
export SMTP_FROM=1552403457@qq.com
export ADMIN_NOTIFY_EMAIL="1552403457@qq.com,784240290@qq.com,18835389791@163.com,654083218@qq.com"
export PUBLIC_ORIGIN=http://47.93.53.231:3000/app

node serve.js
```

Note: this is **not** persistent across shell restarts. For long-running
servers use `start.env` (Option A) or convert it into a systemd unit
file (see "Follow-up" below).

### Verifying the recipient list at runtime

The startup log always shows the parsed recipient list:

```text
[mail] Admin notification recipients (4): 1552403457@qq.com, 784240290@qq.com, 18835389791@163.com, 654083218@qq.com
```

If the count or the addresses look wrong, double-check the
`ADMIN_NOTIFY_EMAIL` value (typos, missing `@`, missing `.`).

## 5. How the Email Is Built (mailer.js internals)

```javascript
// 1. Parse once at init()
adminRecipients = sanitizeRecipients(parseAdminRecipients(process.env.ADMIN_NOTIFY_EMAIL));

// 2. Build both parts
const text = formatNewUserText(user, publicOrigin);   // 11 fields
const html = formatNewUserHtml(user, publicOrigin);   // 11 fields in <table>

// 3. Send
await transporter.sendMail({
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
  to:   adminRecipients.join(', '),   // nodemailer accepts comma-separated
  subject: '新用户注册通知 - PF Assistant',
  text,
  html,
});
```

User-supplied strings are HTML-escaped (`escapeHtml`) before being put
into the HTML body.

The sending call sits inside a `try/catch`. On failure, only the error
**message** is logged (never the SMTP credentials), and the body is
echoed to the server log as a fallback. The function returns
`{ sent: false, reason: 'send-failed', error, logged: true, recipients }`
without throwing.

`auth.js` calls it with `.catch()` and only logs a warning — registration
always completes regardless of the result.

## 6. Verification

### Syntax

```bash
cd /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant
node -c mailer.js && node -c auth.js && node -c serve.js
# All files OK
```

### Startup log (real run)

```text
[start] PUBLIC_ORIGIN=http://47.93.53.231:3000/app
[start] SMTP_HOST=smtp.qq.com PORT=465 SECURE=true
[start] SMTP_USER=1552403457@qq.com
[start] SMTP_PASS=<set, length=16>
[start] ADMIN_NOTIFY_EMAIL=1552403457@qq.com,784240290@qq.com,18835389791@163.com,654083218@qq.com
[db] Database initialized at: .../data/app.db
[mail] Admin notification recipients (4): 1552403457@qq.com, 784240290@qq.com, 18835389791@163.com, 654083218@qq.com
[identity] Loaded device identity: 3895db502f7fc204ac839227be2e6ce8a12985d744bc9221dfbd003ddfa629cc
✅ PF_assistant WebUI: http://47.93.53.231:3000/app
[mail] SMTP ready: smtp.qq.com:465 (secure=true)
[mail] Admin notification sent to 4 recipient(s): 1552403457@qq.com, 784240290@qq.com, 18835389791@163.com, 654083218@qq.com
```

### Register → login → /me roundtrip

```text
Register result: status=active email=login.test.<ts>@bit.edu.cn
Login result:    status=active redirectTo=/app/
Me endpoint:     email=login.test.<ts>@bit.edu.cn status=active
```

### Cookie header (HTTP-safe, no Secure flag)

```text
Set-Cookie: session_token=<...>; Path=/; HttpOnly; Max-Age=604800; SameSite=Strict
```

No `Secure` flag → works on `http://`. Secure cookies would only be
added when `NODE_ENV=production`, which is intentionally not set.

### SMTP failure does not block registration

Tested by replacing `SMTP_PASS` with `WRONG_AUTH_CODE_XYZ` and
restarting the server. A new registration was issued:

```text
Register with bad SMTP result:
  success=True status=active
```

The user was created in the DB with `status=active`. The mailer logged
a warning, fell back to console output of the email body, and the
client still received a successful registration response.

## 7. Multi-recipient parsing edge cases

```text
Input:    "  a@x.com,, b@x.com ,c@x.com,invalid_email,"
After parse + sanitize:
  ['a@x.com', 'b@x.com', 'c@x.com']
```

- Empty entries dropped.
- Whitespace trimmed.
- Invalid emails removed by regex.
- Duplicates removed via `Set`.

## 8. Current Runtime State

- Process: `node serve.js`, PID 675283, user `admin`, listening on
  `0.0.0.0:3000`.
- Config: `start.env` (chmod 600, gitignored).
- SMTP: verified working with QQ Mailbox at `smtp.qq.com:465` (TLS).
- Recipients: 4 admin addresses currently active.

## 9. Important Follow-up

- **Persistent service**: the server is currently started as a detached
  background process. It will not auto-restart on reboot. Consider
  converting `start.sh` + `start.env` into a systemd unit with
  `EnvironmentFile=` and `Restart=always`. (Carried over from Round 1
  follow-up.)
- **HTTPS migration**: when a TLS-terminating domain is added, set
  `NODE_ENV=production` so cookies are issued with `Secure`. Until
  then, leaving it unset keeps the site working over plain HTTP.
- **Secret rotation**: if `SMTP_PASS` is ever exposed, regenerate the
  QQ authorization code in the QQ Mailbox web UI and update `start.env`.
- **Recipient list**: managed entirely through the `ADMIN_NOTIFY_EMAIL`
  env var. No code change needed when admins join or leave — only
  restart the server.

## 10. Directly Relevant Files

- `pf_assistant/package.json`
- `pf_assistant/mailer.js`
- `pf_assistant/auth.js`
- `pf_assistant/serve.js` (unchanged, but now sourced via `start.sh`)
- `pf_assistant/start.sh`
- `pf_assistant/start.env`
- `pf_assistant/start.env.example`
- `worklog/round2_modify.md`
