(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/release.js.');

  let lastPreflight = null;

  function buildInfo() {
    return Object.freeze({
      application: HQ.metadata.name,
      version: HQ.metadata.version,
      build: HQ.metadata.build,
      contractVersion: HQ.contract?.describe?.().version || null,
      generatedAt: new Date().toISOString(),
      location: window.location.origin
    });
  }

  async function preflight(options = {}) {
    const started = performance.now();
    const validation = await HQ.validate.run(options.validation || {});
    const manifest = HQ.manifest.diagnostics();
    const lifecycle = HQ.lifecycle.diagnostics();
    const runtime = HQ.runtime.diagnostics();
    const security = HQ.security.audit();
    const checks = Object.freeze({
      lifecycleReady: lifecycle.status === 'ready',
      manifestCompliant: manifest.compliant,
      runtimeReady: runtime.ready,
      validationCompliant: validation.compliant,
      securityCompliant: security.compliant
    });
    const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    lastPreflight = Object.freeze({
      service: 'release',
      version: HQ.metadata.version,
      createdAt: new Date().toISOString(),
      durationMs: Number((performance.now() - started).toFixed(2)),
      ready: failures.length === 0,
      checks,
      failures: Object.freeze(failures),
      validationSummary: Object.freeze({
        total: validation.total,
        passed: validation.passed,
        failed: validation.failed,
        warnings: validation.warnings
      })
    });
    HQ.events?.emit?.('release:preflight-completed', lastPreflight);
    return lastPreflight;
  }

  function supportBundle() {
    return HQ.security.redact({
      build: buildInfo(),
      lifecycle: HQ.lifecycle.diagnostics(),
      manifest: HQ.manifest.diagnostics(),
      runtime: HQ.runtime.diagnostics(),
      validation: HQ.validate.getLastReport(),
      security: HQ.security.audit(),
      api: HQ.api.diagnostics(),
      errors: HQ.errors.diagnostics(),
      config: HQ.config.diagnostics(),
      features: HQ.features.diagnostics(),
      userAgent: navigator.userAgent
    });
  }

  function downloadSupportBundle(filename = `franchise-hq-support-${HQ.metadata.version}.json`) {
    const blob = new Blob([JSON.stringify(supportBundle(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return filename;
  }

  function diagnostics() {
    return Object.freeze({
      service: 'release',
      version: '1.0',
      build: buildInfo(),
      lastPreflight
    });
  }

  HQ.defineService('release', {
    buildInfo,
    preflight,
    supportBundle,
    downloadSupportBundle,
    diagnostics,
    getLastPreflight: () => lastPreflight
  });

  HQ.manifest?.register?.({
    id: 'release',
    service: 'release',
    script: 'platform/release.js',
    version: '1.0',
    capabilities: ['release-preflight', 'support-bundle', 'build-metadata'],
    dependencies: ['manifest', 'security', 'validate', 'runtime']
  });
})();
