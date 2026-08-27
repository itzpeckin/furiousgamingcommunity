export const CANONICAL_APP_ORIGIN = "https://franchisehq.app";
export const OWNER_FALLBACK_ORIGIN = "https://franchise-hq.pages.dev";

export function isFranchiseHqPagesHost(hostname) {
  return /(^|\.)franchise-hq\.pages\.dev$/i.test(String(hostname || ""));
}

export function isOwnerFallbackHost(hostname) {
  return String(hostname || "").toLowerCase() === "franchise-hq.pages.dev";
}

export function canonicalAuthenticationOrigin(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike));
  if (url.hostname === "franchisehq.app") return CANONICAL_APP_ORIGIN;
  if (isOwnerFallbackHost(url.hostname)) return OWNER_FALLBACK_ORIGIN;
  if (isFranchiseHqPagesHost(url.hostname)) return CANONICAL_APP_ORIGIN;
  return url.origin;
}

export function canonicalDocumentRedirect(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const source = new URL(request.url);
  if (!isFranchiseHqPagesHost(source.hostname) || isOwnerFallbackHost(source.hostname) || source.pathname.startsWith("/api/")) {
    return null;
  }

  const fetchDestination = String(request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const acceptsHtml = String(request.headers.get("accept") || "").toLowerCase().includes("text/html");
  if (fetchDestination && fetchDestination !== "document") return null;
  if (!fetchDestination && !acceptsHtml) return null;

  return new URL(`${source.pathname}${source.search}`, CANONICAL_APP_ORIGIN).toString();
}
