# Security Baseline

`FranchiseHQ.security` provides consistent browser-side defensive helpers.

## Safe rendering

Use `escapeHTML(value)` when a string must be inserted into an HTML template. Prefer `text(value)` and DOM `textContent` when possible.

## URL validation

Use `isSafeUrl`, `normalizeUrl`, or `assertSafeUrl` before assigning user-controlled links. `javascript:`, `data:`, `vbscript:`, and `file:` schemes are rejected.

## External links

`safeExternalLink(anchor, url)` applies `target="_blank"` and `rel="noopener noreferrer"`.

## Redaction

`redact(value)` removes common token, password, authorization, cookie, and secret fields before diagnostics are exported.

## Audit

`FranchiseHQ.security.audit()` reports unsafe URL schemes, inline event handlers, and `_blank` links missing safe `rel` attributes. Warnings are migration findings; unsafe URL schemes are blocking errors.
