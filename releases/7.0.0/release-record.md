# FranchiseHQ 7.0.0 Release Record

**Release type:** Controlled engineering baseline  
**Status:** Review branch published and pull request open; hosted CI and isolated staging activation in progress  
**Production authorized:** No  
**Production deployed:** No

## Scope

- Preserve the accepted 6.3.2 Git commit as a rollback baseline.
- Isolate 7.0.0 work on a release branch.
- Add dependency-free local and CI checks.
- Inventory routes, environment bindings, migrations, browser storage, large files, and legacy markers.
- Define explicit local, staging, and production resource contracts.
- Replace loose-file deployment guidance with a pull-request, staging, evidence, approval, and rollback process.
- Establish a mobile/browser validation contract.
- Establish this living release record and the version-controlled master roadmap.

Excluded: application feature behavior, security-route remediation, database repair, Madden NFL 27 import changes, data deletion/reset, credential rotation, staging provisioning, and all production deployment.

## Added during delivery

- Replaced the audit-only source export with a fresh clone of the live public repository so changes are reviewable against real Git history.
- Recorded the exact baseline Git tree in addition to the commit and local tag.
- Added a ratcheted quality policy: inherited defects must be registered with severity and target release; new defects always fail; strict mode fails on all defects.
- Deferred adopting a root Pages Wrangler file until the current Cloudflare dashboard configuration is exported and reconciled, following Cloudflare's source-of-truth warning.
- Corrected an internal roadmap sequencing conflict: 7.0.0 validates that the baseline detects and registers the broken legacy migration chain; 7.1.0 remains responsible for making a fresh database and strict migration gate pass.
- Attempted a read-only Cloudflare staging inspection after local validation. The available browser reached Cloudflare's sign-in page and had no authenticated session, so no dashboard setting or resource was read or changed.
- Attempted a read-only GitHub access inspection. The public repository was readable, but the available browser had no authenticated GitHub session; the 7.0.0 branch therefore remains local and has not been committed, pushed, or opened as a pull request.
- Resumed the external checks after owner sign-in and verified authenticated access to both GitHub and Cloudflare.
- Inspected the `franchise-hq` Pages project without changing it. Production tracks `main` with automatic deployments enabled; previews cover all non-production branches; and the preview environment currently has no variables, secrets, or resource bindings.
- Published the 35-file candidate to `codex/franchisehq-7.0.0`, verified the remote content matches the locally validated candidate file-for-file, and opened pull request #2.
- Added a release-branch `push` trigger after the repository's first custom workflow did not start from the initial pull-request event; this permits hosted validation without merging to `main`.
- Verified the Cloudflare Pages preview deployed successfully at `https://codex-franchisehq-7-0-0.franchise-hq.pages.dev` and the public application entrypoint rendered with no browser console errors.
- Investigated two failing legacy Worker checks. Both Git integrations run at repository root instead of their intended Worker directory: the import Worker cannot find its existing `workers/franchise-import-worker/wrangler.jsonc`, while the legacy `furiousgamingcommunity` Worker invokes root-level Wrangler against a Pages repository. No Worker setting was changed.

## Known inherited blockers

- Duplicate migration versions `0001` and `0002`.
- The fresh migration sequence fails in `0001_create_leagues.sql` after the foundation migration creates an incompatible `leagues` table.
- Four migration files do not write the `schema_migrations` ledger.
- These issues remain assigned to 7.1.0 and prevent strict database readiness.
- The high-risk routes identified in the production audit remain assigned to 7.0.1; 7.0.0 does not claim to secure them.

## Validation evidence

- Baseline quality gate: passed on August 26, 2026.
- Repository lint: 34 baseline engineering files passed.
- JavaScript syntax: 166 browser, Pages Function, Worker, test, and tooling modules passed.
- HTML asset references: the production entrypoint passed.
- Secret scan: 470 text files passed with no high-confidence committed credential literals.
- Environment contract: all discovered bindings are classified and local/staging/production resource identities are separated.
- Migration baseline: seven inherited issues matched the registered debt exactly; zero new migration issues were found.
- Strict migration gate: failed as designed on those seven inherited issues; it remains blocked until 7.1.0.
- Tooling tests: four passed, zero failed.
- Generated inventory: 473 tracked files, 58 Pages Function routes, 18 discovered environment bindings.
- Release contract: passed and confirmed that 7.0.0 cannot authorize production.
- Git whitespace/conflict check: passed.
- Remote branch comparison: the published 35-file candidate matched the validated local candidate exactly before the workflow-trigger correction.
- Cloudflare Pages preview build: passed at commit `6bae30c22cdc06803b2ca116e3e2e17dd503c7f7`.
- Preview entrypoint smoke test: passed; title and landing content rendered without browser console errors.
- Machine-readable evidence: `releases/7.0.0/validation-evidence.json`.

## Deployment status

- Staging: a Pages preview is deployed successfully, but it is not accepted as usable staging because the preview environment has no isolated variables, secrets, D1, R2, KV, or service bindings.
- GitHub: pull request #2 is open from `codex/franchisehq-7.0.0` to `main`. Hosted FranchiseHQ CI is pending activation on the next review-branch push.
- Legacy Worker checks: failing because their existing Git build roots/deploy commands target the repository root; these failures do not indicate a Pages compilation failure, but the Worker integrations must be corrected before 7.0.0 can be accepted.
- Production: not authorized and not deployed.
- No database, R2, KV, OAuth, Workflow, secret, or production application state was changed.

## Rollback

- Source baseline commit: `4d0a4e979f98a99a8faea7c53fdd7366edc975f9`.
- Source baseline tag: `v6.3.2-baseline`.
- Source baseline tree: `e92b84054af2c9b58c7859b176bd2c7709f97917`.
- Detailed procedure: `docs/ROLLBACK.md`.
- Because 7.0.0 has no application, migration, or production deployment, abandoning the release branch returns to the complete prior state.

## Owner acceptance

Pending owner evidence review. Acceptance of 7.0.0 does not authorize 7.0.1, 7.0.2 data reset, staging provisioning, or a production deployment.
