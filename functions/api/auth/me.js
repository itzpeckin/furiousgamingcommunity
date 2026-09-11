import {
  appendBrowserSessionCookies,
  appendClearedBrowserSessionCookies,
  getCurrentSession,
  jsonResponse,
  rotateBrowserSession
} from "../../_lib/auth.js";

const RELEASE = "7.5.5.3";

export async function onRequestGet(context) {
  try {
    let session = await getCurrentSession(context);

    if (!session) {
      const response = jsonResponse({
        ok: true,
        authenticated: false,
        user: null,
        membership: null,
        capabilities:[],
        release:RELEASE
      });
      appendClearedBrowserSessionCookies(response.headers);
      return response;
    }

    if (session.kind === "browser") {
      session = await rotateBrowserSession(context, session);
    }

    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    if (session.kind === "browser") appendBrowserSessionCookies(headers, session);

    return new Response(JSON.stringify({
      ok: true,
      authenticated: true,
      user: session.user,
      membership: session.membership,
      capabilities:session.capabilities || [],
      session: {
        expiresAt: session.expiresAt,
        absoluteExpiresAt:session.absoluteExpiresAt || null,
        rotated:session.rotated === true
      },
      release: RELEASE
    }, null, 2), { status: 200, headers });
  } catch (error) {
    console.error("Current-user lookup failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to load the current user."
      },
      500
    );
  }
}
