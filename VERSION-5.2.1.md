# Franchise HQ 5.2.1 — Validation Framework Hotfix

## Purpose

Repair the Platform validation and release-certification checks after the application version advanced beyond the completed Platform Foundation release.

## Changes

- Application metadata advanced to `5.2.1`.
- Validation no longer assumes the full application must remain on release `4.21`.
- The stable Platform Contract remains correctly certified as Platform release `4.21` / Contract `1.0`.
- Release build validation now compares against the current application metadata.
- Platform-health validation no longer fails because it reads the previous validation report while a new validation run is still in progress.
- Every validation result now exposes `status`, `passed`, `success`, `compliant`, and `error` fields for easier diagnostics.
- Release certification now distinguishes the evolving application release from the stable Platform baseline.

## Functional impact

No Madden import, repository, roster, Trade Center, page-layout, or League Engine behavior is changed.
