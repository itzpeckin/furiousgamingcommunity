# Franchise HQ — TC-011.3.1 Navigation, League Home & Player Page Polish

## User assumption
- Restores the top-right profile interaction.
- Prevents route clicks from swallowing profile-menu interactions.
- Adds a resilient account-assumption bridge for testing.
- Keeps Developer Mode account switching available.

## Commissioner HQ navigation
- Commissioner HQ is positioned at the top of the left navigation.
- It is visible only when the assumed/authenticated account has the Commissioner role.
- Team owners do not see an empty or disabled Commissioner entry.

## League Home
- Removes the Full Leaderboard button.
- Enlarges leader cards, player names, and stat values.
- Reduces unused whitespace below the schedule ribbon.
- Pulls the lower content upward.
- Aligns Stat Leaders and League News more tightly with the standings area.
- Enlarges news cards to maintain visual balance.

## Player Profiles
Player profiles are once again presented as a full-page experience.

The profile now preserves the page from which it was opened and displays both:
- A contextual back action such as `← Team Page`, `← Trade Center`, or `← League Home`
- An X close button

Closing the profile restores:
- The previous route
- The previous scroll position
- The previous page context

Player profiles can be opened from Team pages, Trade Center, League Home, Game Center, leaderboards, search, and the Player Database without losing the original location.

Replace all six files together.

Suggested commit:
`Apply TC-011.3.1 navigation home and player page polish`
