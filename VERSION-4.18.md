# Franchise HQ Version 4.18

## UI Infrastructure and Theme Foundation

Version 4.18 introduces shared UI infrastructure without redesigning existing pages.

### Added
- `platform/theme.js`: centralized design tokens exposed through `FranchiseHQ.theme` and CSS custom properties.
- `platform/ui-manager.js`: global loading, notification, modal, empty-state, and error-presentation services.
- Reference-counted loading requests so concurrent operations cannot prematurely hide the global loader.
- A modal stack with Escape handling, focus trapping, backdrop handling, scroll locking, and close promises.
- Automated validation for theme registration, UI capabilities, mounted hosts, and loading reference counting.

### Compatibility
The existing `platform/ui.js` adapter interface remains available. Version 4.18 extends and replaces the registered `ui` service while preserving its legacy methods.
