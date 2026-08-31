# FranchiseHQ 7.3.7.1 Release Record

**Status:** Validated local review candidate

**Production changed:** No. Production remains on accepted 7.3.7 commit `3f3bcdddceae2e5a684980cc303083f4ba6639cb`, migration 27, Pages deployment `5dba5ab4-4591-4f2c-a517-4c4ca7fefc78`, and active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`.

## Scope

Normalize Madden's raw `REDG` and `LEDG` positions to the established `REDGE` and `LEDGE` display identities everywhere players appear. Add a league-wide, membership-authoritative GM/Owner History surface to Standings with career records, teams managed, playoff appearances, Super Bowl appearances, and Super Bowl wins.

## Added during delivery

- The shared player adapter, roster service, statistics service, Companion mapper, future import mapper, stable player endpoint, defensive game-log selector, and depth-chart resolver now accept raw `REDG`/`LEDG` while presenting canonical `REDGE`/`LEDGE`.
- Edge players receive the requested TKL, TFL, SACK, INT, FF, FR, and TD game-log columns from either the raw or canonical source label.
- Standings includes a **League History** tab. It ranks every recorded GM/Owner and shows teams managed, career regular-season record, career playoff record, playoff appearances, Super Bowl appearances, and Super Bowl wins.
- League History reads FranchiseHQ ownership periods and frozen season summaries only. Madden owner-name fields remain non-authoritative and cross-tenant inference remains prohibited.
- The League History table was visually checked at desktop and 390×844 phone widths; the phone layout retains a real horizontally scrollable table.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero.
- The broader 7.5.0 session framework remains scheduled; 7.3.7.1 does not change authentication or sessions.

## Validation evidence

- Focused tests prove `REDG`→`REDGE` and `LEDG`→`LEDGE` normalization, shared-surface coverage, the Details-tab defensive mapping, depth-chart aliases, and the league-wide ownership-history contract.
- Browser acceptance proves the League History labels, desktop layout, portrait-phone layout, and horizontal table scrolling.
- The full strict repository gate covers syntax, assets, secrets, environment separation, migration continuity, release evidence, inventory, authorization, tenant boundaries, ownership attribution, imports, transitions, permanent identities, and live-data behavior.
- Migration 27 is already the Production baseline; 7.3.7.1 adds no migration and writes no database rows.

## Deployment status

- The exact 7.3.7.1 candidate has not been published, merged to Main, or deployed.
- No staging run is planned. A separate owner authorization is required for branch publication, pull request, hosted checks, Main merge, and Production deployment.
- Production migration 27, the active Week 9 snapshot, 17 existing GM identities, 17 ownership periods, memberships, and every import/audit row remain unchanged.

## Rollback

- Before publication, discard only the unmerged candidate; Production remains unchanged.
- After a future accepted deployment, runtime rollback restores exact accepted 7.3.7 commit `3f3bcdddceae2e5a684980cc303083f4ba6639cb` and Pages deployment `5dba5ab4-4591-4f2c-a517-4c4ca7fefc78` while retaining migration 27 and all ownership, identity, membership, audit, import, and snapshot rows.
- Never use this code-only rollback to move the active snapshot, reset/import data, run Archive Season, run a game-year transition, rotate the export URL, rewrite ownership history, or reinterpret blocked Free Agents as zero.
