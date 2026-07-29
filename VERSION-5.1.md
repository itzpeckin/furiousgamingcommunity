# Franchise HQ 5.1 — Madden Read-Only League Schema

Version 5.1 begins the League Engine as a **read-only visual model of Madden**, not a second franchise-management system.

## Product invariant

Madden remains authoritative for every official league fact. Franchise HQ may display, normalize, compare, analyze, and facilitate workflows, but it cannot alter rosters, contracts, cap values, scores, standings, injuries, draft-pick ownership, or any other official league data.

## Included

- Madden-authoritative snapshot schema
- Source provenance on imported entities
- Immutable last-valid-snapshot repository
- Stable entity IDs
- Read-only selectors
- Schema and reference validation
- Explicit migration registry
- Temporary legacy/mock adapter
- League Read Model diagnostics

## Not included

- A real Madden Companion import parser (planned for 5.2)
- Changes to existing page appearance
- Roster or contract editing
- Trade execution
- Week or season advancement

## Public API

```javascript
FranchiseHQ.maddenLeague.diagnostics()
FranchiseHQ.maddenLeague.get()
FranchiseHQ.maddenLeague.validate(snapshot)
FranchiseHQ.maddenLeague.installSnapshot(snapshot)
FranchiseHQ.maddenLeague.selectors.getTeam(teamId)
```

`installSnapshot` rejects unvalidated or non-Madden-authoritative state.
