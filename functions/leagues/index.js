import {
  AUTH_CONSTANTS,
  createSecureCookie,
  getCurrentSession,
  redirectResponse
} from "../_lib/auth.js";
import { CANONICAL_APP_ORIGIN, isOwnerFallbackHost } from "../_lib/origin.js";
import { isOwnerFallbackIdentity } from "../_lib/owner-fallback.js";

const RELEASE = "7.3.4.1";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function leagueCard(league) {
  const role = league.role
    ? `<span class="role">${esc(String(league.role).replaceAll("_", " "))}</span>`
    : `<span class="role role--available">Available</span>`;
  return `<a class="league-card" href="/leagues/${encodeURIComponent(league.slug)}">
    <div class="league-mark">FH</div>
    <div class="league-copy">
      <div class="league-meta">Your League</div>
      <h2>${esc(league.name)}</h2>
      <p>${league.team_id ? `Assigned team: ${esc(league.team_id)}` : "Open your league dashboard and management tools."}</p>
    </div>
    ${role}
    <span class="arrow">→</span>
  </a>`;
}

function page({ user, memberships, pendingMemberships = [] }) {
  const hasMemberships = memberships.length > 0;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#05080d">
  <title>Select a League | Franchise HQ</title>
  <style>
    :root{color-scheme:dark;--bg:#05080d;--panel:#0d141f;--panel2:#111b29;--line:rgba(119,158,214,.18);--text:#f7f9fc;--muted:#93a3ba;--blue:#0878ff;--blue2:#00b7ff}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{background:radial-gradient(circle at 50% 0,rgba(0,119,255,.14),transparent 34rem),#05080d}
    .shell{width:min(980px,calc(100% - 32px));margin:0 auto;padding:32px 0 48px}
    header{display:flex;align-items:center;justify-content:space-between;padding:12px 0 34px;border-bottom:1px solid var(--line)}
    .brand{font-weight:950;letter-spacing:.04em;font-size:19px}.brand span{color:#1698ff}.account{text-align:right}.account strong{display:block;font-size:14px}.account span{color:var(--muted);font-size:12px}
    main{padding:48px 0}.eyebrow{color:#77c8ff;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.hero h1{margin:10px 0 10px;font-size:clamp(34px,6vw,54px);letter-spacing:-.04em}.hero p{margin:0;color:var(--muted);font-size:17px;line-height:1.6;max-width:650px}
    .section{margin-top:38px}.section-title{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:13px}.section-title h2{margin:0;font-size:18px}.section-title span{color:var(--muted);font-size:12px}
    .list{display:grid;gap:12px}.league-card{display:grid;grid-template-columns:54px 1fr auto 24px;gap:16px;align-items:center;padding:18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,rgba(17,27,41,.88),rgba(9,14,22,.9));text-decoration:none;color:inherit;transition:.15s ease}.league-card:hover{transform:translateY(-1px);border-color:rgba(44,144,255,.48);background:var(--panel2)}
    .league-mark{width:54px;height:54px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#0878ff,#00a7ff);font-weight:950}.league-meta{color:#6fbfff;text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:900}.league-copy h2{margin:4px 0 3px;font-size:18px}.league-copy p{margin:0;color:var(--muted);font-size:13px}.role{padding:7px 10px;border-radius:999px;background:rgba(8,120,255,.14);color:#8dcaff;font-size:11px;font-weight:850;text-transform:capitalize}.role--available{background:rgba(255,255,255,.06);color:#b8c3d3}.arrow{font-size:21px;color:#79bdff}
    .empty{padding:18px;border:1px dashed rgba(147,163,186,.25);border-radius:14px;color:var(--muted);background:rgba(255,255,255,.02);line-height:1.55}
    footer{display:flex;justify-content:space-between;gap:16px;padding-top:20px;border-top:1px solid var(--line);color:#68778e;font-size:12px}.logout{color:#9db5d2;text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer}
    @media(max-width:620px){.shell{width:min(100% - 24px,980px);padding-top:18px}header{align-items:flex-start}.account strong{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}main{padding-top:36px}.league-card{grid-template-columns:48px 1fr 20px;gap:12px}.league-mark{width:48px;height:48px}.role{grid-column:2;justify-self:start}.arrow{grid-column:3;grid-row:1 / span 2}.section-title{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand">FRANCHISE<span>HQ</span></div>
      <div class="account"><strong>${esc(user.displayName || user.discordUsername || "Discord User")}</strong><span>Signed in with Discord</span></div>
    </header>
    <main>
      <section class="hero">
        <div class="eyebrow">League Selection</div>
        <h1>Choose your league.</h1>
        <p>Select the Franchise HQ league you want to enter. Your Discord session stays signed in while you move between leagues.</p>
      </section>
      <section class="section">
        <div class="section-title"><h2>Your Leagues</h2><span>${memberships.length} connected</span></div>
        <div class="list">
          ${hasMemberships ? memberships.map((l) => leagueCard(l)).join("") : `<div class="empty"><strong>No active league access yet.</strong><br>Use the league URL your commissioner shared with you to request access.</div>`}
        </div>
        ${pendingMemberships.length ? `<div class="section-title" style="margin-top:28px"><h2>Pending Approval</h2><span>${pendingMemberships.length} waiting</span></div><div class="list">${pendingMemberships.map((l)=>`<a class="league-card" href="/leagues/${encodeURIComponent(l.slug)}"><div class="league-mark">FH</div><div class="league-copy"><div class="league-meta">Waiting for commissioner</div><h2>${esc(l.name)}</h2><p>Your Discord account is connected. Team and role assignment are still pending.</p></div><span class="role">Pending</span><span class="arrow">→</span></a>`).join("")}</div>` : ""}
      </section>
    </main>
    <footer><span>Franchise HQ · Release ${RELEASE}</span><form method="post" action="/api/auth/logout"><button class="logout" type="submit">Log out</button></form></footer>
  </div>
</body>
</html>`;
}

export async function onRequestGet(context) {
  try {
    const session = await getCurrentSession(context);
    if (!session) return redirectResponse("/?auth=required");

    let memberships = [];
    let pendingMemberships = [];
    try {
      const result = await context.env.DB.prepare(`
        SELECT leagues.id, leagues.slug, leagues.name, league_memberships.role, league_memberships.team_id
        FROM league_memberships
        INNER JOIN leagues ON leagues.id = league_memberships.league_id
        WHERE league_memberships.user_id = ?
          AND league_memberships.active = 1
          AND leagues.public_status = 'active'
          AND leagues.tenant_status = 'enabled'
        ORDER BY leagues.name ASC
      `).bind(session.user.id).all();
      memberships = result?.results || [];
      const pending = await context.env.DB.prepare(`
        SELECT leagues.id, leagues.slug, leagues.name
        FROM league_memberships
        INNER JOIN leagues ON leagues.id = league_memberships.league_id
        WHERE league_memberships.user_id = ?
          AND league_memberships.active = 0
          AND league_memberships.role = 'team_owner'
          AND league_memberships.team_id IS NULL
          AND leagues.public_status = 'active'
          AND leagues.tenant_status = 'enabled'
        ORDER BY leagues.name ASC
      `).bind(session.user.id).all();
      pendingMemberships = pending?.results || [];
    } catch (error) {
      console.error("League selector membership lookup failed:", error);
    }

    if (isOwnerFallbackHost(new URL(context.request.url).hostname)
      && (!isOwnerFallbackIdentity(context.env, session.user)
        || !memberships.some(membership => membership.role === 'commissioner'))) {
      return redirectResponse(`${CANONICAL_APP_ORIGIN}/leagues`);
    }

    const headers = new Headers({
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-franchisehq-release": RELEASE,
      "x-franchisehq-surface": "league-selector"
    });
    if (session.rawSessionToken) {
      headers.append("Set-Cookie", createSecureCookie(
        AUTH_CONSTANTS.SESSION_COOKIE_NAME,
        session.rawSessionToken,
        AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
        "/"
      ));
      headers.append("Set-Cookie", createSecureCookie(
        AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME,
        session.rawSessionToken,
        AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
        "/"
      ));
    }
    return new Response(page({ user: session.user, memberships, pendingMemberships }), { status: 200, headers });
  } catch (error) {
    console.error("League selector failed:", error);
    return new Response("Unable to load league selection.", { status: 500 });
  }
}
