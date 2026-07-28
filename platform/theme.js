(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/theme.js.');

  const TOKENS = Object.freeze({
    color: Object.freeze({
      surface: '#10141d',
      surfaceRaised: '#171d28',
      surfaceOverlay: 'rgba(16, 20, 29, 0.92)',
      text: '#f5f7fb',
      textMuted: '#9ba7ba',
      border: 'rgba(255, 255, 255, 0.12)',
      accent: '#4f8cff',
      success: '#32d583',
      warning: '#fdb022',
      danger: '#f97066',
      info: '#53b1fd'
    }),
    spacing: Object.freeze({ xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' }),
    radius: Object.freeze({ sm: '8px', md: '12px', lg: '18px', pill: '999px' }),
    shadow: Object.freeze({ raised: '0 16px 40px rgba(0, 0, 0, 0.35)', overlay: '0 24px 80px rgba(0, 0, 0, 0.48)' }),
    motion: Object.freeze({ fast: '120ms', normal: '200ms', slow: '320ms' }),
    zIndex: Object.freeze({ toast: '1200', loading: '1250', modal: '1300' })
  });

  function flatten(value, prefix = [], output = {}) {
    Object.entries(value).forEach(([key, item]) => {
      const path = [...prefix, key];
      if (item && typeof item === 'object') flatten(item, path, output);
      else output[`--fhq-${path.join('-').replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = String(item);
    });
    return output;
  }

  const cssVariables = Object.freeze(flatten(TOKENS));
  let applied = false;

  function apply(target = document.documentElement) {
    if (!target?.style) throw new TypeError('Theme target must support inline CSS properties.');
    Object.entries(cssVariables).forEach(([name, value]) => target.style.setProperty(name, value));
    applied = true;
    HQ.events?.emit?.('theme:applied', { tokenCount: Object.keys(cssVariables).length });
    return target;
  }

  function get(path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], TOKENS);
  }

  function diagnostics() {
    return Object.freeze({
      service: 'theme',
      version: '1.0',
      applied,
      tokenCount: Object.keys(cssVariables).length,
      groups: Object.freeze(Object.keys(TOKENS))
    });
  }

  const service = HQ.defineService('theme', { tokens: TOKENS, cssVariables, apply, get, diagnostics });
  apply();
  return service;
})();
