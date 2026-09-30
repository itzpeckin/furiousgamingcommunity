import { jsonResponse } from '../../../_lib/auth.js';
import { requireAuthenticatedUser } from '../../../_lib/permissions.js';
import { resolveTenant,tenantDatabase } from '../../../_lib/tenant-context.js';
import { accountReadiness } from '../../../_lib/beta-access.js';

export async function onRequestPost(context) {
  const auth = await requireAuthenticatedUser(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveTenant(context.env,context.params.leagueSlug);
  if (!league || league.tenant_status !== 'enabled') return jsonResponse({ ok:false,error:'Not found.' },404);
  const db = tenantDatabase(context.env),userId = auth.session.user.id;
  if (!(await accountReadiness(db,userId)).verified) return jsonResponse({ ok:false,error:'Verify your email in Account Settings before requesting league access.' },403);
  const existing = await db.prepare('SELECT id FROM league_memberships WHERE league_id=? AND user_id=?').bind(league.id,userId).first();
  if (existing) return jsonResponse({ ok:true });
  const limit = Math.min(1000,Math.max(2,Number(league.configuration?.limits?.memberLimit) || 64));
  await db.prepare(`INSERT OR IGNORE INTO league_memberships(id,league_id,user_id,role,team_id,active)
    SELECT ?,?,?,'team_owner',NULL,0 WHERE (SELECT COUNT(*) FROM league_memberships WHERE league_id=?)<?`)
    .bind('membership_'+crypto.randomUUID(),league.id,userId,league.id,limit).run();
  const saved = await db.prepare('SELECT id FROM league_memberships WHERE league_id=? AND user_id=?').bind(league.id,userId).first();
  return jsonResponse(saved ? { ok:true } : { ok:false,error:'This league has reached its membership limit. Contact its commissioner.' },saved ? 200 : 409);
}
