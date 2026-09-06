# FranchiseHQ 7.4.4.5 Release Record

## Scope

Correct the Discord connection false-negative that rejected a commissioner who has Manage Server permission. Keep the one-button, multi-league connection introduced in 7.4.4.4 and preserve the existing Franchise HQ Discord application, encrypted bot token, commands, scheduler, tenant mapping rules, and active-snapshot authority.

## Added during delivery

- Verifies the server selected during Discord consent against the authenticated commissioner's Discord OAuth guild list, which carries the user's server ownership and permission bitfield.
- Accepts either server ownership, Manage Server (`MANAGE_GUILD`), or Administrator authority for the exact selected server.
- Keeps the check fail-closed when the selected server is absent, the user lacks authority, the server identifier is invalid, or Discord cannot verify the permission list.
- Keeps the bot/application verification, automatic schedule-channel creation, tenant mapping, command reconciliation, and active-week synchronization behind the corrected permission gate.
- Adds a focused regression proving selected-server matching, Bearer-token verification, Manage Server and Administrator acceptance, insufficient-permission rejection, and missing-server rejection.

## Known inherited blockers

None registered. Madden Free Agents remain blocked upstream and unknown/null; this Discord authorization fix does not reinterpret that state as zero.

## Validation evidence

The focused Discord suite passes all 15 tests, including the corrected permission lookup and the existing `/week14`, identity-driven schedule, tenant-isolation, signature, replay, privacy, and membership boundaries. Migration 35 remains the current schema and this code-only release requires no D1 write or migration.

## Deployment status

Exact 7.4.4.5 candidate `0eab911ff4737704535a3c75a04ec9c6f4fc15e7` passed all four PR checks in PR #48 and merged as Main `6c5cc23bace756f269247974089b8a4086e69192`. All five Main quality/build/deployment checks passed. Cloudflare Pages Production deployment `9ba113bd-cd34-44be-8709-cced8318d83e` succeeded, the live application asset reports 7.4.4.5, the interaction endpoint rejects GET with 405, and the unauthenticated connection endpoint rejects access with 401.

No Discord consent was performed on the commissioner's behalf. The commissioner can now retry **Connect Discord**, select the FGC server, and complete the first guild mapping and schedule-command acceptance.

No import, snapshot change, reset, deletion, archive, season transition, export-URL rotation, credential change, membership/team-assignment change, Discord guild installation, migration, or data write was performed. Madden Free Agents remain blocked and unknown/null, never zero.

## Rollback

Redeploy the exact 7.4.4.4 application merge `62f0effecf77a15522d81f8731a6f9db4090ad7f` if Production acceptance fails. Migration 35 stays in place because this release adds no schema. Preserve the Discord application, encrypted bot token, memberships, team assignments, active snapshot, league data, export URL, history, and blocked/null Free Agent state.
