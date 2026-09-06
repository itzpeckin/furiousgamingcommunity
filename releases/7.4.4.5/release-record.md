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

The exact 7.4.4.5 candidate is authorized for branch publication, pull request, hosted checks, merge to Main, and code-only Production deployment under the owner's standing consolidated publication direction. Production remains on 7.4.4.4 until the candidate passes the full gate and hosted checks. No Discord consent is performed on the commissioner's behalf; the commissioner will retry **Connect Discord** after deployment and select the FGC server.

No import, snapshot change, reset, deletion, archive, season transition, export-URL rotation, credential change, membership/team-assignment change, Discord guild installation, or data write is included. Madden Free Agents remain blocked and unknown/null, never zero.

## Rollback

Redeploy the exact 7.4.4.4 application merge `62f0effecf77a15522d81f8731a6f9db4090ad7f` if Production acceptance fails. Migration 35 stays in place because this release adds no schema. Preserve the Discord application, encrypted bot token, memberships, team assignments, active snapshot, league data, export URL, history, and blocked/null Free Agent state.
