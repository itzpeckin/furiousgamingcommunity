# Franchise HQ v5.9.1.3 — League Tenant Foundation

This release converts Franchise HQ from a single global league data model into a multi-league-ready platform while preserving the current one-league experience.

## Default registered league

- League ID: `lg_fgc_001`
- Name: `Furious Gaming Community`
- Slug: `furious-gaming-community`
- Public route: `/leagues/furious-gaming-community`
- Future Companion endpoint: `/api/leagues/furious-gaming-community/companion/export`

## Included

- League registry and active-league resolver
- Stable league IDs and unique slugs
- Root URL backward compatibility
- League-scoped snapshot persistence
- League-scoped import history persistence
- League-scoped refresh-event payloads
- Dynamic public and API path helpers
- Commissioner HQ tenant checkpoint

No signup, billing, database, or live Companion receiver is added in this release.
