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

Production deployed and read-only verified, pending owner Discord-server acceptance. Exact candidate `d650c97eb9a1eaca19f7ddb9ca456c0e1f0c8259` passed 4/4 pull-request checks in PR #46 and merged to Main as `f4aaf1d4004de7ec0a21ec0b5b377e387c2402f3`; all 5/5 Main checks passed. Production migration 34 was applied to `franchise-hq-db-madden27` between recovery bookmarks `00000141-0000096a-000050de-4c9ba9913f5199401f387fef4a0215af` and `00000141-00000982-000050de-995347861f06ab3520da3d566158b9a7`, with all protected counts unchanged, all five new operational tables empty, and zero foreign-key violations.

The existing **Franchise HQ** Discord application `1529715179733127219` was reused; no application was created. Discord accepted the Production interaction endpoint `https://franchisehq.app/api/discord/interactions`. The public key and newly authorized bot token are configured in Cloudflare, with the bot token stored only as an encrypted Production secret. The token was used once to register all 16 global commands, was not printed or written to disk, and the clipboard was cleared immediately afterward. Final Pages deployment `2f978383-d4ac-4d33-a586-7be5a164e9d9` succeeded from the exact Main merge. The live domain reports 7.4.4.3, its application asset matches Main, and the endpoint rejects unsigned requests as designed. No Discord guild installation or league/guild mapping was performed; that remains the owner acceptance step.

No import, reset, snapshot operation, archive, transition, export-URL rotation, membership assignment, guild mapping, or league-data mutation ran. Madden Free Agents remain blocked and unknown/null.

## Rollback

If owner acceptance fails, deploy exact prior Main `7e43655447abc5560bbf18efd981af707b08a4d1` and remove or disable the Discord interaction endpoint and Production bot secret. Migration 34 is additive and should remain in place unless a separately authorized recovery operation requires otherwise; do not restore the pre-migration bookmark after new Production writes. Global commands may be removed with an explicitly authorized empty global registration. No guild mapping currently exists, so disabling the endpoint and commands cannot detach league data. Preserve all league/account records, the active snapshot, audit history, export URL, and blocked/null Free Agent state.
