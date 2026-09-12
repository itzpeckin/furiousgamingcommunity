# FranchiseHQ 7.5.5.7 Release Record

**Status:** Authorized candidate; Production publication pending

**Production changed:** No. Production remains on 7.5.5.6 and migration 40 until the candidate passes the protected release gate.

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

Production remains on 7.5.5.6 until the protected 7.5.5.7 branch, pull request, hosted checks, Main merge, and Git-integrated Pages deployment complete.

### Production diagnosis

The newest accepted FGC trade `trade_3ff4c41a-fa75-48e6-851a-18bdd3c04ca1` is in committee revision 1. Delivery event `discord_delivery_16facb1d-bf78-4336-9131-f4210b51283c` targeted configured channel `1014771152608055336`, but Discord removed the rich cards. The event is retryable after one attempt. The read-only query wrote zero rows.

## Boundaries

This release requires no migration or Discord command registration. It does not execute a trade reset, change a live trade or active snapshot, import data, archive or transition a season, rotate the export URL, change Discord routing or credentials, alter memberships, or reinterpret blocked Madden Free Agents.

## Rollback

The code-only rollback baseline is Main commit `1f8f5e27081b1d0fadf9ceb11ef1205d15303f94` with tree `1dbe39d85b27ef14248d3cf5de1ed283b3ffc6f1`. No database rollback is required.
