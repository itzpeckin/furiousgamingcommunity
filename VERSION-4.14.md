# Franchise HQ Version 4.14

## Platform Contract and Architecture Specification

Version 4.14 begins the revised Platform Completion phase. It freezes new feature expansion and establishes the architecture that Versions 4.15–4.21 will implement.

## Added

- `platform/contract.js`
- `ARCHITECTURE.md`
- `PLATFORM-COMPLETION-CHECKLIST.md`

## Updated

- `platform/core.js`
- `index.html`
- `trade/diagnostics.js`

## Runtime capabilities

```javascript
FranchiseHQ.contract.describe()
FranchiseHQ.contract.audit()
FranchiseHQ.contract.ownerOf('appRouter')
FranchiseHQ.contract.sourceFor('currentRoute')
```

## Diagnostic clarification

`FranchiseHQ.trade.diagnostics()` no longer returns the ambiguous compatibility field `lastRenderRoute`.

Use:

- `currentApplicationRoute` for the active page
- `lastTradeContextRoute` for the most recent route that interacted with the Trade Platform

The authoritative current route remains:

```javascript
FranchiseHQ.appRouter.diagnostics().lastRender.route
```

## Commit message

```text
Version 4.14 - Establish Platform contract and architecture specification
```
