# PF Assistant Cleanup Audit

Date: 2026-06-02
Project: PFM2 WebUI / PFM Team Assistant

## Purpose

This audit records cleanup decisions for `pf_assistant/`, especially files that look like residue or have already been removed. It should be updated before or immediately after future cleanup so deleted resources are not mistaken for accidental loss.

## Confirmed Unused Nanobot Brand Assets

The user confirmed these legacy Nanobot brand bitmap assets were intentionally deleted because they are not used:

| Removed asset | Previous location | Status |
|---|---|---|
| `nanobot_apple_touch.png` | `pf_assistant/nanobot/web/dist/brand/` | confirmed unused by user |
| `nanobot_favicon_32.png` | `pf_assistant/nanobot/web/dist/brand/` | confirmed unused by user |
| `nanobot_icon.png` | `pf_assistant/nanobot/web/dist/brand/` | confirmed unused by user |
| `nanobot_logo.png` | `pf_assistant/nanobot/web/dist/brand/` | confirmed unused by user |
| `nanobot_logo.webp` | `pf_assistant/nanobot/web/dist/brand/` | confirmed unused by user |

## Reference Check

Search performed for the removed asset names and `brand/` references across project code/docs/tests/worklog.

Result:

- No references to the removed `nanobot_*` bitmap assets were found.
- `pf_assistant/nanobot/web/dist/index.html` currently references `/brand/research_assistant_icon.svg` for favicon/apple-touch icon.
- `pf_assistant/nanobot/web/dist/brand/research_assistant_icon.svg` remains present.

## Current Brand Asset Kept

| Kept asset | Reason |
|---|---|
| `research_assistant_icon.svg` | Referenced by `pf_assistant/nanobot/web/dist/index.html`. |

## Cleanup Rule

Do not restore the removed `nanobot_*` bitmap assets unless a future source file explicitly references them again or the user asks for those legacy brand assets to return.

## Next Audit Targets

- Check whether generated runtime state such as `data/`, `logs/`, and `start.env` is correctly ignored and excluded from commits.
- Check whether compatibility facade callers can gradually migrate to `src/` imports.
- Review bundled `nanobot/` static assets only with reference checks; avoid deleting assets by appearance alone.
