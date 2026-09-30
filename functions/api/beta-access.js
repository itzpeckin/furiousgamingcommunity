import { jsonResponse } from '../_lib/auth.js';
import { requireAuthenticatedUser } from '../_lib/permissions.js';
import { requireDatabaseSchema } from '../_lib/database-schema.js';
import { tenantDatabase } from '../_lib/tenant-context.js';
import { claimBetaInvitation,availableBetaInvitation,accountReadiness } from '../_lib/beta-access.js';

async function authorize(context) {
  const auth = await requireAuthenticatedUser(context);
  if (!auth.authorized) return { response:auth.response };
  const db = tenantDatabase(context.env);
  await requireDatabaseSchema(db);
  return { db,userId:auth.session.user.id };
}

export async function onRequestGet(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  return jsonResponse({ ok:true,account:await accountReadiness(auth.db,auth.userId),
    invitationAvailable:Boolean(await availableBetaInvitation(auth.db,auth.userId)) });
}

export async function onRequestPost(context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ ok:false,error:'A valid invitation is required.' },400); }
  const claimed = await claimBetaInvitation(auth.db,auth.userId,body.token);
  return jsonResponse(claimed ? { ok:true } : { ok:false,error:'This invitation has expired, was revoked, or belongs to another account.' },claimed ? 200 : 409);
}
