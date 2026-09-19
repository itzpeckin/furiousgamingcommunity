# FranchiseHQ 7.7.1

## Scope

Repair the retained Week 2 candidate snapshot build without requiring another Madden export or changing the live league snapshot. The failed private candidate, every earlier snapshot, source capture, yearly schedule revision, and audit remain retained.

## Added during delivery

The completed 272-game yearly schedule uses an older Madden team-ID set than the current League Info and active Week 2 snapshot. Production read-only evidence proves all 272 game IDs match the active schedule, those games establish a complete one-to-one mapping across all 32 teams, and there are zero conflicting or unmapped teams. The builder previously tried to apply only the active-to-current team map to the older yearly IDs, so it failed before writing the first game.

The candidate now extends the already verified team identity map through exact matching game IDs, fails closed on any contradictory mapping, records the bridge proof in the private snapshot manifest, and then merges the retained yearly schedule with current-week results normally.

## Import-time remediation

- Each resumable build request advances up to 500 records instead of 125, cutting browser/server round trips substantially.
- D1 writes remain bounded to 125 statements per atomic transaction. A lost response safely replays idempotent upserts from the prior durable cursor.
- The plan revision forces any affected private game checkpoint to replay from cursor zero without deleting the snapshot or its audit history.
- The Cloudflare Workflow keeps statistics mapping, candidate construction, and validation as granular durable steps rather than nesting many network steps inside one phase step.
- The import Worker's CPU allowance is explicitly set to 120 seconds for orchestration headroom; individual work remains bounded and checkpointed.

## Known inherited blockers

None are registered in the repository quality baseline. The failed Week 2 candidate is intentionally retained and remains private; it is the recovery target after deployment, not deleted data.

## Validation evidence

Focused regressions cover the older-yearly-ID bridge, contradiction refusal, full 272-game schedule composition, 500-record request contract, 125-row D1 transaction cap, Workflow checkpoint structure, retained roster authority, and blocked Free Agents remaining unknown. The full repository and strict release gate must pass before publication.

This release performs no Madden export/import, snapshot activation, database migration, data reset/deletion, export-URL rotation, season archive/transition, scheduling-thread action, roster/ownership mutation, Discord retry/registration, credential change, or Free Agent reinterpretation. The commissioner can retry the retained export after Production deployment; ordinary validation and atomic publication remain unchanged.

## Deployment status

Publication is owner-authorized and pending the exact candidate commit, pull-request checks, Main merge, Pages deployment, import Worker deployment, and read-only Production version verification. Deployment itself performs no league-data operation.

## Rollback

Redeploy the accepted 7.7.0 Main commit. Migration 45 and all retained live/private/malformed snapshots, candidate runs, captures, mappings, yearly schedules, audits, rosters, Discord records, and Free Agent authority remain in place. Do not restore D1, delete the failed private candidate, request another export, reset data, rotate the export URL, or transition the season.
