# Franchise HQ v5.4.9 Validation — LD-009 League Data Awareness

## Required results
- Development Data shows one global banner on every application route.
- Empty State shows one global banner and keeps League Data pages empty.
- Player cards use the shared Development notice.
- Verified live Madden mode returns no global or player-card banner markup.
- Repeated navigation, source changes, refresh, and browser history do not duplicate banners.
- Manage Source opens `#commissioner/league-data`.
- Existing source persistence and LD-008 events continue working.
- No console errors occur.

## Console checks
```javascript
typeof FranchiseHQ.leagueDataBanner.renderGlobal === 'function'
typeof FranchiseHQ.leagueDataBanner.renderInline === 'function'
```

When Development Data is active:
```javascript
FranchiseHQ.leagueDataBanner.presentation()
```
returns a Development model.

When Empty is active, it returns an Empty model. When verified Live is active, it returns `null`.
