# UI Infrastructure

The authoritative UI service is `FranchiseHQ.ui`.

## Notifications

```js
FranchiseHQ.ui.notify({ type: 'success', title: 'Trade Submitted', message: 'Your proposal has been sent.' });
FranchiseHQ.ui.toast.error('Unable to submit', 'Please try again.');
```

## Loading

```js
const request = FranchiseHQ.ui.loading.show({ message: 'Submitting trade…' });
FranchiseHQ.ui.loading.hide(request);
```

Loading is reference counted. Each caller should hide the specific request ID it received.

## Modals

```js
const dialog = FranchiseHQ.ui.modal.open({ title: 'Player Details', content: '<p>...</p>' });
const result = await dialog.closed;
```

## Empty and error states

```js
FranchiseHQ.ui.empty.show('#results', { title: 'No players found', message: 'Adjust the filters and try again.' });
FranchiseHQ.ui.error.show('#results', error);
```

Existing feature-specific dialogs remain functional and can be migrated incrementally.
