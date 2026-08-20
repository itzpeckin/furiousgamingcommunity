import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE = '5.9.10.6.5.1';
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
  return nested && typeof nested === 'object' ? {...raw, ...nested} : raw;
}

function normalizeTeam(raw = {}) {
  raw = sourceRecord(raw);
  return {
    id: String(raw.external_id ?? raw.team_id ?? raw.teamId ?? ''),
    displayName: raw.display_name ?? raw.displayName ?? raw.teamName ?? null,
    city: raw.city_name ?? raw.cityName ?? null,
    nickname: raw.nickname ?? raw.nickName ?? null,
    abbreviation: raw.abbreviation ?? raw.abbrName ?? null,
    conference: raw.conference_name ?? raw.conferenceName ?? null,
    division: raw.division_name ?? raw.divisionName ?? raw.divName ?? null,
    logo: raw.logo_url ?? raw.logoUrl ?? null,
    primaryColor: raw.primary_color ?? raw.primaryColor ?? null,
    secondaryColor: raw.secondary_color ?? raw.secondaryColor ?? null,
    owner: raw.owner_name ?? raw.ownerName ?? raw.userName ?? null,
    overall: raw.overall ?? raw.ovr_rating ?? raw.ovrRating ?? null,
    source: raw
  };
}

function normalizePlayer(raw = {}) {
  raw = sourceRecord(raw);
  return {
    id: String(raw.external_id ?? raw.player_id ?? raw.playerId ?? ''),
    teamId: String(raw.team_external_id ?? raw.team_id ?? raw.teamId ?? raw.teamID ?? raw.rosterTeamId ?? raw.roster_team_id ?? raw.currentTeamId ?? ''),
    firstName: raw.first_name ?? raw.firstName ?? null,
    lastName: raw.last_name ?? raw.lastName ?? null,
    displayName: raw.display_name ?? raw.displayName ?? ([raw.first_name ?? raw.firstName, raw.last_name ?? raw.lastName].filter(Boolean).join(' ') || null),
    position: raw.position ?? raw.position_name ?? raw.positionName ?? raw.pos ?? null,
    overall: raw.overall ?? raw.overall_rating ?? raw.overallRating ?? raw.ovrRating ?? raw.playerBestOvr ?? raw.bestOverall ?? raw.playerOverall ?? raw.ovr ?? null,
    age: raw.age ?? null,
    devTrait: raw.dev_trait ?? raw.devTrait ?? raw.development_trait ?? null,
    jerseyNumber: raw.jersey_number ?? raw.jerseyNumber ?? null,
    contract: raw.contract ?? {
      yearsRemaining: raw.contractYearsLeft ?? raw.contractYearsRemaining ?? raw.contractLength ?? raw.contractYears ?? raw.yearsRemaining ?? raw.yearsLeft ?? raw.contractLengthRemaining ?? null,
      currentYearSalary: raw.currentYearSalary ?? raw.currentSalary ?? raw.capSalary ?? raw.currentSeasonSalary ?? null,
      capHit: raw.capHit ?? raw.salaryCapHit ?? raw.currentCapHit ?? null,
      bonus: raw.contractBonus ?? raw.signingBonus ?? null
    },
    source: raw
  };
}

function normalizeGame(raw = {}) {
  raw = sourceRecord(raw);
  return {
    id: String(raw.external_id ?? raw.game_id ?? raw.gameId ?? ''),
    season: raw.season_year ?? raw.seasonYear ?? null,
    stage: raw.stage ?? raw.stage_name ?? raw.stageName ?? null,
    week: raw.week_index ?? raw.weekIndex ?? null,
    homeTeamId: String(raw.home_team_external_id ?? raw.home_team_id ?? raw.homeTeamId ?? ''),
    awayTeamId: String(raw.away_team_external_id ?? raw.away_team_id ?? raw.awayTeamId ?? ''),
    homeScore: raw.home_score ?? raw.homeScore ?? null,
    awayScore: raw.away_score ?? raw.awayScore ?? null,
    status: raw.status ?? raw.game_status ?? raw.gameStatus ?? null,
    scheduledAt: raw.scheduled_at ?? raw.scheduledAt ?? null,
    source: raw
  };
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
    metrics: parse(raw.metrics_json) ?? raw.metrics ?? {},
    source: raw
  };
}

function normalizeStanding(raw = {}) {
  raw = sourceRecord(raw);
  return {
    teamId: String(raw.teamId ?? raw.team_id ?? raw.external_id ?? ''),
    teamName: raw.teamName ?? raw.team_name ?? null,
    wins: raw.totalWins ?? raw.wins ?? 0,
    losses: raw.totalLosses ?? raw.losses ?? 0,
    ties: raw.totalTies ?? raw.ties ?? 0,
    winPct: raw.winPct ?? raw.win_pct ?? null,
    conference: raw.conferenceName ?? raw.conference_name ?? null,
    division: raw.divisionName ?? raw.division_name ?? null,
    rank: raw.rank ?? null,
    seed: raw.seed ?? null,
    source: raw
  };
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

async function bulkDomainRows(db,leagueId,snapshotId,domain){
  const result=await rows(db,`
    SELECT external_id,data_json
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain=?
    ORDER BY external_id
  `,leagueId,snapshotId,domain);
  return {
    records:result.map(row=>normalize(domain,parse(row.data_json)||{})),
    nextCursor:null,
    complete:true,
    pageSize:result.length,
    bulk:true
  };
}

async function domainRows(db, leagueId, snapshotId, domain, cursor = null, limit = 150) {
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
  const records = result.map(row => normalize(domain, parse(row.data_json) || {}));
  const nextCursor = result.length === safeLimit ? String(result[result.length - 1]?.external_id || '') : null;
  return {records, nextCursor, complete: !nextCursor, pageSize: safeLimit};
}

export async function onRequestGet(context) {
  try {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ok:false,error:'Invalid league slug.'},400);

  const db = database(context.env);
  const league = await resolveLeague(context.env, slug);
  if (!db || !league) return json({ok:false,error:'League not found.'},404);

  const active = await activeSnapshot(db, league.id);
  if (!active) {
    return json({
      ok:true,
      release:RELEASE,
      state:'empty',
      league:{id:league.id,slug:league.slug,name:league.name},
      snapshot:null,
      domains:{teams:0,players:0,games:0,statistics:0,standings:0},
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
      createdAt:active.created_at
    },
    domains:summary,
    cache:{policy:'client-memory',key:`${league.id}:${active.id}`}
  };

  if (ALLOWED_DOMAINS.has(domain)) {
    const bulk = String(url.searchParams.get('bulk')||'') === '1';
    if(bulk && ['teams','players','games','standings'].includes(domain)){
      const page=await bulkDomainRows(db,league.id,active.id,domain);
      return json({...base,domain,...page});
    }
    const cursor = String(url.searchParams.get('cursor') || '').trim() || null;
    const limit = Number(url.searchParams.get('limit') || 150);
    const page = await domainRows(db,league.id,active.id,domain,cursor,limit);
    return json({...base,domain,...page});
  }

  if (ALLOWED_DOMAINS.has(sample)) {
    const page = await domainRows(db,league.id,active.id,sample,null,1);
    return json({...base,sample:{domain:sample,record:page.records[0] || null}});
  }

  return json(base);
  } catch (error) {
    return json({
      ok:false,
      release:RELEASE,
      error:'Live snapshot read failed.',
      detail:error?.message||String(error)
    },500);
  }
}
