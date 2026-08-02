# Franchise HQ v5.7.0e Validation

## 1. Confirm version

Expected footer:

`v5.7.0e · Live Trade Valuation & Trade Limit Controls`

Confirm no immediate red console errors.

## 2. Validate live Fair Trade Calculator

Open Start Private Trade, add at least two teams, and add assets.

Expected:

- Fair Trade Calculator is visible before submission.
- Incoming and outgoing totals update whenever an asset is added, removed, or redirected.
- Every participating team has its own balance score.
- Asset valuation rows remain clickable.

## 3. Validate Commissioner rules

Open Commissioner HQ → Commissioner Controls → Trade Value.

Expected Section C:

- Enforce seasonal trade limit
- Trade Credits Per Team
- Players Per Trade Credit
- Picks Per Trade Credit
- Reset Rule Defaults

## 4. Validate default asset cost

With defaults of 3 players and 3 picks per credit:

- Send 3 players and 3 picks from one team: 1 credit.
- Add a fourth player: 2 credits.
- Remove the fourth player and add a fourth pick: 2 credits.

## 5. Validate independent multi-team cost

Build a three-team trade with different outgoing package sizes.

Expected:

- Each team displays its own credit cost.
- One team's large package does not increase another team's cost.

## 6. Validate seasonal enforcement

Keep enforcement enabled and set the limit low enough for a participant to exceed it.

Expected:

- Trade-limit warning appears in the builder.
- Send Private Offer is disabled.
- Submission is blocked with a team-specific explanation.

## 7. Validate unlimited mode

Disable Enforce seasonal trade limit.

Expected:

- Builder displays Unlimited.
- Submission is no longer blocked by seasonal usage.
- Asset credit costs remain visible for transparency.

## 8. Validate reset

Click Reset Rule Defaults.

Expected:

- Enforcement enabled
- Limit 4
- Players per credit 3
- Picks per credit 3

## 9. Regression

Confirm two-, three-, and four-team trades still support drafting, destinations, real-time send/receive validation, submission, Active listing, chat, modification, withdrawal, acceptance, committee review, and post-submission fairness details.

Confirm no roster, depth chart, cap, or draft-pick ownership changes after approval.
