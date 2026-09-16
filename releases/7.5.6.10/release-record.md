# FranchiseHQ 7.5.6.10

## Scope

Contain the live Confidence Pool Standings toolbar and table card within the phone viewport while preserving the full leaderboard through an internal horizontal table scroller.

## Added during delivery

The Standings shell, card, and toolbar children now opt into shrinking below their table's minimum content width. The table wrapper remains width-bounded and horizontally scrollable, and long explanatory text may wrap rather than expanding the page. Schedule-integrated Confidence Pool controls and every 7.5.6.9 scoring rule remain unchanged.

## Production finding

Signed-in 7.5.6.9 acceptance at 390px measured the document at 390px but the Confidence Pool shell at roughly 901px of internal overflow, with the toolbar around 900px and the table wrapper around 872px. Schedule phone composition passed. This patch addresses only the Standings containment defect found during that acceptance.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance remains planned for 7.5.7. Neither limitation affects this presentation-only Confidence Pool phone-containment patch.

## Validation evidence

Focused syntax and Confidence Pool tests pass 2/2. The complete repository suite passes 263/263 and the consolidated strict release gate passes 251/251. Generated inventory remains current at 631 tracked files and 79 routes.

## Deployment status

Pull request, protected Main merge, and Production publication are standing-authorized. The release requires no migration and performs no Production data operation. Acceptance is signed-in and read-only; it does not submit or clear Confidence Pool picks.

## Rollback

The exact runtime baseline is Main `8c961b7c23f8c98f0cc3648fbe3849688c0763b2`, Production release 7.5.6.9, Pages run `35046620364`, and migration 42. Runtime rollback must retain all Confidence Pool weeks, entries, picks, audits, snapshots, yearly schedules, captures, reports, the permanent export URL, Discord thread state, season/game-year state, and blocked/null Free Agents. Do not restore a D1 bookmark or clear/resubmit picks as part of rollback.
