# FranchiseHQ

FranchiseHQ is a league-management platform. FGC is the first customer league; league branding and rules are configuration, not the identity of the application.

## Current release

- Production baseline: 7.0.4 at commit `60e8d46bf2c55894fff4f88c33d8b43ed2643bc4`; owner acceptance partially passed
- Current candidate: authorized 7.0.5 exact-route dual-domain authentication and consolidated Commissioner member management
- Production database and Madden data: unchanged by 7.0.5; this release has no migration or reset
- Next product work: mobile roster preview, stable player permalinks, and Trade Block Lite in 7.0.6 after a representative Madden NFL 27 export is available

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
- [7.0.5 authentication and onboarding runbook](docs/AUTH-ONBOARDING.md)
- [Generated system inventory](docs/generated/system-inventory.md)

## Safety rules

- Do not commit secrets or populated `.dev.vars` files.
- Do not upload loose production files.
- Do not point staging at production D1, R2, KV, OAuth, workflow, or service resources.
- Do not run production migrations or deploy production without recorded owner approval.
- Do not treat browser-local data as an authoritative league record.
