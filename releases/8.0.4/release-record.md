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

Focused Command Center and Discord checkpoint tests pass. The complete strict gate passes 307/307 automated tests, syntax, secrets, environment, migration, inventory, and release-contract checks. Hosted deployment checks are pending.

## Deployment status

Implementation candidate. Main, Pages, Worker, and live Discord cleanup are not yet changed.

## Rollback

Restore the prior 8.0.3 Pages and Worker versions if needed. The release has no D1 schema migration; retained schedule run/thread rows and audits are never deleted by rollback.

Release acceptance must validate P2W desktop and phone layout, FGC live Week 4 and tenant isolation, the new Worker Workflow binding, and the exact seven remaining Week 3 threads before triggering guarded cleanup. No league import, export-URL rotation, roster change, season transition, or Free Agent reinterpretation is part of this release.
