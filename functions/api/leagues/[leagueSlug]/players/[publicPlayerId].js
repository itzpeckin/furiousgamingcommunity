import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../../_lib/permissions.js';
import { activeLeagueTeams, resolveTeam } from '../../../../_lib/league-teams.js';
import { normalizePublicPlayerId, publicPlayerPath, normalizePublicTeamSlug } from '../../../../_lib/public-identity-routes.js';
import { normalizePlayer } from '../snapshot/read-model.js';

const RELEASE = '7.4.0.8';
const POSITION_ALIASES = Object.freeze({REDG:'REDGE',RDE:'REDGE',RE:'REDGE',LEDG:'LEDGE',LDE:'LEDGE',LE:'LEDGE',LOLB:'SAM',SLB:'SAM',MLB:'MIKE',ILB:'MIKE',ROLB:'WILL',WLB:'WILL'});
const canonicalPosition = value => {
  const position=String(value||'').trim().toUpperCase().replace(/[_ -]+/g,'');
  return POSITION_ALIASES[position]||position||null;
};

const parse = value => {
  try { return JSON.parse(value || 'null'); }
  catch { return null; }
};

export async function onRequestGet(context) {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return authorization.response;

  const slug = normalizeLeagueSlug(context);
  const publicId = normalizePublicPlayerId(context.params?.publicPlayerId);
  if (!validLeagueSlug(slug) || !publicId) return json({ok:false,error:'Not found.'},404);

  const db = database(context.env);
  const league = await resolveLeague(context.env, slug);
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return json({ok:false,error:'Not found.'},404);
  }

  const identity = await db.prepare(`
    SELECT public_id,display_name,first_name,last_name
    FROM player_identities
    WHERE league_id=? AND public_id=?
    LIMIT 1
  `).bind(league.id, publicId).first();
  if (!identity) return json({ok:false,error:'Player not found.'},404);

  const active = await db.prepare(`
    SELECT records.data_json
    FROM league_active_snapshots active
    JOIN league_snapshot_records records
      ON records.league_id=active.league_id AND records.snapshot_id=active.snapshot_id AND records.domain='players'
    JOIN player_source_aliases aliases
      ON aliases.league_id=records.league_id AND aliases.source_player_id=records.external_id
    JOIN player_identities identities
      ON identities.id=aliases.player_identity_id AND identities.league_id=aliases.league_id
    WHERE active.league_id=? AND identities.public_id=?
    ORDER BY aliases.updated_at DESC
    LIMIT 1
  `).bind(league.id, publicId).first();

  let activePlayer = null;
  if (active?.data_json) {
    const normalized = normalizePlayer(parse(active.data_json) || {}, publicId);
    const teams = await activeLeagueTeams(db, league.id);
    const team = resolveTeam(teams, normalized.teamId);
    activePlayer = {
      present:true,
      teamSlug:normalizePublicTeamSlug(team?.teamKey),
      position:canonicalPosition(normalized.position),
      overall:normalized.overall,
      rosterStatus:normalized.rosterStatus
    };
  }

  return json({
    ok:true,
    release:RELEASE,
    league:{slug:league.slug,name:league.name},
    canonicalPath:publicPlayerPath(league.slug, publicId),
    player:{
      publicId,
      displayName:identity.display_name,
      firstName:identity.first_name,
      lastName:identity.last_name,
      active:activePlayer || {present:false,teamSlug:null,position:null,overall:null,rosterStatus:'not-on-active-roster'}
    },
    rawDatabaseIdsExposed:false
  });
}
