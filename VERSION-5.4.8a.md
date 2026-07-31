# Franchise HQ v5.4.8a — LD-008 Event Naming Hotfix

## Purpose

Correct the LD-008 normalized event names so they comply with the existing Franchise HQ platform event contract.

## Correct platform event names

- `league:mode-changed`
- `league:data-changed`
- `league:state-changed`

## Browser compatibility aliases retained

- `franchisehq:league:modeChanged`
- `franchisehq:league:dataChanged`
- `franchisehq:league:stateChanged`

The canonical browser forms are also emitted:

- `franchisehq:league:mode-changed`
- `franchisehq:league:data-changed`
- `franchisehq:league:state-changed`

## Additional correction

Platform event emission no longer creates duplicate window notifications. Each transition produces one platform-service event, one canonical browser event, and one compatibility browser alias.
