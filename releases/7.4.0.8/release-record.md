# FranchiseHQ 7.4.0.8 Release Record

**Status:** Locally validated review candidate; publication, Production, and the FGC pick operation remain unauthorized

**Production changed:** No. Production remains FranchiseHQ 7.4.0.7 on migration 30.

## Scope

This release closes the final accepted Trade Center layout and filtering defects, then packages the exact corrected FGC draft-pick source for a separately authorized one-time Production application.

## Added during delivery

- A compact 220–260 pixel desktop rail for Trade Activity and Trade Block Targets, returning more width to sent, received, committee, approved, rejected, and history content.
- One vertical review package flow for two-, three-, and four-team trades. Every receiving team occupies its own spaced row, review arrows are removed, and calculator visibility changes only the value section below the packages.
- An in-place Trade Block player-name filter. The input is no longer destroyed and recreated for each character, so full names, normal mobile keyboards, deletion, and incremental matching remain stable.
- A full-database regression for the exact 672-pick FGC source. It proves the corrected fifth-round mapping replaces the generic horizon only where ownership has not been protected by an approved trade or commissioner correction, and proves retries do not duplicate ledger evidence.
- A consolidated Production operation plan for source `fgc-madden-27-opening-ownership`. The operation is not part of local validation and has not been authorized or executed.

## Authority and privacy boundaries

The 7.4.0.7 application deployed both source definitions but did not apply the FGC overlay. The reusable horizon can initialize ordinary Madden 27 picks; the FGC map remains private tenant configuration. This candidate writes no Production rows, applies no baseline, changes no ownership, runs no import, changes no snapshot, archives or transitions no season, resets or deletes no data, rotates no export URL, and changes no credential or membership. Madden's blocked Free Agent source remains unknown/null and is never interpreted as zero.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. This is unrelated to the Trade Center layout and draft-pick ownership work.

## Validation evidence

Focused tests cover compact/stable review layout contracts, calculator-on/off layout invariance, in-place name filtering, exact FGC source expansion, generic-to-FGC replacement, protected audited ownership, and retry safety. The consolidated strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

No GitHub publication, pull request, hosted check, staging deployment, Main change, Production deployment, migration, or Production data operation is authorized or claimed in this candidate record. Production remains exact 7.4.0.7 application merge `637a48c` on migration 30.

## Rollback

The immutable rollback baseline is exact Main evidence commit `14d3ff7803917975c10f0d46d48ce0e6f574b029`, tree `d7609b8c036e02b8e4867a1a68a6dc29f9631dd0`.

## Next gate

After owner review, one consolidated authorization may publish the exact candidate, merge and deploy the code, verify Production, and apply the exact FGC baseline once with before/after counts and protected-ownership evidence. No migration is required.
