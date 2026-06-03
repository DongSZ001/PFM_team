# Round 5 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

This round fixed a confusing WebUI / OpenClaw routing issue:

1. Messages sent from the webpage were accepted by the UI but got no useful
   reply.
2. Replies from the terminal OpenClaw TUI appeared in the webpage chat.

The fix was intentionally small and focused:

- Restore the current Gateway protocol shape for `chat.send`:
  `message` must be a string.
- Add frontend filtering so WebUI only processes events whose
  `sessionKey` matches the current WebUI-created OpenClaw session.
- Add visible Gateway error handling so failed requests stop the typing
  indicator and show an error message instead of spinning silently.
- Stop using a fixed `sessions.create` request id of `1`; track the
  actual pending request id.
- Add regression tests for the Gateway payload and session filtering.

## 1. User-Visible Problem

### Symptoms

- The top-right status showed `已连接`, so the Gateway WebSocket was open.
- The user could send a message from the page, but no assistant reply came
  back.
- Terminal-side OpenClaw / TUI replies appeared inside the webpage chat.

### Screenshot Context

The page showed assistant content that clearly came from the terminal-side
conversation, not from the WebUI user's prompt. The terminal also showed the
same assistant text, which confirmed event cross-talk between the terminal
OpenClaw session and the WebUI.

## 2. Evidence Collected

The live service log showed the direct reason for WebUI messages not getting
processed:

```text
invalid chat.send params: at /message: must be string
```

The log also showed terminal-origin events flowing through the same browser
WebSocket path:

```text
event: agent / chat
sessionKey: agent:main:doz
```

This confirmed two separate issues:

1. WebUI `chat.send` payload did not match the current Gateway schema.
2. WebUI frontend accepted global Gateway `agent` / `chat` events without
   checking whether they belonged to the current WebUI session.

## 3. Root Cause

### 3.1 Wrong `chat.send` payload

The previous test and code expected Gateway to accept:

```js
message: { content: '...' }
```

But the current live Gateway expects:

```js
message: '...'
```

Because of this mismatch, Gateway rejected WebUI sends with:

```text
invalid chat.send params: at /message: must be string
```

### 3.2 No `sessionKey` filtering in WebUI

The WebUI WebSocket currently receives raw Gateway events. It must therefore
filter incoming events. Before this round, `handleMessage()` processed any
`chat` / `agent` event regardless of `payload.sessionKey`.

Terminal TUI events use a different session key, for example:

```text
agent:main:doz
```

The WebUI-created session uses keys like:

```text
agent:main:dashboard:<uuid>
```

Without filtering, terminal replies could appear in the WebUI.

### 3.3 Request id ambiguity

`createOpenClawSession()` previously sent:

```js
id: '1'
```

and session-create response handling also looked for id `1`. This is risky
because other messages can also use generated ids. The code now tracks the
actual pending session-create request id.

## 4. Files Modified

### `custom-webui/app.js`

Key changes:

- `buildChatSendParams()` now returns:

```js
{
  sessionKey,
  message: content,
  idempotencyKey,
}
```

- Added:

```js
function isCurrentSessionPayload(payload, expectedSessionKey = currentSessionKey) {
  if (!payload || !payload.sessionKey) return true;
  return payload.sessionKey === expectedSessionKey;
}
```

- `chat` events are ignored unless their `sessionKey` matches the current
  WebUI session.
- `agent` events are ignored unless their `sessionKey` matches the current
  WebUI session.
- Generic failed Gateway responses are now surfaced to the page:

```js
if (msg.type === 'res' && msg.ok === false) {
  console.error('[ws] request failed:', msg.error);
  isAIThinking = false;
  removeTypingIndicator();
  displayMessage('错误：' + (msg.error?.message || 'Gateway 请求失败'), 'assistant');
  return;
}
```

- `sessions.create` now uses a generated id stored in
  `pendingSessionCreateId` instead of a fixed `'1'`.

### `test/gateway-ui.test.js`

Updated and expanded tests:

- Gateway credential compatibility still covered.
- `chat.send` params now assert string `message`.
- Added test for `isCurrentSessionPayload()` to verify that terminal-side
  session keys such as `agent:main:doz` are rejected when the WebUI expects
  a different session key.

### `pf_assistant/serve.js` note

An optimization attempt changed Gateway `client.id` from `openclaw-tui` to
`pf-assistant-webui`, but the live Gateway rejected that value:

```text
invalid connect params: at /client/id: must be equal to constant;
at /client/id: must match a schema in anyOf
```

That change was reverted. The WebUI currently must keep the accepted
Gateway client id until a proper Gateway client registration / adapter design
is implemented.

## 5. Verification

### Syntax Checks

```bash
node --check custom-webui/app.js
node --check pf_assistant/serve.js
```

Both passed.

### Regression Tests

```bash
node --test test/gateway-ui.test.js
```

Result:

```text
1..3
# tests 3
# pass 3
# fail 0
```

### Runtime Smoke Test

After restarting `pf-assistant-webui.service`, a local WebSocket smoke test
was run against `ws://127.0.0.1:3000/`.

Result:

```text
hello-ok received
session created
chat.send accepted
```

The service log confirmed:

```text
[ws] ✅ HELLO-OK received from Gateway, forwarding to browser
[ws] ← from Gateway: {"type":"res","id":"session-test","ok":true,...}
[ws] ← from Gateway: {"type":"res","id":"send-test","ok":true,"payload":{"status":"started"}}
```

This verifies that WebUI sends are now accepted by Gateway and no longer fail
with `message must be string`.

## 6. Current Runtime State

The WebUI was restarted and is running as:

```text
pf-assistant-webui.service
```

Status at verification time:

```text
Active: active (running)
Main PID: 698888 (node)
```

## 7. Expected User Result

After refreshing the webpage:

- WebUI messages should no longer be rejected by Gateway due to payload shape.
- Terminal TUI events with a different `sessionKey` should not appear in the
  webpage chat.
- If Gateway rejects a request, the WebUI should stop the typing indicator and
  show a visible error instead of silently spinning.

## 8. Remaining Architectural Recommendation

The current fix is a targeted frontend-side isolation fix. It is enough for the
observed issue, but the cleaner long-term architecture is:

1. Browser talks to `serve.js` using a WebUI-specific protocol.
2. `serve.js` acts as a Gateway adapter, owns `sessions.create` and
   `chat.send`.
3. `serve.js` only forwards events that match the WebUI session/run.
4. WebUI no longer receives raw global Gateway events.

This would make terminal/WebUI cross-talk much harder by design.

## 9. Directly Relevant Files

- `custom-webui/app.js`
- `test/gateway-ui.test.js`
- `pf_assistant/serve.js` (client id attempt reverted; syntax verified)
- `worklog/round5_modify.md`
