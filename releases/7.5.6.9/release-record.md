# FranchiseHQ 7.5.6.9

## Scope

Integrate Confidence Pool picks directly into the regular-season Schedule and expose the server-backed Confidence Pool leaderboard from live Standings.

## Added during delivery

Each schedule matchup now contains its own winner and confidence controls beneath the game information. One weekly header reports completion and retains the existing clear/submit workflow. Used confidence values are unavailable on other matchups. Live Standings adds season and weekly Confidence Pool views with confidence points, correct picks, graded picks, correct percentage, weekly wins, weekly average, and best week.

Only submitted weekly entries enter league standings. Correct percentage uses finalized non-tie picks from those entries. Upcoming games never count as incorrect, and tied finals preserve the existing half-confidence score while remaining outside the accuracy denominator. Existing tenant, week-window, unique-value, lock, submit, and audit boundaries remain authoritative.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance remains planned for 7.5.7. Neither limitation affects this code-only Confidence Pool presentation and scoring-summary release.

## Validation evidence

The focused competition/UI suite passes 8/8. It verifies server scoring for one correct and one incorrect final, a 50.0% correct rate, schedule-integrated controls, the live Confidence Pool Standings tab, bounded phone composition, and explicit exclusion of upcoming games from incorrect picks. The complete repository suite passes 263/263 and the consolidated strict release gate passes 251/251.

## Deployment status

Pull request, protected Main merge, and Production publication are standing-authorized. The release requires no migration and performs no Production data operation. Acceptance is signed-in and read-only; it does not submit or clear a Confidence Pool entry.

## Rollback

The exact runtime baseline is Main `0d1018438772b5227364187692d2bd256bacb867`, Production release 7.5.6.8, and migration 42. Runtime rollback must retain all Confidence Pool weeks, entries, picks, audits, snapshots, yearly schedules, captures, reports, the permanent export URL, Discord thread state, season/game-year state, and blocked/null Free Agents. Do not restore a D1 bookmark or clear/resubmit picks as part of rollback.
