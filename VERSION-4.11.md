# Franchise HQ Version 4.11

## Application Shell Modularization

Version 4.11 begins the safe decomposition of the legacy application shell without changing league data or Trade Center workflows.

### Added

- `app/router.js`
  - Owns application route rendering lifecycle.
  - Owns route title resolution.
  - Emits `app-route-rendered` diagnostics.
  - Provides `FranchiseHQ.appRouter`.

- `app/sidebar.js`
  - Owns desktop sidebar scroll persistence.
  - Restores the saved position after route rendering and late layout changes.
  - Owns mobile drawer open/close state.
  - Automatically closes the mobile drawer after route changes.
  - Provides `FranchiseHQ.sidebar`.

### Changed

- `platform/navigation.js`
  - Routes page rendering through `FranchiseHQ.appRouter`.
  - Preserves the legacy renderer only as a compatibility fallback.

- `app.js`
  - Registers its current page renderer with the new application router.
  - Delegates sidebar behavior to the sidebar service.
  - Removes direct sidebar persistence ownership.
  - Keeps existing page renderers intact to minimize regression risk.

- `index.html`
  - Loads the new application shell modules before `app.js`.

- `platform/core.js`
  - Updates metadata to Version 4.11.
  - Adds `appRouter` and `sidebar` to lifecycle requirements.

## Included navigation correction

The desktop sidebar scroll position is restored after the final route and Trade Center layout pass, rather than only during the first browser paint.

## Compatibility

`FGC_APP.renderRoute` remains available as a temporary fallback. Normal navigation now uses `FranchiseHQ.appRouter`.
