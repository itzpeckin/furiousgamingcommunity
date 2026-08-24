import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  createId,
  createRandomToken,
  createSecureCookie,
  hashToken,
  jsonResponse,
  verifySessionTransferToken
} from "../../../_lib/auth.js";

const RELEASE = "6.1.2.3";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const token = url.searchParams.get("token");
    const secret = context.env.SESSION_SIGNING_SECRET || context.env.DISCORD_CLIENT_SECRET;
    const payload = await verifySessionTransferToken(secret, token);
    if (!payload?.userId) {
      return jsonResponse({ ok:false, error:"The login handoff expired or is invalid." }, 400);
    }

    const user = await context.env.DB.prepare(`SELECT id FROM users WHERE id=? LIMIT 1`).bind(payload.userId).first();
    if (!user) return jsonResponse({ ok:false, error:"The authenticated Franchise HQ user no longer exists." }, 404);

    const rawSessionToken = createRandomToken(48);
    const sessionTokenHash = await hashToken(rawSessionToken);
    const expiresAt = addSecondsToNow(AUTH_CONSTANTS.SESSION_DURATION_SECONDS);
    await context.env.DB.prepare(`
      INSERT INTO sessions (id, user_id, session_token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(createId("session"), user.id, sessionTokenHash, expiresAt).run();

    const destination = String(payload.destination || "/leagues");
    const safeDestination = destination.startsWith("/") && !destination.startsWith("//")
      ? destination
      : "/leagues";
    const headers = new Headers({
      Location: safeDestination,
      "Cache-Control": "no-store",
      "x-franchisehq-release": RELEASE
    });
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_COOKIE_NAME, rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS, "/"
    ));
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS, "/"
    ));
    return new Response(null, { status:302, headers });
  } catch (error) {
    console.error("Session claim failed:", error);
    return jsonResponse({ ok:false, error:"Unable to establish the Franchise HQ session.", details:error instanceof Error?error.message:String(error) }, 500);
  }
}
