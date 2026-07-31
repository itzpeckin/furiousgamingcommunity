# Franchise HQ v5.4.8b

## LD-008 Event Delivery Hotfix

This hotfix isolates all normalized League Data event channels.

### Corrected behavior

- `league:mode-changed`, `league:data-changed`, and `league:state-changed` are emitted independently.
- Canonical platform events are emitted before browser aliases.
- A browser compatibility listener can no longer interrupt later event delivery.
- Event failures are isolated and reported without stopping the remaining channels.
- League Data diagnostics now include normalized event delivery counts and failures.

No League Data mode, persistence, snapshot, banner, or repository behavior is changed.
