# Franchise HQ v5.4.8b Validation

## 1. Install listeners

```javascript
window.ld008b?.cleanup?.();
const counts = { mode: 0, data: 0, state: 0 };
const offMode = FranchiseHQ.events.on('league:mode-changed', () => { counts.mode++; console.log('MODE'); });
const offData = FranchiseHQ.events.on('league:data-changed', () => { counts.data++; console.log('DATA'); });
const offState = FranchiseHQ.events.on('league:state-changed', () => { counts.state++; console.log('STATE'); });
window.ld008b = { counts, cleanup: () => [offMode(), offData(), offState()] };
```

Seeing `undefined` after installing listeners is normal.

## 2. Switch mode once

Switch Empty to Development Data, or Development Data to Empty.

Expected console labels:

```text
MODE
DATA
STATE
```

Then run:

```javascript
window.ld008b.counts
```

Expected after one clean switch:

```javascript
{ mode: 1, data: 1, state: 1 }
```

## 3. Check delivery diagnostics

```javascript
FranchiseHQ.leagueData.diagnostics().normalizedEvents
```

Expected:

- `emitted.mode`, `emitted.data`, and `emitted.state` increased.
- All `failed` values are `0`.
- `lastFailure` is `null`.

## 4. Browser aliases

```javascript
const browserCounts = { canonical: 0, compatibility: 0 };
window.addEventListener('franchisehq:league:state-changed', () => browserCounts.canonical++, { once: true });
window.addEventListener('franchisehq:league:stateChanged', () => browserCounts.compatibility++, { once: true });
```

Switch modes once, then run:

```javascript
browserCounts
```

Expected:

```javascript
{ canonical: 1, compatibility: 1 }
```

## 5. Cleanup

```javascript
window.ld008b.cleanup();
delete window.ld008b;
```

An array containing `true` values confirms successful unsubscription.
