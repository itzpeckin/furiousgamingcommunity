# Validation — Franchise HQ v5.4.8a

1. Confirm the footer shows `v5.4.8a · LD-008 Event Naming Hotfix`.
2. Confirm the console no longer reports `Invalid Franchise HQ event name`.
3. Register platform listeners using the canonical names:

```javascript
const counts = { mode: 0, data: 0, state: 0 };
const offMode = FranchiseHQ.events.on('league:mode-changed', event => { counts.mode += 1; console.log(event.detail); });
const offData = FranchiseHQ.events.on('league:data-changed', event => { counts.data += 1; console.log(event.detail); });
const offState = FranchiseHQ.events.on('league:state-changed', event => { counts.state += 1; console.log(event.detail); });
```

4. Switch between Empty and Development Data. Confirm all counters increase and stop increasing after the action.
5. Confirm the browser compatibility alias works:

```javascript
window.addEventListener('franchisehq:league:stateChanged', event => console.log(event.detail), { once: true });
```

6. Switch modes once and confirm the listener logs one payload.
7. Clean up:

```javascript
offMode(); offData(); offState();
```

8. Confirm source persistence, banners, navigation, and the LD-007 API remain functional with no red console errors.
