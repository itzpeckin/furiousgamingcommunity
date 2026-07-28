# Franchise HQ Platform Completion Checklist

## Phase 4 — Platform Foundation

| Version | Platform subsystem | Status |
|---|---|---|
| 4.14 | Platform contract and architecture specification | Complete |
| 4.15 | State architecture and event contract | Complete |
| 4.16 | API and error framework | Complete via 4.16.1 |
| 4.17 | Module runtime and validation framework | Complete |
| 4.18 | UI infrastructure | Complete — awaiting validation |
| 4.19 | Storage, configuration, and feature flags | Pending |
| 4.20 | Security, testing, and release hardening | Pending |
| 4.21 | Platform completion release | Pending |

## Version 4.17 acceptance criteria

- `FranchiseHQ.runtime` is registered as the authoritative module lifecycle service.
- Modules declare identity, routes, permissions, dependencies, and version metadata.
- Runtime lifecycle supports register, initialize, start, ready, and shutdown behavior.
- Dependency failures are visible in runtime diagnostics and do not silently pass.
- Lifecycle transitions are recorded and emitted as Platform events.
- `FranchiseHQ.validate` supports registered synchronous and asynchronous test suites.
- A complete validation report includes pass, fail, warning, skip, duration, and detailed result fields.
- Built-in validation checks the Platform contract, required services, state namespaces, API/error diagnostics, event cleanup, runtime metadata, dependency integrity, and module readiness.
- Existing authentication, Commissioner HQ, navigation, data pages, and Trade Center behavior remain functional.


## Version 4.18 acceptance criteria

- `FranchiseHQ.theme` is registered and applies shared CSS token variables.
- `FranchiseHQ.ui` exposes notification, loading, modal, empty-state, and error-presentation capabilities.
- Loading requests are reference counted and can be independently released.
- The modal manager supports a stack, Escape close, backdrop close, focus handling, and scroll locking.
- Existing UI adapter methods remain available after the UI service upgrade.
- Global UI hosts are mounted once and do not alter existing page layouts when inactive.
- Automated validation reports the UI infrastructure suite as compliant.
- Existing authentication, navigation, Commissioner HQ, data pages, and Trade Center workflows remain functional.
