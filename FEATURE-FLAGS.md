# Feature Flags

`FranchiseHQ.features` provides centralized feature registration and evaluation.

```javascript
FranchiseHQ.features.isEnabled('trade.ai-suggestions');
FranchiseHQ.features.evaluate('trade.ai-suggestions');
```

A flag can be restricted by environment or permission. Runtime overrides are available for controlled validation:

```javascript
FranchiseHQ.features.enable('trade.ai-suggestions');
FranchiseHQ.features.disable('trade.ai-suggestions');
FranchiseHQ.features.clearOverride('trade.ai-suggestions');
```

Version 4.19 registers these initial flags:

- `trade.ai-suggestions` — disabled preview
- `commissioner.system-health` — disabled commissioner preview
- `platform.deployment-validation` — enabled
