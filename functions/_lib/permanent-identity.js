const clean = value => String(value ?? '').trim();

export function normalizeIdentitySource(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function publicPlayerId() {
  return `plr_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function validateSeasonInput(input = {}) {
  const sourceFranchiseId = clean(input.sourceFranchiseId);
  const sourceSeasonId = clean(input.sourceSeasonId);
  const gameRelease = clean(input.gameRelease);
  const displayName = clean(input.displayName);
  const seasonYear = input.seasonYear === null || input.seasonYear === undefined || input.seasonYear === ''
    ? null : Number(input.seasonYear);
  if (!sourceFranchiseId || !sourceSeasonId || !gameRelease || !displayName) {
    return { ok:false, error:'A reviewed source franchise, source season, game release, and season display name are required.' };
  }
  if (seasonYear !== null && (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2200)) {
    return { ok:false, error:'Season year must be a valid four-digit year when supplied.' };
  }
  return { ok:true, value:{ sourceFranchiseId, sourceSeasonId, gameRelease, displayName, seasonYear } };
}

export function previewCompleteness(freeAgentStatus) {
  if (freeAgentStatus === 'located' || freeAgentStatus === 'empty-confirmed') return 'complete';
  return 'rostered-players-only';
}

export function freeAgentPreviewCount(freeAgentStatus, recordCount) {
  return freeAgentStatus === 'located' || freeAgentStatus === 'empty-confirmed'
    ? Number(recordCount || 0) : null;
}
