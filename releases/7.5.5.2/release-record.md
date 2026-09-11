# FranchiseHQ 7.5.5.2 Release Record

**Status:** Local validated review candidate

**Production changed:** No. This local code-only candidate does not change Main, Production, Cloudflare, Discord, migration 38, or league data.

## Scope

Refine only the canonical Player Card Details layout. At full desktop width, Player Ratings is the sole height authority for the three-column dashboard. Current Statistics, Game Log, Abilities, and Contract remain available inside that boundary, with long content scrolling inside its own panel.

The duplicate Transaction History widget is removed from the Details rail. The top-level **Transaction History** tab and its complete canonical history view remain unchanged.

## Added during delivery

- A desktop-only layout boundary where Player Ratings determines the Details dashboard height.
- Contained Game Log, Abilities, and Contract scrolling inside that boundary.
- A two-column Contract layout sized for the narrow dashboard rail.
- A focused source-contract regression proving the duplicate widget is absent and the dedicated Transaction History tab remains.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation target

- Ratings alone determines the desktop Details dashboard height.
- The current-season Game Log scrolls vertically and horizontally inside its card.
- Abilities and Contract remain independently scrollable when their content exceeds the available space.
- Tablet and phone layouts retain the existing stacked responsive behavior.
- The dedicated Transaction History tab remains present and functional.

## Validation evidence

The focused Player Card regression passes 5/5. The complete application suite and strict gate pass 212/212, including 255 JavaScript syntax checks, 21 canonical migrations, 115 required tables, 76 routes, environment separation, asset validation, repository policy, and secret scanning.

## Deployment status

Local candidate only. GitHub publication, hosted checks, Main merge, and Production deployment have not been authorized or run.

## Boundaries

No migration, import, reset, snapshot activation/change, archive, season transition, export-URL rotation, Discord command/configuration change, credential change, membership/assignment change, or Free Agent reinterpretation is included.

## Rollback

The exact rollback baseline is Main commit `1c5f6a9871bb7725b91b39136abdf640f2b68014` with tree `96e420b95185c064337ad25747a0dda090b78520`. This candidate adds no database migration and writes no Production data.
