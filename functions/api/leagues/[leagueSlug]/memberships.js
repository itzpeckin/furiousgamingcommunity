import { createId, jsonResponse } from "../../../_lib/auth.js";
import { requireCommissioner } from "../../../_lib/permissions.js";

const RELEASE = "6.1.1";
const ROLES = new Set(["commissioner", "trade_committee", "team_owner"]);

async function resolveLeague(context) {
  const slug = String(context.params?.leagueSlug || "").trim();
  if (!slug) return null;
  return context.env.DB.prepare(`SELECT id, slug, name FROM leagues WHERE lower(slug)=lower(?) AND public_status='active' LIMIT 1`).bind(slug).first();
}

async function audit(db, leagueId, actorUserId, subjectUserId, action, detail) {
  try {
    await db.prepare(`INSERT INTO league_membership_audit (id, league_id, actor_user_id, subject_user_id, action, detail_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(createId("membership_audit"), leagueId, actorUserId, subjectUserId, action, JSON.stringify(detail || {})).run();
  } catch (error) {
    console.warn("Membership audit unavailable:", error?.message || error);
  }
}

export async function onRequestGet(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveLeague(context);
  if (!league || auth.session.membership?.leagueId !== league.id) return jsonResponse({ ok:false, error:"Not found." }, 404);

  const rows = await context.env.DB.prepare(`
    SELECT lm.id, lm.role, lm.team_id AS teamId, lm.active, lm.created_at AS createdAt, lm.updated_at AS updatedAt,
           u.id AS userId, u.discord_user_id AS discordUserId, u.discord_username AS discordUsername,
           u.discord_global_name AS discordGlobalName, u.display_name AS displayName, u.avatar_url AS avatarUrl
    FROM league_memberships lm
    INNER JOIN users u ON u.id=lm.user_id
    WHERE lm.league_id=?
    ORDER BY lm.active DESC, lower(u.display_name) ASC
  `).bind(league.id).all();

  return jsonResponse({ ok:true, release:RELEASE, league, memberships:rows?.results || [] });
}

export async function onRequestPost(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveLeague(context);
  if (!league || auth.session.membership?.leagueId !== league.id) return jsonResponse({ ok:false, error:"Not found." }, 404);

  const body = await context.request.json().catch(() => ({}));
  const role = String(body.role || "").trim();
  const teamId = body.teamId == null || body.teamId === "" ? null : String(body.teamId).trim();
  if (!ROLES.has(role)) return jsonResponse({ ok:false, error:"Invalid league role." }, 400);
  if (role === "team_owner" && !teamId) return jsonResponse({ ok:false, error:"Team owners require a team assignment." }, 400);

  let user = null;
  if (body.userId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE id=? LIMIT 1`).bind(String(body.userId)).first();
  if (!user && body.discordUserId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE discord_user_id=? LIMIT 1`).bind(String(body.discordUserId)).first();
  if (!user) return jsonResponse({ ok:false, error:"That Discord user has not signed in to Franchise HQ yet." }, 404);

  const existing = await context.env.DB.prepare(`SELECT id FROM league_memberships WHERE league_id=? AND user_id=? LIMIT 1`).bind(league.id, user.id).first();
  const membershipId = existing?.id || createId("membership");
  await context.env.DB.prepare(`
    INSERT INTO league_memberships (id, league_id, user_id, role, team_id, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(league_id, user_id) DO UPDATE SET role=excluded.role, team_id=excluded.team_id, active=1, updated_at=CURRENT_TIMESTAMP
  `).bind(membershipId, league.id, user.id, role, teamId).run();

  await audit(context.env.DB, league.id, auth.session.user.id, user.id, existing ? "membership_updated" : "membership_created", { role, teamId });
  return jsonResponse({ ok:true, release:RELEASE, membership:{ id:membershipId, leagueId:league.id, userId:user.id, role, teamId, active:true } });
}

export async function onRequestDelete(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveLeague(context);
  if (!league || auth.session.membership?.leagueId !== league.id) return jsonResponse({ ok:false, error:"Not found." }, 404);

  const body = await context.request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  if (!userId) return jsonResponse({ ok:false, error:"userId is required." }, 400);
  if (userId === auth.session.user.id) return jsonResponse({ ok:false, error:"Commissioners cannot deactivate their own membership from this endpoint." }, 409);

  const result = await context.env.DB.prepare(`UPDATE league_memberships SET active=0, updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND user_id=?`).bind(league.id, userId).run();
  await audit(context.env.DB, league.id, auth.session.user.id, userId, "membership_deactivated", {});
  return jsonResponse({ ok:true, release:RELEASE, changed:Number(result?.meta?.changes || 0) });
}
