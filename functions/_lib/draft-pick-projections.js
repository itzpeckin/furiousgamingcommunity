import { canonicalTeamKey, resolveTeam } from './league-teams.js';

const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parse = value => {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : {};
  try { return JSON.parse(value || '{}') || {}; }
  catch { return {}; }
};

function sourceRecord(row = {}) {
  const raw = parse(row.dataJson ?? row.data_json ?? row);
  const nested = parse(raw.source_record_json ?? raw.sourceRecord ?? raw.source);
  return nested && typeof nested === 'object' ? {...nested, ...raw} : raw;
}

function standingFor(row, teams) {
  const raw = sourceRecord(row);
  const teamId = raw.teamId ?? raw.team_id ?? raw.external_id ?? row.externalId ?? row.external_id;
  const team = resolveTeam(teams, teamId);
  const wins = number(raw.totalWins ?? raw.wins);
  const losses = number(raw.totalLosses ?? raw.losses);
  const ties = number(raw.totalTies ?? raw.ties) ?? 0;
  if (!team || wins === null || losses === null) return null;
  const games = wins + losses + ties;
  return {
    teamKey:canonicalTeamKey(team.teamKey),
    teamExternalId:team.externalId,
    abbreviation:team.abbreviation,
    wins,
    losses,
    ties,
    games,
    winPercentage:games ? (wins + ties * 0.5) / games : 0,
    standingsWeek:number(raw.weekIndex ?? raw.week ?? raw.currentWeek),
    record:`${wins}-${losses}${ties ? `-${ties}` : ''}`
  };
}

const sameRecord = (left, right) => left
  && right
  && left.wins === right.wins
  && left.losses === right.losses
  && left.ties === right.ties;

/**
 * Produces an estimated inverse-standings draft order. Madden/NFL tiebreakers
 * are intentionally not guessed; exact record ties use a stable team-key order
 * and are marked approximate for the UI.
 */
export function projectDraftOrder(standingRows = [], teams = []) {
  const byTeam = new Map();
  for (const row of standingRows) {
    const standing = standingFor(row, teams);
    if (standing) byTeam.set(standing.teamKey, standing);
  }

  const expected = [...new Map((teams || []).filter(team => team?.teamKey)
    .map(team => [canonicalTeamKey(team.teamKey), team])).keys()];
  const complete = expected.length > 1 && expected.every(teamKey => byTeam.has(teamKey));
  if (!complete) {
    return {
      available:false,
      approximate:true,
      officialTiebreakersApplied:false,
      methodology:'inverse-active-standings-record',
      expectedTeamCount:expected.length,
      standingTeamCount:byTeam.size,
      standingsWeek:null,
      teams:[]
    };
  }

  const sorted = expected.map(teamKey => byTeam.get(teamKey)).sort((left, right) =>
    left.winPercentage - right.winPercentage
    || left.wins - right.wins
    || right.losses - left.losses
    || left.ties - right.ties
    || left.teamKey.localeCompare(right.teamKey)
  );
  const standingsWeek = Math.max(...sorted.map(row => row.standingsWeek ?? 0));
  const projected = sorted.map((row, index) => ({
    ...row,
    slot:index + 1,
    tiedWithSameRecord:sameRecord(sorted[index - 1], row) || sameRecord(row, sorted[index + 1])
  }));

  return {
    available:true,
    approximate:true,
    officialTiebreakersApplied:false,
    methodology:'inverse-active-standings-record',
    expectedTeamCount:expected.length,
    standingTeamCount:byTeam.size,
    standingsWeek:standingsWeek || null,
    teams:projected
  };
}

export function projectedPickLabel(round, slot) {
  const safeRound = Number(round);
  const safeSlot = Number(slot);
  if (!Number.isInteger(safeRound) || safeRound < 1 || !Number.isInteger(safeSlot) || safeSlot < 1) return null;
  return `${safeRound}.${String(safeSlot).padStart(2, '0')}`;
}

export function attachProjectedPickSlots(picks = [], projection = {}) {
  const byOriginalTeam = new Map((projection.teams || []).map(team => [team.teamKey, team]));
  return picks.map(pick => {
    const team = byOriginalTeam.get(canonicalTeamKey(pick.originalTeamKey));
    return {
      ...pick,
      projectedSlot:team?.slot ?? null,
      projectedPick:team ? projectedPickLabel(pick.round, team.slot) : null,
      projectedRecord:team?.record ?? null,
      projectionApproximate:Boolean(team),
      projectionTied:Boolean(team?.tiedWithSameRecord)
    };
  });
}
