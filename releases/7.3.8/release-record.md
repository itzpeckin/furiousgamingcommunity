# FranchiseHQ 7.3.8 Release Record

**Status:** Local validated review candidate; publication and deployment not authorized

**Production changed:** No. Production remains exact 7.3.7.1 commit `25b218956ef775fee3e1a04e0f0bef6001547b21` on Pages deployment `64140548-d20a-411f-8d81-17649cdfe8fa`; migration 27 and active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` remain unchanged.

## Scope

Make importer failures useful to commissioners, remove member-facing platform implementation callouts, and restore available Madden Cap Space from the source data already retained in the active snapshot.

## Added during delivery

- Import failures are grouped into authorization, source-readiness, weekly-coverage, concurrency, validation, network/server, and fallback categories. Each presents a plain-language cause, exact next action, and support code while confirming that current league data remains live.
- Error notifications persist until dismissed. Successful imports receive a concise completion notification that dismisses automatically. Raw phase details and identifiers remain collapsed for optional commissioner/platform-owner diagnosis.
- Routine Free Agent, carry-forward, and source-snapshot warnings no longer become persistent customer banners. Free Agents remain blocked/unknown and are described only when their unavailable dataset is selected or when relevant to import recovery.
- Repeated active-snapshot, validation-warning, source-warning, and controlled-beta callouts were removed from the member shell and league pages. Internal platform-owner inspection tools retain their technical evidence.
- The member read model now unwraps the retained Madden team record and accepts explicit Cap Space aliases on both team and standing sources. It does not estimate a missing value and requires no re-import.
- Detailed field-by-field weekly change narration was deliberately deferred because it adds routine noise without improving the commissioner's one-action workflow.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero.
- The broader 7.5.0 session framework remains scheduled; 7.3.8 does not change authentication or session policy.

## Validation evidence

- Focused contracts cover retained nested Cap Space, Free Agent semantics, removal of the customer-facing snapshot/beta banners, actionable importer recovery, notification behavior, and immutable source/intake boundaries.
- Desktop and 390×844 phone-width browser checks confirm the neutral shell, removed callouts, readable development/no-data states, and 7.3.8 asset wiring.
- The full strict repository gate passes all 132 tests and covers 216 JavaScript modules, 547 tracked inventory files, 68 routes, environment separation, migration continuity, release evidence, authorization, tenancy, imports, transitions, stable identities, ownership, and live-data behavior.
- Migration 27 is already the Production baseline. The candidate adds no migration, performs no export/import, and writes no database rows.

## Deployment status

- Local implementation and validation only. No branch publication, pull request, hosted check, Main change, staging deployment, Production deployment, or cloud rehearsal is authorized or claimed.
- Production remains on 7.3.7.1 with the same Week 9 active snapshot, data, memberships, credentials, and permanent export URL.

## Rollback

- Before publication, rollback is deletion/reversion of the local 7.3.8 candidate changes only. The immutable runtime rollback baseline is exact accepted 7.3.7.1 commit `25b218956ef775fee3e1a04e0f0bef6001547b21` and Pages deployment `64140548-d20a-411f-8d81-17649cdfe8fa`.
- Retain migration 27, all ownership/identity/membership/audit/import rows, every snapshot and capture, and the permanent export URL. Never use rollback to import data, move the active pointer, reset, archive, transition, rotate credentials, or reinterpret blocked Free Agents as zero.
