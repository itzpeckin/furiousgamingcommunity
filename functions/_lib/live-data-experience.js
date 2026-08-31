const parse = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || 'null'); }
  catch { return null; }
};

const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = value => value === null || value === undefined || value === '' ? null : String(value);
const boundedText = (value, maximum) => {
  const normalized = text(value);
  return normalized === null ? null : normalized.slice(0, maximum);
};
const truthy = value => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';

export const MADDEN_RATING_FIELDS = Object.freeze([
  'accelRating', 'agilityRating', 'awareRating', 'bCVRating', 'blockShedRating',
  'breakSackRating', 'breakTackleRating', 'cITRating', 'carryRating', 'catchRating',
  'changeOfDirectionRating', 'finesseMovesRating', 'hitPowerRating', 'impactBlockRating',
  'injuryRating', 'jukeMoveRating', 'jumpRating', 'kickAccRating', 'kickPowerRating',
  'kickRetRating', 'leadBlockRating', 'longSnapRating', 'manCoverRating',
  'passBlockFinesseRating', 'passBlockPowerRating', 'passBlockRating', 'playActionRating',
  'playRecRating', 'powerMovesRating', 'pressRating', 'pursuitRating', 'releaseRating',
  'routeRunDeepRating', 'routeRunMedRating', 'routeRunShortRating', 'runBlockFinesseRating',
  'runBlockPowerRating', 'runBlockRating', 'specCatchRating', 'speedRating',
  'spinMoveRating', 'staminaRating', 'stiffArmRating', 'strengthRating', 'tackleRating',
  'throwAccDeepRating', 'throwAccMidRating', 'throwAccRating', 'throwAccShortRating',
  'throwOnRunRating', 'throwPowerRating', 'throwUnderPressureRating', 'toughRating',
  'truckRating', 'zoneCoverRating'
]);

const RATING_FIELDS_BY_LOWER = new Map(MADDEN_RATING_FIELDS.map(field => [field.toLowerCase(), field]));

export function safeRatingValues(raw = {}) {
  const sources = [parse(raw.ratings_json), raw.ratings, raw].filter(value => value && typeof value === 'object' && !Array.isArray(value));
  const ratings = {};
  for (const source of sources) {
    for (const [sourceKey, sourceValue] of Object.entries(source)) {
      const approvedKey = RATING_FIELDS_BY_LOWER.get(String(sourceKey).toLowerCase());
      const numeric = number(sourceValue);
      if (!approvedKey || numeric === null || numeric < 0 || numeric > 100) continue;
      ratings[approvedKey] = numeric;
    }
  }
  return Object.fromEntries(MADDEN_RATING_FIELDS.filter(field => ratings[field] !== undefined).map(field => [field, ratings[field]]));
}

export function safeAbilityValues(raw = {}) {
  const slots = Array.isArray(raw.signatureSlotList) ? raw.signatureSlotList : [];
  return slots.slice(0, 16).map(slot => {
    const ability = slot?.signatureAbility && typeof slot.signatureAbility === 'object' ? slot.signatureAbility : {};
    const title = boundedText(ability.signatureTitle, 120);
    if (truthy(slot?.isEmpty) || !title) return null;
    return {
      title,
      description:boundedText(ability.signatureDescription, 800),
      rank:boundedText(ability.rank, 32),
      threshold:number(slot?.ovrThreshold),
      unlocked:truthy(ability.isUnlocked) && !truthy(slot?.locked)
    };
  }).filter(Boolean);
}

export function sourceRosterStatus(raw = {}, teamId = '') {
  const explicit = String(raw.rosterStatus ?? raw.roster_status ?? raw.playerStatus ?? raw.player_status ?? raw.status ?? '').trim().toLowerCase();
  if (truthy(raw.isFreeAgent) || ['free agent','free-agent','fa'].includes(explicit)) return 'free-agent';
  if (truthy(raw.isOnIR) || ['ir','injured reserve','injured-reserve','reserve/injured'].includes(explicit)) return 'injured-reserve';
  if (truthy(raw.isOnPracticeSquad) || ['practice squad','practice-squad','ps'].includes(explicit)) return 'practice-squad';
  if (!teamId) return explicit || 'unassigned';
  if (raw.isActive === false || raw.isActive === 0 || raw.isActive === '0') return 'inactive';
  return explicit || 'active';
}

const scaledThousands = value => {
  const numeric = number(value);
  return numeric === null ? null : numeric * 1000;
};

export function sourceSupportedContract(raw = {}) {
  return {
    yearsRemaining:number(raw.contract_years_remaining ?? raw.contractYearsLeft ?? raw.contractYearsRemaining ?? raw.yearsRemaining),
    length:number(raw.contractLength ?? raw.contractYears ?? raw.totalContractYears),
    currentYearSalary:null,
    capHit:scaledThousands(raw.sourceCapHit ?? raw.cap_hit ?? raw.capHit ?? raw.salaryCapHit),
    currentYearBonus:null,
    totalSalary:number(raw.contractSalary ?? raw.totalSalary ?? raw.contractTotalSalary),
    totalBonus:number(raw.contractBonus ?? raw.totalBonus ?? raw.signingBonus),
    releaseNetSavings:scaledThousands(raw.capReleaseNetSavings ?? raw.releaseNetSavings ?? raw.capSavings),
    releasePenalty:scaledThousands(raw.capReleasePenalty ?? raw.releasePenalty ?? raw.deadCap ?? raw.deadMoney),
    sourceUnits:{capHit:'madden-thousands',releaseNetSavings:'madden-thousands',releasePenalty:'madden-thousands',salary:'dollars',bonus:'dollars'}
  };
}

export function freeAgentStateFromMappingRun(run = null) {
  if (!run) return {status:'unavailable',count:null,reason:'No active-snapshot player source is available.',interpretedAsZero:false};
  const warnings = Array.isArray(run.warnings) ? run.warnings : (parse(run.warnings_json) || []);
  const blocker = warnings.find(value => /blocked|failed to retrieve|export error/i.test(String(value)));
  if (blocker) {
    return {status:'blocked',count:null,reason:String(blocker),interpretedAsZero:false};
  }
  const missing = warnings.find(value => /missing|not captured|unavailable/i.test(String(value)));
  if (missing) {
    return {status:'missing',count:null,reason:String(missing),interpretedAsZero:false};
  }
  const count = number(run.free_agent_count ?? run.freeAgentCount);
  if (count !== null && count > 0) return {status:'ready',count,reason:null,interpretedAsZero:false};
  if (count === 0) return {status:'empty-confirmed',count:0,reason:'Madden explicitly returned a successful empty Free Agent roster.',interpretedAsZero:false};
  return {status:'unavailable',count:null,reason:'The active snapshot does not contain authoritative Free Agent evidence.',interpretedAsZero:false};
}

export async function resolveSnapshotPlayerMappingRun(db, leagueId, activeSnapshot, maxDepth = 8) {
  let snapshot = activeSnapshot;
  const visited = new Set();
  for (let depth = 0; snapshot && depth < maxDepth; depth += 1) {
    if (visited.has(snapshot.id)) break;
    visited.add(snapshot.id);
    const manifest = parse(snapshot.manifest_json) || {};
    const runId = manifest.sources?.playerMappingRunId || manifest.pinnedMappingRuns?.players || null;
    if (runId) {
      const run = await db.prepare(`SELECT id,player_count,rostered_count,free_agent_count,warning_count,warnings_json,created_at
        FROM companion_player_mapping_runs WHERE id=? AND league_id=? LIMIT 1`).bind(runId, leagueId).first();
      if (run && Number(run.player_count) === Number(activeSnapshot.player_count)) {
        return {...run, sourceSnapshotId:snapshot.id};
      }
    }
    const sourceSnapshotId = manifest.historicalBackfill?.sourceSnapshotId || manifest.historyCarryForward?.sourceSnapshotId || null;
    if (!sourceSnapshotId) break;
    snapshot = await db.prepare(`SELECT id,player_count,manifest_json FROM league_snapshots WHERE id=? AND league_id=? LIMIT 1`)
      .bind(sourceSnapshotId, leagueId).first();
  }
  return null;
}
