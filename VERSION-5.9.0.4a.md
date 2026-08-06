# Franchise HQ v5.9.0.4a — Import History Event Contract Hotfix

Corrects the Import History event name so it complies with the Franchise HQ event-bus contract.

## Corrected events

- Import history updates now emit `import:history-updated` internally.
- League data refreshes continue exposing the required public event name `league:dataUpdated`.
- The shared event bus receives the contract-safe internal name `league:data-updated`.
- Browser consumers continue receiving `franchisehq:league:dataUpdated`.

No league data, page behavior, snapshot records, or validation rules are changed.
