# Franchise HQ Version 4.10

## Domain Data Services

Version 4.10 introduces read-only domain services that separate feature code from the legacy fixture arrays currently created inside `app.js`.

### New services

- `FranchiseHQ.data`
- `FranchiseHQ.teams`
- `FranchiseHQ.players`
- `FranchiseHQ.schedule`
- `FranchiseHQ.standings`
- `FranchiseHQ.news`

The services currently identify their source as `legacy-fixtures`. This is intentional: Version 4.10 creates the stable domain interfaces first. Later backend releases can replace the fixture source with API data without requiring page and Trade Center code to be rewritten again.

### Trade Center migration

`trade-module.js` now obtains team and player data through `FranchiseHQ.teams` and `FranchiseHQ.players`. It retains a temporary fallback to `FGC_APP` for backward compatibility.

### Scope boundary

Version 4.10 does not yet move the fixture-generation code out of `app.js`, and it does not add server-backed league data. Those are later migration steps.
