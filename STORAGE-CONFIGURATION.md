# Storage and Configuration

## Storage

`FranchiseHQ.storage` is the supported browser-persistence abstraction for new Platform and feature work.

```javascript
FranchiseHQ.storage.set('user.preferences', { compactMode: true });
FranchiseHQ.storage.get('user.preferences');
FranchiseHQ.storage.remove('user.preferences');
```

Options support session storage and expiration:

```javascript
FranchiseHQ.storage.set('temporary.value', data, {
  session: true,
  ttlMs: 300000
});
```

All keys use the `franchisehq:` namespace. Malformed or expired records are removed safely.

## Configuration

`FranchiseHQ.config` resolves values in this order:

1. Runtime overrides
2. `window.FRANCHISE_HQ_CONFIG` deployment values
3. Platform defaults

```javascript
FranchiseHQ.config.get('environment');
FranchiseHQ.config.get('api.baseUrl');
FranchiseHQ.config.setOverride('api.baseUrl', '/api');
```

Frontend configuration must never contain Discord client secrets, signing secrets, database credentials, or other private server credentials.
