# FranchiseHQ 7.0.0 Release Record

**Release type:** Controlled engineering baseline  
**Status:** Final candidate validated; controlled squash merge authorized and awaiting final evidence-head checks
**Production authorized:** Yes — controlled 7.0.0 baseline squash merge only
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

Excluded: application feature behavior, security-route remediation, database repair, Madden NFL 27 import changes, data deletion/reset, credential rotation, and staging provisioning. Production authorization is limited to the validated 7.0.0 baseline squash merge; it does not authorize later release work or resource changes.

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
- Narrowed the hosted trigger to the exact `codex/franchisehq-7.0.0` branch after GitHub did not register the initial wildcard attempt; no default-branch file was changed.
- Verified the Cloudflare Pages preview deployed successfully at `https://codex-franchisehq-7-0-0.franchise-hq.pages.dev` and the public application entrypoint rendered with no browser console errors.
- Investigated two failing legacy Worker checks. Both Git integrations were running at repository root instead of their intended build boundary: the import Worker could not find its existing `workers/franchise-import-worker/wrangler.jsonc`, while the legacy `furiousgamingcommunity` Worker invoked root-level Wrangler against a Pages repository.
- Disabled non-production branch builds for the redundant assets-only `furiousgamingcommunity` Worker and verified that the setting persisted. This prevents review branches from attempting its root-level production-style deploy command; the deployed Worker runtime was not changed.
- Normalized and saved the import Worker's Cloudflare Git build root as `/workers/franchise-import-worker/`, matching the checked-in Wrangler configuration location and Cloudflare's monorepo convention. A fresh review build still reported its separate trigger root as `/`, proving the displayed root had not propagated to that trigger.
- Changed only the import Worker's non-production branch command to `cd workers/franchise-import-worker && npx wrangler versions upload`. This makes the review trigger enter the checked-in Worker project before creating a preview version while leaving the production command unchanged. The checked-in root comment records the intended dashboard boundary without changing executable behavior.
- Verified that the corrected command passed at review commit `16210a1`, uploaded preview Worker version `d0aeb677`, and left the active production version unchanged. The same commit's Pages preview also passed; GitHub reported both Cloudflare checks successful.
- Confirmed that GitHub initially did not index the repository's first custom Actions workflow while it existed only on the review branch. GitHub later activated both pull-request and push runs without a default-branch change.
- Diagnosed the first hosted failure as nondeterministic generated inventory: Windows newline conversion and locale-dependent sorting could produce evidence different from the Linux runner. Normalized text reads, introduced code-point ordering with deterministic tie-breaking, regenerated the inventory, and added an operating-system-independence regression test.
- Verified all three hosted review checks at commit `47bbf36`: GitHub quality, Cloudflare Pages preview, and the import-Worker preview.
- Received owner authorization to squash-merge the validated 7.0.0 baseline into `main` and monitor its production deployment. This authorization does not extend to 7.0.1, data reset, staging resource creation, credential changes, or application feature work.

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
- Tooling tests: five passed, zero failed, including cross-platform evidence determinism.
- Generated inventory: 473 tracked files, 58 Pages Function routes, 18 discovered environment bindings.
- Release contract: passed and confirmed that production authorization is limited to the controlled 7.0.0 baseline squash merge without claiming deployment.
- Git whitespace/conflict check: passed.
- Remote branch comparison: the published 35-file candidate matched the validated local candidate exactly before the workflow-trigger correction.
- Cloudflare Pages preview build: passed at commit `6bae30c22cdc06803b2ca116e3e2e17dd503c7f7`.
- Latest Cloudflare Pages preview build: passed at commit `16210a1`; unique preview `https://ab908c60.franchise-hq.pages.dev` and stable branch preview `https://codex-franchisehq-7-0-0.franchise-hq.pages.dev`.
- Import Worker preview build: passed at commit `16210a1` using the review-only folder command and created unpromoted version `d0aeb677`; the active production version did not change.
- Preview entrypoint smoke test: passed; title and landing content rendered without browser console errors.
- GitHub Actions quality run: passed at review commit `47bbf36` in run `32992901857` after the deterministic-inventory correction.
- Machine-readable evidence: `releases/7.0.0/validation-evidence.json`.

## Deployment status

- Staging: a Pages preview is deployed successfully, but it is not accepted as usable staging because the preview environment has no isolated variables, secrets, D1, R2, KV, or service bindings.
- GitHub: pull request #2 is open from `codex/franchisehq-7.0.0` to `main`. The hosted FranchiseHQ quality gate is active and passed on the validated review head; the owner authorized a squash merge after the final evidence-only head passes.
- Worker build boundaries: passed for the current review commit. Non-production builds are disabled for the redundant assets-only Worker. The import Worker root is saved as `/workers/franchise-import-worker/`, and its review-only command explicitly enters that folder because Cloudflare's preview trigger continues to report `/`; commit `16210a1` successfully created an unpromoted Worker version.
- Production: the controlled 7.0.0 baseline squash merge is authorized but not yet deployed at the time this evidence was recorded.
- No database, R2, KV, OAuth, Workflow, secret, deployed Worker runtime, or production application state was changed. Only non-production Git build settings were corrected.

## Rollback

- Source baseline commit: `4d0a4e979f98a99a8faea7c53fdd7366edc975f9`.
- Source baseline tag: `v6.3.2-baseline`.
- Source baseline tree: `e92b84054af2c9b58c7859b176bd2c7709f97917`.
- Detailed procedure: `docs/ROLLBACK.md`.
- Because 7.0.0 changes no application behavior or migrations, source rollback returns `main` to the exact 6.3.2 baseline; Cloudflare's previous Pages and Worker versions remain the deployment rollback points.

## Owner acceptance

Granted on August 26, 2026 for a controlled squash merge of the validated 7.0.0 baseline and observation of its resulting production deployment. Acceptance does not authorize 7.0.1, the 7.0.2 data reset, staging provisioning, credential changes, or any application feature release.
