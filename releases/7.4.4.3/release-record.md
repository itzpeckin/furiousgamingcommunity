# FranchiseHQ 7.4.4.3 Release Record

## Scope

Add the approved Discord bot as a tenant-safe interface over FranchiseHQ's existing league authority. One Discord application serves multiple guilds and leagues; the invoking guild determines the tenant before membership, team, role, or data is resolved. This release includes the global slash-command contract, protected commands, private notifications, server-backed News and Twitch profiles, and commissioner setup controls.

## Added during delivery

- Added 16 global application commands covering Standings, Schedule, player/team Statistics, Leaders, Player Cards, Trade Block, approved Trade History, News, Game of the Week, the league URL, Twitch, Join, GM History, Confidence Pool, Rules, and Trades.
- Added immediate active-but-unassigned `/join`. Unassigned members retain safe league reads but cannot claim a team or use team/trade actions; revoked members cannot self-reactivate.
- Reused the active Madden snapshot, canonical team resolver, Trade Center executor, Competition executor, membership capabilities, revisions, notifications, and tenant audits rather than creating Discord-only business state.
- Added native two-team trade creation and responses, private Trade Committee review, and a canonical web handoff for three/four-team trades. Existing trade rules, conflicts, thresholds, optional rejection reasons, and Free Trade controls remain authoritative.
- Added private Confidence Pool view/pick/submit commands, with unfinished picks kept private and existing locks/scoring retained.
- Added tenant-scoped commissioner News shared by the website and Discord, plus one global Twitch profile per user that the user may edit and a commissioner may only clear.
- Added verified Ed25519 requests, five-minute timestamp freshness, bounded request bodies, interaction replay receipts, three-second deferred responses, and retryable private Discord delivery events.
- Added a responsive Commissioner HQ Discord Bot panel for the install link, unique guild mapping, private Trade Committee channel, optional notification channel, interaction endpoint, and audited disable action.
- Added additive migration 34, an inert-by-default global command registration tool, two-league regressions, and an automated independent-implementation guard.

## Known inherited blockers

None registered. Madden Free Agents remain blocked upstream and their count remains unknown/null; the Discord interface does not reinterpret or expose that state as zero.

## Validation evidence

The focused Discord/security suite verifies the command schema, unique guild/league mapping, cross-tenant denial, unassigned join behavior, revoked access, request signatures, stale requests, PING/PONG, replay protection, global Twitch identity, tenant News visibility, deferred responses, and durable private notifications. Fresh and production-shaped migrations reach version 34 without foreign-key violations. The consolidated strict repository gate and final counts are recorded in `validation-evidence.json`.

## Deployment status

Validated local review candidate only. No branch publication, pull request, hosted check, Main change, staging/Production deployment, Production migration, Discord credential change, global registration, or guild installation was authorized or performed. The command plan can be printed without network access; applying it requires a later explicit authorization and Production credentials.

## Rollback

Discard the unmerged 7.4.4.3 candidate and return to exact Main baseline `7e43655447abc5560bbf18efd981af707b08a4d1`. Production remains on the owner-accepted 7.4.4.2 application with migration 33. No Production row, Discord configuration, guild, command registration, membership, snapshot, import, archive, transition, reset, export URL, or Free Agent state changed during this local cycle.
