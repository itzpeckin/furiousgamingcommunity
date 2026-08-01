# Franchise HQ v5.6.0b Validation

## Deployment

Upload and replace:

- `app.js`
- `styles.css`
- `index.html`
- `trade-module.js`
- `league-engine/games.js`

Add:

- `VERSION-5.6.0b.md`
- `VALIDATION-5.6.0b.md`

Hard refresh after Cloudflare Pages deploys.

## Required checks

1. Confirm the footer shows `v5.6.0b · Confidence Pool Controls & Predictive Auto-Picks`.
2. Confirm there are no immediate red console errors.
3. Open Schedule → My Season Picks and confirm `Clear Week`, `Clear Season`, and `Auto-Pick & Assign Week` appear.
4. Clear Week and confirm only the active week's selections are removed.
5. Clear Season, type anything other than `CLEAR`, and confirm nothing is removed.
6. Clear Season again, type `CLEAR`, and confirm every week is cleared.
7. Run Auto-Pick & Assign Week and confirm missing winners and all confidence values are populated.
8. Confirm manually selected winners are preserved when Auto-Pick & Assign Week is run.
9. Confirm confidence values are unique within the week.
10. Confirm no home team is automatically favored solely because it is home.
11. Open Commissioner HQ → Teams & Owners and confirm a commissioner-only Rank column appears.
12. Confirm brand-new/no-history teams share the neutral starting rank.
13. Confirm the public Schedule and Pool screens do not expose hidden owner scores.
14. Confirm locking the pool disables clear and auto-pick controls.
15. Confirm reopening the pool restores those controls.

## Console API checks

```javascript
({
  clearWeek: typeof FranchiseHQ.leagueGames.confidence.clearWeek,
  clearSeason: typeof FranchiseHQ.leagueGames.confidence.clearSeason,
  autoAssign: typeof FranchiseHQ.leagueGames.confidence.autoAssign,
  ownerStrength: typeof FranchiseHQ.leagueGames.confidence.getOwnerStrength,
  rankings: typeof FranchiseHQ.leagueGames.confidence.getOwnerRankings,
  prediction: typeof FranchiseHQ.leagueGames.confidence.getMatchupPrediction
});
```

All values should be `"function"`.

```javascript
FranchiseHQ.leagueGames.confidence.getOwnerRankings();
```

Expected: one read-only row per team with a `rank`, `rating`, games, wins, playoff wins, Super Bowl history, and point differential. Ratings are commissioner diagnostics only and should not appear on public pages.

```javascript
FranchiseHQ.leagueGames.diagnostics();
```

Expected version: `5.6.0b`, baseline: `50`, and a populated owner-ranking count.
