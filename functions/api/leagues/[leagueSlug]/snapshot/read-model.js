import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../../_lib/permissions.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from '../../../../_lib/league-teams.js';
import { normalizePublicPlayerId, normalizePublicTeamSlug } from '../../../../_lib/public-identity-routes.js';
import {
  freeAgentStateFromMappingRun,
  resolveSnapshotPlayerMappingRun,
  safeAbilityValues,
  safeRatingValues,
  sourceRosterStatus,
  sourceSupportedContract
} from '../../../../_lib/live-data-experience.js';

const RELEASE = '7.3.6';
const ALLOWED_DOMAINS = new Set(['teams','players','games','statistics','standings']);

const parse = value => {
  try { return JSON.parse(value || 'null'); }
  catch { return null; }
};

const rows = async (db, sql, ...args) => {
  const result = await db.prepare(sql).bind(...args).all();
  return result.results || [];
};

function sourceRecord(raw = {}) {
  const nested = typeof raw.source_record_json === 'string'
    ? parse(raw.source_record_json)
    : (raw.source_record_json || raw.sourceRecord || raw.source || null);
  // The mapper's canonical columns are validated and must win over any
  // similarly named value retained in the original external record.
  return nested && typeof nested === 'object' ? {...nested, ...raw} : raw;
}

const numeric = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const text = value => value === null || value === undefined || value === '' ? null : String(value);

export function normalizeTeam(raw = {}) {
  raw = sourceRecord(raw);
  const id = String(raw.external_id ?? raw.team_id ?? raw.teamId ?? '');
  const displayName = text(raw.display_name ?? raw.displayName ?? raw.teamName);
  const city = text(raw.city_name ?? raw.cityName);
  const nickname = text(raw.nickname ?? raw.nickName);
  const abbreviation = text(raw.abbreviation ?? raw.abbrName);
  const conference = text(raw.conference_name ?? raw.conferenceName ?? raw.confName);
  const division = text(raw.division_name ?? raw.divisionName ?? raw.divName);
  const logo = text(raw.logo_url ?? raw.logoUrl);
  const primaryColor = text(raw.primary_color ?? raw.primaryColor);
  const secondaryColor = text(raw.secondary_color ?? raw.secondaryColor);
  const wins = numeric(raw.wins ?? raw.totalWins) ?? 0;
  const losses = numeric(raw.losses ?? raw.totalLosses) ?? 0;
  const ties = numeric(raw.ties ?? raw.totalTies) ?? 0;
  const approved = {
    teamId:id, displayName, cityName:city, nickName:nickname, abbrName:abbreviation,
    conferenceName:conference, divisionName:division, logoUrl:logo, primaryColor,
    secondaryColor, userName:null, ownerName:null, totalWins:wins, totalLosses:losses,
    totalTies:ties, overall:numeric(raw.overall ?? raw.ovr_rating ?? raw.ovrRating),
    capAvailable:numeric(raw.capAvailable ?? raw.cap_available ?? raw.capRoom),
    ptsFor:numeric(raw.ptsFor ?? raw.pointsFor), ptsAgainst:numeric(raw.ptsAgainst ?? raw.pointsAgainst),
    coachName:text(raw.coachName ?? raw.headCoach), stadiumName:text(raw.stadiumName ?? raw.stadium)
  };
  return {
    id, displayName, city, nickname, abbreviation, conference, division, logo,
    primaryColor, secondaryColor, owner:'Unassigned', ownerRole:null, teamKey:null, overall:approved.overall,
    record:{wins,losses,ties}, source:approved
  };
}

function applyAuthoritativeOwners(records, canonicalTeams, assignments) {
  return records.map(record => {
    const team = resolveTeam(canonicalTeams, record.id)
      || resolveTeam(canonicalTeams, record.abbreviation)
      || null;
    const assignment = team ? assignments.get(team.teamKey) : null;
    const owner = assignment?.displayName || 'Unassigned';
    return {
      ...record,
      teamKey: team?.teamKey || null,
      owner,
      ownerRole: assignment?.role || null,
      source: {
        ...(record.source || {}),
        teamKey: team?.teamKey || null,
        userName: assignment?.displayName || null,
        ownerName: assignment?.displayName || null,
        ownerRole: assignment?.role || null
      }
    };
  });
}

export function normalizePlayer(raw = {}, publicIdValue = null) {
  raw = sourceRecord(raw);
  const id = String(raw.external_id ?? raw.player_id ?? raw.playerId ?? '');
  const publicId = normalizePublicPlayerId(publicIdValue ?? raw.public_id ?? raw.publicId);
  const teamId = String(raw.team_external_id ?? raw.team_id ?? raw.teamId ?? raw.teamID ?? raw.rosterTeamId ?? raw.roster_team_id ?? raw.currentTeamId ?? '');
  const firstName = text(raw.first_name ?? raw.firstName);
  const lastName = text(raw.last_name ?? raw.lastName);
  const displayName = text(raw.display_name ?? raw.displayName) ?? ([firstName,lastName].filter(Boolean).join(' ') || null);
  const position = text(raw.position ?? raw.position_name ?? raw.positionName ?? raw.pos);
  const overall = numeric(raw.overall ?? raw.overall_rating ?? raw.overallRating ?? raw.ovrRating ?? raw.playerBestOvr ?? raw.bestOverall ?? raw.playerOverall ?? raw.ovr);
  const devTrait = text(raw.development_trait ?? raw.dev_trait ?? raw.devTrait ?? raw.developmentTrait ?? raw.development);
  const contract = sourceSupportedContract({
    ...raw,
    sourceCapHit:raw.capHit ?? raw.sourceCapHit
  });
  const ratings = safeRatingValues(raw);
  const abilities = safeAbilityValues(raw);
  const rosterStatus = sourceRosterStatus(raw, teamId);
  const approved = {
    playerId:id, teamId, firstName, lastName, displayName, position, overall,
    archetype:text(raw.archetype ?? raw.playerArchetype), age:numeric(raw.age),
    yearsPro:numeric(raw.years_pro ?? raw.yearsPro ?? raw.experience), devTrait,
    developmentTrait:devTrait, jerseyNumber:numeric(raw.jersey_number ?? raw.jerseyNumber ?? raw.jerseyNum),
    heightInches:numeric(raw.height_inches ?? raw.heightInches ?? raw.height), weightLbs:numeric(raw.weight_lbs ?? raw.weightLbs ?? raw.weight),
    college:text(raw.college ?? raw.collegeName ?? raw.school),
    injuryStatus:text(raw.injury_status ?? raw.injuryStatus ?? raw.injury),
    isInjured:Boolean(Number(raw.is_injured ?? raw.isInjured ?? raw.isOnIR ?? 0)),
    rosterStatus,
    depthOrder:numeric(raw.depthOrder ?? raw.depthChartOrder ?? raw.depth_chart_order ?? raw.depth),
    depthPosition:text(raw.depthPosition ?? raw.depthChartPosition ?? raw.depth_chart_position),
    portraitId:text(raw.portrait_id ?? raw.portraitId), abilityCount:abilities.length, contract
  };
  return {
    id, publicId, teamId, firstName, lastName, displayName, position, overall,
    age:approved.age, devTrait, jerseyNumber:approved.jerseyNumber,
    archetype:approved.archetype, yearsPro:approved.yearsPro,
    heightInches:approved.heightInches, weightLbs:approved.weightLbs,
    college:approved.college, injuryStatus:approved.injuryStatus,
    isInjured:approved.isInjured, rosterStatus:approved.rosterStatus,
    depthOrder:approved.depthOrder, depthPosition:approved.depthPosition,
    portraitId:approved.portraitId, contract, ratings, abilities, source:approved
  };
}

export function normalizeGame(raw = {}) {
  raw = sourceRecord(raw);
  const id = String(raw.external_id ?? raw.game_id ?? raw.gameId ?? '');
  const season = numeric(raw.season_year ?? raw.seasonYear);
  const stage = text(raw.stage ?? raw.stage_name ?? raw.stageName);
  const week = numeric(raw.week_index ?? raw.weekIndex);
  const homeTeamId = String(raw.home_team_external_id ?? raw.home_team_id ?? raw.homeTeamId ?? '');
  const awayTeamId = String(raw.away_team_external_id ?? raw.away_team_id ?? raw.awayTeamId ?? '');
  const homeScore = numeric(raw.home_score ?? raw.homeScore);
  const awayScore = numeric(raw.away_score ?? raw.awayScore);
  const status = text(raw.status ?? raw.game_status ?? raw.gameStatus);
  const scheduledAt = text(raw.scheduled_at ?? raw.scheduledAt);
  const routePath = text(raw.source_route_path ?? raw.sourceRoutePath ?? raw.route_path ?? raw.routePath);
  const approved = {
    gameId:id, seasonYear:season, stage, stageName:stage,
    stageIndex:numeric(raw.stageIndex), weekIndex:week,
    homeTeamId, awayTeamId, homeScore, awayScore, status, scheduledAt,
    routePath,
    stadiumName:text(raw.stadiumName ?? raw.stadium),
    network:text(raw.network ?? raw.broadcastNetwork),
    roundName:text(raw.roundName ?? raw.playoffRound)
  };
  return {id,season,stage,week,homeTeamId,awayTeamId,homeScore,awayScore,status,scheduledAt,source:approved};
}

function normalizeStatistic(raw = {}) {
  raw = sourceRecord(raw);
  return {
    id: String(raw.external_key ?? raw.external_id ?? raw.id ?? ''),
    category: raw.category ?? raw.statistic_category ?? null,
    playerId: String(raw.player_external_id ?? raw.player_id ?? raw.playerId ?? ''),
    teamId: String(raw.team_external_id ?? raw.team_id ?? raw.teamId ?? raw.teamID ?? raw.rosterTeamId ?? raw.roster_team_id ?? raw.currentTeamId ?? ''),
    season: raw.season_year ?? raw.seasonYear ?? null,
    stage: raw.stage ?? null,
    week: raw.week_index ?? raw.weekIndex ?? null,
    metrics: parse(raw.metrics_json) ?? raw.metrics ?? {}
  };
}

function normalizeStatisticCompact(raw = {}) {
  raw = sourceRecord(raw);
  const metrics=parse(raw.metrics_json) ?? raw.metrics ?? {};
  const source={
    routePath:raw.routePath ?? raw.route_path ?? raw.sourceRoutePath ?? raw.source_route_path ?? null,
    gameId:raw.gameId ?? raw.game_id ?? raw.scheduleId ?? raw.schedule_id ?? metrics.__gameId ?? metrics.gameId ?? null,
    scheduleId:raw.scheduleId ?? raw.schedule_id ?? metrics.scheduleId ?? null,
    playerId:raw.player_external_id ?? raw.player_id ?? raw.playerId ?? raw.rosterId ?? raw.roster_id ?? null,
    teamId:raw.team_external_id ?? raw.team_id ?? raw.teamId ?? raw.teamID ?? raw.rosterTeamId ?? raw.roster_team_id ?? null,
    seasonYear:raw.season_year ?? raw.seasonYear ?? raw.calendarYear ?? null,
    stage:raw.stage ?? raw.stage_name ?? raw.stageName ?? raw.seasonStage ?? null,
    weekIndex:raw.week_index ?? raw.weekIndex ?? raw.week ?? null
  };
  return {
    id:String(raw.external_key ?? raw.external_id ?? raw.id ?? ''),
    category:raw.category ?? raw.statistic_category ?? null,
    playerId:String(source.playerId ?? ''),
    teamId:String(source.teamId ?? ''),
    season:source.seasonYear,
    seasonYear:source.seasonYear,
    stage:source.stage,
    week:source.weekIndex,
    weekIndex:source.weekIndex,
    metrics,
    source
  };
}

export function normalizeStanding(raw = {}) {
  raw = sourceRecord(raw);
  const teamId = String(raw.teamId ?? raw.team_id ?? raw.external_id ?? '');
  const teamName = text(raw.teamName ?? raw.team_name);
  const wins = numeric(raw.totalWins ?? raw.wins) ?? 0;
  const losses = numeric(raw.totalLosses ?? raw.losses) ?? 0;
  const ties = numeric(raw.totalTies ?? raw.ties) ?? 0;
  const winPct = numeric(raw.winPct ?? raw.win_pct);
  const conference = text(raw.conferenceName ?? raw.conference_name);
  const division = text(raw.divisionName ?? raw.division_name);
  const rank = numeric(raw.rank);
  const seed = numeric(raw.seed);
  const approved = {
    teamId, teamName, totalWins:wins, totalLosses:losses, totalTies:ties, winPct,
    conferenceName:conference, divisionName:division, rank, seed,
    divWins:numeric(raw.divWins), divLosses:numeric(raw.divLosses), divTies:numeric(raw.divTies),
    confWins:numeric(raw.confWins), confLosses:numeric(raw.confLosses), confTies:numeric(raw.confTies),
    ptsFor:numeric(raw.ptsFor ?? raw.pointsFor), ptsAgainst:numeric(raw.ptsAgainst ?? raw.pointsAgainst),
    netPts:numeric(raw.netPts), winLossStreak:numeric(raw.winLossStreak),
    stageIndex:numeric(raw.stageIndex), weekIndex:numeric(raw.weekIndex),
    seasonYear:numeric(raw.seasonYear ?? raw.calendarYear)
  };
  return {teamId,teamName,wins,losses,ties,winPct,conference,division,rank,seed,source:approved};
}

function normalize(domain, raw) {
  if (domain === 'teams') return normalizeTeam(raw);
  if (domain === 'players') return normalizePlayer(raw);
  if (domain === 'games') return normalizeGame(raw);
  if (domain === 'statistics') return normalizeStatistic(raw);
  if (domain === 'standings') return normalizeStanding(raw);
  return raw;
}

async function activeSnapshot(db, leagueId) {
  return db.prepare(`
    SELECT s.*
    FROM league_active_snapshots a
    JOIN league_snapshots s ON s.id = a.snapshot_id
    WHERE a.league_id = ?
    LIMIT 1
  `).bind(leagueId).first();
}

function validationIntegrity(active) {
  const report = parse(active.validation_report_json) || {};
  const warnings = Array.isArray(report.warnings) ? report.warnings.map(value => String(value)).slice(0, 20) : [];
  return {
    status:text(active.validation_status) || 'not-run',
    score:numeric(active.validation_score),
    errorCount:Number(active.validation_error_count || 0),
    warningCount:Number(active.validation_warning_count || warnings.length || 0),
    warnings
  };
}

async function domainRows(db, leagueId, snapshotId, domain, cursor = null, limit = 150, compact = false) {
  const safeLimit = Math.max(25, Math.min(500, Number(limit) || 150));
  let result;
  if (cursor) {
    result = await rows(db, `
      SELECT external_id, data_json
      FROM league_snapshot_records
      WHERE league_id = ? AND snapshot_id = ? AND domain = ? AND external_id > ?
      ORDER BY external_id
      LIMIT ?
    `, leagueId, snapshotId, domain, String(cursor), safeLimit);
  } else {
    result = await rows(db, `
      SELECT external_id, data_json
      FROM league_snapshot_records
      WHERE league_id = ? AND snapshot_id = ? AND domain = ?
      ORDER BY external_id
      LIMIT ?
    `, leagueId, snapshotId, domain, safeLimit);
  }
  let publicPlayerIds = null;
  if (domain === 'players' && result.length) {
    const identityRows = await rows(db, `
      SELECT aliases.source_player_id, identities.public_id, aliases.updated_at
      FROM player_source_aliases aliases
      JOIN player_identities identities
        ON identities.id=aliases.player_identity_id AND identities.league_id=aliases.league_id
      WHERE aliases.league_id=?
      ORDER BY aliases.updated_at DESC
    `, leagueId);
    publicPlayerIds = new Map();
    for (const identity of identityRows) {
      const sourcePlayerId = String(identity.source_player_id || '');
      const publicId = normalizePublicPlayerId(identity.public_id);
      if (sourcePlayerId && publicId && !publicPlayerIds.has(sourcePlayerId)) {
        publicPlayerIds.set(sourcePlayerId, publicId);
      }
    }
  }
  const records = result.map(row => {
    const raw = parse(row.data_json) || {};
    if (domain === 'statistics' && compact) return normalizeStatisticCompact(raw);
    if (domain === 'players') return normalizePlayer(raw, publicPlayerIds?.get(String(row.external_id)) || null);
    return normalize(domain, raw);
  });
  const nextCursor = result.length === safeLimit ? String(result[result.length - 1]?.external_id || '') : null;
  return {records, nextCursor, complete: !nextCursor, pageSize: safeLimit};
}

export async function onRequestGet(context) {
  try {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return authorization.response;
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ok:false,error:'Invalid league slug.'},400);

  const db = database(context.env);
  const league = await resolveLeague(context.env, slug);
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return json({ok:false,error:'Not found.'},404);
  }

  const active = await activeSnapshot(db, league.id);
  if (!active) {
    return json({
      ok:true,
      release:RELEASE,
      state:'empty',
      league:{id:league.id,slug:league.slug,name:league.name},
      snapshot:null,
      domains:{teams:0,players:0,games:0,statistics:0,standings:0},
      rosteredPlayers:0,
      freeAgents:{status:'unavailable',count:null,reason:'No active snapshot is available.',interpretedAsZero:false,authority:'active-snapshot',sourceSnapshotId:null},
      integrity:{status:'not-run',score:null,errorCount:0,warningCount:0,warnings:[]},
      cache:{policy:'client-memory',key:null}
    });
  }

  const url = new URL(context.request.url);
  const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
  const sample = String(url.searchParams.get('sample') || '').trim().toLowerCase();

  const summary = {
    teams:Number(active.team_count || 0),
    players:Number(active.player_count || 0),
    games:Number(active.game_count || 0),
    statistics:Number(active.statistic_count || 0),
    standings:Number(active.standing_count || 0)
  };
  const includeSummaryMetadata = !ALLOWED_DOMAINS.has(domain);
  const playerMappingRun = includeSummaryMetadata ? await resolveSnapshotPlayerMappingRun(db, league.id, active) : null;
  const freeAgents = includeSummaryMetadata ? {
    ...freeAgentStateFromMappingRun(playerMappingRun),
    authority:'active-snapshot',
    sourceSnapshotId:playerMappingRun?.sourceSnapshotId || active.id
  } : null;
  const integrity = validationIntegrity(active);

  const base = {
    ok:true,
    release:RELEASE,
    state:'live',
    league:{id:league.id,slug:league.slug,name:league.name},
    snapshot:{
      id:active.id,
      status:active.status,
      seasonYear:active.season_year,
      weekIndex:active.week_index,
      activatedAt:active.activated_at,
      createdAt:active.created_at,
      validationStatus:integrity.status,
      validationScore:integrity.score
    },
    domains:summary,
    rosteredPlayers:includeSummaryMetadata
      ? (numeric(playerMappingRun?.rostered_count) ?? (freeAgents?.status === 'ready' ? Math.max(0, summary.players - Number(freeAgents.count || 0)) : summary.players))
      : summary.players,
    freeAgents,
    integrity,
    cache:{policy:'client-memory',key:`${league.id}:${active.id}`}
  };

  if (ALLOWED_DOMAINS.has(domain)) {
    if (String(url.searchParams.get('bulk') || '') === '1') {
      return json({ok:false,error:'Bulk snapshot downloads are disabled. Use bounded pagination.'},400);
    }
    const cursor = String(url.searchParams.get('cursor') || '').trim() || null;
    const limit = Number(url.searchParams.get('limit') || 150);
    const compact = domain === 'statistics' && String(url.searchParams.get('compact') || '') === '1';
    const page = await domainRows(db,league.id,active.id,domain,cursor,limit,compact);
    if (domain === 'teams') {
      const canonicalTeams = await activeLeagueTeams(db, league.id);
      const assignments = await activeTeamAssignments(db, league.id, canonicalTeams);
      page.records = applyAuthoritativeOwners(page.records, canonicalTeams, assignments);
      page.records = page.records.map(team => ({
        ...team,
        slug:normalizePublicTeamSlug(team.teamKey)
      }));
    }
    return json({...base,domain,...page});
  }

  if (ALLOWED_DOMAINS.has(sample)) {
    const page = await domainRows(db,league.id,active.id,sample,null,1);
    let record = page.records[0] || null;
    if (sample === 'teams' && record) {
      const canonicalTeams = await activeLeagueTeams(db, league.id);
      const assignments = await activeTeamAssignments(db, league.id, canonicalTeams);
      record = applyAuthoritativeOwners([record], canonicalTeams, assignments)[0];
      record = {...record,slug:normalizePublicTeamSlug(record.teamKey)};
    }
    return json({...base,sample:{domain:sample,record}});
  }

  return json(base);
  } catch (error) {
    return json({
      ok:false,
      release:RELEASE,
      error:'Live snapshot read failed.'
    },500);
  }
}
