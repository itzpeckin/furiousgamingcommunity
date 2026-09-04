import { createId, jsonResponse } from "../../../_lib/auth.js";
import { requireCommissioner } from "../../../_lib/permissions.js";
import {
  createTenantAuditContext,
  resolveRequestTenant,
  writeTenantAuditEvent
} from "../../../_lib/tenant-context.js";
import {
  activeLeagueTeams,
  activeTeamAssignments,
  publicLeagueTeams,
  resolveTeam
} from "../../../_lib/league-teams.js";
import { ownershipChangeStatements } from "../../../_lib/ownership-periods.js";

const RELEASE = "7.4.0.7";
const MAX_BODY_BYTES = 4 * 1024;
const ROLES = new Set(["commissioner", "trade_committee", "team_owner"]);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_TEAM_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export function normalizeMembershipInput(body = {}) {
  const role = String(body.role || "").trim();
  const teamId = body.teamId == null || body.teamId === "" ? null : String(body.teamId).trim();
  const userId = body.userId == null ? "" : String(body.userId).trim();
  const discordUserId = body.discordUserId == null ? "" : String(body.discordUserId).trim();
  const reactivate = body.reactivate === true;

  if (!ROLES.has(role)) return { ok:false, error:"Invalid league role." };
  if (!userId && !discordUserId) return { ok:false, error:"userId is required." };
  if (userId && !SAFE_ID.test(userId)) return { ok:false, error:"Invalid userId." };
  if (discordUserId && !/^\d{5,30}$/.test(discordUserId)) return { ok:false, error:"Invalid Discord user ID." };
  if (teamId && !SAFE_TEAM_ID.test(teamId)) return { ok:false, error:"Invalid team assignment." };
  if (role === "team_owner" && !teamId) return { ok:false, error:"Team owners require a team assignment." };

  return { ok:true, role, teamId, userId, discordUserId, reactivate };
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

async function membershipPolicy(env, league) {
  const fallback = { requireTeamAssignment:true };
  if (!env?.LEAGUE_CONFIG?.get || !league?.id) return fallback;
  try {
    const raw = await env.LEAGUE_CONFIG.get(`league:${league.id}:membership-policy`);
    const configured = raw ? JSON.parse(raw) : null;
    return {
      requireTeamAssignment:configured?.requireTeamAssignment !== false
    };
  } catch (error) {
    console.warn("Membership policy unavailable; using the secure team-required default:", error?.message || error);
    return fallback;
  }
}

async function audit(context, league, session, subjectUserId, action, detail) {
  const db = context.env.DB;
  try {
    await db.prepare(`INSERT INTO league_membership_audit (id, league_id, actor_user_id, subject_user_id, action, detail_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(createId("membership_audit"), league.id, session.user.id, subjectUserId, action, JSON.stringify(detail || {})).run();
    const tenantAudit = createTenantAuditContext(context, league, session, action);
    await writeTenantAuditEvent(db, tenantAudit, {
      resourceType:"league_membership",
      resourceId:subjectUserId,
      detail
    });
  } catch (error) {
    console.warn("Membership audit unavailable:", error?.message || error);
  }
}

async function authorizedLeague(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return { response:auth.response };
  const league = await resolveRequestTenant(context);
  if (!league || auth.session.membership?.leagueId !== league.id) {
    return { response:jsonResponse({ ok:false, error:"Not found." }, 404) };
  }
  return { auth, league };
}

async function membershipAuditAvailable(db) {
  try {
    const row = await db.prepare(`
      SELECT 1 AS available
      FROM sqlite_schema
      WHERE type='table' AND name='league_membership_audit'
      LIMIT 1
    `).first();
    return Number(row?.available || 0) === 1;
  } catch (error) {
    console.warn("Membership audit schema check failed:", error?.message || error);
    return false;
  }
}

function lastAccessActionSql(withAudit) {
  if (withAudit) {
    return `(SELECT a.action FROM league_membership_audit a
       WHERE a.league_id=lm.league_id AND a.subject_user_id=lm.user_id
         AND a.action IN ('membership_deactivated','membership_restored_pending')
       ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1)`;
  }
  return `CASE
      WHEN lm.active=0 AND lm.role='team_owner' AND lm.team_id IS NULL
        THEN 'membership_restored_pending'
      WHEN lm.active=0 THEN 'membership_deactivated'
      ELSE NULL
    END`;
}

async function findMembership(db, leagueId, userId) {
  const withAudit = await membershipAuditAvailable(db);
  const read = (includeAudit) => db.prepare(`
    SELECT lm.id, lm.user_id AS userId, lm.role, lm.team_id AS teamId, lm.active,
      ${lastAccessActionSql(includeAudit)} AS lastAccessAction
    FROM league_memberships lm
    WHERE lm.league_id=? AND lm.user_id=? LIMIT 1
  `).bind(leagueId, userId).first();
  try {
    return await read(withAudit);
  } catch (error) {
    if (!withAudit) throw error;
    console.warn("Membership audit read failed; using membership-state fallback:", error?.message || error);
    return read(false);
  }
}

async function activeCommissionerCount(db, leagueId) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM league_memberships WHERE league_id=? AND role='commissioner' AND active=1`).bind(leagueId).first();
  return Number(row?.count || 0);
}

export async function onRequestGet(context) {
  const access = await authorizedLeague(context);
  if (access.response) return access.response;
  const { league } = access;

  const withAudit = await membershipAuditAvailable(context.env.DB);
  const read = (includeAudit) => context.env.DB.prepare(`
    SELECT lm.id, lm.role, lm.team_id AS teamId, lm.active,
           CASE
             WHEN lm.active=1 THEN 'active'
             WHEN COALESCE(${lastAccessActionSql(includeAudit)}, '')='membership_deactivated' THEN 'disabled'
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

  let rows;
  try {
    rows = await read(withAudit);
  } catch (error) {
    if (!withAudit) throw error;
    console.warn("Membership audit list failed; using membership-state fallback:", error?.message || error);
    rows = await read(false);
  }

  const teams = await activeLeagueTeams(context.env.DB, league.id);
  const policy = await membershipPolicy(context.env, league);
  const assignments = await activeTeamAssignments(context.env.DB, league.id, teams);
  const memberships = (rows?.results || []).map(member => {
    const team = resolveTeam(teams, member.teamId);
    return {
      ...member,
      teamId:team?.teamKey || null,
      teamName:team?.displayName || null,
      active:Boolean(Number(member.active))
    };
  });
  return jsonResponse({
    ok:true,
    release:RELEASE,
    league,
    memberships,
    teams:publicLeagueTeams(teams, assignments),
    policy
  });
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
    await audit(context, league, auth.session, userId, "membership_restored_pending", {
      previousRole:existing.role,
      previousTeamId:existing.teamId || null
    });
    return jsonResponse({ ok:true, release:RELEASE, status:"pending" });
  }

  const input = normalizeMembershipInput(body);
  if (!input.ok) return jsonResponse({ ok:false, error:input.error }, 400);

  const teams = await activeLeagueTeams(context.env.DB, league.id);
  const policy = await membershipPolicy(context.env, league);
  if (policy.requireTeamAssignment && !input.teamId) {
    return jsonResponse({ ok:false, error:"Every active league member requires a team assignment." }, 400);
  }
  const requestedTeam = input.teamId ? resolveTeam(teams, input.teamId) : null;
  if (input.teamId && !requestedTeam) {
    return jsonResponse({ ok:false, error:"Choose a team from the active Madden franchise import." }, 400);
  }
  const teamId = requestedTeam?.teamKey || null;

  let user = null;
  if (input.userId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE id=? LIMIT 1`).bind(input.userId).first();
  if (!user && input.discordUserId) user = await context.env.DB.prepare(`SELECT id, discord_user_id, display_name FROM users WHERE discord_user_id=? LIMIT 1`).bind(input.discordUserId).first();
  if (!user) return jsonResponse({ ok:false, error:"That Discord user has not signed in to FranchiseHQ yet." }, 404);

  const existing = await findMembership(context.env.DB, league.id, user.id);
  if (!existing) {
    return jsonResponse({ ok:false, error:"That user must open this league's invite link and connect Discord before activation." }, 409);
  }
  const reactivating = !Number(existing.active) && existing.lastAccessAction === "membership_deactivated";
  if (reactivating && !input.reactivate) {
    return jsonResponse({ ok:false, error:"Use Teams & Owners to explicitly reactivate this revoked member." }, 409);
  }
  if (user.id === auth.session.user.id && existing.role === "commissioner" && input.role !== "commissioner") {
    return jsonResponse({ ok:false, error:"Commissioners cannot remove their own commissioner role." }, 409);
  }
  if (Number(existing.active) && existing.role === "commissioner" && input.role !== "commissioner" && await activeCommissionerCount(context.env.DB, league.id) <= 1) {
    return jsonResponse({ ok:false, error:"A league must retain at least one active commissioner." }, 409);
  }

  if (teamId) {
    const assignments = await activeTeamAssignments(context.env.DB, league.id, teams);
    const occupied = assignments.get(teamId);
    if (occupied && occupied.userId !== user.id) {
      return jsonResponse({ ok:false, error:`That team is already assigned to ${occupied.displayName || 'another member'}.` }, 409);
    }
  }

  const update = teamId
    ? context.env.DB.prepare(`
        UPDATE league_memberships
        SET role=?, team_id=?, active=1, updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND user_id=?
          AND NOT EXISTS (
            SELECT 1 FROM league_memberships occupied
            WHERE occupied.league_id=? AND occupied.team_id=? AND occupied.active=1 AND occupied.user_id<>?
          )
      `).bind(input.role, teamId, league.id, user.id, league.id, teamId, user.id)
    : context.env.DB.prepare(`
        UPDATE league_memberships
        SET role=?, team_id=NULL, active=1, updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND user_id=?
      `).bind(input.role, league.id, user.id);
  const ownership = await ownershipChangeStatements(context.env.DB,{
    leagueId:league.id,userId:user.id,displayName:user.display_name,nextTeamKey:teamId,expectedMembershipActive:1
  });
  const results = await context.env.DB.batch([update,...ownership.statements]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) {
    return jsonResponse({ ok:false, error:"That assignment changed before it could be saved. Refresh and try again." }, 409);
  }

  const action = reactivating
    ? "membership_reactivated"
    : Number(existing.active) ? "membership_updated" : "membership_activated";
  await audit(context, league, auth.session, user.id, action, {
    role:input.role,
    teamId,
    previousRole:existing.role,
    previousTeamId:existing.teamId || null
  });
  return jsonResponse({
    ok:true,
    release:RELEASE,
    membership:{ id:existing.id, leagueId:league.id, userId:user.id, role:input.role, teamId, active:true }
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

  const ownership = await ownershipChangeStatements(context.env.DB,{
    leagueId:league.id,userId,displayName:null,nextTeamKey:null,expectedMembershipActive:0
  });
  const results = await context.env.DB.batch([context.env.DB.prepare(`
    UPDATE league_memberships SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND user_id=? AND active=1
  `).bind(league.id, userId),...ownership.statements]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1) return jsonResponse({ ok:false, error:"Membership state changed. Refresh and try again." }, 409);
  await audit(context, league, auth.session, userId, "membership_deactivated", {
    previousRole:existing.role,
    previousTeamId:existing.teamId || null
  });
  return jsonResponse({ ok:true, release:RELEASE, changed:1 });
}
