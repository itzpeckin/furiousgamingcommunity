import { canonicalMaddenStage, maddenRoutePeriod } from './madden-period.js';

const rank={preseason:0,'regular-season':1,playoffs:2};
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return{}}};
const strictInt=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isInteger(Number(value))?Number(value):null;
export const compareSchedulePeriods=(a,b)=>(rank[a?.stage]??99)-(rank[b?.stage]??99)||a.week-b.week;
export function canonicalSchedulePeriod(value){
  const stage=canonicalMaddenStage(value?.stage),week=strictInt(value?.week);
  return stage&&week!==null&&week>=0&&week<=40?{stage,week,key:`${stage}:${week}`} : null;
}

// Only current-state metadata, not array rows or schedule route numbers, can
// supply the league clock. A root weekIndex is zero-based; currentWeek is not.
export function currentStatePeriodEvidence(payload,routePath){
  if(maddenRoutePeriod(routePath))return [];
  const evidence=[];
  const walk=(value,path='$',depth=0)=>{
    if(depth>6||!value||typeof value!=='object'||Array.isArray(value))return;
    const fields=new Map(Object.keys(value).map(key=>[key.toLowerCase().replace(/[^a-z0-9]/g,''),key]));
    const stageKey=['currentstage','stageindex','seasonstage','seasontype','stage'].map(k=>fields.get(k)).find(Boolean);
    const weekKey=['currentweek','currentweekindex','weekindex','week'].map(k=>fields.get(k)).find(Boolean);
    if(weekKey){
      const raw=strictInt(value[weekKey]);
      const week=raw===null?null:raw+(weekKey.toLowerCase().includes('index')?1:0);
      const stage=stageKey?canonicalMaddenStage(value[stageKey]):null;
      evidence.push({stage,week,path:`${path}.${weekKey}`,routePath,invalid:week===null||week<1||week>40||(Boolean(stageKey)&&!stage)});
    }
    for(const [key,child] of Object.entries(value))walk(child,`${path}.${key}`,depth+1);
  };
  walk(payload);
  return evidence;
}

export function proveCurrentSchedulePeriod(analyses=[]){
  const statistics=analyses.filter(a=>a.datasetType==='statistics'&&a.period?.playable).map(a=>({
    ...canonicalSchedulePeriod(a.period),routePath:a.routePath,path:'$route-or-payload-period'
  })).filter(p=>p.key).sort(compareSchedulePeriods);
  const roots=analyses.flatMap(a=>a.currentPeriodEvidence||[]);
  const fallbackStage=statistics.at(-1)?.stage;
  if(roots.length){
    const candidates=roots.map(item=>canonicalSchedulePeriod({...item,stage:item.stage||fallbackStage}));
    const keys=new Set(candidates.map(p=>p?.key));
    if(roots.some(p=>p.invalid)||candidates.some(p=>!p)||keys.size!==1)return{status:'ambiguous',period:null,evidence:roots};
    return{status:'proven',period:candidates[0],source:'current-state-metadata',evidence:roots};
  }
  // Weekly-stat routes belong to the latest accepted export, even when no game
  // has finished yet. Their season history can prove the last captured period.
  const period=canonicalSchedulePeriod(statistics.at(-1));
  return period?{status:'proven',period,source:'captured-statistics-period',evidence:statistics.filter(p=>p.key===period.key)}
    :{status:'unknown',period:null,evidence:[]};
}

export function snapshotCurrentPeriod(snapshot,legacy=true){
  if(!snapshot)return null;
  const manifest=parse(snapshot.manifest_json??snapshot.manifest);
  const period=canonicalSchedulePeriod(manifest.currentPeriod||manifest.sourceCoverage?.currentPeriod);
  if(period)return period;
  if(!legacy)return null;
  // Legacy snapshots were regular-season snapshots unless a retained manifest
  // explicitly proved another stage. This is a read-only compatibility bridge.
  return canonicalSchedulePeriod({stage:'regular-season',week:snapshot.week_index??snapshot.weekIndex??snapshot.currentWeek});
}

export function scheduleAdvanceDecision(previous,{period,proof,seasonYear,previousSeasonYear=previous?.season_year??previous?.seasonYear}={}){
  const from=snapshotCurrentPeriod(previous),to=canonicalSchedulePeriod(period);
  const result={allowed:false,reviewRequired:true,from,to,sourceSnapshotId:previous?.id??previous?.snapshot_id??null};
  if(!previous)return{...result,reason:'initial-import'};
  if(proof?.status!=='proven'||!from||!to)return{...result,reason:'current-period-unproven'};
  if(Number(previousSeasonYear)!==Number(seasonYear))return{...result,reason:'season-change'};
  const delta=compareSchedulePeriods(to,from);
  if(delta===0)return{...result,reason:'same-week',reviewRequired:false};
  if(delta<0)return{...result,reason:'backward-period'};
  const oneWeek=from.stage===to.stage&&to.week===from.week+1;
  const preseasonOpening=from.stage==='preseason'&&from.week===3&&to.stage==='regular-season'&&to.week===1;
  return oneWeek||preseasonOpening?{...result,allowed:true,reviewRequired:false,reason:preseasonOpening?'preseason-to-regular-opening':'one-week-advance'}
    :{...result,reason:'skipped-period'};
}
