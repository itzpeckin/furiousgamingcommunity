(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/config.js.');

  const defaults = Object.freeze({
    environment: 'production',
    api: Object.freeze({ baseUrl: '' }),
    storage: Object.freeze({ namespace: 'franchisehq' }),
    features: Object.freeze({ allowRuntimeOverrides: true })
  });
  const deployment = Object.freeze({ ...(window.FRANCHISE_HQ_CONFIG || {}) });
  const runtime = new Map();

  function readPath(source, path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
  }

  function get(path, fallback = undefined) {
    const key = String(path || '').trim();
    if (!key) return fallback;
    if (runtime.has(key)) return runtime.get(key);
    const deploymentValue = readPath(deployment, key);
    if (deploymentValue !== undefined) return deploymentValue;
    const defaultValue = readPath(defaults, key);
    return defaultValue === undefined ? fallback : defaultValue;
  }

  function has(path) {
    return get(path, Symbol.for('franchisehq.config.missing')) !== Symbol.for('franchisehq.config.missing');
  }

  function setOverride(path, value) {
    if (get('features.allowRuntimeOverrides', true) !== true) throw new Error('Runtime configuration overrides are disabled.');
    const key = String(path || '').trim();
    if (!key) throw new TypeError('A configuration path is required.');
    runtime.set(key, value);
    HQ.events?.emit?.('config:overridden', { path: key });
    return value;
  }

  function clearOverride(path) {
    return runtime.delete(String(path || '').trim());
  }

  function snapshot() {
    return Object.freeze({
      environment: get('environment'),
      api: Object.freeze({ baseUrl: get('api.baseUrl', '') }),
      storage: Object.freeze({ namespace: get('storage.namespace', 'franchisehq') }),
      features: Object.freeze({ allowRuntimeOverrides: get('features.allowRuntimeOverrides', true) })
    });
  }

  function diagnostics() {
    return Object.freeze({
      service: 'config',
      version: '1.0',
      environment: get('environment'),
      deploymentKeys: Object.freeze(Object.keys(deployment)),
      runtimeOverrideCount: runtime.size,
      runtimeOverrides: Object.freeze([...runtime.keys()]),
      secretPolicy: 'Frontend configuration must not contain private credentials or server secrets.',
      snapshot: snapshot()
    });
  }

  HQ.defineService('config', { get, has, setOverride, clearOverride, snapshot, diagnostics });
  HQ.manifest?.register?.({ id: 'config', service: 'config', script: 'platform/config.js', version: '1.0', capabilities: ['defaults', 'deployment-config', 'runtime-overrides', 'environment-awareness'], dependencies: ['manifest'] });
})();
