# FranchiseHQ 7.4.4 Release Record

**Status:** Locally validated review candidate; publication and Production are not yet authorized

**Production changed:** No. Production remains FranchiseHQ 7.4.3 on migration 33. No import, snapshot activation, data mutation, URL rotation, archive, transition, reset, or deletion ran.

## Scope

This code-only release consolidates the permanent Madden export connection and weekly importer into one commissioner workflow, prioritizes its three routine actions, improves phone usability, and preserves the selected Commissioner tab within the horizontally scrollable navigation.

## Added during delivery

- One full-width **Madden Companion Import** workspace replaces the separate Dedicated Madden Export URL and import cards.
- **Copy URL**, **Import Latest Export**, and **Refresh** are the first controls in the workflow.
- Current-step progress and phase status appear immediately after the actions, followed by one latest-snapshot summary.
- Export readiness, automatic polling, rejected-source recovery guidance, advanced URL rotation controls, technical identifiers, atomic activation, and historical-backfill context remain available without duplication.
- Mobile actions are full-width touch targets; phase progress scrolls within its own rail; snapshot evidence becomes one column at narrow phone widths.
- Commissioner navigation records and restores the horizontal tab viewport so selecting **Audit** leaves Audit selected and visible after route rendering.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero.

## Validation evidence

Focused Commissioner, import, permanent-export, candidate, and competition tests cover the unified workspace, action placement, mobile layout contracts, source readiness, atomic activation, tab viewport restoration, and unchanged Free Agent semantics. The complete strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

Local implementation only on `codex/franchisehq-7.4.4`. GitHub publication, hosted checks, Main, Cloudflare Pages, the import Worker, D1, and Production remain unchanged.

## Rollback

The immutable rollback baseline is exact Main evidence commit `eb1901501f8985955c004f2803e34b9a11ba6bae`, tree `e8433de8296fa75863ab9f204d90636207feaa4e`, representing the recorded FranchiseHQ 7.4.3 Production state. This candidate adds no database migration.

## Next gate

After owner review, separately authorize exact-candidate publication, PR and hosted checks, merge to Main, code-only Production deployment, and read-only acceptance. No migration or league-data operation is required.
