# Franchise HQ v5.4.6 — LD-006 Persistent Data-Source Selection

## Release objective
Persist the commissioner-selected League Data mode through the Franchise HQ platform storage layer.

## What changed
- Introduced the platform storage key `league.data.mode`.
- Supported persisted values are limited to `empty`, `demo`, and `live`.
- Restores a valid saved selection during application startup.
- Migrates a valid legacy `fgc-league-data-mode` value into the platform storage service.
- Invalid, missing, corrupted, or unavailable storage resolves safely to Empty mode.
- Internal `auto` mode remains supported for compatibility but is not persisted.
- Added persistence information to `FranchiseHQ.leagueData.status()` and `diagnostics()`.
- Updated browser cache versions and visible release metadata to v5.4.6.

## Why this matters
The commissioner should not have to select the same data source every time the page reloads. At the same time, Franchise HQ must never guess that Development or Live data should be active. This release remembers only deliberate, valid selections and preserves Empty as the safe fallback.

## Files changed
- `league-engine/data-state.js`
- `index.html`

## Documentation
- `VERSION-5.4.6.md`
- `VALIDATION-5.4.6.md`

## Non-goals
This release does not add import workflows, change the Development Data dataset, change the banner design, modify the Madden repository, or add roster functionality.
