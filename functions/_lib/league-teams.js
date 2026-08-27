const text = value => value === null || value === undefined || value === ''
  ? null
  : String(value).trim() || null;

function parse(value) {
  try { return JSON.parse(value || 'null'); }
  catch { return null; }
}

function sourceRecord(raw = {}) {
  const nested = typeof raw.source_record_json === 'string'
    ? parse(raw.source_record_json)
    : (raw.source_record_json || raw.sourceRecord || raw.source || null);
  return nested && typeof nested === 'object' ? {...nested, ...raw} : raw;
}

export function canonicalTeamKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-');
}

export function normalizeLeagueTeam(raw = {}, externalIdFallback = '') {
  raw = sourceRecord(raw);
  const externalId = text(raw.external_id ?? raw.externalId ?? raw.team_id ?? raw.teamId ?? externalIdFallback) || '';
  const abbreviation = text(raw.abbreviation ?? raw.abbrName ?? raw.abbr ?? raw.teamAbbr);
  const displayName = text(raw.display_name ?? raw.displayName ?? raw.teamName ?? raw.fullName)
    || [text(raw.city_name ?? raw.cityName ?? raw.city), text(raw.nickname ?? raw.nickName ?? raw.name)].filter(Boolean).join(' ')
    || abbreviation
    || externalId;
  const teamKey = canonicalTeamKey(abbreviation || externalId);
  return {
    id: teamKey,
    teamKey,
    externalId,
    displayName,
    cityName: text(raw.city_name ?? raw.cityName ?? raw.city),
    nickname: text(raw.nickname ?? raw.nickName ?? raw.name),
    abbreviation,
    conferenceName: text(raw.conference_name ?? raw.conferenceName ?? raw.conference),
    divisionName: text(raw.division_name ?? raw.divisionName ?? raw.division),
    logoUrl: text(raw.logo_url ?? raw.logoUrl ?? raw.logo),
    primaryColor: text(raw.primary_color ?? raw.primaryColor),
    secondaryColor: text(raw.secondary_color ?? raw.secondaryColor)
  };
}

export function teamAliases(team = {}) {
  return new Set([
    team.teamKey,
    team.id,
    team.externalId,
    team.abbreviation,
    team.displayName,
    team.nickname
  ].map(canonicalTeamKey).filter(Boolean));
}

export function resolveTeam(teams = [], value = '') {
  const wanted = canonicalTeamKey(value);
  if (!wanted) return null;
  return teams.find(team => teamAliases(team).has(wanted)) || null;
}

export async function activeLeagueTeams(db, leagueId) {
  const result = await db.prepare(`
    SELECT r.external_id, r.data_json
    FROM league_active_snapshots a
    JOIN league_snapshot_records r
      ON r.league_id=a.league_id AND r.snapshot_id=a.snapshot_id
    WHERE a.league_id=? AND r.domain='teams'
    ORDER BY r.external_id
  `).bind(leagueId).all();
  return (result?.results || [])
    .map(row => normalizeLeagueTeam(parse(row.data_json) || {}, row.external_id))
    .filter(team => team.teamKey && team.externalId);
}

export async function activeTeamAssignments(db, leagueId, teams = null) {
  const canonicalTeams = teams || await activeLeagueTeams(db, leagueId);
  const result = await db.prepare(`
    SELECT lm.id AS membershipId, lm.user_id AS userId, lm.role, lm.team_id AS storedTeamId,
      u.display_name AS displayName, u.discord_global_name AS discordGlobalName,
      u.discord_username AS discordUsername
    FROM league_memberships lm
    JOIN users u ON u.id=lm.user_id
    WHERE lm.league_id=? AND lm.active=1 AND lm.team_id IS NOT NULL
    ORDER BY lower(u.display_name)
  `).bind(leagueId).all();
  const assignments = new Map();
  for (const row of result?.results || []) {
    const team = resolveTeam(canonicalTeams, row.storedTeamId);
    if (!team || assignments.has(team.teamKey)) continue;
    assignments.set(team.teamKey, {
      membershipId: row.membershipId,
      userId: row.userId,
      role: row.role,
      teamId: team.teamKey,
      displayName: row.displayName || row.discordGlobalName || row.discordUsername || 'League Member'
    });
  }
  return assignments;
}

export function publicLeagueTeams(teams = [], assignments = new Map()) {
  return teams.map(team => {
    const assignment = assignments.get(team.teamKey) || null;
    return {
      ...team,
      ownerName: assignment?.displayName || null,
      ownerRole: assignment?.role || null,
      assigned: Boolean(assignment)
    };
  });
}
