(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/negotiations.js.');

  let adapter = null;
  const supportedActions = Object.freeze([
    'saveDraft',
    'submit',
    'accept',
    'decline',
    'withdraw',
    'revise',
    'replay',
    'sendMessage'
  ]);

  function attachLegacy(nextAdapter) {
    if (!nextAdapter || typeof nextAdapter !== 'object') {
      throw new TypeError('A negotiation adapter is required.');
    }
    adapter = nextAdapter;
    HQ.getService?.('trade.events')?.emit?.('trade-negotiations-ready', {
      version: '4.13',
      actions: supportedActions
    });
    return service;
  }

  function invoke(action, ...args) {
    const fn = adapter?.[action];
    if (typeof fn !== 'function') {
      console.warn(`[FranchiseHQ.trade.negotiations] Unsupported action: ${action}`);
      return undefined;
    }

    HQ.getService?.('trade.events')?.emit?.('trade-negotiation-action', {
      action,
      phase: 'before'
    });

    const result = fn(...args);

    HQ.getService?.('trade.events')?.emit?.('trade-negotiation-action', {
      action,
      phase: 'after'
    });

    return result;
  }

  function saveDraft(...args) { return invoke('saveDraft', ...args); }
  function submit(...args) { return invoke('submit', ...args); }
  function accept(...args) { return invoke('accept', ...args); }
  function decline(...args) { return invoke('decline', ...args); }
  function withdraw(...args) { return invoke('withdraw', ...args); }
  function revise(...args) { return invoke('revise', ...args); }
  function replay(...args) { return invoke('replay', ...args); }
  function sendMessage(...args) { return invoke('sendMessage', ...args); }

  function diagnostics() {
    return Object.freeze({
      initialized: Boolean(adapter),
      adapterConnected: Boolean(adapter),
      supportedActions,
      moduleVersion: '4.13'
    });
  }

  const service = {
    attachLegacy,
    invoke,
    saveDraft,
    submit,
    accept,
    decline,
    withdraw,
    revise,
    replay,
    sendMessage,
    diagnostics
  };

  HQ.defineService('trade.negotiations', service, { freeze: false });
})();
