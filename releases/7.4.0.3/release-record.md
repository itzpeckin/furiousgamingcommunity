# FranchiseHQ 7.4.0.3 Release Record

**Status:** Validated local review candidate; publication, migration, and deployment are not authorized

**Production changed:** No. Production remains on the owner-accepted 7.4.0.2 runtime and migration 28.

## Scope

This is a FranchiseHQ platform release. No FGC league identity or ownership order is hard-coded into application behavior.

For a 2026 Franchise season, the generic initializer creates 2027, 2028, and 2029 Rounds 1–7 for every active team. Each pick starts with its original team as current owner. A standard 32-team league therefore receives 672 picks.

## Added during delivery

- Automatic versioned draft-pick baseline initialization and three-class rollover.
- Permanent draft-pick continuity plus immutable ownership ledger evidence.
- Restored Trade Center navigation, asset selection, calculator, fairness, Commissioner controls, privacy boundaries, and Trade Block experience.
- Regression coverage for tenant isolation, retry safety, ownership preservation, draft privacy, and approved-trade cleanup.

## Draft-pick continuity

- Permanent continuity uses league, draft class, round, and original team rather than a Franchise-season ID.
- Initializer and season rollover operations are retry-safe and insert only missing identities.
- Rollover extends the next-three-class horizon without updating existing ownership.
- Versioned Madden-release, league-specific, and sheet-import baseline records are tenant-scoped.
- A later baseline updates only pick identities with no audited Trade Center or commissioner movement. Existing traded ownership wins.
- Approved draft-pick transfers add immutable ledger evidence.
- Historical referenced row IDs are preserved during migration; no existing pick ID is rewritten.

## Trade Center and privacy

- Navigation order is Received, Sent, Drafts, Committee, Approved, Rejected, and History.
- Drafts are saved on the server and visible only to their creator.
- Negotiations remain participant/reviewer private.
- League-wide History contains only committee-approved FranchiseHQ trades and strips private messages, review ballots, proposal notes, and rejection reasons from unrelated viewers.
- Team Trade Assets separates All, Players, and Picks. Player rows expose name, position, overall, value, and one-click package addition while names open the player card.
- The player card labels the builder return path as **Return to Trade Proposal**.
- Two-, three-, and four-team trades show per-team sent, received, net, and fairness values. Overall fairness is the least-balanced participant.

## Calculator and Commissioner controls

The detailed pre-7.4.0 calculator is restored as shared league configuration: eight player factor weights, the underlying curve/development/age/position/contract values, five package adjustments, seven round bases, three future-retention values, early/late multipliers, and Early/Mid/Late/Super Bowl projections per team. Existing simplified 7.4.0 default values migrate back to the approved model; genuine commissioner overrides are normalized and preserved. Disabling the calculator removes all values and fairness output.

## Trade Block

- Public cards are player-focused and filter by Name, Position, Team, Overall, and Development Trait.
- Cards include team presentation plus name, overall, position, development, age, cap hit, desired return, and available player imagery.
- The whole card and player name open the player card.
- Roster, player-card, Trade Block, and Manage My Trade Block entry points use the shared server-backed flow.
- The star opens a right-side editor directly. A requested-return comment is mandatory before **OK** publishes.
- My Trade Block contains only active listings; Manage My Trade Block opens the roster-style selector on demand.
- Approved player trades deactivate the prior owner’s listing.
- AI suggestion navigation and public exports are disabled.

## Authority and safety boundaries

Madden Import remains the unconditional authority for player ownership after the next import. FranchiseHQ remains the draft-pick authority while Madden provides no pick data. Blocked Free Agents remain unknown/null and are never interpreted as zero.

No push, pull request, Main change, Cloudflare deployment, Production migration, data import, snapshot change, reset, deletion, archive, season transition, URL rotation, credential change, or membership change is included in this local build authorization.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The consolidated suite passed 150 of 150 tests. The strict repository gate passed 223 JavaScript modules, 556 inventoried files, 69 routes, 94 required database tables, asset validation, environment separation, lint, and secret scanning with zero registered or unregistered failures. Exact results are recorded in `validation-evidence.json`.

## Deployment status

Not run and not authorized. Production remains on FranchiseHQ 7.4.0.2 with schema migration 28.

## Rollback

The immutable rollback baseline is FranchiseHQ 7.4.0.2 commit `b131cdafbf84a65adbb0905e09a2cc859df40e04`, tree `974bf95c8e0ecb32f6ff4bb89fbb530b72428540`.

## Next input

The commissioner-reviewed league-specific baseline and current FGC Week 11 ownership order remain pending. They will be applied as separate versioned tenant baselines and must not overwrite any audited FranchiseHQ pick movement.
