import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../../_lib/permissions.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from '../../../../_lib/league-teams.js';
import { normalizePublicTeamSlug, publicTeamPath } from '../../../../_lib/public-identity-routes.js';

const RELEASE = '7.4.0.6';

export async function onRequestGet(context) {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return authorization.response;

  const slug = normalizeLeagueSlug(context);
  const teamSlug = normalizePublicTeamSlug(context.params?.teamSlug);
  if (!validLeagueSlug(slug) || !teamSlug) return json({ok:false,error:'Not found.'},404);

  const db = database(context.env);
  const league = await resolveLeague(context.env, slug);
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return json({ok:false,error:'Not found.'},404);
  }

  const teams = await activeLeagueTeams(db, league.id);
  const team = resolveTeam(teams, teamSlug);
  if (!team || normalizePublicTeamSlug(team.teamKey) !== teamSlug) {
    return json({ok:false,error:'Team not found.'},404);
  }
  const assignments = await activeTeamAssignments(db, league.id, teams);
  const assignment = assignments.get(team.teamKey) || null;

  return json({
    ok:true,
    release:RELEASE,
    league:{slug:league.slug,name:league.name},
    canonicalPath:publicTeamPath(league.slug, teamSlug),
    team:{
      slug:teamSlug,
      displayName:team.displayName,
      cityName:team.cityName,
      nickname:team.nickname,
      abbreviation:team.abbreviation,
      conferenceName:team.conferenceName,
      divisionName:team.divisionName,
      logoUrl:team.logoUrl,
      primaryColor:team.primaryColor,
      secondaryColor:team.secondaryColor,
      ownerName:assignment?.displayName || null,
      ownerRole:assignment?.role || null
    },
    rawDatabaseIdsExposed:false
  });
}
