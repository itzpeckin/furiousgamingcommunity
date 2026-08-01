# Franchise HQ v5.6.1 Validation

## 1. Confirm version

Expected footer:

```text
v5.6.1 · Standings Service & UI
```

Confirm there are no immediate red console errors.

## 2. Confirm service registration

```javascript
({
  service: typeof FranchiseHQ.modules?.league?.standings,
  alias: typeof FranchiseHQ.leagueStandings,
  league: typeof FranchiseHQ.leagueStandings?.getStandings,
  division: typeof FranchiseHQ.leagueStandings?.getDivisionStandings,
  conference: typeof FranchiseHQ.leagueStandings?.getConferenceStandings,
  playoffs: typeof FranchiseHQ.leagueStandings?.getPlayoffPicture,
  poolSeason: typeof FranchiseHQ.leagueStandings?.getConfidencePoolStandings,
  poolWeek: typeof FranchiseHQ.leagueStandings?.getConfidencePoolWeek
});
```

Every value should be `object` or `function` as appropriate.

## 3. Confirm module alias

```javascript
FranchiseHQ.leagueStandings === FranchiseHQ.modules.league.standings;
```

Expected: `true`.

## 4. Inspect diagnostics

```javascript
FranchiseHQ.leagueStandings.diagnostics();
```

Expected:

- `service: "standings"`
- `version: "5.6.1"`
- `teamCount: 32`
- `completedGames` greater than zero in Development Data
- `healthy: true`

## 5. Validate league standings API

```javascript
const leagueStandings = FranchiseHQ.leagueStandings.getStandings();
leagueStandings.slice(0, 5);
```

Expected:

- 32 team rows
- Sorted best record first
- Record fields populated
- Results are read-only

## 6. Validate standings calculations

Inspect one row:

```javascript
leagueStandings[0];
```

Expected fields include:

```text
wins
losses
ties
winPct
divisionRecord
conferenceRecord
pointsFor
pointsAgainst
pointDifferential
streak
```

## 7. Validate Division UI

Open `Standings → Division`.

Expected:

- Eight division cards
- Four teams per division
- Correct conference and division names
- Expanded columns for record and scoring

## 8. Validate Conference UI

Open `Standings → Conference`.

Expected:

- AFC and NFC tables
- 16 teams in each table
- Conference rank shown

## 9. Validate League UI

Open `Standings → League`.

Expected:

- One 32-team table
- Teams sorted by calculated results
- No hard-coded record mismatch

## 10. Validate Playoff Picture

Open `Standings → Playoff Picture`.

Expected:

- AFC and NFC cards
- Seven projected qualifiers per conference
- Division leader and Wild card labels
- In-the-hunt teams displayed beneath the cutline

## 11. Validate Confidence Pool season standings

Open `Standings → Confidence Pool → Season`.

Expected columns:

```text
Rank
Owner
Team
Total Points
Correct
Weeks Won
Average
Best Week
Max Remaining
Status
```

Saved Confidence Pool entries should appear.

## 12. Validate Confidence Pool API

```javascript
FranchiseHQ.leagueStandings.getConfidencePoolStandings();
```

Expected:

- Ranked entries
- Total points and correct picks
- Weekly wins
- Average and best week
- Remaining possible points
- Submission status

## 13. Validate weekly results

Select `Weekly` and navigate between weeks.

Expected:

- Week number changes
- Points and correct picks update for the selected week
- Page does not navigate away
- Empty weeks safely show zero values

API check:

```javascript
FranchiseHQ.leagueStandings.getConfidencePoolWeek(1);
```

## 14. Validate Team navigation

Click a football standings row.

Expected: the corresponding Team page opens.

## 15. Validate source switching

Switch to Empty State.

Expected:

- Shared Empty State behavior remains active
- Development standings do not silently remain visible

Restore Development Data and confirm standings return.

## 16. Final console check

Navigate through every football and Confidence Pool standings view.

Expected: no red JavaScript application errors.
