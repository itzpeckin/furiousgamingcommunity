# FranchiseHQ

FranchiseHQ is a league-management platform. FGC is the first customer league; league branding and rules are configuration, not the identity of the application.

## Current release

- Production baseline: 7.0.1 at commit `af9d12573e29ec1cbf4e9a14024f8e7bcb39ebca`
- Current candidate: 7.0.2 persistent login and controlled league onboarding
- Production deployment: unchanged until the owner authorizes the 7.0.2 publication cycle
- Next product work: Madden NFL 27 intake after a stable Companion App export is available

## Local quality gate

Node.js 22.5 or newer is required. The baseline has no third-party root dependencies.

```sh
npm run inventory
npm run ci
```

`npm run ci` checks repository policy, JavaScript syntax, HTML assets, high-confidence secret patterns, environment separation, the registered migration baseline, tooling tests, generated inventory, and the release contract.

`npm run check:strict` also treats every inherited migration defect as a failure. It is intentionally blocked until the canonical migration repair in 7.1.0.

## Controlling documents

- [Roadmap](docs/ROADMAP.md)
- [Environment separation](docs/ENVIRONMENTS.md)
- [Branch and repository policy](docs/BRANCH-POLICY.md)
- [Rollback process](docs/ROLLBACK.md)
- [Mobile validation matrix](docs/MOBILE-TEST-MATRIX.md)
- [Release process](RELEASE-PROCESS.md)
- [7.0.0 release record](releases/7.0.0/release-record.md)
- [7.0.2 onboarding runbook](docs/AUTH-ONBOARDING.md)
- [Generated system inventory](docs/generated/system-inventory.md)

## Safety rules

- Do not commit secrets or populated `.dev.vars` files.
- Do not upload loose production files.
- Do not point staging at production D1, R2, KV, OAuth, workflow, or service resources.
- Do not run production migrations or deploy production without recorded owner approval.
- Do not treat browser-local data as an authoritative league record.
