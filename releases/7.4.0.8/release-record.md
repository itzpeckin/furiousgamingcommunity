# FranchiseHQ 7.4.0.8 Release Record

**Status:** Production deployed; exact FGC pick baseline applied and verified; owner UI acceptance pending

**Production changed:** Yes. FranchiseHQ 7.4.0.8 is live on migration 30, and the authorized FGC-only 672-pick baseline was applied. No other league-data operation ran.

## Scope

This release closes the final accepted Trade Center layout and filtering defects, then packages the exact corrected FGC draft-pick source for a separately authorized one-time Production application.

## Added during delivery

- A compact 220–260 pixel desktop rail for Trade Activity and Trade Block Targets, returning more width to sent, received, committee, approved, rejected, and history content.
- One vertical review package flow for two-, three-, and four-team trades. Every receiving team occupies its own spaced row, review arrows are removed, and calculator visibility changes only the value section below the packages.
- An in-place Trade Block player-name filter. The input is no longer destroyed and recreated for each character, so full names, normal mobile keyboards, deletion, and incremental matching remain stable.
- A full-database regression for the exact 672-pick FGC source. It proves the corrected fifth-round mapping replaces the generic horizon only where ownership has not been protected by an approved trade or commissioner correction, and proves retries do not duplicate ledger evidence.
- The exact private FGC baseline for 672 permanent pick identities across 32 teams, Draft Classes 2027–2029, and Rounds 1–7. Production now contains 110 non-original ownership assignments from the reviewed map.
- A recoverable, audited Production application protected by before/after D1 bookmarks. The operation skips any pick protected by a `trade-approved` or `commissioner-correction` ledger event and remains retry-safe.

## Authority and privacy boundaries

The reusable horizon remains FranchiseHQ-wide while the applied FGC map remains private tenant configuration. The one authorized data operation changed only FGC draft-pick baseline, ownership, ledger, application, and audit rows. Production had no existing `trade-approved` or `commissioner-correction` draft-pick events; the preservation guard remained active and local rehearsal separately proved a commissioner-corrected owner remains untouched. No import ran, the active snapshot did not change, no season was archived or transitioned, no data was reset or deleted, no export URL was rotated, and no credential or membership was changed. Madden's blocked Free Agent source remains unknown/null and is never interpreted as zero.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. This is unrelated to the Trade Center layout and draft-pick ownership work.

## Validation evidence

Focused tests cover compact/stable review layout contracts, calculator-on/off layout invariance, in-place name filtering, exact FGC source expansion, generic-to-FGC replacement, protected audited ownership, and retry safety. A disposable all-30-migration rehearsal executed the exact generated SQL against 672 picks, preserved a simulated commissioner correction, remained retry-safe, and returned zero foreign-key violations. Production readback verified 224 picks in each of 2027, 2028, and 2029; 110 non-original owners; the exact mapping SHA-256; 672 baseline entries; a complete 672/672 application; zero unprotected mapping mismatches; one tenant audit row; and zero foreign-key violations. Users, memberships, team assignments, and active snapshot `7433846f-3750-4b9b-965a-3ead8f38590f` were unchanged.

## Deployment status

Owner authorization published exact candidate `1c6c62f7d4a28a055fbed5a16b7f25dc3c7cabbc` through [PR #39](https://github.com/itzpeckin/furiousgamingcommunity/pull/39). All four candidate checks passed. The PR merged to Main as exact merge `37be901a60234c3ef844280527872eec4586d4ba`, and all six Main build, quality, deployment, Pages, and Worker checks passed. Production Pages deployment `52ae9935-decc-447d-abc2-0b8cf8a5732f` and Worker build `706fda54-186e-4559-9ef3-77fcaa30516a` / version `fb32429a-19b3-4837-869f-2df057e5547b` succeeded. Read-only HTTPS checks confirmed the public 7.4.0.8 marker, exact Trade Center asset, and healthy tenant-list endpoint. Migration 30 remains current.

The confirmed Madden 27 database was bookmarked at `000000f6-000002c0-000050dc-5a3f0e43b49e66893958c0cb9b3e5108` before the data operation and `000000f6-00000306-000050dc-dd5bb4594e5c184a06a8c9a0e5ce2df9` after verification. D1 reported 2,020 logical changes and 6,059 engine row writes for the baseline transaction. The old Madden 26 database was not used.

## Rollback

The immutable rollback baseline is exact Main evidence commit `14d3ff7803917975c10f0d46d48ce0e6f574b029`, tree `d7609b8c036e02b8e4867a1a68a6dc29f9631dd0`.

## Next gate

Owner signed-in UI acceptance is next: confirm the compact Trade Center rail, one-column two-/three-/four-team review packages, calculator-off layout stability, normal full-name Trade Block filtering, and the reviewed FGC picks in the Trade Center. No new import or data operation is needed.
