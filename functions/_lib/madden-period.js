const WEEK_ROUTE=/(?:^|\/)week\/(pre|reg|post)\/(\d+)(?:\/|$)/i;

const integer=value=>{
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const parsed=Number(value);
  return Number.isInteger(parsed)?parsed:null;
};

function own(record,key){
  return Boolean(record&&Object.prototype.hasOwnProperty.call(record,key));
}

function first(record,aliases){
  for(const key of aliases){
    if(own(record,key)&&record[key]!==null&&record[key]!=='')return record[key];
  }
  const keys=new Map(Object.keys(record||{}).map(key=>[key.toLowerCase(),key]));
  for(const key of aliases){
    const actual=keys.get(key.toLowerCase());
    if(actual&&record[actual]!==null&&record[actual]!=='')return record[actual];
  }
  return null;
}

export function canonicalMaddenStage(value){
  const stage=String(value??'').trim().toLowerCase();
  if(['0','pre','preseason'].includes(stage))return'preseason';
  if(['2','post','postseason','playoff','playoffs'].includes(stage))return'playoffs';
  if(['1','reg','regular','regular-season'].includes(stage))return'regular-season';
  return null;
}

export function maddenRoutePeriod(routePath){
  const match=String(routePath||'').match(WEEK_ROUTE);
  if(!match)return null;
  const stage=canonicalMaddenStage(match[1]),week=integer(match[2]);
  return stage&&week!==null?{stage,week,key:`${stage}:${week}`} : null;
}

function payloadRecord(value){
  if(!value)return null;
  if(typeof value==='string'){
    try{return JSON.parse(value)}catch{return null}
  }
  return typeof value==='object'&&!Array.isArray(value)?value:null;
}

/**
 * Madden Companion's All Weeks export can use `/week/reg/0/` as a current-
 * week aggregate route. A non-empty aggregate is playable data only when its
 * zero-based payload `weekIndex` resolves one unambiguous canonical period.
 * Empty `/reg/0/` routes remain lifecycle placeholders.
 */
export function resolveMaddenPeriod(routePath,records=[]){
  const route=maddenRoutePeriod(routePath);
  if(!route)return null;
  const sentinel=route.stage==='regular-season'&&route.week===0;
  if(!sentinel)return{...route,source:'route',playable:true,sentinel:false};

  const rows=(Array.isArray(records)?records:[records]).map(payloadRecord).filter(Boolean);
  if(!rows.length)return{...route,source:'empty-placeholder',playable:false,sentinel:true,placeholder:true};

  const candidates=[];
  for(const record of rows){
    const rawWeekIndex=integer(first(record,['weekIndex','week_index']));
    const rawStageValue=first(record,['stageIndex','stage_index']);
    const rawStage=rawStageValue===null?route.stage:canonicalMaddenStage(rawStageValue);
    if(rawWeekIndex===null||rawWeekIndex<0||rawWeekIndex>39||rawStage!=='regular-season')continue;
    candidates.push({stage:rawStage,week:rawWeekIndex+1,rawWeekIndex,rawStageIndex:integer(rawStageValue)});
  }

  const periods=new Map(candidates.map(item=>[`${item.stage}:${item.week}`,item]));
  if(periods.size!==1||candidates.length!==rows.length){
    return{...route,source:periods.size?'payload-conflict':'payload-unresolved',playable:false,sentinel:true,placeholder:false};
  }
  const resolved=[...periods.values()][0];
  return{
    stage:resolved.stage,
    week:resolved.week,
    key:`${resolved.stage}:${resolved.week}`,
    source:'payload-sentinel',
    playable:true,
    sentinel:true,
    placeholder:false,
    rawStageIndex:resolved.rawStageIndex,
    rawWeekIndex:resolved.rawWeekIndex,
    routeStage:route.stage,
    routeWeek:route.week
  };
}

export function periodFromInventoryItem(item){
  const route=maddenRoutePeriod(item?.routePath??item?.route_path);
  if(!route)return null;
  if(route.stage!=='regular-season'||route.week!==0)return route;
  if(Number(item?.recordCount??item?.record_count??0)<=0)return null;
  const stage=canonicalMaddenStage(item?.canonicalStage??item?.canonical_stage);
  const week=integer(item?.canonicalWeek??item?.canonical_week);
  const source=String(item?.periodSource??item?.period_source??'');
  if(source!=='payload-sentinel'||stage!=='regular-season'||week===null||week<1)return null;
  return{stage,week,key:`${stage}:${week}`};
}

// Schedule aggregates may contain the whole season. Validate every record;
// never guess a period for a malformed row or let an aggregate override a route.
export function resolveMaddenSchedulePeriods(routePath,records=[]){
  const route=maddenRoutePeriod(routePath);
  if(!route)return null;
  if(route.stage!=='regular-season'||route.week!==0)return [resolveMaddenPeriod(routePath,records)];
  const rows=Array.isArray(records)?records:[records];
  if(!rows.length)return [];
  const periods=new Map();
  for(const row of rows){
    const period=resolveMaddenPeriod(routePath,[row]);
    if(!period?.playable)return null;
    periods.set(period.key,period);
  }
  return [...periods.values()].sort((a,b)=>a.week-b.week);
}

export function periodsFromInventoryItem(item){
  const single=periodFromInventoryItem(item);
  if(single)return [single];
  const route=maddenRoutePeriod(item?.routePath??item?.route_path);
  if(route?.stage!=='regular-season'||route.week!==0
    ||String(item?.datasetType??item?.dataset_type)!=='schedule'
    ||Number(item?.recordCount??item?.record_count??0)<=0
    ||item?.periodSource!=='payload-schedule-aggregate')return [];
  const periods=item.canonicalPeriods;
  if(!Array.isArray(periods)||!periods.length)return [];
  if(periods.some(p=>canonicalMaddenStage(p?.stage)!=='regular-season'
    ||!Number.isInteger(p?.week)||p.week<1||p.week>40))return [];
  return periods.map(p=>({stage:'regular-season',week:p.week,key:`regular-season:${p.week}`}));
}
