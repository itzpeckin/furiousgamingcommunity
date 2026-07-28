# Franchise HQ Version 4.20

## Security, Testing and Release Hardening

Version 4.20 establishes the final hardening layer before the Platform Foundation completion release.

### New services

- `FranchiseHQ.security` — output encoding, URL validation, safe external links, diagnostics redaction, and browser-side security auditing.
- `FranchiseHQ.release` — build metadata, automated release preflight, and redacted support-bundle generation.

### Important boundary

This release provides a frontend security baseline. It does not replace server-side authentication, authorization, input validation, CSRF protection, secure secrets management, Cloudflare security headers, or backend rate limiting.

### Release process

A release candidate should pass both:

```javascript
await FranchiseHQ.validate.run()
await FranchiseHQ.release.preflight()
```

The preflight combines lifecycle, deployment manifest, module runtime, validation, and security results into one release decision.
