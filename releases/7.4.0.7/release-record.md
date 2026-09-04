# FranchiseHQ 7.4.0.7 Release Record

**Status:** Production deployed; read-only verification passed; owner UI acceptance pending

**Production changed:** Code only. FranchiseHQ 7.4.0.7 is live on migration 30; no database or league-data operation ran.

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

The reusable source is product-wide Madden 27 configuration; FGC remains tenant configuration, never the product identity. The FGC overlay does not auto-apply. Publication and code deployment did not seed or change draft-pick ownership, write Production rows, import Madden data, change the active snapshot, archive or transition a season, reset or delete data, rotate the export URL, or change credentials or memberships. Madden's blocked Free Agent source remains unknown/null and is never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

Read-only workbook validation proved 672 unique, complete pick identities in each source with no missing or duplicate original-team identities. Source reconstruction matches both recorded SHA-256 mapping digests exactly. Focused tests prove the 58 reusable ownership overrides, all 59 FGC differences including the corrected fifth round, tenant rejection outside FGC, a 672-pick 2028–2030 rollover, original ownership for the newly opened 2030 class, protected commissioner preview access, ledger preservation, and retry-safe season preparation. The consolidated strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

Owner authorization published exact candidate `66def9a48fa20130d35b1a7418b72b955615ddfa` through [PR #38](https://github.com/itzpeckin/furiousgamingcommunity/pull/38). All four candidate checks passed. The PR merged to Main as exact merge `637a48c25ea2187f60263955ef11010b101b4ac6`, and all six Main build, quality, deployment, Pages, and Worker checks passed. Production Pages deployment `1e4eaad8-2ffb-442c-8e37-af8cd27293aa` and Worker build `e8613496-efe6-4f03-b948-aac1493fb3b6` / version `7cae5f20-a37d-4b5f-b275-7ba1ca11cd3d` succeeded. Read-only HTTPS checks confirmed the public 7.4.0.7 marker, exact Trade Center asset, and a healthy tenant-list endpoint. Migration 30 remains current; staging and all Production data operations remained untouched.

## Rollback

The immutable rollback baseline is exact Main evidence commit `e0e66cdf3de25182e30b641aed32b99d37ab1853`, tree `e6d844cd16dbe6cf02d34b2cff4f0a9897aab315`.

## Next gate

Owner signed-in UI acceptance is next. Applying the private FGC source remains a distinct Production data operation and requires separate authorization after commissioner-only preview review.
