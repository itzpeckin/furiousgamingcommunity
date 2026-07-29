# Franchise HQ Version 5.2

## Madden Import Contract & Validation

Version 5.2 establishes the controlled ingestion boundary for the read-only League Engine.

### Included

- Versioned Madden import envelope
- JSON import adapter for normalized Madden data
- Preview-before-publish workflow
- Schema, provenance, duplicate-ID, and reference validation
- Required-data publication gate
- Field-availability reporting
- Validation receipts required before repository installation
- Failed-import quarantine history
- Atomic replacement of the current snapshot
- Automatic retention of the last valid snapshot when an import fails

### Product boundary

Franchise HQ does not alter Madden league state. A website action cannot move players, change contracts, update salary-cap values, advance the league, or complete a trade. Only a validated Madden import may replace the official snapshot displayed by Franchise HQ.

### Scope limitation

The 5.2 JSON adapter accepts the Franchise HQ normalized import contract. Mapping specific raw Madden Companion export formats will be added after representative Madden exports are available.
