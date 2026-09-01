import { canonicalTeamKey } from './league-teams.js';

export const TRADE_CENTER_RELEASE = '7.4.0';

export const DEFAULT_TRADE_CENTER_SETTINGS = Object.freeze({
  seasonTradeLimitEnabled: true,
  seasonTradeLimit: 4,
  maxPlayersPerTeam: 3,
  maxPicksPerTeam: 3,
  freeTradeDesignationEnabled: true,
  calculatorEnabled: true,
  reviewApprovalThreshold: 3,
  valueModel: Object.freeze({
    overallWeight: 1,
    ageCurveWeight: 1,
    developmentWeight: 1,
    positionWeight: 1,
    contractWeight: 1,
    draftRoundValues: Object.freeze({1:1000,2:520,3:300,4:180,5:110,6:70,7:40}),
    futurePickRetention: Object.freeze({1:1,2:0.82,3:0.68})
  })
});

const integer = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const finite = (value, fallback, min = 0, max = 100) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function normalizeTradeCenterSettings(value = {}) {
  const source = object(value);
  const model = object(source.valueModel);
  const roundSource = object(model.draftRoundValues);
  const retentionSource = object(model.futurePickRetention);
  return {
    seasonTradeLimitEnabled: source.seasonTradeLimitEnabled !== false,
    seasonTradeLimit: integer(source.seasonTradeLimit, 4, 1, 100),
    maxPlayersPerTeam: integer(source.maxPlayersPerTeam, 3, 1, 12),
    maxPicksPerTeam: integer(source.maxPicksPerTeam, 3, 1, 21),
    freeTradeDesignationEnabled: source.freeTradeDesignationEnabled !== false,
    calculatorEnabled: source.calculatorEnabled !== false,
    reviewApprovalThreshold: integer(source.reviewApprovalThreshold, 3, 1, 12),
    valueModel: {
      overallWeight: finite(model.overallWeight, 1, 0, 10),
      ageCurveWeight: finite(model.ageCurveWeight, 1, 0, 10),
      developmentWeight: finite(model.developmentWeight, 1, 0, 10),
      positionWeight: finite(model.positionWeight, 1, 0, 10),
      contractWeight: finite(model.contractWeight, 1, 0, 10),
      draftRoundValues: Object.fromEntries(Array.from({length:7}, (_, index) => {
        const round = String(index + 1);
        return [round, integer(roundSource[round], DEFAULT_TRADE_CENTER_SETTINGS.valueModel.draftRoundValues[round], 0, 100000)];
      })),
      futurePickRetention: Object.fromEntries(Array.from({length:3}, (_, index) => {
        const distance = String(index + 1);
        return [distance, finite(retentionSource[distance], DEFAULT_TRADE_CENTER_SETTINGS.valueModel.futurePickRetention[distance], 0, 1)];
      }))
    }
  };
}

export function tradeCenterSettingsFromLeagueDocument(document = {}) {
  return normalizeTradeCenterSettings(object(document).tradeCenter);
}

export function withTradeCenterSettings(document = {}, settings = {}) {
  return {...object(document), tradeCenter:normalizeTradeCenterSettings(settings)};
}

export function stableDraftPickId({leagueId, franchiseSeasonId, draftClass, round, originalTeamKey}) {
  const parts = [leagueId, franchiseSeasonId, integer(draftClass, 0, 1900, 3000), integer(round, 0, 1, 7), canonicalTeamKey(originalTeamKey)];
  if (parts.some(value => !value)) throw new TypeError('A complete permanent draft-pick identity is required.');
  return `pick:${parts.join(':')}`;
}

export function normalizeTradeTransfers(transfers = [], settings = DEFAULT_TRADE_CENTER_SETTINGS) {
  if (!Array.isArray(transfers) || !transfers.length) throw new TypeError('At least one trade asset is required.');
  const normalizedSettings = normalizeTradeCenterSettings(settings);
  const seen = new Set();
  const participants = new Set();
  const outgoing = new Map();
  const normalized = transfers.map((raw, ordinal) => {
    const fromTeamKey = canonicalTeamKey(raw?.fromTeamKey ?? raw?.fromTeamId);
    const toTeamKey = canonicalTeamKey(raw?.toTeamKey ?? raw?.toTeamId);
    if (!fromTeamKey || !toTeamKey || fromTeamKey === toTeamKey) throw new TypeError('Every asset needs different source and destination teams.');
    const rawType = String(raw?.assetType ?? raw?.type ?? raw?.asset?.type ?? '').toLowerCase();
    const assetType = rawType === 'pick' || rawType === 'draft-pick' ? 'draft-pick' : rawType === 'player' ? 'player' : null;
    if (!assetType) throw new TypeError('Trade assets must be players or draft picks.');
    const assetId = String(raw?.assetId ?? raw?.playerId ?? raw?.draftPickId ?? raw?.asset?.id ?? '').trim();
    if (!assetId) throw new TypeError('Every trade asset needs a stable identifier.');
    const key = `${assetType}:${assetId}`;
    if (seen.has(key)) throw new TypeError('An asset may appear only once in a trade revision.');
    seen.add(key);
    participants.add(fromTeamKey); participants.add(toTeamKey);
    const counts = outgoing.get(fromTeamKey) || {player:0, 'draft-pick':0};
    counts[assetType] += 1;
    outgoing.set(fromTeamKey, counts);
    return {assetType, assetId, fromTeamKey, toTeamKey, ordinal};
  });
  if (participants.size < 2 || participants.size > 4) throw new TypeError('A trade must include between two and four teams.');
  for (const [teamKey, counts] of outgoing) {
    if (counts.player > normalizedSettings.maxPlayersPerTeam) throw new TypeError(`${teamKey.toUpperCase()} exceeds the player limit.`);
    if (counts['draft-pick'] > normalizedSettings.maxPicksPerTeam) throw new TypeError(`${teamKey.toUpperCase()} exceeds the draft-pick limit.`);
  }
  for (const teamKey of participants) {
    const sends = normalized.some(asset => asset.fromTeamKey === teamKey);
    const receives = normalized.some(asset => asset.toTeamKey === teamKey);
    if (!sends || !receives) throw new TypeError('Every participating team must send and receive at least one asset.');
  }
  return {transfers:normalized, participants:[...participants], outgoing};
}

export function applyRosterOverlays(players = [], overlays = [], teamExternalIds = new Map()) {
  const active = new Map((overlays || [])
    .filter(row => String(row.internal_status ?? row.internalStatus) === 'active')
    .map(row => [String(row.source_player_id ?? row.sourcePlayerId), row]));
  return (players || []).map(player => {
    const sourceId = String(player?.id ?? player?.external_id ?? player?.playerId ?? '');
    const overlay = active.get(sourceId);
    if (!overlay) return player;
    const teamKey = canonicalTeamKey(overlay.to_team_key ?? overlay.toTeamKey);
    const externalId = String(teamExternalIds.get(teamKey) || teamKey);
    return {
      ...player,
      teamId:externalId,
      source:{...(player.source || {}), teamId:externalId}
    };
  });
}

export function reconciliationOutcome(expectedTeamKey, maddenTeamKey, previousTeamKey) {
  const expected = canonicalTeamKey(expectedTeamKey);
  const madden = canonicalTeamKey(maddenTeamKey);
  const previous = canonicalTeamKey(previousTeamKey);
  if (madden && madden === expected) return 'matched';
  if (!madden || madden === previous) return 'reverted';
  return 'different-team';
}

export function workflowDecision(reviewRows = [], threshold = 3) {
  const required = integer(threshold, 3, 1, 12);
  const decisions = new Map();
  for (const row of reviewRows || []) decisions.set(String(row.reviewer_user_id ?? row.reviewerUserId), String(row.decision));
  const values = [...decisions.values()];
  const approvals = values.filter(value => value === 'approve').length;
  const rejections = values.filter(value => value === 'reject').length;
  return {
    approvals,
    rejections,
    abstentions:values.filter(value => value === 'abstain').length,
    result:approvals >= required ? 'approved' : rejections >= required ? 'rejected' : null,
    threshold:required
  };
}
