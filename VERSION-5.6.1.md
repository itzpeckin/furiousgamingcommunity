# Franchise HQ v5.6.1 — Standings Service & UI

## Scope

This release completes the second part of Epic 5.6 by replacing mock standings with a shared standings service calculated from the Games service.

### Football standings

- League standings
- Conference standings
- Division standings
- Projected playoff picture
- Record, win percentage, division record, conference record, points for, points against, point differential, and streak

### Confidence Pool standings

- Season standings
- Weekly results
- Total points
- Correct picks
- Weekly wins
- Average weekly score
- Best week
- Remaining possible points
- Submission status

## Public API

```javascript
FranchiseHQ.modules.league.standings.getStandings();
FranchiseHQ.modules.league.standings.getDivisionStandings();
FranchiseHQ.modules.league.standings.getConferenceStandings();
FranchiseHQ.modules.league.standings.getPlayoffPicture();
FranchiseHQ.modules.league.standings.getConfidencePoolStandings();
FranchiseHQ.modules.league.standings.getConfidencePoolWeek(week);
FranchiseHQ.modules.league.standings.diagnostics();
```

The service is also available through:

```javascript
FranchiseHQ.leagueStandings
```

## Read-only boundary

The service reads completed game results and Confidence Pool entries. It does not edit game results, team records, picks, or league snapshots.
