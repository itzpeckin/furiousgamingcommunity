import { canonicalTeamKey } from './league-teams.js';
export { stableDraftPickId } from './draft-pick-baselines.js';

export const TRADE_CENTER_RELEASE = '7.4.0.5';

export const DEFAULT_TRADE_CENTER_SETTINGS = Object.freeze({
  seasonTradeLimitEnabled: true,
  seasonTradeLimit: 4,
  maxPlayersPerTeam: 3,
  maxPicksPerTeam: 3,
  freeTradeDesignationEnabled: true,
  calculatorEnabled: true,
  reviewApprovalThreshold: 3,
  valueModel: Object.freeze({
    player:Object.freeze({overall:100,age:100,development:100,position:100,contract:100,production:100,elite:100,injury:100}),
    model:Object.freeze({overallQuadratic:4.25,overall84Bonus:210,overall92Bonus:420,devStar:8,devSuperstar:18,devXFactor:28,
      age21_23:0,age24_26:0,age27_29:0,age30_32:0,age33Plus:0,positionQB:134,positionWR:107,positionEDGE:120,
      positionCB:115,positionOT:112,positionDT:109,positionRB:94,positionTE:92,positionOG:102,positionC:102,
      positionMLB:104,positionOLB:104,positionS:100,positionK:45,positionP:45,positionFB:72,
      contractCapEfficiencyRate:15,contractRookiePremium:13,contractFourYearControl:6,contractExpiringPenalty:7,
      contractMaxPremium:20,contractMaxPenalty:24}),
    package:Object.freeze({eliteScarcity:100,bestPlayer:100,dilution:100,rosterSpot:100,assetMix:100}),
    draft:Object.freeze({roundBases:Object.freeze({1:4200,2:2100,3:1325,4:825,5:500,6:275,7:125}),
      futureRetention:Object.freeze({1:100,2:65,3:40}),earlyPickMultiplier:134,latePickMultiplier:84,teamProjections:Object.freeze({})})
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
  const defaults=DEFAULT_TRADE_CENTER_SETTINGS.valueModel;
  const playerSource=object(model.player),modelSource=object(model.model),packageSource=object(model.package),draftSource=object(model.draft);
  const oldRoundSource=object(model.draftRoundValues),roundSource=Object.keys(object(draftSource.roundBases)).length?object(draftSource.roundBases):oldRoundSource;
  const oldRetentionSource=object(model.futurePickRetention),retentionSource=Object.keys(object(draftSource.futureRetention)).length?object(draftSource.futureRetention):oldRetentionSource;
  const oldWeights={overall:model.overallWeight,age:model.ageCurveWeight,development:model.developmentWeight,position:model.positionWeight,contract:model.contractWeight};
  const weight=(key)=>{
    if(playerSource[key]!==undefined)return finite(playerSource[key],defaults.player[key],0,500);
    const legacy=Number(oldWeights[key]);return Number.isFinite(legacy)?finite(legacy*100,defaults.player[key],0,500):defaults.player[key];
  };
  const roundValue=round=>{
    const value=Number(roundSource[round]),simplified={1:1000,2:520,3:300,4:180,5:110,6:70,7:40}[round];
    return !Number.isFinite(value)||value===simplified?defaults.draft.roundBases[round]:integer(value,defaults.draft.roundBases[round],0,100000);
  };
  const retentionValue=distance=>{
    const value=Number(retentionSource[distance]);
    if(!Number.isFinite(value)||[1,.82,.68][distance-1]===value)return defaults.draft.futureRetention[distance];
    return finite(value<=1?value*100:value,defaults.draft.futureRetention[distance],0,150);
  };
  return {
    seasonTradeLimitEnabled: source.seasonTradeLimitEnabled !== false,
    seasonTradeLimit: integer(source.seasonTradeLimit, 4, 1, 100),
    maxPlayersPerTeam: integer(source.maxPlayersPerTeam, 3, 1, 12),
    maxPicksPerTeam: integer(source.maxPicksPerTeam, 3, 1, 21),
    freeTradeDesignationEnabled: source.freeTradeDesignationEnabled !== false,
    calculatorEnabled: source.calculatorEnabled !== false,
    reviewApprovalThreshold: integer(source.reviewApprovalThreshold, 3, 1, 12),
    valueModel: {
      player:{...Object.fromEntries(Object.keys(defaults.player).map(key=>[key,weight(key)]))},
      model:{...Object.fromEntries(Object.entries(defaults.model).map(([key,fallback])=>[key,finite(modelSource[key],fallback,key.startsWith('age')?-100:0,10000)]))},
      package:{...Object.fromEntries(Object.entries(defaults.package).map(([key,fallback])=>[key,finite(packageSource[key],fallback,0,500)]))},
      draft:{
        roundBases:Object.fromEntries(Array.from({length:7},(_,index)=>[String(index+1),roundValue(String(index+1))])),
        futureRetention:Object.fromEntries(Array.from({length:3},(_,index)=>[String(index+1),retentionValue(String(index+1))])),
        earlyPickMultiplier:finite(draftSource.earlyPickMultiplier,defaults.draft.earlyPickMultiplier,25,250),
        latePickMultiplier:finite(draftSource.latePickMultiplier,defaults.draft.latePickMultiplier,25,250),
        teamProjections:Object.fromEntries(Object.entries(object(draftSource.teamProjections)).map(([key,value])=>[canonicalTeamKey(key),['early','mid','late','super-bowl'].includes(String(value))?String(value):'mid']))
      }
    }
  };
}

export function tradeCenterSettingsFromLeagueDocument(document = {}) {
  return normalizeTradeCenterSettings(object(document).tradeCenter);
}

export function withTradeCenterSettings(document = {}, settings = {}) {
  return {...object(document), tradeCenter:normalizeTradeCenterSettings(settings)};
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
