# FranchiseHQ 7.4.0.5 Release Record

**Status:** Validated local review candidate; publication, Main, and Production are not authorized

**Production changed:** No. Production remains on FranchiseHQ 7.4.0.4 at migration 30.

## Scope

This code-only release completes the owner-approved Trade Center and Trade Block experience. It redesigns Create Trade around team-branded horizontal asset panels and a visual receiving-package exchange, makes every displayed calculator value explainable, and lets the original proposing team cancel an offer only while it is still being negotiated.

The server privacy contract remains unchanged: members see their own team's activity and completed commissioner-approved trades from other teams. Private proposals and negotiations between unrelated teams remain hidden.

## Added during delivery

- A team-branded Create Trade workspace with roster imagery, cap space, team needs, player/pick filters, search, horizontal desktop flow, explicit transfer arrows, and a responsive stacked package review.
- Clickable player and draft-pick values that show the rating, age, development, contract, production, position, risk, round, projection, and timeline factors that produced the number.
- Clickable per-team package totals that show asset values and package adjustments, plus an explainable package-balance percentage for two-to-four-team trades.
- Canonical modern player-card navigation from builder assets, sent/received package cards, Trade Block rows, and the Add Players drawer.
- An inline two-step **Cancel Offer** control available only to the original proposing team while the workflow remains `negotiating`.
- Private participant-visible cancelled records, recipient notification, a workflow message, and a tenant audit event. Recipient cancellation, stale revisions, and cancellation after committee/approval fail closed.
- Navy Trade Center surfaces, connected Trade Activity timeline treatment, a History shortcut, horizontal team-branded Trade Block rows, player imagery, and the premium Add Players experience.

## Authority and privacy boundaries

Cancellation does not move a player or draft pick and does not alter Madden data. Madden Import remains authoritative for player ownership; FranchiseHQ remains authoritative for its audited pick ledger while Madden supplies no supported pick source. A cancelled negotiation is visible only to its participants. It does not enter league-wide History.

Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The focused Trade Center suite passes all 9 tests, including proposer-only cancellation, stale revision handling, committee/approved lockout, privacy, canonical player navigation, explainable values, and responsive markup. Desktop 1440×1000 and phone 390×844 visual checks confirm the horizontal desktop exchange, bounded mobile overflow, navy contrast, and stacked package review. The full consolidated strict gate result is recorded in `validation-evidence.json`.

## Deployment status

Not run and not authorized. No migration is required; Production remains on release 7.4.0.4 and schema migration 30.

## Rollback

The immutable rollback baseline is exact Main commit `6bfe495e6173c49b1c21dc4eaf6a5814cfe2166e`, tree `bc9a7ac3bc9d6c63a08701f0a86d1684adc217d4`.

## Next gate

One consolidated authorization may publish the exact candidate branch, create and validate its pull request, merge to Main after hosted checks pass, deploy the code-only release to Production, and perform read-only signed-in acceptance. No migration or league-data operation is needed.
