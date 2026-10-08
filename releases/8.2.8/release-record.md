# FranchiseHQ 8.2.8

## Scope

Commissioners can bulk assign roster ability counts by position and configure automatic Free Trades with alternative complete outgoing packages. Player thresholds support exclusive/inclusive comparisons; pick packages support total and per-round limits. All teams must qualify. Approval requirements remain, eligibility is checked again before approval, and completed classifications are retained. Existing manual free-trade configuration and explicit saved ability policies remain unchanged; new generic ability defaults count every position as one.

## Added during delivery

EA recovery is available during unfinished collection, cancels stale reads and collection on reconnect, keeps settings open, and prevents background authentication refreshes from repeatedly remounting controls. Schedule initial/current-context selection follows the league week and joins actual standings into team cards; manual browsing is retained until league/season/week changes.

## Known inherited blockers

None registered. Development exceptions still need acquisition history to confirm a violation; current roster counts alone cannot establish one. Automatic Free Trades require commissioners to save package rules; this release does not configure individual leagues.

## Validation evidence

542 automated tests passed, including authenticated trade handlers, authoritative rating rechecks, complete-package alternatives, preserved approval history, per-position setting persistence, reconnect job cancellation, click recovery, authentication refresh guards and actual schedule rendering. Browser fixtures at 1440px/390px verified bulk counts, save/reload, package add/edit/remove/save, no overflow or page errors. Other strict gates passed; required release-record headings were corrected and the release contract rerun. These are isolated tests, not live EA account changes or Discord trade acceptance.

## Deployment status

Candidate work. No live settings, imports, EA account actions, trades or Discord messages were performed. Schema remains 53; Workers and credentials unchanged. Targeted trade handler and schedule renderer tests pass; full quality, hosted and browser checks are recorded as completed in validation evidence. Production publication is authorized but not yet performed.

## Rollback

Prior Pages deployment: f2150fce-a82a-4036-9136-7016ad9a9351, Main ca22d20c4ad03b2f787ce7043afc14f54eafd5db. Schema stays 53. Before restoring 8.2.7, any newly saved custom ability maps require restoring that league's last compatible gameplayRules revision, retaining the new policy in revision history. Prefer a forward repair to avoid changing commissioner policies. Free-trade package JSON is retained but ignored by 8.2.7; approved free-trade flags remain intact. Do not delete league data or settings history.
