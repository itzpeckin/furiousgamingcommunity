import { jsonResponse } from '../../../_lib/auth.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import { resolveRequestTenant } from '../../../_lib/tenant-context.js';

const RELEASE = '7.3.3';

async function retired(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return auth.response;
  const league = await resolveRequestTenant(context);
  if (!league || auth.session.membership?.leagueId !== league.id) {
    return jsonResponse({ok:false,error:'Not found.',release:RELEASE},404);
  }
  return jsonResponse({
    ok:false,
    release:RELEASE,
    code:'LEGACY_RESET_RETIRED',
    error:'The broad league reset operation is retired. Use the scoped game-year transition workflow.',
    replacement:`/api/leagues/${encodeURIComponent(league.slug)}/game-year-transition`,
    preservedDomains:['users','leagues','memberships','roles','sessions','settings','rules','audits'],
    activeSnapshotChanged:false,
    resetPerformed:false
  },410);
}

export const onRequestGet = retired;
export const onRequestPost = retired;
