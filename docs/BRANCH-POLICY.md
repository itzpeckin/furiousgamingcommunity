# FranchiseHQ Branch and Repository Policy

## Branch roles

- `main`: production branch. Merges require an accepted release candidate and explicit production approval.
- `staging`: optional long-lived staging alias. It may target only isolated staging resources.
- `codex/franchisehq-<version>` or `feature/<scope>`: implementation branches.
- Pull-request preview deployments: preferred validation path before merge.

## Required repository controls

Configure the GitHub repository so `main` requires:

- A pull request.
- The **FranchiseHQ Quality Gate** status.
- No unresolved review comments.
- A current branch.
- No force push or branch deletion.

These settings are external account changes and are not activated by committing this document.

## Commit and release rules

- Do not use “Add files via upload” as the normal release path.
- Do not combine unrelated product features into a baseline or security release.
- Do not rewrite accepted migration history.
- Tag the rollback baseline before implementation.
- Tag a new version only after its release record is complete and accepted.
- Never store secrets in commits, release notes, screenshots, or support bundles.

## Cloudflare branch controls

Cloudflare Pages production must track only `main`. Pull requests and approved non-production branches may create previews. Preview deployments must use staging bindings and cannot write to production data resources.
