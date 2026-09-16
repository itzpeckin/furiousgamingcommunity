# FranchiseHQ 7.5.6.6

## Scope

Correct the first 2027 All Weeks weekly import without requiring another Madden export. Populated statistics prove the live period, the completed 18-week yearly schedule remains the schedule horizon, and verified-empty future statistics routes no longer masquerade as required weekly data.

## Added during delivery

The discovery policy now distinguishes populated statistics from empty future placeholders, candidate coverage excludes empty future statistics while retaining their schedule weeks, and the statistics mapper skips only routes proven empty for the covered current/future horizon. Malformed, unreadable, or non-empty invalid routes still fail closed. A stale passed report is reanalyzed under the new policy so the retained 179-route cohort can be reused.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. Import performance work remains planned for 7.5.7. Neither limitation requires a repeated 18-week schedule export.

## Validation evidence

Focused regressions reproduce a 272-game All Weeks schedule with populated Week 1 statistics and empty Week 2–18 routes. They prove Week 1, preserve all 18 schedule weeks, exclude empty future statistics from effective coverage, skip verified-empty mapping routes, and keep malformed non-empty payloads blocking. The complete repository and strict gates are required before publication.

## Deployment status

Production publication and retained-cohort retry are owner-authorized but not yet run. This code-only patch requires no migration. Until deployment, Production remains 7.5.6.5 with the completed yearly schedule and failed candidate retained.

## Rollback

The exact pre-release baseline is Main `911a787692cb2ad9576da2ee611662d6d32bb5f9`, Production release 7.5.6.5, Pages deployment `76204841-1eba-46af-8dd5-7672fe519876`, and Worker version `924b2e52`. Rollback must retain migration 42, the yearly schedule revision, all captures/reports/candidates/snapshots/audits, the permanent URL, season state, Discord state, and blocked/null Free Agent state. It must not restore a D1 bookmark.
