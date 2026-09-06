# FranchiseHQ 7.4.4 Release Record

**Status:** Production deployed and read-only verified; pending owner UI acceptance

**Production changed:** Yes, code only. Exact candidate `1b8562358de29881b08c69b5be9155b6b03e1a6b` was published through PR #43, merged to Main as `72b61aa0d058814d8ab1e5f060c2acb053a8e142`, and deployed by Cloudflare Pages deployment `a3cc2702-baa1-4d0b-aa46-9a3dd0686743`. Migration 33 remains current. No import, snapshot activation, data mutation, URL rotation, archive, transition, reset, or deletion ran.

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

Focused Commissioner, import, permanent-export, candidate, and competition tests cover the unified workspace, action placement, mobile layout contracts, source readiness, atomic activation, tab viewport restoration, and unchanged Free Agent semantics. The exact candidate passed all four PR checks. The Main quality and deployment checks passed. Signed-in read-only Production acceptance confirmed the 7.4.4 marker, the single import workspace, exact top action order, progress-before-snapshot hierarchy, live Season 2026 / Regular Season Week 13 context, and Free Agents still unknown. SHA-256 hashes of `trade-module.js`, `styles.css`, and `league-engine/one-click-import.js` match Main exactly. The complete evidence is recorded in `validation-evidence.json`.

## Deployment status

Published from `codex/franchisehq-7.4.4` through [PR #43](https://github.com/itzpeckin/furiousgamingcommunity/pull/43), merged to Main as `72b61aa0d058814d8ab1e5f060c2acb053a8e142`, and deployed to Production through Cloudflare Pages deployment `a3cc2702-baa1-4d0b-aa46-9a3dd0686743`. The import Worker source did not change and its Production build/version remain `b87f1bb1-71cc-4695-af0c-c3fe1415223f` / `326ee7ef-55b2-4041-8eb2-db4ee9358bd0`; exact-candidate build `28050630-a8ff-4ccf-a339-463079912b02` / version `1479e845-3523-4ab0-9bc3-def8bb01fd9e` passed without receiving Production traffic. D1 remained on migration 33 and no database operation was required or run.

## Rollback

The immutable rollback baseline is exact Main evidence commit `eb1901501f8985955c004f2803e34b9a11ba6bae`, tree `e8433de8296fa75863ab9f204d90636207feaa4e`, representing the recorded FranchiseHQ 7.4.3 Production state. This candidate adds no database migration.

## Next gate

Owner signed-in UI acceptance of the unified import workspace is next. No import or league-data operation is part of this release.
