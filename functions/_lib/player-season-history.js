const CATEGORIES = Object.freeze({
  passing:[
    ['passYds','sum'],['passTDs','sum'],['passInts','sum'],['passComp','sum'],['passAtt','sum'],
    ['passSacks','sum'],['passLongest','max'],['passPts','sum']
  ],
  rushing:[
    ['rushYds','sum'],['rushTDs','sum'],['rushFum','sum'],['rushAtt','sum'],
    ['rushToPct','average'],['rush20PlusYds','sum'],['rushBrokenTackles','sum'],
    ['rushYdsAfterContact','sum'],['rushLongest','max'],['rushPts','sum']
  ],
  receiving:[
    ['recCatches','sum'],['recYds','sum'],['recTDs','sum'],['recCatchPct','average'],
    ['recToPct','average'],['recDrops','sum'],['recYdsAfterCatch','sum'],['recLongest','max'],['recPts','sum']
  ],
  defense:[
    ['defTotalTackles','sum'],['defSacks','sum'],['defInts','sum'],['defForcedFum','sum'],
    ['defFumRec','sum'],['defTDs','sum'],['defDeflections','sum'],['defIntReturnYds','sum'],
    ['defSafeties','sum'],['defCatchAllowed','sum'],['defPts','sum']
  ],
  kicking:[
    ['kickPts','sum'],['fGMade','sum'],['fGAtt','sum'],['fG50PlusMade','sum'],
    ['fG50PlusAtt','sum'],['fGLongest','max'],['xPMade','sum'],['xPAtt','sum'],
    ['kickoffAtt','sum'],['kickoffTBs','sum']
  ],
  punting:[
    ['puntAtt','sum'],['puntYds','sum'],['puntNetYds','sum'],['puntsIn20','sum'],
    ['puntTBs','sum'],['puntsBlocked','sum'],['puntLongest','max']
  ]
});

const parse = (value, fallback = null) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || 'null') ?? fallback; }
  catch { return fallback; }
};

const sourceRecord = row => {
  const outer=parse(row?.data_json ?? row,{}) || {};
  const nested=parse(outer.source_record_json ?? outer.sourceRecord ?? outer.source,{}) || {};
  return {...nested,...outer};
};

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function passerRating(totals){
  const attempts=Number(totals.passAtt||0);if(!attempts)return null;
  const a=clamp(((Number(totals.passComp||0)/attempts)-0.3)*5,0,2.375);
  const b=clamp(((Number(totals.passYds||0)/attempts)-3)*0.25,0,2.375);
  const c=clamp((Number(totals.passTDs||0)/attempts)*20,0,2.375);
  const d=clamp(2.375-(Number(totals.passInts||0)/attempts)*25,0,2.375);
  return (a+b+c+d)/6*100;
}

export function aggregateArchivedPlayerCategory(rows=[],category=''){
  const definitions=CATEGORIES[category]||[],totals={},averageCounts={};
  for(const metrics of rows){
    for(const [key,mode] of definitions){
      if(!finite(metrics?.[key]))continue;
      const value=Number(metrics[key]);
      totals[key]=mode==='max'?Math.max(Number(totals[key]||0),value):Number(totals[key]||0)+value;
      if(mode==='average')averageCounts[key]=Number(averageCounts[key]||0)+1;
    }
  }
  for(const [key,count] of Object.entries(averageCounts))totals[key]=totals[key]/count;
  const metricRows=key=>rows.filter(metrics=>finite(metrics?.[key])).length;
  if(category==='passing'){
    totals.passCompPct=totals.passAtt?totals.passComp/totals.passAtt*100:null;
    totals.passYdsPerAtt=totals.passAtt?totals.passYds/totals.passAtt:null;
    totals.passYdsPerGame=metricRows('passYds')?totals.passYds/metricRows('passYds'):null;
    totals.passerRating=passerRating(totals);
  }else if(category==='rushing'){
    totals.rushYdsPerAtt=totals.rushAtt?totals.rushYds/totals.rushAtt:null;
    totals.rushYdsPerGame=metricRows('rushYds')?totals.rushYds/metricRows('rushYds'):null;
  }else if(category==='receiving'){
    totals.recYdsPerCatch=totals.recCatches?totals.recYds/totals.recCatches:null;
    totals.recYdsPerGame=metricRows('recYds')?totals.recYds/metricRows('recYds'):null;
    totals.recYacPerCatch=totals.recCatches?totals.recYdsAfterCatch/totals.recCatches:null;
  }else if(category==='kicking'){
    totals.fGCompPct=totals.fGAtt?totals.fGMade/totals.fGAtt*100:null;
    totals.xPCompPct=totals.xPAtt?totals.xPMade/totals.xPAtt*100:null;
  }else if(category==='punting'){
    totals.puntYdsPerAtt=totals.puntAtt?totals.puntYds/totals.puntAtt:null;
    totals.puntNetYdsPerAtt=totals.puntAtt?totals.puntNetYds/totals.puntAtt:null;
  }
  return Object.fromEntries(Object.entries(totals).filter(([,value])=>value!==null&&finite(value)));
}

export function buildArchivedPlayerSeasonTotals({records=[],aliases=[],seasonYear=null,sourceSnapshotId=null}={}){
  const identityBySource=new Map(aliases.map(alias=>[
    String(alias.sourcePlayerId??alias.source_player_id??''),
    String(alias.playerIdentityId??alias.player_identity_id??'')
  ]).filter(([source,identity])=>source&&identity));
  const grouped=new Map();
  let retainedStatisticRows=0,matchedStatisticRows=0;
  for(const row of records){
    const raw=sourceRecord(row);
    const provenance=String(raw.stage??raw.stage_name??raw.source_route_path??raw.sourceRoutePath??raw.route_path??'').toLowerCase();
    if(provenance.includes('preseason')||/\/week\/pre(?:\/|$)/.test(provenance))continue;
    const category=String(raw.category??raw.statistic_category??'').toLowerCase();
    if(!CATEGORIES[category])continue;
    const sourcePlayerId=String(raw.player_external_id??raw.player_id??raw.playerId??'');
    if(!sourcePlayerId)continue;
    retainedStatisticRows++;
    const playerIdentityId=identityBySource.get(sourcePlayerId);
    if(!playerIdentityId)continue;
    matchedStatisticRows++;
    if(!grouped.has(playerIdentityId))grouped.set(playerIdentityId,new Map());
    const categories=grouped.get(playerIdentityId);
    if(!categories.has(category))categories.set(category,[]);
    categories.get(category).push(parse(raw.metrics_json??raw.metrics,{})||{});
  }
  const byIdentity=new Map();
  for(const [playerIdentityId,categories] of grouped){
    const totals={};
    for(const [category,rows] of categories)totals[category]=aggregateArchivedPlayerCategory(rows,category);
    byIdentity.set(playerIdentityId,{
      schemaVersion:1,seasonYear:Number(seasonYear)||null,sourceSnapshotId:sourceSnapshotId||null,
      statisticRowCount:[...categories.values()].reduce((sum,rows)=>sum+rows.length,0),categories:totals
    });
  }
  return{byIdentity,retainedStatisticRows,matchedStatisticRows,playersWithStatistics:byIdentity.size};
}

export function emptyArchivedPlayerSeasonTotals({seasonYear=null,sourceSnapshotId=null}={}){
  return{schemaVersion:1,seasonYear:Number(seasonYear)||null,sourceSnapshotId:sourceSnapshotId||null,statisticRowCount:0,categories:{}};
}
