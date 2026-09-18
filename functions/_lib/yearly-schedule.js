import { resolveMaddenPeriod, resolveMaddenSchedulePeriods } from './madden-period.js';
import { candidateScheduleCarryForward } from './candidate-import.js';

export const YEARLY_SCHEDULE_WEEK_COUNT = 18;
export const YEARLY_SCHEDULE_ROUTE = /(?:^|\/)week\/(pre|reg|post)\/(\d+)\/schedules\/?$/i;

const ALIASES = Object.freeze({
  id:['gameId','scheduleId','id','eventId'],
  home:['homeTeamId','homeTeamID','homeId','home_team_id'],
  away:['awayTeamId','awayTeamID','awayId','away_team_id'],
  homeScore:['homeScore','homeTeamScore','homePts','homePoints'],
  awayScore:['awayScore','awayTeamScore','awayPts','awayPoints'],
  status:['status','gameStatus','state'],
  complete:['isComplete','completed','gameComplete'],
  date:['date','scheduledAt','gameDate','kickoffTime','startTime']
});

const own = (value,key) => Boolean(value && Object.prototype.hasOwnProperty.call(value,key));
const integer = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value),10);
  return Number.isInteger(parsed) ? parsed : null;
};
const text = value => value === null || value === undefined ? null : (String(value).trim() || null);
const truthy = value => value === true || value === 1 || value === '1'
  || ['true','yes','complete','completed','final'].includes(String(value ?? '').toLowerCase());

function first(record, aliases) {
  for (const key of aliases) if (own(record,key) && record[key] !== null && record[key] !== '') return record[key];
  const keys = new Map(Object.keys(record || {}).map(key => [key.toLowerCase(),key]));
  for (const key of aliases) {
    const actual = keys.get(key.toLowerCase());
    if (actual && record[actual] !== null && record[actual] !== '') return record[actual];
  }
  return null;
}

function arrays(value, path='$', depth=0, output=[]) {
  if (depth > 7 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    output.push({path,records:value});
    return output;
  }
  if (typeof value === 'object') {
    for (const [key,item] of Object.entries(value)) arrays(item,`${path}.${key}`,depth+1,output);
  }
  return output;
}

export function yearlyScheduleCollection(payload) {
  const collections = arrays(payload)
    .map(item => ({...item,records:item.records.filter(record => record && typeof record === 'object' && !Array.isArray(record))}))
    .filter(item => item.records.length);
  collections.sort((left,right) => {
    const score = item => item.records.slice(0,12)
      .filter(record => first(record,ALIASES.home) !== null && first(record,ALIASES.away) !== null).length;
    return score(right)-score(left) || right.records.length-left.records.length;
  });
  return collections[0] || null;
}

function completedStatus(record, homeScore, awayScore) {
  const status = text(first(record,ALIASES.status));
  if (truthy(first(record,ALIASES.complete)) || /final|complete/i.test(status || '')) return 'completed';
  if (Number.isFinite(homeScore) && Number.isFinite(awayScore) && (homeScore > 0 || awayScore > 0)) return 'completed';
  return status || 'scheduled';
}

function routePeriod(routePath) {
  const match = String(routePath || '').match(YEARLY_SCHEDULE_ROUTE);
  if (!match) return null;
  const stage = match[1].toLowerCase() === 'reg' ? 'regular-season'
    : match[1].toLowerCase() === 'pre' ? 'preseason' : 'playoffs';
  return {stage,week:integer(match[2]),sentinel:match[1].toLowerCase() === 'reg' && Number(match[2]) === 0};
}

function normalizeGame(record,index,source,period,seasonYear) {
  const homeTeamExternalId = text(first(record,ALIASES.home));
  const awayTeamExternalId = text(first(record,ALIASES.away));
  if (!homeTeamExternalId || !awayTeamExternalId || homeTeamExternalId === awayTeamExternalId) return null;
  const homeScore = integer(first(record,ALIASES.homeScore));
  const awayScore = integer(first(record,ALIASES.awayScore));
  const externalId = text(first(record,ALIASES.id))
    || `${period.stage}-${period.week}-${awayTeamExternalId}-${homeTeamExternalId}-${index+1}`;
  return {
    external_id:externalId,
    season_year:Number.isInteger(Number(seasonYear)) ? Number(seasonYear) : null,
    stage:period.stage,
    week_index:period.week,
    home_team_external_id:homeTeamExternalId,
    away_team_external_id:awayTeamExternalId,
    home_score:homeScore,
    away_score:awayScore,
    status:completedStatus(record,homeScore,awayScore),
    scheduled_at:text(first(record,ALIASES.date)),
    source_route_path:source.routePath,
    source_capture_id:source.captureId || null,
    source_record_json:JSON.stringify(record),
    source_observed_at:source.observedAt || null
  };
}

export function parseYearlyScheduleCapture({routePath,payload,captureId=null,observedAt=null,seasonYear=null}={}) {
  const warnings=[];
  const route=routePeriod(routePath);
  if (!route) return {games:[],warnings:[`Ignored non-schedule capture ${routePath || 'without a route'}.`]};
  if (route.stage !== 'regular-season') {
    return {games:[],warnings:[`Ignored ${route.stage} schedule route ${routePath}; yearly schedule imports collect Regular Season Weeks 1–18 only.`]};
  }
  const collection=yearlyScheduleCollection(payload);
  if (!collection) {
    return {games:[],warnings:[route.sentinel
      ? `Ignored the empty Week 0 placeholder ${routePath}.`
      : `No schedule games were found in ${routePath}.`]};
  }
  const rows=collection.records;
  if (route.sentinel && resolveMaddenSchedulePeriods(routePath,rows) === null) {
    return {games:[],warnings:[`The non-empty Week 0 schedule ${routePath} contains malformed or conflicting payload periods and was not collected.`]};
  }
  const games=[];
  for (let index=0;index<rows.length;index+=1) {
    const period=route.sentinel ? resolveMaddenPeriod(routePath,[rows[index]]) : {
      stage:route.stage,week:route.week,playable:true,source:'route'
    };
    if (!period?.playable || period.stage !== 'regular-season'
      || !Number.isInteger(period.week) || period.week < 1 || period.week > YEARLY_SCHEDULE_WEEK_COUNT) {
      warnings.push(`Ignored one schedule record from ${routePath} because it did not resolve to Regular Season Weeks 1–18.`);
      continue;
    }
    const game=normalizeGame(rows[index],index,{routePath,captureId,observedAt},period,seasonYear);
    if (!game) {
      warnings.push(`Ignored one schedule record from ${routePath} because its home and away teams were missing or invalid.`);
      continue;
    }
    games.push(game);
  }
  return {games,warnings};
}

function authority(game) {
  const route=routePeriod(game?.source_route_path);
  if (!route || route.stage !== 'regular-season') return 0;
  if (route.sentinel) return 1;
  return route.week === Number(game?.week_index) ? 2 : 0;
}

export function yearlyScheduleIdentity(game) {
  const week=integer(game?.week_index ?? game?.weekIndex);
  const home=text(game?.home_team_external_id ?? game?.homeTeamExternalId);
  const away=text(game?.away_team_external_id ?? game?.awayTeamExternalId);
  return week && home && away ? `regular-season:${week}:${away}:${home}` : null;
}

export function selectYearlyScheduleGames(games=[], warnings=[]) {
  const selected=new Map();
  for (const game of games) {
    const key=yearlyScheduleIdentity(game);
    if (!key) continue;
    const existing=selected.get(key);
    if (!existing) {
      selected.set(key,game);
      continue;
    }
    const replace=authority(game)>authority(existing)
      || (authority(game)===authority(existing)
        && String(game.source_observed_at || '')>String(existing.source_observed_at || ''));
    if (replace) selected.set(key,game);
    warnings.push(`Duplicate yearly schedule matchup ${key} was resolved using ${replace ? game.source_route_path : existing.source_route_path}.`);
  }
  return [...selected.values()].sort((left,right) => Number(left.week_index)-Number(right.week_index)
    || String(left.scheduled_at || '').localeCompare(String(right.scheduled_at || ''))
    || String(left.external_id).localeCompare(String(right.external_id)));
}

export function yearlyScheduleCoverage(games=[]) {
  const weeks=[...new Set(games.map(game=>integer(game?.week_index)).filter(week=>week>=1&&week<=YEARLY_SCHEDULE_WEEK_COUNT))]
    .sort((left,right)=>left-right);
  const missingWeeks=Array.from({length:YEARLY_SCHEDULE_WEEK_COUNT},(_,index)=>index+1)
    .filter(week=>!weeks.includes(week));
  return {weeks,missingWeeks,capturedWeekCount:weeks.length,expectedWeekCount:YEARLY_SCHEDULE_WEEK_COUNT,complete:missingWeeks.length===0};
}

export function mergeYearlyScheduleCatalog({yearlyGames=[],priorGames=[],currentGames=[],seasonYear=null}={}) {
  const priorOverlay=candidateScheduleCarryForward(priorGames,yearlyGames,{seasonYear});
  const currentOverlay=candidateScheduleCarryForward(currentGames,priorOverlay.records,{seasonYear});
  const selected=new Map(),recordsWithoutIds=[];
  let deduplicatedExternalIds=0;
  for(const record of currentOverlay.records){
    const externalId=String(record?.external_id??'').trim();
    if(!externalId){recordsWithoutIds.push(record);continue;}
    if(selected.has(externalId))deduplicatedExternalIds+=1;
    // Overlay order is yearly, prior, then current, so a later exact Madden
    // game ID is the more recent authority even after Madden rebases team IDs.
    selected.set(externalId,record);
  }
  return{
    ...currentOverlay,
    records:[...selected.values(),...recordsWithoutIds],
    deduplicatedExternalIds,
    yearlyGameCount:yearlyGames.length,
    priorGameCount:priorGames.length,
    currentGameCount:currentGames.length
  };
}
