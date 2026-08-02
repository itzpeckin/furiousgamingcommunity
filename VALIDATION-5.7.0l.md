# Franchise HQ v5.7.0l — Complete Phase 5.7 QA Validation

This validation replaces prior 5.7.0x checklists. It reflects the current unified Private Trade Builder and removes tests for retired workflows such as the separate Multi-Team Trade button, Active/Incoming tabs, the old Shared Trade Calculator name, and direct roster mutation.

## Before starting

Use Development Data and a Commissioner identity. Keep the browser console open throughout testing. The expected result is no red application errors.

---

# Section 1 — Clean reset

## Test 1 — Confirm the release

Expected footer:

`v5.7.0l · Committee Authorization & Phase 5.7 QA`

## Test 2 — Reset all Trade Center data

1. Open Commish HQ.
2. Open Commissioner Controls.
3. Open Trade Center.
4. Find Commissioner QA Utility → Reset All Trade Data.
5. Click Reset All Trade Data.
6. Type exactly `RESET TRADES`.
7. Confirm.

Expected:

- Sent, Received, Committee, Approved, Rejected, and History are empty.
- Chats, ballots, notifications, drafts, and recovery copies are removed.
- AI Suggestions and Trade Block configuration may remain available.
- Trade limits and valuation settings remain unchanged.
- Rosters, players, picks, standings, and League Data remain unchanged.

## Test 3 — Confirm reset through the console

Run:

```javascript
({
  twoTeamTrades: FGC_TRADE.negotiations().length,
  multiTeamTrades: FGC_TRADE.multiTrades().length
});
```

Expected:

```javascript
{
  twoTeamTrades: 0,
  multiTeamTrades: 0
}
```

If these exact public helpers are not exposed, visually confirm every current Trade Center lifecycle tab is empty.

---

# Section 2 — Commissioner settings and roles

## Test 4 — Confirm Commissioner navigation

Expected main navigation label:

`Commish HQ`

Expected Commissioner HQ tabs begin:

`Overview | Commissioner Controls | Import Franchise | Teams & Owners | League Rules | League Data`

## Test 5 — Confirm Commissioner Controls order

Open Commissioner Controls → Trade Center.

Expected order:

1. Reset All Trade Data
2. Trade Limits & Asset Rules
3. Player Value Calculations
4. Draft Pick Value Calculations

## Test 6 — Confirm Trade Committee assignments

Open Commish HQ → Teams & Owners.

Confirm:

- Buccaneers / Peckin has Commissioner access.
- Patriots / Blevins has Trade Committee access.
- Any user changed to Trade Committee in this screen becomes part of the live review roster.
- A user removed from Trade Committee no longer receives committee controls.

## Test 7 — Confirm reviewer list is dynamic

Temporarily mark one additional owner as Trade Committee.

Expected on the next committee-review trade:

- The owner appears in Committee Decisions.
- Their vote is counted when eligible.
- Remove the role after this test if it is not part of the league's final setup.

---

# Section 3 — Unified Private Trade Builder

## Test 8 — Start Private Trade availability

Switch to an owner with remaining trade credits.

Expected:

- Start Private Trade is enabled.
- The text beneath it shows `Remaining / Total`, such as `3 / 4 remaining`.

Switch to an owner with zero remaining credits when limits are enabled.

Expected:

- Start Private Trade is disabled and greyed out.
- The remaining count is red.

## Test 9 — Builder participant flow

1. Click Start Private Trade.
2. Confirm your team is preselected.
3. Add Team B.
4. Add Team C.
5. Add Team D.

Expected:

- One unified builder is used for two, three, and four teams.
- Four teams is the maximum.
- Duplicate teams cannot be added.
- There is no separate Multi-Team Trade button.

## Test 10 — Partner dropdown information

Expected format:

`BUF - Buffalo Bills - Strike - 3 Trades Remaining`

Expected:

- Teams with zero remaining credits are disabled when limits are active.
- Unlimited mode displays Unlimited Trades.

## Test 11 — Asset browser parity

For every participating team test:

- All
- Players
- Picks
- Search
- Position filter

Expected player rows include:

- Player name
- Position
- Development trait
- Overall
- Trade value

Expected picks include year, round, ownership, and value.

## Test 12 — Directed asset flow

Add assets from all participating teams and choose destination teams.

Expected:

- An asset cannot be sent back to its current team.
- The same asset cannot be added twice.
- The Trade Draft updates in real time.
- Every team has independent Sends and Receives totals.

## Test 13 — Send-and-receive rule

Leave one participating team with zero incoming or zero outgoing assets.

Expected bold warning:

`ALL TEAMS MUST SEND AND RECEIVE ITEMS.`

Click Send Private Offer.

Expected:

- A popup names the incomplete requirement.
- No trade is submitted.
- The draft remains intact.

## Test 14 — Clear Trade

Click Clear Trade and cancel.

Expected: nothing changes.

Click it again and confirm.

Expected:

- Your team remains.
- Other participants, assets, destinations, and message are cleared.
- The builder stays open.

## Test 15 — Back and draft persistence

Build an unfinished trade and click Back.

Expected options:

- Continue Editing
- Save as Draft
- Discard Changes

Validate each option.

Also refresh during an unfinished build.

Expected: the recovery flow can restore participants, assets, destinations, and message.

---

# Section 4 — Live Fair Trade Calculator

## Test 16 — Real-time calculations

Build a trade before submitting.

Expected:

- Fair Trade Calculator is visible inside the builder.
- It updates when adding/removing assets or changing destinations.
- Both two-team and multi-team trades use the name Fair Trade Calculator.

## Test 17 — Team-level balance

Expected for each team:

- Value Sent
- Value Received
- Team balance percentage
- Overall balance for the full transaction

## Test 18 — Individual player breakdown

Expand View Asset Valuation Breakdown, then expand a player.

Expected compact rows for the active valuation model, such as:

- Overall Rating
- Age & Window
- Development Trait
- Contract & Control
- Production
- Position Scarcity
- Elite Premium
- Injury Risk

Expected:

- Typography matches Package Engine adjustments.
- Values align right.
- No overlapping or oversized tiles.
- Full player card remains optional.

## Test 19 — Draft pick breakdown

Expand a pick.

Expected factors include applicable values such as:

- Round base
- Projected slot
- Future-year retention
- Commissioner adjustments

## Test 20 — Package Engine adjustments

Expected outgoing/incoming package adjustments where applicable, including:

- Elite scarcity premium
- Best-player premium
- Package dilution
- Roster-slot cost
- Asset-mix adjustments

Calculations must appear before submission and remain visible after submission.

---

# Section 5 — Trade limits and credits

## Test 21 — Default credit calculation

With defaults of three players and three picks per credit, validate:

- Up to 3 players and up to 3 picks = 1 credit
- 4–6 players or 4–6 picks = 2 credits
- The larger player/pick unit determines the cost

## Test 22 — Credits do not count before approval

Create a trade and advance it through Negotiating and Committee Review.

Expected:

- Remaining credits do not decrease.
- Only approved trades consume credits.

## Test 23 — Approval-time enforcement

Give a team one credit remaining and place two trades into Committee Review.

Approve the first.

Expected: the first consumes the remaining credit.

Attempt final approval of the second.

Expected:

- Approval is blocked.
- A notification names the team that is out of trades.
- The trade remains under review/requires correction.

## Test 24 — Teams & Owners usage modal

Open Teams & Owners and click Trades Remaining.

Expected:

- Modal is centered.
- Positive remaining count is green; zero is red.
- Approved trades and credits consumed display in-line.
- Opening a usage record does not navigate away.

## Test 25 — Unlimited mode

Disable seasonal trade limits.

Expected:

- All teams show unlimited/∞.
- No partner is disabled for credit reasons.
- Credit rules no longer block submission or approval.

Restore the league's desired setting after testing.

---

# Section 6 — Two-team negotiation lifecycle

## Test 26 — Submit and tab routing

Submit a valid two-team trade.

Expected:

- Creator sees it under Sent.
- Recipient sees it under Received.
- It does not appear under Committee before both owners accept.

## Test 27 — Received unread badge

As recipient, before opening Received:

Expected: Received shows an unread badge.

Open Received.

Expected: the badge clears.

A revised offer should create a new unread state.

## Test 28 — Owner actions at top and bottom

As recipient, open the trade.

Expected at both top and bottom:

- Accept
- Counter
- Reject

## Test 29 — Counter

Click Counter, revise assets, and submit.

Expected:

- Same negotiation continues with a new version.
- Prior acceptance state resets.
- Timeline records the new version.
- Recipient/sender responsibilities switch correctly.

## Test 30 — Modify and withdraw

As current proposer:

Expected:

- Modify Trade is available while eligible.
- Withdraw is available while negotiating.
- Modify restores the correct teams/assets/message.
- Withdraw moves the trade out of active Sent/Received views and preserves history/timeline as designed.

## Test 31 — Clean detail layout

Expected trade detail focuses on:

- Trade package
- Owner actions
- Fair Trade Calculator
- Chat
- Timeline

The old progress banner, visibility banner, and standalone version box should not appear.

Versions appear only inside Timeline → View Trade Versions.

---

# Section 7 — Three-team and four-team negotiation lifecycle

## Test 32 — Submit multi-team trade

Submit a valid three-team trade.

Expected:

- It opens without Trade Could Not Be Loaded.
- It appears in Sent for the proposer.
- It appears in Received for owners who must respond.
- All directed assets and player details are spaced correctly.

## Test 33 — Multi-team acceptance

Each participant must accept the exact package.

Expected:

- Status shows acceptance progress.
- One or two acceptances are insufficient for a three-team trade.
- All participants must accept before Committee Review.

## Test 34 — Multi-team counter

As a participating recipient, click Counter.

Expected:

- Unified builder restores all teams, assets, destinations, and message.
- Submitting keeps the same transaction.
- All previous acceptances reset.
- Every participant must accept the revised package.

## Test 35 — Multi-team rejection

Reject the trade as a participant.

Expected:

- Complete transaction closes.
- It leaves Sent/Received.
- It appears in the appropriate rejected/history record for involved teams.
- Chat remains preserved.

## Test 36 — Multi-team private chat

Expected:

- Only participating owners can see/chat during negotiation.
- Messages survive refresh.
- Unrelated owners cannot access the private negotiation.

---

# Section 8 — Committee authorization and privacy

## Test 37 — Non-committee owner cannot vote

Move a trade to Committee Review and switch to a normal owner who is not involved and is not a reviewer.

Expected:

- No Approve, Reject, or Abstain buttons.
- Direct links do not expose ballot controls.
- A view-only/unauthorized state is shown where applicable.

## Test 38 — Negotiating trades remain private from committee

Leave a trade in Negotiating and switch to a Trade Committee member.

Expected:

- It does not appear under Committee.
- It does not appear under Sent or Received unless that reviewer is personally a participating owner.
- A direct link does not expose the negotiation.

## Test 39 — Dynamic committee roster

Move a trade to Committee Review.

Expected Committee Decisions list includes:

- Current Commissioners
- Current Trade Committee members configured in Teams & Owners
- Blevins when still assigned Trade Committee status
- Legacy mock reviewers only if they remain intentionally available in Simulation Mode

## Test 40 — Recusal

Use a Trade Committee or Commissioner identity whose franchise participates in the trade.

Expected:

- Reviewer appears in the committee list as Recused.
- No vote controls are usable.
- Status says Awaiting committee review / You are recused, not Your committee review is pending.
- Their recused slot does not count as an eligible pending ballot.

## Test 41 — Eligible reviewer controls

Use an eligible reviewer whose franchise is not involved.

Expected:

- Approve, Reject, and Abstain are visible.
- Reject and Abstain require a comment.
- Approve comment remains optional.

## Test 42 — Committee unread badge

As an eligible reviewer who has not voted:

Expected: Committee tab shows a badge.

Open Committee.

Expected: badge clears as seen.

Expected no Committee action badge for:

- Participating owner who is not a reviewer
- Recused reviewer
- Reviewer who has already acted

## Test 43 — Uniform two-column committee layout

Open both a two-team and a multi-team Committee Review trade.

Expected:

- Committee Decisions uses two columns on desktop for both trade types.
- One column is used on smaller/mobile widths.
- Ballot panel remains readable.
- Comment box and buttons do not overlap.

## Test 44 — Approval and rejection thresholds

Cast enough eligible ballots to approve one trade and reject another.

Expected:

- Only eligible, non-recused ballots count.
- Approved trade moves to Approved.
- Rejected trade moves to Rejected.
- Committee decision states are visually prominent.

---

# Section 9 — Trade Center tabs and visibility

## Test 45 — Tab order

Expected:

`Sent | Received | Committee | Approved | Rejected | AI Suggestions | History`

## Test 46 — Approved and Rejected privacy

As an owner:

- Approved shows committee-approved trades involving that team.
- Rejected shows committee-rejected trades involving that team.
- Unrelated teams' approved/rejected trades do not appear in these personal tabs.

## Test 47 — League-wide History

Expected History includes all committee-approved league trades after full owner acceptance.

Expected History excludes:

- Negotiating
- Draft
- Withdrawn
- Declined
- Committee-rejected

## Test 48 — Decision prominence

Validate visible states such as:

- Your decision required
- You accepted
- Waiting on another owner
- All owners accepted
- Your committee review is pending
- You voted approve/reject/abstain
- Awaiting committee review · You are recused
- Committee approved
- Committee rejected

---

# Section 10 — Asset resolution and availability

## Test 49 — Duplicate asset protection

Attempt to use the same player or pick more than once.

Expected: submission is blocked with a specific duplicate warning.

## Test 50 — Ownership verification

Attempt to send a player from the wrong team.

Expected: asset is marked unavailable or submission is blocked.

## Test 51 — Injured-player rule

Using a player marked injured, confirm the configured league rule prevents trading that player.

## Test 52 — Stale/missing asset handling

Where test controls permit, attempt to load a trade referencing an asset absent from the active snapshot.

Expected:

- Trade detail does not silently treat it as valid.
- Asset resolution reports missing/unavailable.
- Revision is required before continuing.

---

# Section 11 — Roster and Madden authority protection

## Test 53 — No roster mutation after approval

Record a traded player's team before approval.

Approve the trade.

Re-read the player through the roster service.

Expected:

- Team assignment is unchanged.
- Team roster is unchanged.
- Depth chart is unchanged.
- Cap table is unchanged.
- Pick ownership in League Data is unchanged.

Only a later Madden Companion import should update those records.

## Test 54 — News and audit behavior

Expected after approval:

- Approved transaction may appear in League News/History.
- Committee votes and permitted public comments are preserved.
- Private chat remains private.
- No site roster move is executed.

---

# Section 12 — Final regression

## Test 55 — Existing features

Confirm all still work:

- Trade Block
- AI Suggestions
- Player cards
- Draft-pick cards
- Trade-value settings
- Trade-limit settings
- Teams & Owners role changes
- Notifications
- Trade chat
- Timeline and replay

## Test 56 — Mobile/responsive behavior

At narrow width confirm:

- Trade tabs remain usable.
- Builder cards stack without overlap.
- Fair Trade Calculator remains readable.
- Committee roster changes from two columns to one.
- Ballot controls remain accessible.

## Test 57 — Final console check

Clear the console and navigate through:

- Sent
- Received
- Committee
- Approved
- Rejected
- AI Suggestions
- History
- Two-team detail
- Three-team detail
- Four-team builder
- Commissioner Controls
- Teams & Owners

Expected:

`No red JavaScript application errors.`

---

# Phase 5.7 acceptance criteria

Phase 5.7.0x is ready to close when:

- Unified two-to-four-team trades work through one builder.
- Every team sends and receives at least one asset.
- Draft recovery and Clear Trade work.
- Fair Trade Calculator is live and fully detailed.
- Trade limits are enforced only at committee approval.
- Non-reviewers never see vote controls.
- Current Teams & Owners roles drive the reviewer roster.
- Reviewers are recused from trades involving their team.
- Committee layout is consistent across all trade types.
- Tabs, unread badges, chat, counters, revisions, decisions, and history work.
- Approved trades do not mutate Madden-authoritative roster data.
- No red console errors remain.
