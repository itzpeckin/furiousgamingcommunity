(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/security.js.');

  const SAFE_PROTOCOLS = Object.freeze(['http:', 'https:', 'mailto:', 'tel:']);
  const blockedSchemes = /^(?:javascript|data|vbscript|file):/i;

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function text(value) {
    return document.createTextNode(String(value ?? ''));
  }

  function normalizeUrl(value, options = {}) {
    const raw = String(value ?? '').trim();
    if (!raw || blockedSchemes.test(raw)) return null;
    try {
      const url = new URL(raw, window.location.origin);
      const allowed = options.allowedProtocols || SAFE_PROTOCOLS;
      if (!allowed.includes(url.protocol)) return null;
      if (options.sameOrigin === true && url.origin !== window.location.origin) return null;
      return url;
    } catch {
      return null;
    }
  }

  function isSafeUrl(value, options = {}) {
    return normalizeUrl(value, options) !== null;
  }

  function assertSafeUrl(value, options = {}) {
    const url = normalizeUrl(value, options);
    if (!url) {
      const error = new Error('Unsafe or invalid URL rejected.');
      error.code = 'UNSAFE_URL';
      throw error;
    }
    return url.href;
  }

  function safeExternalLink(anchor, value) {
    if (!(anchor instanceof HTMLAnchorElement)) throw new TypeError('safeExternalLink requires an anchor element.');
    anchor.href = assertSafeUrl(value);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function redact(value, options = {}) {
    const sensitiveKeys = new Set((options.keys || [
      'token', 'accessToken', 'refreshToken', 'authorization', 'password', 'secret', 'clientSecret', 'cookie'
    ]).map((key) => String(key).toLowerCase()));
    const seen = new WeakSet();
    const walk = (input) => {
      if (input === null || typeof input !== 'object') return input;
      if (seen.has(input)) return '[Circular]';
      seen.add(input);
      if (Array.isArray(input)) return input.map(walk);
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [
        key,
        sensitiveKeys.has(key.toLowerCase()) ? '[REDACTED]' : walk(item)
      ]));
    };
    return walk(value);
  }

  function audit() {
    const externalBlankLinks = [...document.querySelectorAll('a[target="_blank"]')];
    const unsafeBlankLinks = externalBlankLinks.filter((anchor) => {
      const rel = new Set((anchor.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean));
      return !rel.has('noopener') || !rel.has('noreferrer');
    });
    const inlineHandlers = [...document.querySelectorAll('*')].filter((element) =>
      [...element.attributes].some((attribute) => /^on/i.test(attribute.name))
    );
    const insecureUrls = [...document.querySelectorAll('[href],[src]')].filter((element) => {
      const raw = element.getAttribute('href') || element.getAttribute('src') || '';
      return blockedSchemes.test(raw.trim());
    });
    const findings = [
      ...unsafeBlankLinks.map((element) => ({ severity: 'warning', code: 'UNSAFE_BLANK_LINK', element: element.outerHTML.slice(0, 180) })),
      ...inlineHandlers.map((element) => ({ severity: 'warning', code: 'INLINE_EVENT_HANDLER', element: element.outerHTML.slice(0, 180) })),
      ...insecureUrls.map((element) => ({ severity: 'error', code: 'UNSAFE_URL_SCHEME', element: element.outerHTML.slice(0, 180) }))
    ];
    return Object.freeze({
      service: 'security',
      version: '1.0',
      secureContext: window.isSecureContext,
      protocol: window.location.protocol,
      counts: Object.freeze({
        findings: findings.length,
        errors: findings.filter((item) => item.severity === 'error').length,
        warnings: findings.filter((item) => item.severity === 'warning').length
      }),
      findings: Object.freeze(findings),
      compliant: findings.every((item) => item.severity !== 'error')
    });
  }

  const service = HQ.defineService('security', {
    escapeHTML,
    text,
    normalizeUrl,
    isSafeUrl,
    assertSafeUrl,
    safeExternalLink,
    redact,
    audit,
    diagnostics: audit,
    safeProtocols: SAFE_PROTOCOLS
  });

  HQ.manifest?.register?.({
    id: 'security',
    service: 'security',
    script: 'platform/security.js',
    version: '1.0',
    capabilities: ['output-encoding', 'url-validation', 'secret-redaction', 'security-audit'],
    dependencies: ['manifest']
  });
})();
