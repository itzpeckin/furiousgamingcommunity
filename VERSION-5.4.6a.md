# Franchise HQ v5.4.6a — LD-006 Storage Resolution Hotfix

## Release objective
Correct the startup resolution order for the new League Data preference and the legacy preference.

## Problem corrected
In v5.4.6, an invalid value stored under `league.data.mode` was treated like a missing value. The application then checked the older `fgc-league-data-mode` key and could restore Development Data.

Example of the incorrect behavior:

- New key: `banana`
- Legacy key: `demo`
- Incorrect result: Development Data

## Correct behavior
The new key now has priority whenever it exists:

- Valid new value: restore it.
- Invalid new value: resolve to Empty.
- Missing new value: check the legacy key for migration.
- Missing or invalid values in both locations: resolve to Empty.

## Why this matters
A corrupted or unsupported modern preference must never reactivate sample data through an old browser preference. Empty remains the safe fallback.

## Files changed
- `league-engine/data-state.js`
- `index.html`

## Documentation
- `VERSION-5.4.6a.md`
- `VALIDATION-5.4.6a.md`
