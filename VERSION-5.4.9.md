# Franchise HQ v5.4.9 — LD-009 League Data Awareness

## Purpose
Complete the Development/Empty data-source banner architecture without changing its approved cosmetic design.

## Included
- One shared `FranchiseHQ.leagueDataBanner` component.
- Global banner rendering through the shared component.
- Player-card notice rendering through the same component.
- Source-aware behavior using `FranchiseHQ.leagueData.currentSource()`.
- Explicit no-render behavior for verified live Madden data.
- Idempotent global rendering that prevents duplicate banners.
- Existing Empty and Development wording and styling preserved.

## Boundaries
This release does not change source selection, persistence, events, imports, roster rendering, or banner cosmetics.
