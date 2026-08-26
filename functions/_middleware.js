const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://discord.com https://*.discord.com https://accounts.ea.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://discord.com https://*.discord.com"
].join("; ");

const rateBuckets = new Map();
const AUTH_RATE_POLICIES = Object.freeze({
  "/api/auth/discord/login": { limit: 30, windowMs: 10 * 60 * 1000 },
  "/api/auth/session/claim": { limit: 30, windowMs: 10 * 60 * 1000 }
});

function requestId(request) {
  const presented = String(request.headers.get("x-franchisehq-request-id") || "").trim();
  return /^[A-Za-z0-9._:-]{8,100}$/.test(presented) ? presented : crypto.randomUUID();
}

function applySecurityHeaders(response, id, request) {
  const headers = new Headers(response.headers);
  headers.set("x-franchisehq-request-id", id);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  headers.set("content-security-policy-report-only", CSP_REPORT_ONLY);
  if (new URL(request.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function safeApiFailure(id, status = 500) {
  return new Response(JSON.stringify({
    ok: false,
    error: "The request could not be completed.",
    requestId: id
  }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function crossOriginMutation(request, pathname) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return false;
  if (pathname === "/api/auth/session/claim") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin !== new URL(request.url).origin;
}

function rateLimit(request, pathname) {
  const policy = AUTH_RATE_POLICIES[pathname];
  if (!policy) return null;
  const client = String(request.headers.get("cf-connecting-ip") || "unidentified");
  const key = `${pathname}:${client}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + policy.windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 2_000) {
    for (const [entryKey, entry] of rateBuckets) {
      if (entry.resetAt <= now) rateBuckets.delete(entryKey);
    }
  }
  if (bucket.count <= policy.limit) return null;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

export async function onRequest(context) {
  const id = requestId(context.request);
  const pathname = new URL(context.request.url).pathname;
  let response;
  const retryAfter = rateLimit(context.request, pathname);
  if (retryAfter) {
    response = new Response(JSON.stringify({
      ok: false,
      error: "Too many authentication attempts. Please wait and try again.",
      requestId: id
    }), {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": String(retryAfter)
      }
    });
    return applySecurityHeaders(response, id, context.request);
  }
  if (crossOriginMutation(context.request, pathname)) {
    response = new Response(JSON.stringify({
      ok: false,
      error: "Cross-origin state changes are not allowed.",
      requestId: id
    }), {
      status: 403,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
    return applySecurityHeaders(response, id, context.request);
  }
  try {
    response = await context.next();
  } catch (error) {
    console.error("Unhandled FranchiseHQ request failure", { requestId: id, pathname, error });
    response = pathname.startsWith("/api/")
      ? safeApiFailure(id)
      : new Response("FranchiseHQ could not load this page.", { status: 500 });
  }

  if (pathname.startsWith("/api/") && response.status >= 500) {
    console.error("FranchiseHQ API failure response", { requestId: id, pathname, status: response.status });
    response = safeApiFailure(id, response.status);
  }
  return applySecurityHeaders(response, id, context.request);
}
