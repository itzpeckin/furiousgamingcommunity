# FranchiseHQ 8.0.20 — game summaries and thread results

## Scope

Current-week Discord `/game` generates a matchup preview or final result image using the existing player-card renderer, typography and team branding. Both teams include GM, record and game information. Finals show passing, rushing, receiving and defensive game leaders; unplayed matchups show top-rated offense and defense. League Home uses the same game-specific leader selector and prominently displays the final score.

## Added during delivery

Migration 49 adds a tenant-scoped result delivery ledger. Same-week imports use the existing durable schedule workflow, preserving the Import Worker. Result messages are tracked, retried with nonce reconciliation, and edited for later corrections. Threads containing final results are archived instead of deleted after week advance. A canonical game's retained source schedule ID supports renumbered EA records.

## Known inherited blockers

None. Discord access and an existing associated game thread are required for automatic delivery. Missing statistical categories are labeled as unavailable rather than replaced with season totals. No historical result backfill occurs merely on deployment.

## Validation evidence

The 436-test release suite passed, followed by ten focused checks covering the additional renamed-game join and week normalization. Signed local Discord requests cover `/game` in a thread, current-week selection, stale selection rejection and tenant isolation. Delivery tests cover one post, lost response reconciliation, corrected-score edits, superseded imports, historical suppression and retention at rollover. Seventeen archive/workflow/platform checks passed. The actual image renderer produced a verified PNG. Desktop and 390px phone layout checks passed in both preview and final modes without overflow. CI and hosted acceptance are recorded on the release PR and final receipt.

## Deployment status

Standing authorization applies. Migration 49 was applied to staging with an empty result ledger and clean foreign keys. Production publication is pending preview/CI acceptance. No collection, import, live Discord message, trade or archive action was performed during implementation. Production snapshot data is unchanged by this release.

## Rollback

Restore v8.0.19 at 14e793c80ae77dd1b28775195456ee2ebf0e1fe0 and Pages 75b2404a-2f6e-4a17-acbb-508424db1acc. Retain the additive migration 49 delivery ledger and Import Worker. Never roll back live league snapshots for this presentation and delivery release.
