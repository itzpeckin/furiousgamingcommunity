# FranchiseHQ 7.5.5.7 Release Record

**Status:** Production deployed; owner mobile/Discord acceptance pending

**Production changed:** Yes. PR #76 merged to Main as `2694e8dd57de6cb24516233e807a536b52fd905c`, and Git-integrated Pages deployment `ba8fe890-af5e-4ced-bd18-581d5a6d97b8` serves release 7.5.5.7. Migration 40 remains current.

## Scope

Promote the two Trade Center reset operations into Command Center Quick Controls, make Trade Review asset cards deliberately readable at phone widths, and guarantee a functional Trade Submit review even when Discord removes rich embeds.

## Added during delivery

- **Reset Season Trades** and **Reset ALL Trades** are prominent Command Center operations with the same explicit confirmation and server-authoritative audit behavior already used in League Controls.
- Mobile review cards retain player image, team identity, player/pick details, route, and optional trade value while separating metrics into readable horizontally scrollable cells instead of compressing them.
- Trade Submit still prefers the exact rich private-thread cards. If Discord strips embeds, FranchiseHQ atomically replaces the incomplete post with a complete permission-safe player/pick package and the same Approve/Deny controls.
- Multi-message fallback is bounded to Discord content limits and removes partial fallback posts if a later fallback write fails.
- Authenticated Trade Center loads safely wake retryable Discord outbox events, so an accepted trade is not stranded until another workflow action occurs; the existing idempotency key prevents duplicate committee posts.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. Rich Trade Submit colors and logos still depend on Discord allowing Embed Links in the selected channel, but 7.5.5.7 removes that permission as a functional blocker by providing a complete player/pick and decision-control fallback.

## Validation evidence

The focused 48-test Trade Center and Discord suites pass. The complete strict repository gate validates 215 automated tests, 255 JavaScript modules, 23 canonical migrations, 116 required tables, and 76 Pages routes.

## Deployment status

Exact candidate `2dc3d3208f3182fb5f41e0cdfe1255e629fc3a85` was published through PR #76 with all four pull-request checks passing. The PR merged as Main `2694e8dd57de6cb24516233e807a536b52fd905c`; the Main quality, Pages build/deployment, and Cloudflare Pages checks passed. Git-integrated Pages deployment `ba8fe890-af5e-4ced-bd18-581d5a6d97b8` serves release 7.5.5.7, and authenticated acceptance loaded FGC at Season 2026, Regular Season Week 19.

The live Command Center exposes prominent **Reset Season Trades** and **Reset ALL Trades** controls; neither operation was clicked. Mobile review behavior is covered by the focused responsive regressions and remains pending owner device acceptance.

### Production diagnosis

The newest accepted FGC trade `trade_3ff4c41a-fa75-48e6-851a-18bdd3c04ca1` remains unchanged in committee revision 1. Before deployment, delivery event `discord_delivery_16facb1d-bf78-4336-9131-f4210b51283c` targeted configured channel `1014771152608055336`, but Discord removed the rich cards and left it retryable after one attempt. The initial diagnosis wrote zero rows.

After deployment, one authenticated Trade Center load safely woke the retained event. It completed as `sent` on attempt 2 at `2026-09-12 05:27:23`; the workflow remained in committee revision 1. This changed only the one operational outbox row and wrote zero protected league rows. The committee package now retains every player/pick plus Approve/Deny even when Discord requires the permission-safe text fallback.

## Boundaries

This release requires no migration or Discord command registration. It did not execute a trade reset, change a live trade or active snapshot, import data, archive or transition a season, rotate the export URL, change Discord routing or credentials, alter memberships, or reinterpret blocked Madden Free Agents. Exactly one operational Discord delivery event advanced from retryable to sent.

## Rollback

The code-only rollback baseline is Main commit `1f8f5e27081b1d0fadf9ceb11ef1205d15303f94` with tree `1dbe39d85b27ef14248d3cf5de1ed283b3ffc6f1`. No database rollback is required.
