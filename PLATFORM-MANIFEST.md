# Platform Manifest

`FranchiseHQ.manifest` records Platform service metadata and validates deployment completeness.

```javascript
FranchiseHQ.manifest.diagnostics();
```

The diagnostics report includes:

- required Platform script paths
- script paths found in the deployed document
- missing script paths
- self-declared Platform services
- registered services
- compliance status

This is intended to turn missing-file deployment mistakes into direct messages such as:

```text
Required platform scripts are missing: platform/runtime.js
```

rather than allowing the application to fail only through a generic readiness timeout.
