import { jsonResponse } from '../../_lib/auth.js';
import { requirePlatformOwner } from '../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../_lib/database-schema.js';
import { tenantDatabase } from '../../_lib/tenant-context.js';
import { createBetaInvitation } from '../../_lib/beta-access.js';

async function authorize(context) {
  const auth = await requirePlatformOwner(context);
  if (!auth.authorized) return { response:auth.response };
  const db = tenantDatabase(context.env);
  await requireDatabaseSchema(db);
  return { db,userId:auth.session.user.id };
}

export async function onRequestGet(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const result = await auth.db.prepare(`SELECT invitation.id,invitation.label,invitation.created_at,
    invitation.expires_at,invitation.revoked_at,invitation.claimed_at,invitation.plan_id,
    user.display_name AS claimed_by_name,plan.activated_at FROM platform_beta_invitations invitation
    LEFT JOIN users user ON user.id=invitation.claimed_by_user_id
    LEFT JOIN platform_league_onboarding_plans plan ON plan.id=invitation.plan_id
    ORDER BY invitation.created_at DESC LIMIT 100`).all();
  return jsonResponse({ ok:true,invitations:result?.results || [] });
}

export async function onRequestPost(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ ok:false,error:'A valid invitation request is required.' },400); }
  if (body.action === 'revoke') {
    const activated=await auth.db.prepare(`SELECT plan.activated_at FROM platform_beta_invitations invitation
      JOIN platform_league_onboarding_plans plan ON plan.id=invitation.plan_id WHERE invitation.id=?`)
      .bind(String(body.id || '')).first();
    if(activated?.activated_at) return jsonResponse({ok:false,error:'This invitation has already activated a league. Its access cannot be revoked here.'},409);
    await auth.db.prepare(`UPDATE platform_beta_invitations SET revoked_at=CURRENT_TIMESTAMP
      WHERE id=? AND revoked_at IS NULL AND NOT EXISTS
      (SELECT 1 FROM platform_league_onboarding_plans WHERE id=platform_beta_invitations.plan_id AND activated_at IS NOT NULL)`)
      .bind(String(body.id || '')).run();
    return jsonResponse({ ok:true });
  }
  if (body.action !== 'create') return jsonResponse({ ok:false,error:'Unsupported invitation action.' },400);
  const invitation = await createBetaInvitation(auth.db,auth.userId,body.label);
  return jsonResponse({ ok:true,invitation },201);
}
