# Round 9 Modification Log

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Summary

This round redesigned the unauthenticated entry experience from a default
centered login modal into a full-screen technology-style landing cover.

The existing login, registration, authentication APIs, chat UI, Gateway flow,
and post-login application entry were preserved.

Key outcomes:

- Added a full-screen hero landing page for unauthenticated users.
- Used local background image `custom-webui/Image/2.webp`.
- Kept text, logo, buttons, tags, and capability cards as frontend-rendered UI,
  not baked into the image.
- Added top navigation with login/register entry points.
- Changed unauthenticated default behavior so the login modal is not shown until
  the user clicks a login/register action.
- Kept reset-password URL behavior: `?reset=...` still opens the reset modal.
- Added responsive desktop/mobile CSS.
- Added `.webp` MIME support in `serve.js`.
- Added tests for landing cover presence and unauthenticated behavior.

## 1. User Request

The user requested replacing the current direct login modal / gray overlay entry
with a high-end science/technology cover page.

Required content included:

- Brand: `PFM² 相场模拟助手`
- Hero title: `PFM² 相场模拟助手`
- Tagline: `面向复杂材料体系的智能模拟与分析平台`
- Description about physical modeling, numerical computation, and intelligent
  analysis.
- Primary CTA: `登录使用`
- Secondary CTA: `创建账号`
- Tags: `Phase-field`, `Simulation`, `Materials`, `Analysis`
- Four capability cards: 高效计算、精准建模、智能分析、可靠复现

## 2. Files Changed

### `custom-webui/index.html`

Added:

- `landingPage` full-screen cover section.
- Top navigation.
- Brand / logo mark.
- Login and register entry buttons.
- Hero copy and CTA buttons.
- Ability tags.
- Bottom capability cards.
- Preload link for `Image/2.webp`.

Changed:

- `#app` is hidden by default while unauthenticated.
- `#authModal` is hidden by default.
- `app.js` version query updated to `v=20260602-r9-landing-cover`.

### `custom-webui/app.js`

Added:

- Landing DOM references.
- Login/register button handlers for the landing page.
- `getUnauthenticatedLandingAction(search)`.
- `showLandingPage()`.
- `openAuthModal(step)`.

Behavior changes:

- Unauthenticated users now see the landing page instead of the login modal.
- Clicking `登录` or `登录使用` opens the existing login panel.
- Clicking `注册` or `创建账号` opens the existing registration panel.
- Login success still calls `enterApp()` and enters the original chat app.
- Logout now returns to the landing page instead of immediately reopening the
  login modal.
- Password reset links still open the reset modal.

### `custom-webui/styles.css`

Added a new landing-cover design system:

- Full viewport hero layout.
- Local WebP background with layered readability gradients.
- Dark blue / blue-purple neon palette.
- Glassmorphism navigation, tags, CTA, and capability cards.
- Responsive behavior for desktop and mobile.
- Reduced menu density on mobile.

Also restyled auth modal to dark glass style so it visually belongs with the new
cover while preserving existing forms.

### `pf_assistant/serve.js`

Added MIME type:

```js
'.webp': 'image/webp'
```

This makes `/app/Image/2.webp` serve with the correct content type.

### `test/gateway-ui.test.js`

Added tests:

- `custom UI renders landing cover and keeps auth modal hidden by default`
- `custom UI unauthenticated landing action shows cover instead of modal`

## 3. Verification

### Tests and syntax

```bash
node --check pf_assistant/serve.js
node --check custom-webui/app.js
node --test test/gateway-ui.test.js
```

Result:

```text
1..8
# tests 8
# pass 8
# fail 0
```

### Runtime checks

Service was restarted:

```bash
systemctl restart pf-assistant-webui.service
```

Homepage check:

```bash
curl --noproxy '*' --max-time 5 -sS http://127.0.0.1:3000/app/ | rg -n "landingPage|authModal|app.js|Image/2.webp"
```

Important result:

```text
<link rel="preload" as="image" href="Image/2.webp" type="image/webp" />
<section class="landing-page" id="landingPage" aria-labelledby="landingTitle">
<div class="modal" id="authModal" style="display:none">
<script src="app.js?v=20260602-r9-landing-cover"></script>
```

Background image check:

```bash
curl --noproxy '*' --max-time 5 -I http://127.0.0.1:3000/app/Image/2.webp
```

Important result:

```text
HTTP/1.1 200 OK
Content-Type: image/webp
```

Smoke check:

```bash
node pf_assistant/scripts/smoke-check-webui.js --skip-chat
```

Result included:

```json
{
  "ok": true,
  "health": { "ok": true },
  "gateway": { "reachable": true, "status": "reachable" },
  "websocket": {
    "helloOk": true,
    "sessionKey": "agent:main:dashboard:<uuid>",
    "chatAccepted": false
  }
}
```

## 4. Visual Verification Note

Automated screenshot verification was attempted, but Playwright is not installed
in the current environment. Verification was completed through static structure,
CSS/resource checks, HTTP checks, and regression tests.

Manual browser review is still recommended for final visual polish across:

- 1920 x 1080
- 1536 x 864
- 1440 x 900
- 1366 x 768
- mobile widths below 768px

## 6. Follow-up Visual Check

After Playwright was installed, the landing page was checked at:

- 1366 x 768
- 1536 x 864
- 1920 x 1080
- 390 x 844

A real issue was found at 1366 x 768: the hero copy overlapped with the bottom
capability card panel. The low-height desktop media query was adjusted to reduce
hero typography, vertical spacing, CTA height, and capability-card padding for
viewports below 820px height.

Follow-up verification showed:

```text
1366x768   heroCardsOverlap=false, overflowX=false
1536x864   heroCardsOverlap=false, overflowX=false
1920x1080  heroCardsOverlap=false, overflowX=false
390x844    heroCardsOverlap=false, overflowX=false
```

The login/register cover buttons were also checked with Playwright and opened
expected existing auth modal steps.

## 5. Directly Relevant Files

- `custom-webui/index.html`
- `custom-webui/styles.css`
- `custom-webui/app.js`
- `custom-webui/Image/2.webp`
- `pf_assistant/serve.js`
- `test/gateway-ui.test.js`
- `worklog/round9_modify.md`
- `worklog/modefiy.md`
