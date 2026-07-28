(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/api.js.');
  }

  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_RETRIES = 0;
  const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
  const activeRequests = new Map();
  const requestHistory = [];
  const MAX_HISTORY = 100;
  let requestSequence = 0;

  class ApiError extends (HQ.errors?.FranchiseHQError || Error) {
    constructor(message, details = {}) {
      super(message || 'Franchise HQ API request failed.', {
        ...details,
        name: 'ApiError'
      });
      this.name = 'ApiError';
      this.status = Number(details.status || this.status || 0);
      this.code = details.code || this.code || null;
      this.url = details.url || null;
      this.method = details.method || null;
      this.payload = details.payload ?? null;
      this.requestId = details.requestId || this.requestId || null;
      this.cause = details.cause;
    }
  }

  function buildUrl(path, query = null) {
    const value = String(path || '').trim();
    if (!value) throw new TypeError('FranchiseHQ.api requires a request path.');

    const url = new URL(value, window.location.origin);
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, rawValue]) => {
        if (rawValue === undefined || rawValue === null || rawValue === '') return;
        if (Array.isArray(rawValue)) {
          rawValue.forEach((item) => url.searchParams.append(key, String(item)));
          return;
        }
        url.searchParams.set(key, String(rawValue));
      });
    }
    return url.pathname + url.search + url.hash;
  }

  function emit(name, detail, metadata = {}) {
    if (HQ.events?.emit) {
      HQ.events.emit(name, detail, { source: 'api', ...metadata });
      return;
    }
    window.dispatchEvent(new CustomEvent(`franchisehq:${name}`, { detail }));
  }

  function record(entry) {
    requestHistory.push(Object.freeze(entry));
    if (requestHistory.length > MAX_HISTORY) requestHistory.shift();
  }

  function composeSignal(externalSignal, controller) {
    if (!externalSignal) return controller.signal;
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    return controller.signal;
  }

  function expectsJson(url, options = {}) {
    if (options.responseType === 'text' || options.responseType === 'blob') return false;
    if (options.responseType === 'json') return true;
    try {
      return new URL(url, window.location.origin).pathname.startsWith('/api/');
    } catch (_) {
      return String(url || '').startsWith('/api/');
    }
  }

  async function parseResponse(response, context = {}) {
    if (response.status === 204) return null;

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const jsonExpected = expectsJson(context.url || response.url, context.options);
    const isJson = contentType.includes('application/json') || contentType.includes('+json');

    if (isJson) {
      try {
        return await response.json();
      } catch (error) {
        throw new ApiError('The server returned invalid JSON.', {
          status: response.status || 500,
          code: 'INVALID_JSON',
          url: context.url || response.url,
          method: context.method || null,
          requestId: context.requestId || null,
          cause: error
        });
      }
    }

    if (context.options?.responseType === 'blob') return response.blob();

    const text = await response.text();
    if (jsonExpected) {
      const safePreview = text ? text.slice(0, 160).replace(/\s+/g, ' ').trim() : null;
      throw new ApiError('The API returned an unexpected response format.', {
        status: response.ok ? 500 : (response.status || 500),
        code: 'INVALID_API_RESPONSE',
        url: context.url || response.url,
        method: context.method || null,
        requestId: context.requestId || null,
        payload: {
          contentType: contentType || 'unknown',
          preview: safePreview
        }
      });
    }

    return text || null;
  }

  function messageFromPayload(payload, status) {
    if (typeof payload?.error === 'string') return payload.error;
    if (typeof payload?.message === 'string') return payload.message;
    if (typeof payload?.error?.message === 'string') return payload.error.message;
    return `Request failed with status ${status}.`;
  }

  function shouldRetry(error, method, attempt, retries) {
    if (attempt >= retries) return false;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
    return error.status === 0 || RETRYABLE_STATUSES.has(error.status);
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const requestId = options.requestId || `fhq-${Date.now()}-${++requestSequence}`;
    const url = buildUrl(path, options.query);
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const retries = Number.isInteger(options.retries) ? Math.max(0, options.retries) : DEFAULT_RETRIES;
    const startedAt = Date.now();
    const signal = composeSignal(options.signal, controller);

    const headers = new Headers(options.headers || {});
    headers.set('Accept', headers.get('Accept') || 'application/json');
    headers.set('X-FranchiseHQ-Request-ID', requestId);

    let body = options.body;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
    const isUrlSearchParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
    if (body !== undefined && body !== null && typeof body === 'object' && !isFormData && !isBlob && !isUrlSearchParams) {
      headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
      body = JSON.stringify(body);
    }

    const requestDetail = { requestId, method, url, startedAt: new Date(startedAt).toISOString() };
    activeRequests.set(requestId, { controller, ...requestDetail });
    emit('api:request-started', requestDetail);

    let timeout = null;
    if (timeoutMs > 0) timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs);

    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const response = await fetch(url, {
            method,
            credentials: options.credentials || 'same-origin',
            headers,
            body: ['GET', 'HEAD'].includes(method) ? undefined : body,
            signal,
            cache: options.cache || 'no-store'
          });

          const payload = await parseResponse(response, { url, method, requestId, options });
          if (!response.ok || payload?.ok === false) {
            throw new ApiError(messageFromPayload(payload, response.status), {
              status: response.status,
              code: payload?.code || payload?.error?.code || `HTTP_${response.status}`,
              url,
              method,
              payload,
              requestId
            });
          }

          const durationMs = Date.now() - startedAt;
          const success = { ...requestDetail, status: response.status, durationMs, attempt, payload };
          record({ ...success, outcome: 'succeeded' });
          emit('api:request-succeeded', success);
          return options.returnResponse === true ? { payload, response, requestId } : payload;
        } catch (error) {
          const aborted = error?.name === 'AbortError';
          const timedOut = aborted && controller.signal.reason === 'timeout';
          const apiError = error instanceof ApiError ? error : new ApiError(
            timedOut ? `Request timed out after ${timeoutMs}ms.` : aborted ? 'Request was cancelled.' : (error?.message || 'Unable to reach the Franchise HQ API.'),
            {
              status: 0,
              code: timedOut ? 'REQUEST_TIMEOUT' : aborted ? 'REQUEST_CANCELLED' : 'NETWORK_ERROR',
              url,
              method,
              requestId,
              cause: error
            }
          );

          if (shouldRetry(apiError, method, attempt, retries)) {
            emit('api:request-retrying', { ...requestDetail, attempt: attempt + 1, error: apiError });
            await delay(Math.min(250 * (2 ** attempt), 2000));
            continue;
          }

          const normalized = HQ.errors?.normalize ? HQ.errors.normalize(apiError, {
            status: apiError.status,
            code: apiError.code,
            requestId,
            context: { url, method }
          }) : apiError;
          const durationMs = Date.now() - startedAt;
          record({ ...requestDetail, outcome: 'failed', durationMs, status: apiError.status, code: apiError.code });
          HQ.errors?.record?.(normalized, { source: 'api' });
          emit('api:request-failed', { ...requestDetail, durationMs, error: normalized });
          if (apiError.status === 401) emit('auth:required', { requestId, url, method });
          if (apiError.status === 403) emit('permission:denied', { requestId, url, method });
          throw normalized;
        }
      }
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
      activeRequests.delete(requestId);
    }
  }

  function cancel(requestId, reason = 'cancelled-by-client') {
    const active = activeRequests.get(String(requestId));
    if (!active) return false;
    active.controller.abort(reason);
    return true;
  }

  function cancelAll(reason = 'cancelled-by-client') {
    const ids = Array.from(activeRequests.keys());
    ids.forEach((id) => cancel(id, reason));
    return ids.length;
  }

  function get(path, options = {}) { return request(path, { ...options, method: 'GET' }); }
  function post(path, body, options = {}) { return request(path, { ...options, method: 'POST', body }); }
  function put(path, body, options = {}) { return request(path, { ...options, method: 'PUT', body }); }
  function patch(path, body, options = {}) { return request(path, { ...options, method: 'PATCH', body }); }
  function remove(path, options = {}) { return request(path, { ...options, method: 'DELETE' }); }

  const endpoints = Object.freeze({
    health: () => get('/api/health'),
    auth: Object.freeze({ me: () => get('/api/auth/me'), logout: () => post('/api/auth/logout') }),
    league: Object.freeze({ active: () => get('/api/league') })
  });

  function diagnostics() {
    return Object.freeze({
      service: 'api',
      version: '2.0.1',
      defaults: Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES }),
      activeRequests: Object.freeze(Array.from(activeRequests.values()).map(({ controller, ...item }) => Object.freeze(item))),
      recentRequests: Object.freeze(requestHistory.slice(-20))
    });
  }

  HQ.defineService('api', {
    ApiError,
    buildUrl,
    request,
    get,
    post,
    put,
    patch,
    delete: remove,
    cancel,
    cancelAll,
    endpoints,
    diagnostics,
    defaults: Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS, retries: DEFAULT_RETRIES })
  });
})();
