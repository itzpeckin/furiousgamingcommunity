import { createId, jsonResponse } from "../../../_lib/auth.js";
import { requireCommissioner } from "../../../_lib/permissions.js";

const RELEASE = "7.0.2";
const MAX_BODY_BYTES = 4 * 1024;
const ROLES = new Set(["commissioner", "trade_committee", "team_owner"]);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_TEAM_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export function normalizeMembershipInput(body = {}) {
  const role = String(body.role || "").trim();
  const teamId = body.teamId == null || body.teamId === "" ? null : String(body.teamId).trim();
  const userId = body.userId == null ? "" : String(body.userId).trim();
  const discordUserId = body.discordUserId == null ? "" : String(body.discordUserId).trim();

  if (!ROLES.has(role)) return { ok:false, error:"Invalid league role." };
  if (!userId && !discordUserId) return { ok:false, error:"userId is required." };
  if (userId && !SAFE_ID.test(userId)) return { ok:false, error:"Invalid userId." };
  if (discordUserId && !/^\d{5,30}$/.test(discordUserId)) return { ok:false, error:"Invalid Discord user ID." };
  if (teamId && !SAFE_TEAM_ID.test(teamId)) return { ok:false, error:"Invalid team assignment." };
  if (role === "team_owner" && !teamId) return { ok:false, error:"Team owners require a team assignment." };

  return { ok:true, role, teamId, userId, discordUserId };
}
async function readJsonObject(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response:jsonResponse({ ok:false, error:"Membership request is too large." }, 413) };
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { response:jsonResponse({ ok:false, error:"Membership request is too large." }, 413) };
  }
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { response:jsonResponse({ ok:false, error:"Request body must be a JSON object." }, 400) };
  }
}

async function resolveLeague(context) {
  const slug = String(context.params?.leagueSlug || "").trim();
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
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

async function authorizedLeague(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return { response:auth.response };
  const league = await resolveLeague(context);
  if (!league || auth.session.membership?.leagueId !== league.id) {
    return { response:jsonResponse({ ok:false, error:"Not found." }, 404) };
  }
  return { auth, league };
}

async function findMembership(db, leagueId, userId) {
  return db.prepare(`
    SELECT lm.id, lm.user_id AS userId, lm.role, lm.team_id AS teamId, lm.active,
      (SELECT a.action FROM league_membership_audit a
       WHERE a.league_id=lm.league_id AND a.subject_user_id=lm.user_id
         AND a.action IN ('membership_deactivated','membership_restored_pending')
       ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS lastAccessAction
    FROM league_memberships lm
    WHERE lm.league_id=? AND lm.user_id=? LIMIT 1
  `).bind(leagueId, userId).first();
}

async function activeCommissionerCount(db, leagueId) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM league_memberships WHERE league_id=? AND role='commissioner' AND active=1`).bind(leagueId).first();
  return Number(row?.count || 0);
}

export async function onRequestGet(context) {
  const access = await authorizedLeague(context);
  if (access.response) return access.response;
  const { league } = access;

  const rows = await context.env.DB.prepare(`
    SELECT lm.id, lm.role, lm.team_id AS teamId, lm.active,
           CASE
             WHEN lm.active=1 THEN 'active'
             WHEN COALESCE((
               SELECT a.action FROM league_membership_audit a
               WHERE a.league_id=lm.league_id AND a.subject_user_id=lm.user_id
                 AND a.action IN ('membership_deactivated','membership_restored_pending')
               ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1
             ), '')='membership_deactivated' THEN 'disabled'
             ELSE 'pending'
           END AS status,
           lm.created_at AS createdAt, lm.updated_at AS updatedAt,
           u.id AS userId, u.discord_user_id AS discordUserId, u.discord_username AS discordUsername,
           u.discord_global_name AS discordGlobalName, u.display_name AS displayName, u.avatar_url AS avatarUrl
    FROM league_memberships lm
    INNER JOIN users u ON u.id=lm.user_id
    WHERE lm.league_id=?
    ORDER BY CASE WHEN lm.active=0 THEN 0 ELSE 1 END, lower(u.display_name) ASC
    LIMIT 500
  `).bind(league.id).all();

  return jsonResponse({ ok:true, release:RELEASE, league, memberships:rows?.results || [] });
}

export async function onRequestPost(context) {
  const access = await authorizedLeague(context);
  if (access.response) return access.response;
  const { auth, league } = access;
  const parsed = await readJsonObject(context.request);
  if (parsed.response) return parsed.response;
  const body = parsed.body;

  if (body.action === "restore_pending") {
    const userId = String(body.userId || "").trim();
    if (!SAFE_ID.test(userId)) return jsonResponse({ ok:false, error:"Valid userId is required." }, 400);
    const existing = await findMembership(context.env.DB, league.id, userId);
    if (!existing) return jsonResponse({ ok:false, error:"League member not found." }, 404);
    if (Number(existing.active)) return jsonResponse({ ok:false, error:"That member already has active league access." }, 409);
    const result = await context.env.DB.prepare(`
      UPDATE league_memberships
      SET role='team_owner', team_id=NULL, active=0, updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND user_id=? AND active=0
    `).bind(league.id, userId).run();
    if (Number(result?.meta?.changes || 0) !== 1) return jsonResponse({ ok:false, error:"Membership state changed. Refresh and try again." }, 409);
    await audit(context.env.DB, league.id, auth.session.user.id, userId, "membership_restored_pending", {
      previousRole:existing.role,
      previousTeamId:existing.teamId || null
    });
    return jsonResponse({ ok:true, release:RELEASE, status:"pending" });
  }

  const input = normalizeMembershipInput(body);
  if (!input.ok) return jsonResponse({ ok:false, error:input.error }, 400);

  let user = null;
  if (input.userId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE id=? LIMIT 1`).bind(input.userId).first();
  if (!user && input.discordUserId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE discord_user_id=? LIMIT 1`).bind(input.discordUserId).first();
  if (!user) return jsonResponse({ ok:false, error:"That Discord user has not signed in to FranchiseHQ yet." }, 404);

  const existing = await findMembership(context.env.DB, league.id, user.id);
  if (!existing) {
    return jsonResponse({ ok:false, error:"That user must open this league's invite link and connect Discord before activation." }, 409);
  }
  if (!Number(existing.active) && existing.lastAccessAction === "membership_deactivated") {
    return jsonResponse({ ok:false, error:"Restore this disabled member to Pending before activating access." }, 409);
  }
  if (user.id === auth.session.user.id && existing.role === "commissioner" && input.role !== "commissioner") {
    return jsonResponse({ ok:false, error:"Commissioners cannot remove their own commissioner role." }, 409);
  }
  if (Number(existing.active) && existing.role === "commissioner" && input.role !== "commissioner" && await activeCommissionerCount(context.env.DB, league.id) <= 1) {
    return jsonResponse({ ok:false, error:"A league must retain at least one active commissioner." }, 409);
  }

  if (input.teamId) {
    const occupied = await context.env.DB.prepare(`
      SELECT u.display_name AS displayName FROM league_memberships lm
      INNER JOIN users u ON u.id=lm.user_id
      WHERE lm.league_id=? AND lm.team_id=? AND lm.active=1 AND lm.user_id<>? LIMIT 1
    `).bind(league.id, input.teamId, user.id).first();
    if (occupied) return jsonResponse({ ok:false, error:`That team is already assigned to ${occupied.displayName || 'another member'}.` }, 409);
  }

  const update = input.teamId
    ? context.env.DB.prepare(`
        UPDATE league_memberships
        SET role=?, team_id=?, active=1, updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND user_id=?
          AND NOT EXISTS (
            SELECT 1 FROM league_memberships occupied
            WHERE occupied.league_id=? AND occupied.team_id=? AND occupied.active=1 AND occupied.user_id<>?
          )
      `).bind(input.role, input.teamId, league.id, user.id, league.id, input.teamId, user.id)
    : context.env.DB.prepare(`
        UPDATE league_memberships
        SET role=?, team_id=NULL, active=1, updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND user_id=?
      `).bind(input.role, league.id, user.id);
  const result = await update.run();
  if (Number(result?.meta?.changes || 0) !== 1) {
    return jsonResponse({ ok:false, error:"That assignment changed before it could be saved. Refresh and try again." }, 409);
  }

  const action = Number(existing.active) ? "membership_updated" : "membership_activated";
  await audit(context.env.DB, league.id, auth.session.user.id, user.id, action, {
    role:input.role,
    teamId:input.teamId,
    previousRole:existing.role,
    previousTeamId:existing.teamId || null
  });
  return jsonResponse({
    ok:true,
    release:RELEASE,
    membership:{ id:existing.id, leagueId:league.id, userId:user.id, role:input.role, teamId:input.teamId, active:true }
  });
}

export async function onRequestDelete(context) {
  const access = await authorizedLeague(context);
  if (access.response) return access.response;
  const { auth, league } = access;
  const parsed = await readJsonObject(context.request);
  if (parsed.response) return parsed.response;
  const userId = String(parsed.body.userId || "").trim();
  if (!SAFE_ID.test(userId)) return jsonResponse({ ok:false, error:"Valid userId is required." }, 400);
  if (userId === auth.session.user.id) return jsonResponse({ ok:false, error:"Commissioners cannot deactivate their own membership." }, 409);

  const existing = await findMembership(context.env.DB, league.id, userId);
  if (!existing) return jsonResponse({ ok:false, error:"League member not found." }, 404);
  if (!Number(existing.active)) return jsonResponse({ ok:false, error:"That member is already inactive." }, 409);
  if (existing.role === "commissioner" && await activeCommissionerCount(context.env.DB, league.id) <= 1) {
    return jsonResponse({ ok:false, error:"A league must retain at least one active commissioner." }, 409);
  }

  const result = await context.env.DB.prepare(`
    UPDATE league_memberships SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND user_id=? AND active=1
  `).bind(league.id, userId).run();
  if (Number(result?.meta?.changes || 0) !== 1) return jsonResponse({ ok:false, error:"Membership state changed. Refresh and try again." }, 409);
  await audit(context.env.DB, league.id, auth.session.user.id, userId, "membership_deactivated", {
    previousRole:existing.role,
    previousTeamId:existing.teamId || null
  });
  return jsonResponse({ ok:true, release:RELEASE, changed:1 });
}
