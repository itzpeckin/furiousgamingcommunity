(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/validate.js.');
  }

  const suites = new Map();
  let lastReport = null;

  function normalizeStatus(value) {
    const status = String(value || '').toLowerCase();
    if (['pass', 'fail', 'warning', 'skip'].includes(status)) return status;
    return 'pass';
  }

  function register(suite) {
    if (!suite || typeof suite !== 'object') throw new TypeError('A validation suite definition is required.');
    const id = String(suite.id || '').trim();
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) throw new TypeError(`Invalid validation suite id "${id}".`);
    if (!Array.isArray(suite.tests) || suite.tests.length === 0) throw new TypeError(`Validation suite "${id}" must include tests.`);

    const normalized = Object.freeze({
      id,
      name: String(suite.name || id),
      version: String(suite.version || HQ.metadata.version),
      tests: Object.freeze(suite.tests.map((test, index) => {
        if (!test || typeof test.run !== 'function') throw new TypeError(`Suite "${id}" test ${index + 1} requires a run function.`);
        return Object.freeze({
          id: String(test.id || `test-${index + 1}`),
          name: String(test.name || test.id || `Test ${index + 1}`),
          severity: String(test.severity || 'error'),
          run: test.run
        });
      }))
    });
    suites.set(id, normalized);
    return normalized;
  }

  function assertion(condition, message, details = null) {
    if (!condition) {
      const error = new Error(message || 'Validation assertion failed.');
      error.validationDetails = details;
      throw error;
    }
    return true;
  }

  async function runTest(suite, test) {
    const started = performance.now();
    try {
      const value = await test.run({ platform: HQ, assert: assertion });
      const normalized = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : { details: value };
      return Object.freeze({
        suiteId: suite.id,
        suiteName: suite.name,
        testId: test.id,
        testName: test.name,
        status: normalizeStatus(normalized.status),
        message: normalized.message || 'Passed.',
        details: normalized.details ?? null,
        durationMs: Number((performance.now() - started).toFixed(2))
      });
    } catch (error) {
      return Object.freeze({
        suiteId: suite.id,
        suiteName: suite.name,
        testId: test.id,
        testName: test.name,
        status: test.severity === 'warning' ? 'warning' : 'fail',
        message: error instanceof Error ? error.message : String(error),
        details: error?.validationDetails ?? null,
        durationMs: Number((performance.now() - started).toFixed(2))
      });
    }
  }

  async function run(options = {}) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const requested = options.suites
      ? new Set(Array.isArray(options.suites) ? options.suites : [options.suites])
      : null;
    const selected = [...suites.values()].filter((suite) => !requested || requested.has(suite.id));
    const results = [];

    for (const suite of selected) {
      for (const test of suite.tests) results.push(await runTest(suite, test));
    }

    const count = (status) => results.filter((result) => result.status === status).length;
    lastReport = Object.freeze({
      service: 'validate',
      version: HQ.metadata.version,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Number((performance.now() - started).toFixed(2)),
      total: results.length,
      passed: count('pass'),
      failed: count('fail'),
      warnings: count('warning'),
      skipped: count('skip'),
      compliant: count('fail') === 0,
      suites: Object.freeze(selected.map((suite) => suite.id)),
      results: Object.freeze(results)
    });

    HQ.events?.emit?.('validation:completed', lastReport);
    return lastReport;
  }

  function diagnostics() {
    return Object.freeze({
      service: 'validate',
      version: '1.3',
      suiteCount: suites.size,
      testCount: [...suites.values()].reduce((total, suite) => total + suite.tests.length, 0),
      suites: Object.freeze([...suites.values()].map((suite) => Object.freeze({
        id: suite.id,
        name: suite.name,
        version: suite.version,
        testCount: suite.tests.length
      }))),
      lastReport
    });
  }

  const service = HQ.defineService('validate', {
    register,
    run,
    assertion,
    diagnostics,
    getLastReport: () => lastReport
  });

  register({
    id: 'platform',
    name: 'Platform Foundation',
    tests: [
      {
        id: 'release-metadata',
        name: 'Release metadata',
        run: ({ assert }) => {
          assert(HQ.metadata.version === '4.21', `Expected release 4.21, received ${HQ.metadata.version}.`);
          return { details: HQ.metadata };
        }
      },
      {
        id: 'required-services',
        name: 'Required services registered',
        run: ({ assert }) => {
          const diagnostics = HQ.lifecycle.diagnostics();
          assert(diagnostics.missingServices.length === 0, 'Required services are missing.', diagnostics.missingServices);
          return { details: { count: diagnostics.services.length } };
        }
      },
      {
        id: 'contract-audit',
        name: 'Platform contract audit',
        run: ({ assert }) => {
          const audit = HQ.contract.audit();
          assert(audit.contractVersion === '1.0', `Expected contract 1.0, received ${audit.contractVersion}.`);
          assert(audit.release === '4.21', `Expected contract release 4.21, received ${audit.release}.`);
          assert(audit.compliant, 'Platform contract audit is not compliant.', audit);
          return { details: audit };
        }
      },
      {
        id: 'state-namespaces',
        name: 'State namespaces',
        run: ({ assert }) => {
          const diagnostics = HQ.state.diagnostics();
          const names = diagnostics.namespaces?.map?.((item) => item.name) || Object.keys(diagnostics.namespaces || {});
          ['platform', 'identity', 'league', 'dataCache', 'trade'].forEach((name) => {
            assert(names.includes(name), `State namespace "${name}" is missing.`, names);
          });
          return { details: names };
        }
      },
      {
        id: 'api-error-services',
        name: 'API and error diagnostics',
        run: ({ assert }) => {
          const api = HQ.api.diagnostics();
          const errors = HQ.errors.diagnostics();
          assert(api.service === 'api', 'API diagnostics are unavailable.', api);
          assert(errors.service === 'errors', 'Error diagnostics are unavailable.', errors);
          return { details: { apiVersion: api.version, errorsVersion: errors.version } };
        }
      },
      {
        id: 'event-subscription-cleanup',
        name: 'Event subscription cleanup',
        run: ({ assert }) => {
          let calls = 0;
          const eventName = `validation:runtime-${Date.now()}`;
          const stop = HQ.events.on(eventName, () => { calls += 1; }, { owner: 'validate' });
          HQ.events.emit(eventName, { phase: 'before-stop' });
          stop();
          HQ.events.emit(eventName, { phase: 'after-stop' });
          assert(calls === 1, `Expected one event call, received ${calls}.`);
          return { details: { calls, unsubscribeType: typeof stop } };
        }
      }
    ]
  });

  register({
    id: 'runtime',
    name: 'Module Runtime',
    tests: [
      {
        id: 'runtime-registered',
        name: 'Runtime service registered',
        run: ({ assert }) => {
          assert(HQ.hasService('runtime'), 'Runtime service is not registered.');
          return { details: HQ.runtime.diagnostics() };
        }
      },
      {
        id: 'module-metadata',
        name: 'Module metadata contract',
        run: ({ assert }) => {
          const modules = HQ.runtime.list();
          assert(modules.length >= 5, `Expected at least five runtime modules, received ${modules.length}.`);
          modules.forEach((module) => {
            assert(module.id && module.name && module.version, `Module metadata is incomplete for ${module.id || 'unknown'}.`, module);
            assert(Array.isArray(module.routes), `Module routes must be an array for ${module.id}.`);
            assert(Array.isArray(module.permissions), `Module permissions must be an array for ${module.id}.`);
          });
          return { details: modules.map(({ id, state }) => ({ id, state })) };
        }
      },
      {
        id: 'modules-ready',
        name: 'Runtime modules ready',
        run: async ({ assert }) => {
          await HQ.runtime.startAll();
          const diagnostics = HQ.runtime.diagnostics();
          assert(diagnostics.ready, 'One or more runtime modules are not ready.', diagnostics.modules);
          return { details: diagnostics.counts };
        }
      },
      {
        id: 'dependency-integrity',
        name: 'Module dependencies resolved',
        run: ({ assert }) => {
          const modules = HQ.runtime.list();
          modules.forEach((module) => {
            module.dependencies.forEach((dependency) => {
              if (dependency.startsWith('service:')) {
                assert(HQ.hasService(dependency.slice(8)), `Missing dependency ${dependency} for ${module.id}.`);
              } else {
                assert(modules.some((candidate) => candidate.id === dependency), `Missing module dependency ${dependency} for ${module.id}.`);
              }
            });
          });
          return { details: { modulesChecked: modules.length } };
        }
      }
    ]
  });

  register({
    id: 'ui-infrastructure',
    name: 'UI Infrastructure',
    tests: [
      {
        id: 'theme-service',
        name: 'Theme service registered',
        run: ({ assert }) => {
          assert(HQ.hasService('theme'), 'Theme service is not registered.');
          const diagnostics = HQ.theme.diagnostics();
          assert(diagnostics.tokenCount > 0, 'Theme tokens are unavailable.', diagnostics);
          assert(diagnostics.applied, 'Theme tokens have not been applied to the document.', diagnostics);
          return { details: diagnostics };
        }
      },
      {
        id: 'ui-manager-capabilities',
        name: 'UI manager capabilities',
        run: ({ assert }) => {
          const required = ['notify', 'loading', 'modal', 'empty', 'error'];
          required.forEach((capability) => {
            assert(HQ.ui?.[capability], `UI capability "${capability}" is missing.`);
          });
          const diagnostics = HQ.ui.diagnostics();
          assert(diagnostics.version === '2.0', `Expected UI manager 2.0, received ${diagnostics.version}.`);
          return { details: diagnostics };
        }
      },
      {
        id: 'ui-hosts',
        name: 'Global UI hosts mounted',
        run: ({ assert }) => {
          const diagnostics = HQ.ui.diagnostics();
          assert(diagnostics.hosts.toast, 'Toast host is not mounted.', diagnostics.hosts);
          assert(diagnostics.hosts.loading, 'Loading host is not mounted.', diagnostics.hosts);
          assert(diagnostics.hosts.modal, 'Modal host is not mounted.', diagnostics.hosts);
          return { details: diagnostics.hosts };
        }
      },
      {
        id: 'loading-reference-count',
        name: 'Loading reference counting',
        run: ({ assert }) => {
          const first = HQ.ui.loading.show({ message: 'Validation' });
          const second = HQ.ui.loading.show({ message: 'Validation' });
          assert(HQ.ui.loading.count() === 2, 'Loading count did not increment to two.');
          HQ.ui.loading.hide(first);
          HQ.ui.loading.hide(second);
          assert(HQ.ui.loading.count() === 0, 'Loading count did not return to zero.');
          return { details: { finalCount: HQ.ui.loading.count() } };
        }
      }
    ]
  });


  register({
    id: 'storage-configuration',
    name: 'Storage, Configuration and Feature Flags',
    tests: [
      {
        id: 'deployment-manifest',
        name: 'Deployment manifest scripts loaded',
        run: ({ assert }) => {
          const diagnostics = HQ.manifest.diagnostics();
          assert(diagnostics.scripts.compliant, `Required platform scripts are missing: ${diagnostics.scripts.missing.join(', ')}`, diagnostics.scripts);
          assert(diagnostics.services.compliant, `Manifest services are missing: ${diagnostics.services.missing.join(', ')}`, diagnostics.services);
          return { details: diagnostics };
        }
      },
      {
        id: 'storage-service',
        name: 'Storage service available',
        run: ({ assert }) => {
          const diagnostics = HQ.storage.diagnostics();
          assert(diagnostics.localAvailable, 'Local storage is unavailable.', diagnostics);
          assert(diagnostics.sessionAvailable, 'Session storage is unavailable.', diagnostics);
          return { details: diagnostics };
        }
      },
      {
        id: 'storage-round-trip',
        name: 'Storage JSON round trip',
        run: ({ assert }) => {
          const key = `validation.${Date.now()}`;
          const value = { release: HQ.metadata.version, valid: true };
          assert(HQ.storage.set(key, value), 'Storage write failed.');
          const received = HQ.storage.get(key);
          HQ.storage.remove(key);
          assert(received?.release === value.release && received?.valid === true, 'Storage round trip returned an unexpected value.', received);
          return { details: received };
        }
      },
      {
        id: 'storage-expiration',
        name: 'Storage expiration metadata',
        run: async ({ assert }) => {
          const key = `validation.expiration.${Date.now()}`;
          HQ.storage.set(key, 'expires', { ttlMs: 1 });
          await new Promise((resolve) => setTimeout(resolve, 5));
          assert(HQ.storage.get(key, null) === null, 'Expired storage value was returned.');
          return { details: { expired: true } };
        }
      },
      {
        id: 'configuration-precedence',
        name: 'Configuration runtime override precedence',
        run: ({ assert }) => {
          const path = 'validation.runtimeOverride';
          HQ.config.setOverride(path, 'active');
          assert(HQ.config.get(path) === 'active', 'Runtime configuration override was not returned.');
          HQ.config.clearOverride(path);
          assert(HQ.config.get(path, null) === null, 'Runtime configuration override was not cleared.');
          return { details: HQ.config.diagnostics() };
        }
      },
      {
        id: 'feature-flags',
        name: 'Feature flag evaluation and override',
        run: ({ assert }) => {
          const key = 'validation.temporary-flag';
          HQ.features.register(key, { defaultEnabled: false }, { replace: true });
          assert(HQ.features.isEnabled(key) === false, 'Feature flag default state was not respected.');
          HQ.features.enable(key);
          assert(HQ.features.isEnabled(key) === true, 'Feature flag enable override failed.');
          HQ.features.disable(key);
          assert(HQ.features.isEnabled(key) === false, 'Feature flag disable override failed.');
          HQ.features.clearOverride(key);
          return { details: HQ.features.evaluate(key) };
        }
      },
      {
        id: 'platform-feature-default',
        name: 'Deployment validation feature enabled',
        run: ({ assert }) => {
          const evaluation = HQ.features.evaluate('platform.deployment-validation');
          assert(evaluation.enabled, 'Platform deployment validation feature is disabled.', evaluation);
          return { details: evaluation };
        }
      },
      {
        id: 'new-services-declared',
        name: 'New services declared by contract',
        run: ({ assert }) => {
          const audit = HQ.contract.audit();
          ['manifest', 'storage', 'config', 'features'].forEach((name) => {
            assert(!audit.undeclaredRegisteredServices.includes(name), `Service "${name}" is not declared in the platform contract.`, audit);
          });
          return { details: { services: ['manifest', 'storage', 'config', 'features'] } };
        }
      }
    ]
  });


  register({
    id: 'security-release',
    name: 'Security, Testing and Release Hardening',
    tests: [
      {
        id: 'security-service',
        name: 'Security baseline service registered',
        run: ({ assert }) => {
          assert(HQ.hasService('security'), 'Security service is not registered.');
          const diagnostics = HQ.security.diagnostics();
          assert(diagnostics.compliant, 'Security audit contains blocking findings.', diagnostics);
          return { details: diagnostics };
        }
      },
      {
        id: 'output-encoding',
        name: 'Output encoding blocks HTML injection',
        run: ({ assert }) => {
          const encoded = HQ.security.escapeHTML('<img src=x onerror=alert(1)>');
          assert(!encoded.includes('<img'), 'HTML was not escaped.', encoded);
          assert(encoded.includes('&lt;img'), 'Escaped HTML output was unexpected.', encoded);
          return { details: { encoded } };
        }
      },
      {
        id: 'unsafe-url-rejection',
        name: 'Unsafe URL schemes rejected',
        run: ({ assert }) => {
          assert(HQ.security.isSafeUrl('javascript:alert(1)') === false, 'javascript: URL was accepted.');
          assert(HQ.security.isSafeUrl('/teams') === true, 'Same-origin relative URL was rejected.');
          return { details: { javascriptRejected: true, relativeAccepted: true } };
        }
      },
      {
        id: 'secret-redaction',
        name: 'Sensitive diagnostics values redacted',
        run: ({ assert }) => {
          const redacted = HQ.security.redact({ token: 'secret', nested: { password: 'private', value: 1 } });
          assert(redacted.token === '[REDACTED]', 'Token was not redacted.', redacted);
          assert(redacted.nested.password === '[REDACTED]', 'Nested password was not redacted.', redacted);
          return { details: redacted };
        }
      },
      {
        id: 'release-service',
        name: 'Release service registered',
        run: ({ assert }) => {
          assert(HQ.hasService('release'), 'Release service is not registered.');
          const diagnostics = HQ.release.diagnostics();
          assert(diagnostics.build.version === '4.21', 'Release build metadata is incorrect.', diagnostics);
          return { details: diagnostics.build };
        }
      },
      {
        id: 'support-bundle-redaction',
        name: 'Support bundle generated without obvious secrets',
        run: ({ assert }) => {
          const bundle = HQ.release.supportBundle();
          const serialized = JSON.stringify(bundle);
          assert(!/"(?:token|password|secret)"\s*:\s*"(?!\[REDACTED\])/i.test(serialized), 'Support bundle contains an unredacted sensitive value.');
          return { details: { bytes: serialized.length } };
        }
      },
      {
        id: 'new-services-declared-420',
        name: 'Security and release services declared by contract',
        run: ({ assert }) => {
          const audit = HQ.contract.audit();
          ['security', 'release'].forEach((name) => {
            assert(!audit.undeclaredRegisteredServices.includes(name), `Service "${name}" is not declared in the platform contract.`, audit);
          });
          return { details: { services: ['security', 'release'] } };
        }
      }
    ]
  });


  register({
    id: 'platform-certification',
    name: 'Platform Completion and Certification',
    tests: [
      {
        id: 'stable-contract',
        name: 'Stable Platform Contract 1.0',
        run: ({ assert }) => {
          const audit = HQ.contract.audit();
          assert(audit.contractVersion === '1.0', `Expected stable contract 1.0, received ${audit.contractVersion}.`, audit);
          assert(audit.release === '4.21', `Expected release 4.21, received ${audit.release}.`, audit);
          assert(audit.compliant, 'Platform contract is not compliant.', audit);
          return { details: audit };
        }
      },
      {
        id: 'platform-health-service',
        name: 'Consolidated Platform health report',
        run: ({ assert }) => {
          assert(HQ.hasService('platform'), 'Platform health service is not registered.');
          const health = HQ.platform.health();
          assert(health.overall === 'healthy', 'Platform health is degraded.', health);
          return { details: health.checks };
        }
      },
      {
        id: 'runtime-dependency-certification',
        name: 'Runtime dependency graph is compliant',
        run: ({ assert }) => {
          const audit = HQ.runtime.dependencyAudit();
          assert(audit.compliant, 'Runtime dependency audit failed.', audit);
          return { details: audit };
        }
      },
      {
        id: 'platform-manifest-complete',
        name: 'Platform manifest is complete',
        run: ({ assert }) => {
          const diagnostics = HQ.manifest.diagnostics();
          assert(diagnostics.compliant, 'Platform manifest is incomplete.', diagnostics);
          assert(diagnostics.entries.some((entry) => entry.service === 'platform'), 'Platform health service is missing from the manifest.', diagnostics.entries);
          return { details: diagnostics };
        }
      },
      {
        id: 'release-certification-capability',
        name: 'Release certification capability available',
        run: ({ assert }) => {
          assert(typeof HQ.release.certify === 'function', 'release.certify is unavailable.');
          return { details: HQ.release.diagnostics() };
        }
      }
    ]
  });

})();
