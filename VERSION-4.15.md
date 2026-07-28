# Franchise HQ Version 4.15

## State Architecture and Event Contract

Version 4.15 establishes the authoritative state boundaries and event conventions required by the Platform Contract.

## New Platform service

`FranchiseHQ.state`

Capabilities:

- registered and owned state namespaces
- immutable snapshots
- patch and replace operations
- hydration and reset behavior
- trigger-based resets
- scoped subscriptions
- state history and diagnostics

Initial namespaces:

- platform
- identity
- league
- dataCache
- trade

## Event service improvements

`FranchiseHQ.events` now provides:

- canonical `namespace:action` names
- migration support for legacy `namespace-action` names
- standardized event metadata
- duplicate-listener prevention
- listener ownership
- owner-level cleanup
- subscription and event-history diagnostics

## Trade compatibility

`FranchiseHQ.trade.state` remains available with the same public methods, but now delegates to the registered `trade` state namespace.

## No intended visual changes

This release changes shared architecture only. Existing pages and Trade Center behavior should remain unchanged.
