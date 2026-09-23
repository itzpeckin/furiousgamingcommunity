# FranchiseHQ 8.0.7 — Command Center Archive Season layout

Baseline: Main `fe7b8babab4d5efd76f9c2e346facc2501cf8ccc` (8.0.6).

## Scope

The existing **Archive Season** safety panel now occupies the previously unused right-hand Command Center space beneath **Quick Controls**. **Needs Your Attention** remains in the left operations rail, and **Recent League Activity** remains full-width below the two balanced rails.

The protected Archive Season behavior, confirmation, authority, and server transaction are unchanged. At tablet and phone widths both rails continue to stack into one column, and the existing mobile Archive Season card/button treatment remains intact.

## Added during delivery

No additional scope was added during delivery.

## Known inherited blockers

EA's Madden Companion roster-export availability remains outside FranchiseHQ control. It is unrelated to this presentation-only change.

## Validation evidence

Commissioner HQ regression coverage pins the new secondary rail, requires Quick Controls and Archive Season to share it, verifies Recent League Activity follows both rails, rejects the former full-width Archive Season placement, and retains the existing phone breakpoint.

## Deployment status

Production deployment is authorized but pending full validation, pull-request publication, merge, and hosted deployment verification. This candidate does not execute Archive Season or mutate Production league data.

## Rollback

No D1 migration is included. Application rollback restores the prior full-width Archive Season placement without changing the active season, rules publication, league data, snapshots, imports, Discord threads, credentials, export URL, audits, or historical records.
