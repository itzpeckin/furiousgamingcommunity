# Franchise HQ Version 4.12

## Trade Platform Foundation

Version 4.12 introduces the first dedicated Trade Platform services while preserving the existing Trade Center implementation through a compatibility adapter.

### New services

- `FranchiseHQ.trade`
- `FranchiseHQ.trade.state`
- `FranchiseHQ.trade.events`
- `FranchiseHQ.trade.diagnostics`

### Navigation scroll correction

Version 4.11 attempted to persist scroll on the `.sidebar` shell. The actual desktop scroll container is `[data-nav-list]`. Version 4.12 now saves and restores the correct element, reapplies the position after route and Trade Center render events, and ensures the active route remains visible.

### Trade lifecycle

Trade routes now render through `FranchiseHQ.trade`, which delegates to the existing `FGC_TRADE` implementation. The service emits:

- `trade-before-render`
- `trade-after-render`
- `trade-platform-ready`
- `trade-ready`

### Commit message

`Version 4.12 - Introduce Trade Platform Foundation and correct sidebar scroll persistence`
