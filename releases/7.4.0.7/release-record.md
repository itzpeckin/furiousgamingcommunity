# FranchiseHQ 7.4.0.7 Release Record

**Status:** Locally validated review candidate; publication and Production remain unauthorized

**Production changed:** No. Production remains FranchiseHQ 7.4.0.6 on migration 30.

## Scope

This release converts the two commissioner-reviewed spreadsheets into a reusable Madden 27 opening draft-pick source and an explicit FGC ownership overlay. It also makes the existing three-class horizon contract observable when **Archive Season** prepares the next franchise season.

## Added during delivery

- A reusable Madden 27 source with 672 permanent pick identities covering every NFL team, Draft Classes 2027–2029, and Rounds 1–7. Its 58 non-original ownership assignments seed new Madden 27 league horizons automatically.
- A private FGC overlay containing the complete corrected 672-pick map. The overlay changes 59 assignments relative to the reusable source and can only be previewed or applied by a commissioner of the configured FGC tenant.
- Deterministic source hashes, expected counts, source references, and the documented normalization of `Pacekrs via Cowboys` to `Packers via Cowboys`.
- A no-write short circuit for an already-complete draft horizon, preventing a code deployment from replacing existing league ownership.
- An explicit configured-source path through the existing versioned baseline application. Applying a later reviewed baseline continues to preserve every pick protected by an approved-trade or commissioner-correction ledger event.
- Archive Season response evidence for the prepared three-class window. Advancing from Franchise Season 2026 to 2027 preserves the 2028 and 2029 continuity identities and creates all 224 original-owner picks for Draft Class 2030.

## Authority and privacy boundaries

The reusable source is product-wide Madden 27 configuration; FGC remains tenant configuration, never the product identity. The FGC overlay does not auto-apply. This local build did not seed or change draft-pick ownership, write Production rows, import Madden data, change the active snapshot, archive or transition a season, reset or delete data, rotate the export URL, or change credentials or memberships. Madden's blocked Free Agent source remains unknown/null and is never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

Read-only workbook validation proved 672 unique, complete pick identities in each source with no missing or duplicate original-team identities. Source reconstruction matches both recorded SHA-256 mapping digests exactly. Focused tests prove the 58 reusable ownership overrides, all 59 FGC differences including the corrected fifth round, tenant rejection outside FGC, a 672-pick 2028–2030 rollover, original ownership for the newly opened 2030 class, protected commissioner preview access, ledger preservation, and retry-safe season preparation. The consolidated strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

No GitHub publication, pull request, hosted check, staging deployment, Main change, Production deployment, migration, or Production data operation is authorized or claimed in this candidate record. Production remains exact 7.4.0.6 application merge `d138e1a` on migration 30.

## Rollback

The immutable rollback baseline is exact Main evidence commit `e0e66cdf3de25182e30b641aed32b99d37ab1853`, tree `e6d844cd16dbe6cf02d34b2cff4f0a9897aab315`.

## Next gate

The owner may separately authorize publication of the exact 7.4.0.7 candidate. Applying the private FGC source is a distinct Production data operation and must remain separately authorized after private preview review.
