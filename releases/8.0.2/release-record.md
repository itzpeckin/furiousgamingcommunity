# FranchiseHQ 8.0.2

## Scope

Repair the missing first-season foundation that prevented P2W from using its retained first export. Make the repair reusable for every new tenant while preserving roster safety, tenant isolation, the permanent export URL, retained captures, active snapshots, Discord timing, and honest Free Agent authority.

## Added during delivery

- Commissioners receive a First-Season Setup panel when an activated league has an export but no durable Madden game year, franchise season, or import destination.
- FranchiseHQ derives the Madden release from that league's saved onboarding year, binds only the single franchise observed on that league's retained export, and requires the commissioner to enter and explicitly confirm the source-season value that the payload cannot prove.
- The game year, franchise season, link, active import destination, retained-session expectations, and tenant audit are written atomically with deterministic IDs. Repeated requests reuse the reviewed foundation instead of creating duplicates.
- The retained export is reanalyzed after preparation. A verified retained full schedule can be adopted into Import Yearly Schedule without another All Weeks export, publishing a live snapshot, moving the current week, or creating Discord threads.
- A rosterless first export remains in review. The UI now says that the first roster is still required and explains every disabled import action instead of silently doing nothing.
- Mobile layout and tenant-isolation regressions cover the new confirmation and schedule-reuse workflow.

## Known inherited blockers

P2W's retained export contains no roster, player, Free Agent, or league-identity route. Release 8.0.2 can reuse its schedule but cannot safely publish the first live snapshot until one roster-inclusive export succeeds. Missing or blocked Free Agents remain unknown, never zero.

## Validation evidence

The focused regression creates a new tenant with a retained 272-game All Weeks schedule, requires explicit source-season confirmation, creates exactly one tenant-owned foundation, reclassifies the retained report, adopts the retained schedule, and proves that a separate FGC fixture, active snapshots, Discord schedule threads, and retained captures remain unchanged. The complete strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

Published through PR #142 and merged to Main `f77e266`. All four pull-request checks and all five Main quality, build, and deployment checks passed, including quality workflow `35539244174` and Pages workflow `35539243812`.

Authenticated read-only Production acceptance confirms Release 8.0.2 on both tenants. P2W shows the retained 42-route export, observed franchise `3138676`, exact source-season confirmation, and the first-roster safety block. FGC remains live on its 2027 Week 4 snapshot with 32 teams, 2,046 rostered players, and its completed 272-game yearly schedule. No Production season preparation, import, snapshot activation, Discord work, reset, deletion, URL rotation, archive, transition, credential change, or Free Agent reinterpretation occurred during deployment or acceptance.

## Rollback

Redeploy Main `42bdfcda0cfb0e1a501caaea8723270ce253bb9e`. No schema rollback is required. Do not delete a prepared season, retained export, yearly schedule capture, audit, snapshot, membership, Discord record, or Free Agent evidence during rollback.
