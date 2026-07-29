# Franchise HQ v5.4.0 — League Data State Manager

## Purpose

This release allows Franchise HQ to continue operating safely before a live Madden import exists.

## State priority

In `auto` mode the League module resolves data in this order:

1. Validated live Madden snapshot
2. Explicit demo snapshot
3. Safe empty snapshot

Demo and empty snapshots never enter the official Madden repository and cannot alter authoritative league state.

## New service

`FranchiseHQ.modules.league.leagueDataState`

Compatibility facade:

`FranchiseHQ.leagueData`

## Main API

```javascript
FranchiseHQ.leagueData.current()
FranchiseHQ.leagueData.status()
FranchiseHQ.leagueData.viewState('roster')
FranchiseHQ.leagueData.setMode('auto' | 'empty' | 'demo' | 'live')
FranchiseHQ.leagueData.seedDemoFromLegacy(data, { activate: true })
FranchiseHQ.leagueData.clearDemo()
FranchiseHQ.leagueData.subscribe(listener)
```

## Guarantees

- No import is required for the site to boot.
- Empty data produces a valid read-model snapshot rather than `null`.
- Demo data is visibly marked non-authoritative.
- A validated Madden import automatically becomes active in `auto` mode.
- Official repository protections remain unchanged.
