# FranchiseHQ 7.5.5.6 Release Record

**Status:** Locally validated and authorized for one consolidated Production publication cycle

**Production changed:** Not yet.

## Scope

Refine the shared Discord private-trade and Trade Submit presentation, preserve final owner notifications when completed threads are removed, and record the exact cause of the current FGC committee-delivery failure without changing a trade or league data.

## Added during delivery

- Inserts a dedicated visual spacer between every player or draft-pick asset in the shared Discord trade package.
- Reduces the Trade Status card to the actual workflow state only: Negotiating, Accepted, Approved, Rejected, or Cancelled.
- Keeps intermediate duplicate owner DMs suppressed while a private thread is active, but never suppresses terminal Approved, Rejected, or Cancelled DMs.
- Notifies both participant owners after a partner rejection so neither owner loses the result when the private thread is removed.
- Retains one identical team-colored, logo-backed asset package for private negotiations and Trade Submit review.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

The focused 39-test Discord suite and complete 215-test strict repository gate pass. The gate also verifies 255 JavaScript modules, 23 canonical migrations, 116 required tables, and 76 Pages routes.

## Deployment status

Read-only D1 inspection proved that accepted trade `trade_ffbb7621-644b-4f5e-a9ea-462268e73dcc` reached committee state and queued the correct Trade Submit event for configured channel `1014771152608055336`. Discord removed the rich embeds from that post, so FranchiseHQ deleted the incomplete duplicate and retained delivery event `discord_delivery_f3b0592d-64dc-4c0b-9299-7ae624528461` as retryable. Its recorded corrective action is to allow Embed Links for the FranchiseHQ bot in that channel.

Production publication is authorized but not yet run. No Production row changed during diagnosis.

## Boundaries

This is a code-only release. It does not migrate or alter Production D1, register commands, change Discord configuration, import or reset data, change the active snapshot, archive or transition a season, rotate the export URL, change credentials or memberships, or reinterpret blocked Madden Free Agents.

## Rollback

The exact code baseline is Main commit `c21cc23ecd29236b45db331e5fdf997bc46a6fb6` with tree `5c1ed31a3bbc6e2c256016076ccb85927718f241`. No database rollback is required.
