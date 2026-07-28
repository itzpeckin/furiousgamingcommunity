# Franchise HQ Platform Architecture v1.0

## Purpose

The Platform supplies shared infrastructure for every Franchise HQ capability. Feature modules consume Platform services but do not become Platform dependencies.

## Stable services

- `lifecycle`: application readiness and checkpoints
- `platform`: consolidated health reporting
- `manifest`: script and service inventory
- `contract`: ownership, boundaries, and sources of truth
- `events`: application event transport
- `state`: namespaced shared state
- `errors`: normalized errors and diagnostics
- `api`: shared network transport
- `runtime`: module registration and lifecycle
- `validate`: automated validation suites
- `release`: preflight, certification, and support bundles
- `storage`: versioned browser storage
- `config`: layered application configuration
- `features`: feature-flag evaluation
- `security`: browser security baseline
- `theme`: shared design tokens
- `ui`: loading, modal, notification, empty, and error presentation

## Layer direction

```text
Feature Modules
    ↓
Module Framework / Data Services / Identity / League Engine
    ↓
Platform 1.0
```

Platform services must not depend on feature-specific trade, roster, draft, or league-rule behavior.

## Authoritative health command

```javascript
FranchiseHQ.platform.health()
```

A healthy report requires lifecycle readiness, complete required services and checkpoints, manifest compliance, runtime readiness, contract compliance, and security compliance. The most recent validation report is included when available.

## Compatibility

`FGC_APP` and `FGC_TRADE` may remain as migration adapters. They are not sources of truth and should not receive new architecture.
