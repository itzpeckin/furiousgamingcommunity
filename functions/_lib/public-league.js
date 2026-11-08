import { getCurrentSession, jsonResponse } from './auth.js';
import { resolveRequestTenant, sessionBelongsToTenant } from './tenant-context.js';

// Explicit opt-in for public read handlers. Never substitute a guest membership
// or relax requireActiveMembership/requireCapability used by operational APIs.
export async function requireLeagueViewer(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return {authorized:false,response:jsonResponse({ok:false,error:'Read-only access.'},405)};
  }
  const league = await resolveRequestTenant(context);
  if (!league) return {authorized:false,response:jsonResponse({ok:false,error:'Not found.'},404)};
  const candidate = await getCurrentSession(context,{leagueId:league.id});
  const isMember = sessionBelongsToTenant(candidate,league);
  return {authorized:true,league,isMember,session:isMember ? candidate : null};
}

export function publicFeatures(features = {}) {
  return Object.fromEntries(Object.entries(features).map(([key,value]) => [key,{enabled:value.enabled===true}]));
}
