# FranchiseHQ Mobile and Desktop Validation Matrix

Every user-facing release must define and pass the applicable cells in this matrix.

## Viewports

| Class | Representative width | Required behavior |
|---|---:|---|
| Narrow phone | 360 px | No horizontal page overflow; core controls remain reachable |
| Standard phone | 390 px | Primary mobile acceptance viewport |
| Large phone | 430 px | Touch layout uses available width without desktop-only assumptions |
| Tablet | 768 px | Navigation and dense data views remain usable in portrait |
| Desktop | 1280 px | Full navigation and multi-column layouts remain coherent |

## Interaction

- Touch targets are comfortably selectable without precision tapping.
- Keyboard focus is visible and follows a logical order.
- Dialogs fit the viewport and do not trap inaccessible content.
- Tables use a documented mobile transformation, priority columns, or controlled scrolling.
- Loading, empty, stale, denied, validation, error, retry, and success states fit every viewport.
- Shared links opened from Discord, email, or another application reach the intended resource after sign-in.
- Refresh and back/forward navigation preserve the route without relying on browser-local authoritative state.

## Network/API

- Critical reads remain understandable on a constrained connection.
- Lists paginate or bound their payload size.
- Retries do not duplicate writes.
- Offline/interrupted requests show a recoverable state.
- API error contracts do not depend on desktop-only presentation.

## Evidence

The release record lists tested browsers/devices, screenshots or run identifiers, failures found, fixes, and any deferred limitation.
