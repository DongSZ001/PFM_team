# Round 14 Modify Log - Frontend Directory Structure Cleanup

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Goal

Organize the frontend files under `custom-webui/` into clearer source, style, and asset directories after Round 13 split the chat renderer out of `app.js`.

This round intentionally stayed frontend-only:

- no backend API changes;
- no auth/Gateway/session changes;
- no database changes;
- no renderer behavior changes;
- only resource locations and references were updated.

## Design Plan

Target structure:

```text
custom-webui/
  index.html
  js/
    app.js
    chat-renderer.js
  css/
    styles.css
  assets/
    images/
      1.png
      2.webp
```

Reasoning:

- `js/` separates frontend logic from HTML.
- `css/` isolates styles and makes future style splitting easier.
- `assets/images/` replaces the old capitalized `Image/` folder and gives images a conventional location.
- Historical worklog files were not bulk-rewritten, so old rounds remain accurate historical records.

## Files / Paths Changed

Moved:

- `custom-webui/app.js` -> `custom-webui/js/app.js`
- `custom-webui/chat-renderer.js` -> `custom-webui/js/chat-renderer.js`
- `custom-webui/styles.css` -> `custom-webui/css/styles.css`
- `custom-webui/Image/1.png` -> `custom-webui/assets/images/1.png`
- `custom-webui/Image/2.webp` -> `custom-webui/assets/images/2.webp`

Removed:

- empty `custom-webui/Image/` directory

Updated:

- `custom-webui/index.html`
- `test/gateway-ui.test.js`
- `README.md`
- `worklog/modefiy.md`

## Main Changes

### 1. HTML Resource References

Updated `custom-webui/index.html`:

```html
<link rel="preload" as="image" href="assets/images/2.webp" type="image/webp" />
<link rel="stylesheet" href="css/styles.css?v=20260602-r14-frontend-structure" />
<script src="js/chat-renderer.js?v=20260602-r14-frontend-structure"></script>
<script src="js/app.js?v=20260602-r14-frontend-structure"></script>
```

### 2. CSS Background Image Path

Because `styles.css` moved into `custom-webui/css/`, background image URLs were updated from:

```css
url("Image/2.webp")
```

to:

```css
url("../assets/images/2.webp")
```

### 3. Test Path Updates

Updated `test/gateway-ui.test.js` to load:

- `../custom-webui/js/chat-renderer.js`
- `../custom-webui/js/app.js`
- `../custom-webui/css/styles.css`

Also updated the landing-cover test to expect `assets/images/2.webp`.

### 4. README Update

Updated README frontend structure references from flat files to:

- `custom-webui/js/app.js`
- `custom-webui/js/chat-renderer.js`
- `custom-webui/css/styles.css`
- `custom-webui/assets/images/`

## Verification

Commands run:

```bash
node --check custom-webui/js/chat-renderer.js
node --check custom-webui/js/app.js
node --check test/gateway-ui.test.js
node --test test/gateway-ui.test.js
```

Result:

- JS syntax checks passed.
- Node test suite passed: 17 tests passed, 0 failed.

Playwright resource-load check:

- `/app/css/styles.css` requested and loaded.
- `/app/js/chat-renderer.js` requested and loaded.
- `/app/js/app.js` requested and loaded.
- `/app/assets/images/2.webp` requested and loaded.
- `window.PFMChatRenderer` was available.
- Landing page remained visible for unauthenticated users.
- CSS was applied.
- Landing background referenced the new `assets/images/2.webp` path.

## Dependency Changes

No new dependencies were added.

## Risk Notes

- Historical worklog and docs may mention old paths such as `custom-webui/app.js` or `custom-webui/Image/2.webp`; those entries are historical and were intentionally not rewritten.
- Runtime depends on `index.html` paths matching the new directory structure. This is covered by tests and the Playwright resource-load check.
- Future frontend cleanup can now split `css/styles.css` and `js/app.js` further with lower confusion.

## Search Keywords

```text
frontend structure
custom-webui/js
custom-webui/css
assets/images
Image folder
app.js path
chat-renderer.js path
styles.css path
resource load
cache busting
Round 14
```
