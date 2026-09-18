import { snapshotCurrentPeriod } from './schedule-integrity.js';

const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const periodLabel = period => {
  if (!period) return 'Current period unavailable';
  if (period.stage === 'playoffs') {
    return ({1:'Wild Card',2:'Divisional Round',3:'Conference Championship',4:'Super Bowl'})[period.week]
      || `Playoff Week ${period.week}`;
  }
  return `${period.stage === 'preseason' ? 'Preseason' : 'Regular Season'} Week ${period.week}`;
};

export function canonicalLeagueContext(league, snapshot) {
  if (!snapshot) {
    return Object.freeze({
      authority:'server-active-snapshot',
      state:'empty',
      snapshotId:null,
      seasonYear:null,
      stage:null,
      week:null,
      displayLabel:'No active snapshot',
      configurationAligned:null,
      contextKey:`${league?.id || 'unknown'}:empty`
    });
  }

  const period = snapshotCurrentPeriod(snapshot, false);
  const seasonYear = number(snapshot.season_year ?? snapshot.seasonYear);
  const configuredSeason = number(league?.current_season);
  const configuredWeek = number(league?.current_week);
  const configurationAligned = Boolean(
    period
    && (configuredSeason === null || configuredSeason === seasonYear)
    && (configuredWeek === null || configuredWeek === period.week)
  );
  const state = !period ? 'incomplete' : configurationAligned ? 'live' : 'stale';
  return Object.freeze({
    authority:'server-active-snapshot',
    state,
    snapshotId:String(snapshot.id),
    seasonYear,
    stage:period?.stage || null,
    week:period?.week ?? null,
    displayLabel:periodLabel(period),
    configurationAligned,
    configuredSeason,
    configuredWeek,
    contextKey:`${league?.id || 'unknown'}:${snapshot.id}:${seasonYear ?? 'unknown'}:${period?.key || 'period-unknown'}`
  });
}

export function canonicalDataStatus(context, integrity = {}, domains = {}) {
  if (!context?.snapshotId) {
    return Object.freeze({
      code:'empty',tone:'neutral',available:false,stale:false,incomplete:false,
      label:'Import required',message:'No active league snapshot is available.'
    });
  }
  const expected = ['teams','players','games','statistics','standings'];
  const missing = expected.filter(domain => !Number.isFinite(Number(domains?.[domain])) || Number(domains[domain]) < 0);
  const validationFailed = Number(integrity?.errorCount || 0) > 0
    || ['failed','invalid'].includes(String(integrity?.status || '').toLowerCase());
  if (context.state === 'incomplete' || missing.length || validationFailed) {
    return Object.freeze({
      code:'incomplete',tone:'warning',available:true,stale:false,incomplete:true,
      label:'Import incomplete',
      message:validationFailed
        ? 'The active snapshot has validation errors.'
        : 'The active snapshot does not contain complete canonical context metadata.'
    });
  }
  if (context.state === 'stale') {
    return Object.freeze({
      code:'stale',tone:'warning',available:true,stale:true,incomplete:false,
      label:'Context needs review',
      message:'League settings and the active snapshot disagree; the active snapshot remains authoritative.'
    });
  }
  return Object.freeze({
    code:'live',tone:'success',available:true,stale:false,incomplete:false,
    label:'Live',message:'All core league pages use the same active snapshot context.'
  });
}
