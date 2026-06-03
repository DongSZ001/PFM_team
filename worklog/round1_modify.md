# Round 1 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

This round covered two items:

1. Updated the welcome prompt shown in the custom WebUI.
2. Diagnosed and repaired a backend crash that caused the webpage to become unavailable.

## 1. Welcome Prompt Update

### Request

Replace the old startup welcome text with:

```text
欢迎使用 PFM² 相场模拟专业助手。
请描述你的模拟需求，例如材料体系、物理过程、边界条件或希望分析的问题。我可以辅助完成铁电畴、铁磁畴、击穿与储能等领域相关的模拟设计、计算调用、结果分析与理论解释
```

### Files Modified

- `custom-webui/index.html`
  - Updated the static welcome message rendered when the page first loads.
- `custom-webui/app.js`
  - Updated `displayWelcome()` so new chats and empty sessions use the same text.

### Why Both Files Were Changed

The welcome text existed in two places:

- `index.html`: initial DOM shown on first page load.
- `app.js`: dynamic fallback inserted for new chats, empty chats, or failed message loading.

Changing only one would make the UI show inconsistent prompts.

## 2. Webpage Outage

### Symptom

The page could not be opened. The backend was no longer reliably serving port `3000`.

### Evidence

The backend log showed a Node crash:

```text
TypeError: Invalid URL
code: 'ERR_INVALID_URL'
input: '/'
base: 'http://'
```

The crash was also reproduced while requesting `/app/app.js`:

```text
TypeError: Invalid URL
input: '/app/app.js'
base: 'http://'
```

### Root Cause

The backend parsed request URLs using this pattern:

```javascript
new URL(req.url, `http://${req.headers.host}`)
```

When a request arrived without a valid `Host` header, `req.headers.host` was empty or undefined. The base URL became:

```text
http://
```

That is invalid, so `new URL()` threw `ERR_INVALID_URL`. Because the exception was inside the HTTP server request handler, the Node process crashed. Once Node crashed, the WebUI stopped listening on port `3000`, so the webpage could not open.

### Fix Applied

Added a safe URL-base helper in `pf_assistant/serve.js`:

```javascript
function getRequestBase(req) {
  const host = req.headers.host || "127.0.0.1:" + STATIC_PORT;
  return "http://" + host;
}
```

Replaced unsafe URL parsing in `serve.js` with:

```javascript
new URL(req.url, getRequestBase(req))
```

Also fixed the same missing-host risk in `pf_assistant/auth.js`:

```javascript
new URL(req.url, "http://" + (req.headers.host || "127.0.0.1:3000"))
```

### Repair Note

During the first repair attempt, template-string syntax inside a Perl replacement command was interpreted incorrectly, temporarily producing a broken helper that still returned `http://`. This was corrected by using plain string concatenation.

## Verification

Syntax checks passed:

```bash
node --check pf_assistant/serve.js
node --check pf_assistant/auth.js
```

HTTP checks passed:

```bash
curl --noproxy '*' -I --max-time 5 http://127.0.0.1:3000/app/
curl --noproxy '*' -I --max-time 5 http://47.93.53.231:3000/app/
```

Both returned `HTTP/1.1 200 OK`.

Port check confirmed Node was listening on `0.0.0.0:3000`.

## Current Runtime State

The backend is currently running as a transient systemd service:

```text
pf-assistant-webui.service
```

Status at verification time:

```text
Active: active (running)
Main PID: 672571
```

## Important Follow-up

The current service was started with `systemd-run`, so it is transient. It keeps the WebUI alive now, but it will not automatically survive a server reboot.

Recommended next step:

- Create a persistent `pf-assistant-webui.service` unit file.
- Add `Restart=always`.
- Define required environment variables explicitly.
- Run `systemctl enable pf-assistant-webui`.

## Directly Relevant Files

- `custom-webui/index.html`
- `custom-webui/app.js`
- `pf_assistant/serve.js`
- `pf_assistant/auth.js`
- `worklog/round1_modify.md`
