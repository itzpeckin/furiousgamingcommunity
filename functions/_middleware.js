import { canonicalDocumentRedirect } from "./_lib/origin.js";
import { AUTH_CONSTANTS, getCookie, hashToken, verifyMutationCsrf } from "./_lib/auth.js";

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

function mutationOriginStatus(request, pathname) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return { mutation:false, valid:true };
  if (pathname === "/api/auth/session/claim") return { mutation:true, valid:true, handoff:true };
  const expectedOrigin = new URL(request.url).origin;
  const origin = String(request.headers.get("origin") || "").trim();
  let refererOrigin = "";
  try {
    const referer = request.headers.get("referer");
    if (referer) refererOrigin = new URL(referer).origin;
  } catch {}
  if (origin && origin !== expectedOrigin) return { mutation:true, valid:false, reason:"cross-origin" };
  if (!origin && refererOrigin && refererOrigin !== expectedOrigin) return { mutation:true, valid:false, reason:"cross-origin" };

  const hasBrowserSession = Boolean(
    getCookie(request, AUTH_CONSTANTS.SESSION_COOKIE_NAME)
    || getCookie(request, AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME)
  );
  if (!hasBrowserSession) return { mutation:true, valid:true };
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    return { mutation:true, valid:false, reason:"cross-origin" };
  }
  if (!origin && !refererOrigin) return { mutation:true, valid:false, reason:"missing-origin" };
  return { mutation:true, valid:true, browserSession:true };
}

async function rateLimit(context, pathname) {
  const policy = AUTH_RATE_POLICIES[pathname];
  if (!policy) return null;
  const client = String(context.request.headers.get("cf-connecting-ip") || "unidentified");
  const key = await hashToken(`${pathname}:${client}`);
  if (context.env?.AUTH_RATE_LIMITER?.limit) {
    const outcome = await context.env.AUTH_RATE_LIMITER.limit({ key });
    return outcome?.success === false ? Math.ceil(policy.windowMs / 1000) : null;
  }
  if (!context.env?.DB) return null;
  const seconds = Math.ceil(policy.windowMs / 1000);
  try {
    const row = await context.env.DB.prepare(`INSERT INTO authentication_rate_limits
      (bucket_key,request_count,expires_at,updated_at)
      VALUES (?,1,datetime('now',?),CURRENT_TIMESTAMP)
      ON CONFLICT(bucket_key) DO UPDATE SET
        request_count=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE request_count+1 END,
        expires_at=CASE WHEN expires_at<=CURRENT_TIMESTAMP THEN datetime('now',?) ELSE expires_at END,
        updated_at=CURRENT_TIMESTAMP
      RETURNING request_count AS requestCount,
        MAX(1,CAST((julianday(expires_at)-julianday('now'))*86400 AS INTEGER)) AS retryAfter`)
      .bind(key,`+${seconds} seconds`,`+${seconds} seconds`).first();
    return Number(row?.requestCount || 0) > policy.limit ? Number(row?.retryAfter || seconds) : null;
  } catch (error) {
    console.error("FranchiseHQ authentication rate limit unavailable", { pathname, error });
    return null;
  }
}

export async function onRequest(context) {
  const id = requestId(context.request);
  const pathname = new URL(context.request.url).pathname;
  let response;
  const canonicalLocation = canonicalDocumentRedirect(context.request);
  if (canonicalLocation) {
    response = new Response(null, {
      status: 302,
      headers: {
        location: canonicalLocation,
        "cache-control": "no-store",
        "x-franchisehq-canonical-host": "franchisehq.app"
      }
    });
    return applySecurityHeaders(response, id, context.request);
  }
  const retryAfter = await rateLimit(context, pathname);
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
  const mutationOrigin = mutationOriginStatus(context.request, pathname);
  if (!mutationOrigin.valid) {
    response = new Response(JSON.stringify({
      ok: false,
      error: "Cross-origin state changes are not allowed.",
      code:"MUTATION_ORIGIN_REJECTED",
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
  if (mutationOrigin.browserSession) {
    const csrf = await verifyMutationCsrf(context).catch((error) => {
      console.error("FranchiseHQ CSRF validation failed", { requestId:id, pathname, error });
      return { browserSession:true, valid:false, reason:"validation-error" };
    });
    if (!csrf.valid) {
      response = new Response(JSON.stringify({
        ok:false,
        error:"Your secure session changed. Refresh this page and try again.",
        code:"CSRF_VALIDATION_FAILED",
        requestId:id
      }), {
        status:403,
        headers:{
          "content-type":"application/json; charset=utf-8",
          "cache-control":"no-store"
        }
      });
      return applySecurityHeaders(response, id, context.request);
    }
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
