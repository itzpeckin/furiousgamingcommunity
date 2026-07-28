# Franchise HQ Version 4.19

## Storage, Configuration, Feature Flags and Platform Manifest

### Deployment manifest

#### New files

- `platform/manifest.js`
- `platform/storage.js`
- `platform/config.js`
- `platform/features.js`
- `VERSION-4.19.md`
- `STORAGE-CONFIGURATION.md`
- `FEATURE-FLAGS.md`
- `PLATFORM-MANIFEST.md`

#### Updated files

- `platform/core.js`
- `platform/contract.js`
- `platform/runtime.js`
- `platform/validate.js`
- `index.html`
- `PLATFORM-COMPLETION-CHECKLIST.md`

**Total files to deploy: 14**

## Release summary

Version 4.19 introduces namespaced browser storage, layered application configuration, centrally registered feature flags, and a Platform Manifest that verifies required scripts and self-registering services.

The deployment validator now reports the exact missing script path when a release file or updated `index.html` is omitted.

## Expected versions

- Platform release: `4.19`
- Contract: `1.5-draft`
- Runtime: `1.1`
- Validator: `1.1`
- Manifest: `1.0`
- Storage: `1.0`
- Configuration: `1.0`
- Feature flags: `1.0`
