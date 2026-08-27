export const CANONICAL_APP_ORIGIN = "https://franchisehq.app";
export const OWNER_FALLBACK_ORIGIN = "https://franchise-hq.pages.dev";
export const DISCORD_CALLBACK_PATH = "/api/auth/discord/callback";
export const PUBLIC_DISCORD_REDIRECT_URI = `${CANONICAL_APP_ORIGIN}${DISCORD_CALLBACK_PATH}`;
export const OWNER_DISCORD_REDIRECT_URI = `${OWNER_FALLBACK_ORIGIN}${DISCORD_CALLBACK_PATH}`;

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

function configuredRedirectUri(value, expectedOrigin) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.origin !== expectedOrigin || url.pathname !== DISCORD_CALLBACK_PATH || url.search || url.hash) {
    throw new Error(`Discord redirect URI must be ${expectedOrigin}${DISCORD_CALLBACK_PATH}.`);
  }
  if (url.protocol !== "https:" && !/^(?:localhost|127\.0\.0\.1)$/i.test(url.hostname)) {
    throw new Error("Discord redirect URI must use HTTPS outside local development.");
  }
  return url.toString();
}

export function discordRedirectUriForOrigin(env = {}, originLike) {
  const origin = canonicalAuthenticationOrigin(originLike);
  if (origin === CANONICAL_APP_ORIGIN) {
    return configuredRedirectUri(env.DISCORD_REDIRECT_URI_PUBLIC, origin) || PUBLIC_DISCORD_REDIRECT_URI;
  }
  if (origin === OWNER_FALLBACK_ORIGIN) {
    return configuredRedirectUri(env.DISCORD_REDIRECT_URI_OWNER, origin) || OWNER_DISCORD_REDIRECT_URI;
  }

  const configured = configuredRedirectUri(env.DISCORD_REDIRECT_URI, origin);
  return configured || new URL(DISCORD_CALLBACK_PATH, origin).toString();
}

export function normalizeLeagueReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const match = raw.match(/^\/leagues\/([A-Za-z0-9-]{1,100})\/?(#[A-Za-z0-9][A-Za-z0-9._~:/%+-]{0,255})?$/);
  if (!match) return null;
  return `/leagues/${match[1]}${match[2] || ""}`;
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
