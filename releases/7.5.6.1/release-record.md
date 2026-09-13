# FranchiseHQ 7.5.6.1

Status: Production deployed and public read-only acceptance passed; owner Discord/site vote acceptance pending.

## Scope

Every committed committee vote queues a durable refresh in the same database batch as its vote. The shared trade workflow is used by the website, Discord reviewer DMs, Trade Submit buttons and review slash command. Refresh all known delivered review cards and the owner thread from authoritative current-revision status/approval/rejection counts, without casting another vote or creating duplicate committee review posts. Preserve the existing team-colored asset cards, logos, fields and dividers.

## Added during delivery

Store posted message references in existing outbox payloads, recover older exact application/trade messages in known destinations with a bounded 200-message channel scan, and register signed clicked messages directly. Suppress owner duplicate notices, not committee-reviewer DMs. Remove terminal action buttons explicitly. Ignore deleted resources instead of recreating them. An unavailable destination does not prevent other copies from updating; the existing outbox retains failures for retry, awakened by later workflow actions or authenticated Trade Center/status loads. Discord permission/rate-limit failures can delay delivery; this is not a guarantee against Discord outages.

Detect votes arriving while rendering, editing or later in the fan-out, and converge using fresh counts with bounded retry. Permission-safe multipart messages retain their asset chunks and refresh final status/controls. An open, visible site review reads a small status response every five seconds without replacing asset cards or typed reason text. Finished review stops polling. Public approved trade counts remain correct while private reviewer identities/reasons remain protected.

## Validation evidence

Full strict gate passes 229/229 tests, 257 syntax modules, 76 routes, 23 canonical migrations and 116 required tables. Focused synthetic Discord/trade tests pass 57/57. Separate authentication/mobile acceptance passes 12/12. Regression scenarios cover each entry point, repeated/changing/abstaining votes, final approval, rejection/revision, concurrent early and late votes, partial API failure/retry, deleted messages, exact legacy discovery, multipart fallback and tenant-private status lookup. All four PR and five Main/deployment checks passed. Public acceptance at 2026-09-13 06:59:50 UTC verified healthy Production, exact Main landing/asset bytes, and web/Discord server release 7.5.6.1. No actual Production trade vote is used for acceptance.

## Known inherited blockers

Code-only, migration 40 unchanged. No Discord command registration, channel/role change, credential or membership edit, live import, snapshot move, reset, archive/transition, export URL rotation, or ownership correction. Blocked Free Agents remain unknown/null. Owner deferred representative new-season current-week/source validation until the next season; this patch makes no current-week/import/scheduling change.

## Deployment status

Exact candidate `b8581e635e3a944a5d6506a0f40e76af3b0bdb85` was published through PR #96 and merged as code Main `d08eed34ac79a51f929333b1f7618f4680cadd59`. Cloudflare Pages Production `7537cc37-73f9-4399-a525-333f315b8c6d` succeeded. Main quality workflow `34744057027` and deployment workflow `34744056623` passed. Existing migration remains 40. Production acceptance issued only public GET requests; no authenticated UI, vote, import or protected data operation ran. Owner real-server/site vote acceptance follows.

## Rollback

Redeploy exact prior Main `b810284b9b7a8e5299fae867d9a2cc670e89581f` without a reverse migration or data reset. Retain votes, outbox message references, snapshots, picks, transactions and audits. Do not replay votes or delete Discord resources during rollback.
