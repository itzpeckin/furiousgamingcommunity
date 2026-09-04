# FranchiseHQ 7.4.0.6 Release Record

**Status:** Production deployed and read-only verified; owner UI acceptance pending

**Production changed:** Yes, within the authorized code-only release boundary. Production now serves exact Main merge `d138e1a` and remains at migration 30.

## Scope

This code-only remediation completes the requested sent-offer revision path, redesigns the player and pick rows inside an opened proposal, preserves multi-team builder position while assets are selected, and tightens every Trade Center and Trade Block surface for portrait-phone use.

## Added during delivery

- A proposer-visible **Revise Offer** action for sent trades while their status remains `negotiating`. The existing server workflow retains the trade ID, advances its revision, accepts the revising team's new terms, clears every other participant's prior acceptance, and notifies the other owners.
- A team-branded opened-proposal treatment with player imagery or position placeholders, rating/development chips, explicit movement direction, and clickable value explanations.
- Preserved horizontal team-panel and per-team roster-list scroll positions across player selection, filtering, and builder rerenders so multi-team selection stays where the owner was working.
- An owned-listing star that opens a purpose-built remove confirmation instead of the management rail.
- A clickable owned **Looking for** surface that opens Manage My Trade Block, scrolls the exact player into view, highlights the row, and focuses its notes field on desktop and mobile.
- Responsive Trade Center detail, Trade Block filters/rows, manager rows, confirmation dialog, value explanation, and bottom-sheet Add Players layouts without page-level horizontal overflow.

## Authority and privacy boundaries

Revising or cancelling a negotiation does not move a player or draft pick. Approved Trade Center roster overlays remain presentation-only until Madden Import confirms or overrides player ownership. No import, snapshot operation, pick seed/baseline, migration, or league-data mutation was performed. Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The focused Trade Center suite passes all 9 tests, including a proposer revision from revision 1 to 2, reset recipient acceptance, stale-action rejection, and subsequent proposer-only cancellation. Local browser checks at desktop and 390×844 verify the revised proposal, explainable values, removal confirmation, exact-player manager focus, bottom-sheet Add Players layout, and bounded horizontal geometry. The full consolidated strict gate is recorded in `validation-evidence.json`.

## Deployment status

Exact candidate `598ba57` was published through PR #37 and passed all four pull-request checks. The PR merged to Main as `d138e1a`; all six Main build, quality, Pages, Worker, and deployment checks passed. Cloudflare Pages deployment `6092a340-d83e-4454-9eae-4cfeb300b173` and Worker build `b2673ed7-c1bc-4ee3-9b20-94f8cb0d4763` succeeded. Read-only authenticated HTTPS verification confirmed the protected league Trade Center reports FranchiseHQ 7.4.0.6 and loads the 7.4.0.6 application and Trade Center assets.

No migration or Production data operation ran. Migration 30, every league-data row, the active snapshot, credentials, memberships, export URL, and blocked/null Free Agent semantics remain unchanged.

## Rollback

The immutable rollback baseline is exact Main evidence commit `4e39c09f3c45e5bc7b8e90ad8944802249a195ae`, tree `d2ffef6647e76439b4342ab2a0fb44556fd9c68d`. The currently deployed 7.4.0.5 application baseline remains exact Main merge `0c372bd2a36ff52e491b8b6b84637a0fe1513e03`.

## Next gate

Signed-in owner acceptance should verify sent-offer revision, the redesigned opened-proposal assets, stable multi-team selection position, direct Trade Block removal, exact-player notes focus, and portrait-phone behavior. No import, migration, or league-data operation is required for acceptance.
