# FranchiseHQ 7.4.1 Release Record

**Status:** Production deployed and read-only verified; signed-in owner acceptance pending

**Production changed:** Yes. Exact candidate `555fab9f5ae002c26baddb6fe98bce174e6437c5` is merged to Main as `9903a969dd224d76b001c6272234b1967090e603`, Production serves FranchiseHQ 7.4.1, and additive migration 31 is verified.

## Scope

This consolidated cycle completes the planned Transactions and League History foundation and includes the owner's final Trade Center acceptance changes: full-width Trade Review asset rows and active-standings draft-pick projections.

## Added during delivery

- Full-width team-branded player rows throughout Trade Review. Each row uses the accepted Trade Block presentation for Development, Contract, and Age, with explainable Trade Value included only when the shared calculator is enabled. Hiding calculator values does not restructure the package.
- Record-based projected draft slots for every available pick. The current active snapshot standings are read whenever Trade Center state is loaded, inverse order follows the pick's original team, a first-round label renders as `1.01`, and a later Madden import automatically changes the estimate. Exact-record ties are stable estimates because official Madden/NFL tiebreakers are not claimed. Incomplete standings display no projected slot.
- A season-grouped Transactions experience covering public Madden-observed trades, signings, releases, and movements. Member-visible records show before/after team states and source summaries without exposing pending workflow or internal reconciliation labels.
- Permanent signed-in transaction links and a compact `league_transaction_history` projection that survives removal of active Madden-edition transaction/evidence rows during a future transition. The retained relational summary complements the existing immutable game-year archive; it does not preserve or expose raw private payloads.
- Commissioner-only append-only correction revisions for display type, franchise season, Madden week, time, and participant identifiers. Every correction requires a reason and tenant audit event. Original canonical rows and source evidence remain unchanged.
- Trade Center approval now creates its canonical trade, immutable workflow evidence, and permanent History Books projection in the same D1 batch. Later Madden roster reconciliation updates both active and retained summaries while Madden stays authoritative.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero.

## Validation evidence

Focused tests cover inverse-standings updates, original-team pick authority, tie and incomplete-standings behavior, two-to-four-team full-width Trade Review, calculator-off layout invariance, Trade Center atomic history creation, member/commissioner access, tenant isolation, sanitized source evidence, repeated workflow/roster idempotence, append-only correction revision conflicts, and permanent-link readback after active canonical rows are removed. The full consolidated gate passes 162/162 tests; fresh and legacy migration tests reach schema 31 with zero foreign-key violations.

The strict repository gate passes 228 JavaScript modules, 565 inventoried files, 69 routes, HTML assets, environment separation, and the secret scan. No cloud environment or Production data was touched during implementation.

## Deployment status

Published through [PR #40](https://github.com/itzpeckin/furiousgamingcommunity/pull/40) after all four candidate checks passed. Before the schema change, Production D1 target `franchise-hq-db-madden27` (`b2529150-28af-42ca-a07b-69506764ccb6`) was confirmed and Time Travel bookmark `000000f8-00000148-000050dd-22fb74dae910207e3c250ee20d092278` was recorded. Additive migration 31 then created `league_transaction_history` and `canonical_transaction_corrections`; the ledger, both table contracts, required foreign keys, protected counts, active snapshot, 672 draft picks, 1,344 pick-ledger events, and blocked Free Agent state were verified. `PRAGMA foreign_key_check` returned no violations. Post-migration bookmark `000000f8-00000154-000050dd-c04ac9c04cbc6114062ce08ee77f860a` is retained.

PR #40 merged to Main as `9903a969dd224d76b001c6272234b1967090e603`. All six Main checks passed, including the repository quality gate, Pages, and Worker builds. Production Pages deployment `a8087a3a-80da-4ea7-a7d7-9240a68923ef`, Worker build `b87f1bb1-71cc-4695-af0c-c3fe1415223f`, and Worker version `326ee7ef-55b2-4041-8eb2-db4ee9358bd0` are live. Read-only HTTPS acceptance found the 7.4.1 public marker and Trade Center asset, while the signed-out tenant Transactions endpoint correctly returned `401 Authentication required`.

No import, active-snapshot change, reset, deletion, Archive Season, edition transition, export-URL rotation, credential/membership change, or draft-pick ownership operation ran. Free Agents remain explicitly blocked/unknown and were not interpreted as zero.

## Rollback

The immutable rollback baseline is exact commit `ffcb61145b4d5a5e68a6d371ebef588249b01c7e`, tree `99cbc4475b2b1a80d8f072dd60110ac232a2a0cf`, representing the recorded and owner-accepted FranchiseHQ 7.4.0.8 Production state.

## Next gate

The owner can perform signed-in acceptance of the Transactions experience, projected draft-slot labels, full-width Trade Review asset rows, and commissioner correction controls. No data-changing acceptance action is required.
