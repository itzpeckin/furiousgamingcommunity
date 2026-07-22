# Furious Gaming Community — Franchise HQ

## Sprint TC-003: Draft Pick Engine

This release combines the validated TC-002 package engine with the first working draft-pick valuation model.

### TC-002 correction

- The Best Player Premium now compares every player across both sides of the transaction.
- Only the package containing the single most valuable player can receive the premium.
- A one-player package no longer earns a premium merely because that player represents 100% of its own side.
- Package concentration and best-player value are treated as separate ideas.

### TC-003 features

- Draft picks from 2027, 2028, and 2029 receive transparent values.
- Each value includes round base value, future-year discount, and projected owner finish.
- Owner projection tiers: Strong contender, Playoff, Middle, Likely Top 10, Likely Top 5, and Likely Top 3.
- Picks owned by teams projected to finish poorly receive higher value.
- Clicking a draft pick opens a large pick-value card showing its complete calculation.
- The trade builder and submitted trade calculations use the same pick model.
- Model labels: LVE 1.1, Package Engine 1.1, Draft Pick Engine 1.0.

### Validation

1. Open Trade #104 and expand package adjustments.
2. Confirm only the side with the highest-valued player receives Best Player Premium.
3. Click a draft pick in the trade package.
4. Confirm the pick card shows round base, owner projection, future discount, and total value.
5. Build a trade with 2027 and 2029 picks from the same team and confirm the 2029 pick is discounted.
6. Compare first-round picks owned by teams with different projection tiers.
7. Confirm player cards and DEV-001 account switching still work.

Mock projections are intentionally configurable placeholders until real owner history and franchise standings are imported.
