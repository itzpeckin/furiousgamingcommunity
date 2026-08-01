# Franchise HQ v5.6.1b

## Commissioner HQ Navigation & Schedule Cleanup

This hotfix restores Commissioner HQ rendering and navigation after the weekly Confidence Pool window controls introduced a rendering failure on the Overview tab. The Confidence Pool management card now fails safely and no longer depends on `Array.prototype.at()`.

The League Schedule toolbar has also been simplified by removing the redundant full week-button panel. Week selection remains available through the compact previous/next controls.

### Changed files

- `app.js`
- `styles.css`
- `index.html`
- `trade-module.js`
