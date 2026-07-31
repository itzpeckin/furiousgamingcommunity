# Franchise HQ v5.4.5 — LD-005 Explicit Startup Mode

**Release date:** July 30, 2026  
**Status:** Ready for validation

## What changed

Franchise HQ now starts in **Empty mode** whenever the browser does not have a valid, deliberately selected League Data mode.

Startup behavior:

- Saved `empty` restores Empty mode.
- Saved `demo` restores Development Data mode.
- Saved `live` restores Live mode, subject to a valid live snapshot being available.
- Missing values start in Empty mode.
- Invalid values start in Empty mode.
- Legacy saved `auto` values start in Empty mode.

The internal `auto` capability remains available for compatibility, but it is no longer accepted as a startup preference.

## Why this matters

Development records may exist in the application for testing, but their existence must never cause them to appear automatically. A commissioner must deliberately select Development Data before sample league records can become active.

## Included cosmetic refinement

The previously validated banner contrast refinement remains part of the v5.4.5 release baseline. This package changes only the League Data startup behavior and release documentation.

## Files in this upload

- `league-engine/data-state.js`
- `VERSION-5.4.5.md`
- `VALIDATION-5.4.5.md`

## Corrected release package

The corrected package also includes `app.js`. This restores the declared `renderGlobalLeagueDataBanner()` function required by the League Data subscription callback. No banner design changes are introduced by this correction.


## Scope Hotfix
Corrected the global League Data banner event listener so it calls the renderer through the exported `window.FGC_APP` API instead of referencing an IIFE-scoped function from global scope.
