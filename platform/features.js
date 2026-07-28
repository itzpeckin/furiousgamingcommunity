(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/features.js.');

  const flags = new Map();
  const overrides = new Map();

  function register(key, definition = {}, options = {}) {
    const id = String(key || '').trim();
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) throw new TypeError(`Invalid feature flag "${id}".`);
    if (flags.has(id) && options.replace !== true) return flags.get(id);
    const flag = Object.freeze({
      key: id,
      description: String(definition.description || ''),
      defaultEnabled: definition.defaultEnabled === true,
      environments: Object.freeze(Array.isArray(definition.environments) ? [...definition.environments] : []),
      requiredPermission: definition.requiredPermission ? String(definition.requiredPermission) : null,
      preview: definition.preview === true
    });
    flags.set(id, flag);
    return flag;
  }

  function evaluate(key, context = {}) {
    const id = String(key || '').trim();
    const flag = flags.get(id);
    if (!flag) return Object.freeze({ key: id, enabled: false, reason: 'Feature flag is not registered.' });

    const environment = HQ.config?.get?.('environment', 'production') || 'production';
    if (flag.environments.length && !flag.environments.includes(environment)) {
      return Object.freeze({ key: id, enabled: false, reason: `Feature is unavailable in the ${environment} environment.` });
    }

    if (flag.requiredPermission) {
      const allowed = context.permissions?.includes?.(flag.requiredPermission)
        || HQ.permissions?.can?.(flag.requiredPermission) === true;
      if (!allowed) return Object.freeze({ key: id, enabled: false, reason: `Permission "${flag.requiredPermission}" is required.` });
    }

    const enabled = overrides.has(id) ? overrides.get(id) : flag.defaultEnabled;
    return Object.freeze({
      key: id,
      enabled,
      reason: enabled ? 'Feature is enabled.' : 'Feature is disabled by configuration.',
      source: overrides.has(id) ? 'runtime-override' : 'default',
      preview: flag.preview
    });
  }

  function isEnabled(key, context = {}) {
    return evaluate(key, context).enabled;
  }

  function enable(key) {
    if (!flags.has(String(key))) throw new Error(`Feature flag "${key}" is not registered.`);
    overrides.set(String(key), true);
    HQ.events?.emit?.('feature:changed', { key: String(key), enabled: true });
    return true;
  }

  function disable(key) {
    if (!flags.has(String(key))) throw new Error(`Feature flag "${key}" is not registered.`);
    overrides.set(String(key), false);
    HQ.events?.emit?.('feature:changed', { key: String(key), enabled: false });
    return false;
  }

  function clearOverride(key) {
    return overrides.delete(String(key));
  }

  function list(context = {}) {
    return Object.freeze([...flags.values()].map((flag) => Object.freeze({ ...flag, evaluation: evaluate(flag.key, context) })));
  }

  function diagnostics() {
    return Object.freeze({
      service: 'features',
      version: '1.0',
      flagCount: flags.size,
      overrideCount: overrides.size,
      environment: HQ.config?.get?.('environment', 'production'),
      flags: list()
    });
  }

  HQ.defineService('features', { register, evaluate, isEnabled, enable, disable, clearOverride, list, diagnostics });
  HQ.manifest?.register?.({ id: 'features', service: 'features', script: 'platform/features.js', version: '1.0', capabilities: ['feature-registration', 'environment-gating', 'permission-gating', 'runtime-overrides'], dependencies: ['config'] });

  register('trade.ai-suggestions', { description: 'AI-assisted trade suggestion workflow.', defaultEnabled: false, preview: true });
  register('commissioner.system-health', { description: 'Commissioner-facing platform health view.', defaultEnabled: false, requiredPermission: 'commissioner', preview: true });
  register('platform.deployment-validation', { description: 'Deployment manifest validation checks.', defaultEnabled: true });
})();
