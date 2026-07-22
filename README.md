# Franchise HQ — Sprint TC-005

Negotiation Engine 1.0 with persistent offer states, messages, immutable versions, activity history, notifications, viewed tracking, withdraw/decline/counter/accept actions, and committee handoff.

## TC-005 corrective pass
- Fixed individual asset removal while building revisions and counteroffers.
- Fixed withdrawal permissions for commissioner accounts that also own a team.
- Moved trade notifications out of Trade Center and into the top-right bell menu.
- Updated profile identity to show the owned franchise rather than a generic role.
- Added `[C]` and `[TC]` identity markers, with commissioner precedence.
- Removed the misleading profile caret while keeping the profile menu clickable.

## TC-005.1 — Negotiation UX Polish

- Corrects active-proposal ownership when a commissioner acts on behalf of their team.
- The current proposer sees only **Revise** and **Withdraw**.
- The current recipient sees only **Accept**, **Counter**, and **Decline**.
- Every counter transfers control of the active proposal to the countering owner.
- Withdraw closes the negotiation while preserving its audit trail.
- Newly added assets in a counteroffer are highlighted directly in the current package with a **NEW** tag for the reviewing owner.
- Notification dropdown now uses an opaque, high-contrast background.
- Developer Mode moved into the player-name profile menu; the separate sliders button was removed.
- Profile menu displays player name first and franchise second, with `[C]` or `[TC]` role tags.
