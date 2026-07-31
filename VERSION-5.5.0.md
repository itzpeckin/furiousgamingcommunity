# Franchise HQ v5.5.0 — Roster Read Model Foundation

## Purpose

Create the read-only roster service that converts the active League Data snapshot into reliable roster selectors, indexes, position groups, depth ordering, free-agent handling, provenance, and health diagnostics.

## Public API

```javascript
FranchiseHQ.modules.league.rosters.getTeamRoster(teamId);
FranchiseHQ.modules.league.rosters.getPlayersByPosition(teamId, position);
FranchiseHQ.modules.league.rosters.findPlayer(playerId);
FranchiseHQ.modules.league.rosters.searchPlayers(query);
FranchiseHQ.modules.league.rosters.getFreeAgents();
FranchiseHQ.modules.league.rosters.getRosterHealth(teamId);
FranchiseHQ.modules.league.rosters.diagnostics();
```

## Boundaries

This release does not add the Team Roster page or Player Directory UI. It does not edit rosters, contracts, injuries, depth charts, or Madden snapshots.
