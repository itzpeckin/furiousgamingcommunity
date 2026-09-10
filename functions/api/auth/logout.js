import {
  AUTH_CONSTANTS,
  appendClearedBrowserSessionCookies,
  getCookie,
  jsonResponse,
  revokeBrowserSessions
} from "../../_lib/auth.js";

const RELEASE = "7.5.3";

async function revokeSession(context) {
  const candidates = [
    getCookie(context.request, AUTH_CONSTANTS.SESSION_COOKIE_NAME),
    getCookie(context.request, AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME)
  ].filter(Boolean);

  try {
    return await revokeBrowserSessions(context, {
      rawTokens:candidates,
      eventType:"logged_out",
      reason:"user-logout"
    });
  } catch (error) {
    console.warn("Session revocation warning:", error?.message || error);
    return 0;
  }
}

export async function onRequestGet(context) {
  return jsonResponse({
    ok: false,
    error: "Logout requires POST."
  }, 405, { Allow: "POST" });
}

export async function onRequestPost(context) {
  const revokedSessions = await revokeSession(context);
  const wantsHtml = String(context.request.headers.get("accept") || "").includes("text/html");
  const headers = new Headers({
    "Cache-Control": "no-store"
  });
  appendClearedBrowserSessionCookies(headers);
  if (wantsHtml) {
    headers.set("Location", "/?logout=success");
    return new Response(null, { status: 303, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({
    ok: true,
    authenticated: false,
    revokedSessions,
    release: RELEASE
  }), { status: 200, headers });
}
