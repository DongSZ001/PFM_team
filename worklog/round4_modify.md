# Round 4 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

This round fixed the remaining runtime issue where the custom WebUI still
showed **"未连接"** after login and the chat input could not send messages.

The earlier code-side fixes were already in place, but the running service
still had no OpenClaw Gateway token in its startup environment. The Gateway
therefore rejected every browser WebSocket connection with:

```text
unauthorized: gateway token missing
```

This round completed the runtime repair:

1. Located the local OpenClaw operator token source.
2. Wrote that token into `pf_assistant/start.env` as `OC_GATEWAY_TOKEN`
   with the value kept secret / redacted in logs and notes.
3. Restored the `PUBLIC_ORIGIN` line after the token insertion step.
4. Restarted the WebUI through a transient systemd unit using `start.sh`,
   so `start.env` is actually loaded.
5. Verified the WebSocket handshake returns `hello-ok`.

## 1. User-Visible Problem

### Symptoms

- After login, the top-right status still showed:

```text
未连接
```

- The chat input still could not send messages.

### Why Sending Was Blocked

The frontend intentionally blocks sends while `isConnected === false`.
Because the Gateway handshake never completed, `sendMessage()` returned
before sending any `chat.send` request.

## 2. Evidence Collected

The WebUI startup log showed:

```text
[gateway] Device token is not configured. Set OC_GATEWAY_TOKEN or OC_DEVICE_TOKEN before starting WebUI.
```

After a browser WebSocket connection, the log showed:

```text
[ws] Gateway connected
[ws] Got challenge, sending connect with device identity...
[ws] ← from Gateway: {"type":"res","id":"1","ok":false,"error":{"code":"INVALID_REQUEST","message":"unauthorized: gateway token missing ...
[ws] Gateway closed: 1008 ...
```

This confirmed:

- HTTP login / session cookies were not the failing layer.
- The browser-to-`serve.js` WebSocket opened.
- `serve.js` could reach OpenClaw Gateway on `127.0.0.1:18789`.
- The failure was Gateway authentication due to missing token in the
  WebUI runtime environment.

## 3. Root Cause

`pf_assistant/serve.js` now reads Gateway credentials from:

```text
OC_GATEWAY_TOKEN
OC_DEVICE_TOKEN
OC_GATEWAY_PASSWORD
```

But `pf_assistant/start.env` only had SMTP / admin notification /
`PUBLIC_ORIGIN` settings. It did not contain `OC_GATEWAY_TOKEN`.

The server therefore started correctly, but every WebSocket handshake
failed at the Gateway authentication step.

There was also an old transient systemd unit:

```text
pf-assistant-webui.service
```

Its old `ExecStart` had run `node serve.js` directly, which does not load
`start.env`. Even if `start.env` was later fixed, that old direct start
path would still miss the token.

## 4. Files / Runtime Config Modified

### `pf_assistant/start.env`

Added:

```text
OC_GATEWAY_TOKEN=<redacted>
OC_GATEWAY_PASSWORD=
```

The token was read from the local OpenClaw device auth configuration.
The plaintext token is intentionally not written in this worklog.

Also restored:

```text
PUBLIC_ORIGIN=http://47.93.53.231:3000/app
```

During the first automated insertion, `PUBLIC_ORIGIN` was accidentally
left blank. This was corrected before final startup.

### `pf_assistant/start.env.example`

Already updated in the previous step to document:

```text
OC_GATEWAY_TOKEN=
OC_GATEWAY_PASSWORD=
```

and to recommend `OC_GATEWAY_TOKEN` while keeping `OC_DEVICE_TOKEN`
compatibility.

## 5. Runtime Operations

### Found Local Token Source

Checked the local OpenClaw auth file without printing the token:

```text
/home/admin/.openclaw/identity/device-auth.json
```

Confirmed:

```text
hasTokens=true
keys=["operator"]
firstTokenLength=43
```

### Wrote Token Into `start.env`

Used a small Node script to copy the local operator token into
`pf_assistant/start.env` as `OC_GATEWAY_TOKEN`.

Console output was redacted:

```text
OC_GATEWAY_TOKEN configured in start.env (value redacted)
```

### Restarted WebUI

Stopped the old runtime process and tested `./start.sh` in the foreground.
Startup then showed:

```text
[gateway] Device token configured via OC_GATEWAY_TOKEN
```

Then recreated the transient systemd service so the WebUI is not tied to
the current shell session:

```bash
systemctl reset-failed pf-assistant-webui.service
systemd-run \
  --unit=pf-assistant-webui \
  --property=WorkingDirectory=/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant \
  /home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/start.sh
```

The service now runs `start.sh`, which loads `start.env`, instead of
running `node serve.js` directly.

## 6. Verification

### Service Status

`systemctl status pf-assistant-webui --no-pager` showed:

```text
Active: active (running)
Main PID: 693213 (node)
CGroup: /system.slice/pf-assistant-webui.service
        └─693213 node serve.js
```

Startup log included:

```text
[gateway] Device token configured via OC_GATEWAY_TOKEN
[identity] Loaded device identity: 3895db502f7fc204...
✅ PF_assistant WebUI: http://47.93.53.231:3000/app
```

### Port Check

`ss -tlnp` confirmed:

```text
0.0.0.0:3000  users:(("node",pid=693213,...))
0.0.0.0:18789 users:(("openclaw-gatewa",pid=621297,...))
```

### WebSocket Handshake

Ran a local WebSocket handshake test against the WebUI:

```bash
node -e "<ws handshake test>"
```

Result:

```text
hello-ok received
```

This verifies that:

- Browser -> WebUI WebSocket works.
- WebUI -> OpenClaw Gateway works.
- Gateway authentication now succeeds.

### Regression Tests

Re-ran the targeted regression tests:

```bash
node --test test/gateway-ui.test.js
```

Result:

```text
1..2
# tests 2
# pass 2
# fail 0
```

## 7. Current Runtime State

The WebUI is currently running as:

```text
pf-assistant-webui.service
```

This is a **transient systemd service** created by `systemd-run`.

Current service command:

```text
/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/start.sh
```

This is important because `start.sh` loads `start.env`, including
`OC_GATEWAY_TOKEN`.

## 8. Expected User Result

After refreshing the WebUI page:

- The top-right status should change from `未连接` to `已连接`.
- The send button should become available after the WebSocket handshake.
- Chat messages should no longer be blocked by the missing Gateway token.

## 9. Important Follow-up

The current service is still transient. It will continue running now, but
it will not automatically survive a server reboot.

Recommended next step:

1. Create a persistent `/etc/systemd/system/pf-assistant-webui.service`.
2. Use `WorkingDirectory=/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant`.
3. Use `ExecStart=/home/admin/.openclaw/workspace/pf-assistant-webui/pf_assistant/start.sh`.
4. Add `Restart=always`.
5. Run:

```bash
systemctl daemon-reload
systemctl enable --now pf-assistant-webui.service
```

## 10. Directly Relevant Files

- `pf_assistant/start.env`
- `pf_assistant/start.env.example`
- `pf_assistant/gateway-config.js`
- `pf_assistant/serve.js`
- `custom-webui/app.js`
- `test/gateway-ui.test.js`
- `worklog/round4_modify.md`
