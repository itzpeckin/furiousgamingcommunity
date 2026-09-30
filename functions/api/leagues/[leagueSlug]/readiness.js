import { jsonResponse } from '../../../_lib/auth.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import { resolveTenant,tenantDatabase } from '../../../_lib/tenant-context.js';
import { leagueReadiness } from '../../../_lib/league-readiness.js';

export async function onRequestGet(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveTenant(context.env,context.params.leagueSlug);
  if (!league || auth.session.membership.leagueId !== league.id) return jsonResponse({ ok:false,error:'Not found.' },404);
  return jsonResponse({ ok:true,...await leagueReadiness(tenantDatabase(context.env),league,auth.session.user.id) });
}
