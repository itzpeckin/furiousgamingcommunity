# FranchiseHQ 7.4.4.4 Release Record

## Scope

Repair the Production Discord schedule-command regression and replace the manual guild-ID setup with a scalable commissioner-operated connection. The existing Franchise HQ Discord application remains the only bot. Its schedule threads use the active FranchiseHQ snapshot, registered Discord identities, and active Teams & Owners assignments.

## Root cause

The 7.4.4.3 registration tool called Discord's global bulk-overwrite endpoint with a 16-command manifest. That operation made the submitted list authoritative and removed the bot's prior `/week1`–`/week18` commands. Discord therefore reported the stale `/week14` integration as unknown. The authorized token reset also invalidated any separate scheduler runtime that retained the previous token.

## Added during delivery

- Restores `/week1` through `/week18` on the existing application. A commissioner command creates or reconciles public matchup threads for that week from the active Madden snapshot.
- Replaces global bulk overwrite with per-name POST upserts. Connection-time repair first lists existing global names and adds only missing commands, preserving commands outside the current manifest.
- Adds a single **Connect Discord** action in Commissioner HQ. Discord handles server selection and consent; FranchiseHQ verifies Manage Server authority, verifies the bot, creates or reuses `#franchisehq-schedule`, stores the unique tenant mapping, and registers the weekly commands immediately in the selected guild.
- Resolves matchup mentions from `users.discord_user_id` and active `league_memberships.team_id` assignments. No FGC owner list, Discord ID, or schedule is hard coded.
- Queues an idempotent active-week thread sync after a commissioner import is validated and atomically activated. A Discord delivery failure cannot change or roll back the Madden-authoritative snapshot.
- Adds migration 35 with four connection metadata columns, durable schedule-sync runs, and one retained Discord thread identity per league/game/season/week.

## Known inherited blockers

None registered. Madden Free Agents remain blocked upstream and unknown/null; this Discord recovery does not reinterpret that state as zero.

## Validation evidence

Focused Discord tests cover the 34-command inventory, non-destructive global and guild upserts, tenant-safe commissioner bootstrap, `/week14`, active-snapshot game selection, both registered team-owner mentions, idempotent thread rows, existing Discord security and membership boundaries, and private delivery. Fresh and legacy database paths reach migration 35 with clean foreign keys. The consolidated strict repository gate is required before publication.

## Deployment status

This candidate has not changed GitHub, Main, Production, Discord, credentials, league mappings, memberships, team assignments, league data, or the active snapshot. Migration 35 must be applied and verified before the application code is deployed. The first FGC connection still requires one Discord consent click by a commissioner with Manage Server permission; commissioners never copy a server ID, channel ID, token, or interaction URL.

No import, reset, deletion, archive, season transition, export-URL rotation, or snapshot activation is included. Madden Free Agents remain blocked and unknown/null, never zero.

## Rollback

If acceptance fails, redeploy exact 7.4.4.3 source baseline `23b56f2d43e7a8982b03e7dedd121db717144d0a`. Migration 35 is additive and should remain unless a separately authorized recovery requires restoring a verified pre-migration bookmark before any new Discord schedule rows exist. Disable the league connection rather than deleting its audit or thread records. Preserve the Discord application, bot secret, memberships, team assignments, league data, active snapshot, export URL, history, and blocked/null Free Agent state.
