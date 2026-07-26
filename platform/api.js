(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/api.js.');
  }

  const DEFAULT_TIMEOUT_MS = 15000;
  let requestSequence = 0;

  class ApiError extends Error {
    constructor(message, details = {}) {
      super(message || 'Franchise HQ API request failed.');
      this.name = 'ApiError';
      this.status = Number(details.status || 0);
      this.code = details.code || null;
      this.url = details.url || null;
      this.method = details.method || null;
      this.payload = details.payload ?? null;
      this.requestId = details.requestId || null;
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

  function emit(name, detail) {
    if (HQ.events?.emit) {
      HQ.events.emit(name, detail);
      return;
    }
    window.dispatchEvent(new CustomEvent(`franchisehq:${name}`, { detail }));
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (error) {
        throw new ApiError('The server returned invalid JSON.', {
          status: response.status,
          url: response.url,
          cause: error
        });
      }
    }

    const text = await response.text();
    return text || null;
  }

  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const requestId = `fhq-${Date.now()}-${++requestSequence}`;
    const url = buildUrl(path, options.query);
    const controller = new AbortController();
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : DEFAULT_TIMEOUT_MS;

    let timeout = null;
    if (timeoutMs > 0) {
      timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    }

    const headers = new Headers(options.headers || {});
    headers.set('Accept', headers.get('Accept') || 'application/json');
    headers.set('X-FranchiseHQ-Request-ID', requestId);

    let body = options.body;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
    const isUrlSearchParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;

    if (
      body !== undefined &&
      body !== null &&
      typeof body === 'object' &&
      !isFormData &&
      !isBlob &&
      !isUrlSearchParams
    ) {
      headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
      body = JSON.stringify(body);
    }

    const requestDetail = { requestId, method, url };
    emit('api-request-started', requestDetail);

    try {
      const response = await fetch(url, {
        method,
        credentials: options.credentials || 'same-origin',
        headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : body,
        signal: options.signal || controller.signal,
        cache: options.cache || 'no-store'
      });

      const payload = await parseResponse(response);
      if (!response.ok || payload?.ok === false) {
        throw new ApiError(
          payload?.error || `Request failed with status ${response.status}.`,
          {
            status: response.status,
            code: payload?.code,
            url,
            method,
            payload,
            requestId
          }
        );
      }

      emit('api-request-succeeded', {
        ...requestDetail,
        status: response.status,
        payload
      });

      return payload;
    } catch (error) {
      let apiError = error;
      if (!(error instanceof ApiError)) {
        const aborted = error?.name === 'AbortError';
        apiError = new ApiError(
          aborted
            ? `Request timed out after ${timeoutMs}ms.`
            : error instanceof Error
              ? error.message
              : 'Unable to reach the Franchise HQ API.',
          {
            status: 0,
            code: aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
            url,
            method,
            requestId,
            cause: error
          }
        );
      }

      emit('api-request-failed', {
        ...requestDetail,
        error: apiError
      });

      throw apiError;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }

  function get(path, options = {}) {
    return request(path, { ...options, method: 'GET' });
  }

  function post(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body });
  }

  function put(path, body, options = {}) {
    return request(path, { ...options, method: 'PUT', body });
  }

  function patch(path, body, options = {}) {
    return request(path, { ...options, method: 'PATCH', body });
  }

  function remove(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' });
  }

  const endpoints = Object.freeze({
    health: () => get('/api/health'),
    auth: Object.freeze({
      me: () => get('/api/auth/me'),
      logout: () => post('/api/auth/logout')
    }),
    league: Object.freeze({
      active: () => get('/api/league')
    })
  });

  HQ.defineService('api', {
    ApiError,
    buildUrl,
    request,
    get,
    post,
    put,
    patch,
    delete: remove,
    endpoints,
    defaults: Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS })
  });
})();
