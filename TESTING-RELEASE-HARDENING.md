# FranchiseHQ Testing and Release Hardening

## Repository gate

Run the complete dependency-free release gate with:

```sh
npm run ci
```

It validates:

- Engineering/release files and JSON structure.
- JavaScript syntax across browser, Pages Functions, Workers, and tooling code.
- Local assets referenced by the application entrypoint.
- High-confidence committed-secret patterns without printing secret values.
- Explicit local/staging/production resource separation.
- Current SQL migration behavior against an in-memory SQLite database.
- Tooling unit tests.
- Route, binding, storage, migration, and legacy-code inventory freshness.
- The current release manifest and production-authorization guard.

## Strict gate

```sh
npm run check:strict
```

Beginning with 7.1.0, strict mode must pass. It validates the canonical sequence, fresh database, required schema, ledger continuity, foreign keys, and absence of request-time schema creation. No inherited migration issue remains registered.

## Browser/platform diagnostics

The existing in-app diagnostics remain useful secondary evidence:

```javascript
await FranchiseHQ.validate.run();
await FranchiseHQ.release.preflight();
await FranchiseHQ.release.certify();
```

They do not replace server authorization tests, clean migration tests, or staging acceptance.

## Manual matrix

Every user-facing release follows `docs/MOBILE-TEST-MATRIX.md` and adds role, tenant, data-state, time-state, and failure-state checks appropriate to its scope.
