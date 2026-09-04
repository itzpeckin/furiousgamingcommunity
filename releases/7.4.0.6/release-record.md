# FranchiseHQ 7.4.0.6 Release Record

**Status:** Locally validated review candidate

**Production changed:** No. Production remains FranchiseHQ 7.4.0.5 on migration 30.

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

Revising or cancelling a negotiation does not move a player or draft pick. Approved Trade Center roster overlays remain presentation-only until Madden Import confirms or overrides player ownership. No import, snapshot operation, pick seed/baseline, league-data mutation, or Production operation was performed. Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The focused Trade Center suite passes all 9 tests, including a proposer revision from revision 1 to 2, reset recipient acceptance, stale-action rejection, and subsequent proposer-only cancellation. Local browser checks at desktop and 390×844 verify the revised proposal, explainable values, removal confirmation, exact-player manager focus, bottom-sheet Add Players layout, and bounded horizontal geometry. The full consolidated strict gate is recorded in `validation-evidence.json`.

## Deployment status

This release is local only on `codex/franchisehq-7.4.0.6`. GitHub publication, a pull request, hosted checks, Main, Cloudflare Pages, the Worker, and Production remain unchanged and require a separate exact-commit authorization.

## Rollback

The immutable rollback baseline is exact Main evidence commit `4e39c09f3c45e5bc7b8e90ad8944802249a195ae`, tree `d2ffef6647e76439b4342ab2a0fb44556fd9c68d`. The currently deployed 7.4.0.5 application baseline remains exact Main merge `0c372bd2a36ff52e491b8b6b84637a0fe1513e03`.

## Next gate

Authorize publication of the final exact 7.4.0.6 commit, creation of its pull request, hosted checks, merge to Main, and code-only Production deployment. No migration or league-data operation is required.
