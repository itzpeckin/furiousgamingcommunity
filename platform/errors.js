(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/errors.js.');
  }

  const history = [];
  const MAX_HISTORY = 100;

  const CATEGORIES = Object.freeze({
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    VALIDATION: 'validation',
    NETWORK: 'network',
    TIMEOUT: 'timeout',
    NOT_FOUND: 'not-found',
    CONFLICT: 'conflict',
    SERVER: 'server',
    UNKNOWN: 'unknown'
  });

  class FranchiseHQError extends Error {
    constructor(message, details = {}) {
      super(message || 'An unexpected Franchise HQ error occurred.');
      this.name = details.name || 'FranchiseHQError';
      this.code = details.code || 'UNKNOWN_ERROR';
      this.category = details.category || CATEGORIES.UNKNOWN;
      this.status = Number(details.status || 0);
      this.recoverable = details.recoverable !== false;
      this.userMessage = details.userMessage || this.message;
      this.requestId = details.requestId || null;
      this.context = details.context || null;
      this.cause = details.cause;
      this.timestamp = details.timestamp || new Date().toISOString();
    }

    toJSON() {
      return {
        name: this.name,
        message: this.message,
        userMessage: this.userMessage,
        code: this.code,
        category: this.category,
        status: this.status,
        recoverable: this.recoverable,
        requestId: this.requestId,
        context: this.context,
        timestamp: this.timestamp
      };
    }
  }

  function categoryFromStatus(status, code = '') {
    if (code === 'REQUEST_TIMEOUT') return CATEGORIES.TIMEOUT;
    if (code === 'NETWORK_ERROR') return CATEGORIES.NETWORK;
    if (status === 401) return CATEGORIES.AUTHENTICATION;
    if (status === 403) return CATEGORIES.AUTHORIZATION;
    if (status === 404) return CATEGORIES.NOT_FOUND;
    if (status === 409) return CATEGORIES.CONFLICT;
    if (status === 400 || status === 422) return CATEGORIES.VALIDATION;
    if (status >= 500) return CATEGORIES.SERVER;
    return CATEGORIES.UNKNOWN;
  }

  function defaultUserMessage(category) {
    switch (category) {
      case CATEGORIES.AUTHENTICATION: return 'Your session has expired. Please sign in again.';
      case CATEGORIES.AUTHORIZATION: return 'You do not have permission to complete this action.';
      case CATEGORIES.VALIDATION: return 'Please review the information provided and try again.';
      case CATEGORIES.NETWORK: return 'Franchise HQ could not connect to the server. Check your connection and try again.';
      case CATEGORIES.TIMEOUT: return 'The request took too long. Please try again.';
      case CATEGORIES.NOT_FOUND: return 'The requested information could not be found.';
      case CATEGORIES.CONFLICT: return 'This information changed before the action could be completed. Refresh and try again.';
      case CATEGORIES.SERVER: return 'Franchise HQ encountered a server problem. Please try again.';
      default: return 'Something went wrong. Please try again.';
    }
  }

  function normalize(error, overrides = {}) {
    if (error instanceof FranchiseHQError && Object.keys(overrides).length === 0) return error;

    const source = error && typeof error === 'object' ? error : {};
    const status = Number(overrides.status ?? source.status ?? 0);
    const code = overrides.code || source.code || (source.name === 'AbortError' ? 'REQUEST_ABORTED' : 'UNKNOWN_ERROR');
    const category = overrides.category || source.category || categoryFromStatus(status, code);
    const message = overrides.message || source.message || String(error || 'Unknown error');

    return new FranchiseHQError(message, {
      name: overrides.name || source.name || 'FranchiseHQError',
      code,
      category,
      status,
      recoverable: overrides.recoverable ?? source.recoverable ?? status < 500,
      userMessage: overrides.userMessage || source.userMessage || defaultUserMessage(category),
      requestId: overrides.requestId || source.requestId || null,
      context: overrides.context || source.context || null,
      cause: overrides.cause || source.cause || error
    });
  }

  function record(error, metadata = {}) {
    const normalized = normalize(error, metadata);
    const entry = Object.freeze({
      ...normalized.toJSON(),
      source: metadata.source || 'unknown',
      handled: metadata.handled === true
    });
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
    HQ.events?.emit?.('error:recorded', entry, { source: metadata.source || 'errors' });
    return normalized;
  }

  function present(error, options = {}) {
    const normalized = record(error, { ...options, handled: true });
    const title = options.title || (normalized.category === CATEGORIES.AUTHORIZATION ? 'Access denied' : 'Unable to complete action');
    HQ.ui?.toast?.(title, normalized.userMessage, {
      type: options.type || 'error',
      duration: options.duration || 6000,
      code: normalized.code,
      requestId: normalized.requestId
    });
    return normalized;
  }

  function validation(message, details = {}) {
    return new FranchiseHQError(message, {
      ...details,
      code: details.code || 'VALIDATION_ERROR',
      category: CATEGORIES.VALIDATION,
      status: details.status || 422,
      userMessage: details.userMessage || message
    });
  }

  function clearHistory() {
    history.length = 0;
  }

  function diagnostics() {
    const byCategory = history.reduce((result, item) => {
      result[item.category] = (result[item.category] || 0) + 1;
      return result;
    }, {});
    return Object.freeze({
      service: 'errors',
      version: '1.0',
      totalRecorded: history.length,
      byCategory: Object.freeze(byCategory),
      recent: Object.freeze(history.slice(-20))
    });
  }

  HQ.defineService('errors', {
    FranchiseHQError,
    CATEGORIES,
    normalize,
    record,
    present,
    validation,
    clearHistory,
    diagnostics
  });
})();
