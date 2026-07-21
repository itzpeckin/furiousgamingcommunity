# Franchise HQ — Milestone 1 Complete

This package combines Milestones 1A, 1B, 1C, and 1D into one static interactive prototype.

## Included

- Responsive desktop and mobile design system
- League home, teams, player profiles, standings, stats, schedule, and news
- Mock Discord account login and role switching
- Creator-only private trade calculator workspace
- Saved private drafts
- Two-owner private negotiation room with chat and versioned revisions
- Hidden trade-committee review with five mock voters
- Public League News announcements only for approved trades
- Commissioner-authored private rejection DMs
- Functional trade block and owner availability controls
- Commissioner workflow dashboard and audit trail
- Browser-saved mock trades, messages, votes, and block changes

## Files

- `index.html`
- `styles.css`
- `app.js`
- `trade-module.js`

## Recommended test

1. Sign in as the Dallas owner.
2. Open Trade Center and Trade #104.
3. Switch to the Green Bay owner and accept or counter.
4. Switch through committee identities and vote.
5. For approval, the final trade appears in League News.
6. For rejection, switch to Commissioner and send the individual private DMs.

All data is mock data stored in browser localStorage. No Discord or Madden account is contacted.
