# Franchise HQ v5.4.5 — Validation Guide

Validate LD-005 using the steps in the chat release guide.

Required outcomes:

- A browser with no saved League Data mode starts in Empty mode.
- A missing preference resolves to Empty.
- An invalid preference resolves to Empty.
- A legacy `auto` preference resolves to Empty.
- A saved `empty`, `demo`, or `live` preference is restored.
- Development data does not activate merely because a demo snapshot exists.
- The validated banner cosmetic refinement remains unchanged.
- No JavaScript console errors occur.

## Preliminary console check

Before continuing the startup-mode tests, refresh the application and confirm that the console no longer reports `renderGlobalLeagueDataBanner is not defined`.


## Scope Hotfix Check
After deployment, confirm the console no longer reports `renderGlobalLeagueDataBanner is not defined` when Development Data initializes or the League Data mode changes.
