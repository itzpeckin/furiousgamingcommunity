import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  createId,
  createRandomToken,
  createSecureCookie,
  decodeOpaqueContext,
  hashToken,
  jsonResponse
} from "../../../_lib/auth.js";

const RELEASE = "7.1.0";

export async function onRequestGet(context) {
  return jsonResponse({
    ok: false,
    error: "Session handoffs must use the secure POST flow."
  }, 405, { Allow: "POST" });
}

async function readCode(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return String(body?.code || "").trim();
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return String(form.get("code") || "").trim();
  }
  return "";
}

export async function onRequestPost(context) {
  try {
    const code = await readCode(context.request);
    if (!/^[a-f0-9]{64}$/i.test(code)) {
      return jsonResponse({ ok:false, error:"The login handoff expired or is invalid." }, 400);
    }

    const codeHash = await hashToken(code);
    const stored = await context.env.DB.prepare(`
      SELECT id
      FROM oauth_states
      WHERE state_token_hash = ?
        AND id LIKE 'handoff.%'
        AND used_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `).bind(codeHash).first();
    if (!stored?.id) {
      return jsonResponse({ ok:false, error:"The login handoff expired or is invalid." }, 400);
    }

    const encoded = String(stored.id).split(".")[1] || "";
    const payload = decodeOpaqueContext(encoded);
    const requestOrigin = new URL(context.request.url).origin;
    if (!payload?.userId || payload.audience !== requestOrigin) {
      return jsonResponse({ ok:false, error:"The login handoff expired or is invalid." }, 400);
    }

    const user = await context.env.DB.prepare(`SELECT id FROM users WHERE id=? LIMIT 1`).bind(payload.userId).first();
    if (!user) return jsonResponse({ ok:false, error:"The authenticated Franchise HQ user no longer exists." }, 404);

    const rawSessionToken = createRandomToken(48);
    const sessionTokenHash = await hashToken(rawSessionToken);
    const expiresAt = addSecondsToNow(AUTH_CONSTANTS.SESSION_DURATION_SECONDS);
    const sessionId = createId("session");
    const results = await context.env.DB.batch([
      context.env.DB.prepare(`
        INSERT INTO sessions (id, user_id, session_token_hash, expires_at)
        SELECT ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM oauth_states
          WHERE id = ? AND state_token_hash = ?
            AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        )
      `).bind(sessionId, user.id, sessionTokenHash, expiresAt, stored.id, codeHash),
      context.env.DB.prepare(`
        UPDATE oauth_states
        SET used_at = CURRENT_TIMESTAMP
        WHERE id = ? AND state_token_hash = ?
          AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      `).bind(stored.id, codeHash)
    ]);
    if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
      return jsonResponse({ ok:false, error:"The login handoff expired or was already used." }, 400);
    }

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
    return new Response(null, { status:303, headers });
  } catch (error) {
    console.error("Session claim failed:", error);
    return jsonResponse({ ok:false, error:"Unable to establish the Franchise HQ session." }, 500);
  }
}
