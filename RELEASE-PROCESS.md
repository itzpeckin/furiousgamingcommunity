# FranchiseHQ Release Process

This process replaces the historical loose-file/ZIP upload workflow beginning with 7.0.0.

## 1. Open a scoped release branch

- Start from the accepted baseline or previous release tag.
- Use one branch per version.
- Write the included and excluded scope in `releases/<version>/release-record.md`.
- Production data changes require a separate migration and recovery plan.

## 2. Implement and update evidence

- Keep application, migration, environment, and feature-flag changes reviewable.
- Add regression coverage for each bug fixed.
- Run `npm run inventory` when routes, bindings, storage keys, migrations, or major files change.
- Update `docs/ROADMAP.md` with requested additions, discoveries, bugs, deferrals, and the next gate.

## 3. Run the local gate

```sh
npm run ci
```

No unexpected failure may be waived. Inherited issues are warnings only when they appear in `config/quality-baseline.json` with a severity and target release. Strict readiness is checked with:

```sh
npm run check:strict
```

## 4. Review through Git

- Open a pull request; do not upload individual files to the production branch.
- Require the FranchiseHQ Quality Gate status.
- Review the changed route, binding, migration, security, mobile, and rollback contracts.
- Confirm the release manifest identifies the exact baseline and candidate commit.

## 5. Validate in staging

- Deploy only to the isolated staging/preview environment.
- Verify the staging bindings against `config/environment-contract.json`.
- Apply migrations only to the staging database after its backup is verified.
- Run API, role, mobile, desktop, data, and rollback acceptance checks.
- Record deployment and evidence identifiers in the release record.

## 6. Request production approval

Provide the owner with a plain-language summary of:

- What changed and why.
- What was tested.
- Data or migration impact.
- Known limitations and disabled features.
- Exact production steps and stop conditions.
- Exact rollback procedure.

No production deployment occurs without explicit approval for that version.

## 7. Deploy and verify

- Confirm backup and rollback readiness.
- Deploy the exact staging-accepted commit.
- Apply only the listed production migrations.
- Run the production smoke checklist.
- Watch authentication, errors, imports, data freshness, and critical workflows through the release observation window.

## 8. Close the release

- Add the accepted release tag.
- Complete the release record and roadmap tracker.
- Record bugs found after launch in the next appropriate version.
- Retain the previous deployment and required recovery evidence.
