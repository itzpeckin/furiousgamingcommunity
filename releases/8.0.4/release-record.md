# FranchiseHQ 8.0.4 — Command Center and schedule-rollover stability

Baseline: Main `033cb68ca2c122d205823e0d64803947ed1e79ae` (8.0.3).

## Scope

The P2W Command Center's compact Yearly Schedule card now remains a readable single-column unit and its parent grows with the content. The full League Data view and Teams & Owners are unchanged.

Automatic Discord schedule rollover moves into small, persistent Workflow checkpoints. Each checkpoint confirms the exact active snapshot and proven period transition. New-week threads are complete before any prior-period thread is removed. An interrupted run can resume, including after a same-week import, without needing another Madden export. Existing thread rows and sync runs remain as audit evidence.

## Added during delivery

The incomplete FGC rollover revealed the need for an explicit, commissioner-authorized retry against the current snapshot without another export. This action is proof-gated and audit-recorded.

## Known inherited blockers

EA's Madden Companion Rosters mode remains unavailable for P2W's first complete live import. This release does not change roster authority or treat missing Free Agents as zero.

## Validation evidence

Focused Command Center and Discord checkpoint tests pass. The complete strict gate passes 307/307 automated tests, syntax, secrets, environment, migration, inventory, and release-contract checks. PR quality and Pages preview checks passed. Signed-in P2W desktop acceptance at a 1280-pixel viewport confirms the annual card is inside its parent, with a 16-pixel gap before the next card and no page-wide horizontal overflow. Phone visual acceptance remains pending; phone breakpoints are covered by the automated layout check.

## Deployment status

Published through [PR #146](https://github.com/itzpeckin/furiousgamingcommunity/pull/146) and merged to Main `f3657eb`. PR quality run `35626887080` passed. Production Pages deployment `12ef5c6e-f8d9-4fdf-b073-929c529defd1` succeeded and the Worker is on version `68e534cc-71b0-49f9-ae74-a32b78e29009` with both import and schedule Workflow bindings. Production serves Release 8.0.4 on P2W. Its retained collection remains 5/18 weeks and 79/272 games, with no active snapshot. FGC remains on Week 4 with all 16 current-week schedule threads. The seven leftover Week 3 threads have **not** been deleted; the proof-gated retry is available but was not triggered during deployment. No Production Madden import, active-snapshot move, Discord thread mutation, league-data row change, season transition, export-URL rotation, or Free Agent reinterpretation occurred during publication or acceptance.

## Rollback

Restore the prior 8.0.3 Pages and Worker versions if needed. The release has no D1 schema migration; retained schedule run/thread rows and audits are never deleted by rollback.

Owner acceptance should confirm the P2W Command Center at desktop and phone widths. Before the guarded FGC cleanup is triggered, reconfirm the exact Week 4 snapshot, 16 current threads, seven old Week 3 threads, and original Week 3-to-4 transition proof. No league import, export-URL rotation, roster change, season transition, or Free Agent reinterpretation is part of this release.
