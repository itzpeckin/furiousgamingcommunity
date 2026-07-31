# Validation — Franchise HQ v5.4.6 / LD-006

## Upload
Upload `index.html`, `league-engine/data-state.js`, `VERSION-5.4.6.md`, and `VALIDATION-5.4.6.md` to their matching repository locations.

## Required validation
1. Confirm the displayed release is `v5.4.6 · LD-006 Persistent Data-Source Selection`.
2. Select Empty, refresh, and confirm Empty remains selected.
3. Select Development Data, refresh, and confirm Development Data remains selected.
4. Confirm the approved Development and Empty banner designs remain unchanged.
5. Inspect `FranchiseHQ.leagueData.status().persistence` in the console.
6. Confirm the storage key is `league.data.mode`.
7. Test an invalid stored value and confirm startup safely resolves to Empty.
8. Test a legacy `fgc-league-data-mode` value and confirm it is restored and migrated.
9. Confirm internal Auto mode is not saved as a commissioner preference.
10. Confirm no red JavaScript errors appear.
