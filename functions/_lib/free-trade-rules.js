// Qualifying alternatives apply to each team's entire outgoing package.
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
export function normalizeFreeTradeRules(value){
  if(value==null)return {mode:'manual',packages:[]};
  if(!value||typeof value!=='object'||!['manual','automatic'].includes(value.mode)||!Array.isArray(value.packages)||value.packages.length>20)invalid('Choose a Free Trade mode and up to 20 package rules.');
  const integer=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)invalid(label);return v;};
  const packages=value.packages.map((r,index)=>{
    if(!r||!['under','at-most'].includes(r.overallComparison))invalid('Choose under or at most for player overall.');
    const range=(min,max,cap,label)=>{
      integer(min,0,cap,label);integer(max,0,cap,label);
      if(min>max)invalid(label+' minimum cannot exceed maximum.');
      return [min,max];
    };
    range(r.minPlayers,r.maxPlayers,12,'Player count');
    range(r.minPicks,r.maxPicks,21,'Pick count');
    if(r.maxPlayers+r.maxPicks===0)invalid('A qualifying package must allow at least one asset.');
    const overall=integer(r.overall,1,100,'Overall must be from 1 to 100.');
    const roundLimits={};
    for(let round=1;round<=7;round++)roundLimits[round]=integer(r.roundLimits?.[round],0,21,'Set each round limit from 0 to 21 (0 excludes the round).');
    if(r.maxPicks>0&&!Object.values(roundLimits).some(Boolean))invalid('Allow at least one pick round.');
    return {name:String(r.name||'Package '+(index+1)).trim().slice(0,80),minPlayers:r.minPlayers,maxPlayers:r.maxPlayers,minPicks:r.minPicks,maxPicks:r.maxPicks,overallComparison:r.overallComparison,overall,roundLimits};
  });
  if(value.mode==='automatic'&&!packages.length)invalid('Add at least one qualifying package before enabling automatic Free Trades.');
  return {mode:value.mode,packages};
}
export function evaluateFreeTrade(assets,rules){
  const config=normalizeFreeTradeRules(rules);
  if(config.mode!=='automatic')return {automatic:false,eligible:false,reason:'Free Trade status is assigned by an authorized reviewer.',teams:[]};
  const groups=new Map();
  for(const asset of assets||[]){
    const team=asset.fromTeamKey;
    if(!team)return {automatic:true,eligible:false,reason:'An asset has no confirmed sending team.',teams:[]};
    groups.set(team,[...(groups.get(team)||[]),asset]);
  }
  const teams=[...groups].map(([teamKey,items])=>{
    const match=config.packages.find(r=>{
      const players=items.filter(a=>a.assetType==='player'),picks=items.filter(a=>a.assetType==='draft-pick');
      if(players.length+picks.length!==items.length||players.length<r.minPlayers||players.length>r.maxPlayers||picks.length<r.minPicks||picks.length>r.maxPicks)return false;
      if(players.some(a=>typeof a.overall!=='number'||!Number.isFinite(a.overall)||a.overall<1||a.overall>99||(r.overallComparison==='under'?a.overall>=r.overall:a.overall>r.overall)))return false;
      const counts={};
      for(const p of picks){if(!Number.isInteger(p.round)||p.round<1||p.round>7)return false;counts[p.round]=(counts[p.round]||0)+1;}
      return Object.entries(counts).every(([round,count])=>count<=r.roundLimits[round]);
    });
    return {teamKey,eligible:Boolean(match),packageName:match?.name||null};
  });
  const eligible=teams.length>=2&&teams.every(t=>t.eligible);
  return {automatic:true,eligible,teams,reason:eligible?'Every outgoing package qualifies. This trade uses no seasonal trade slots.':'One or more outgoing packages do not match a Free Trade rule. Missing ratings or pick rounds cannot qualify.'};
}
export function freeTradeRuleSummary(settings){
  const r=normalizeFreeTradeRules(settings?.freeTradeRules);
  if(settings?.freeTradeDesignationEnabled===false)return {title:'Free Trades',text:'Disabled.'};
  if(r.mode!=='automatic')return {title:'Free Trades',text:'Authorized reviewers designate Free Trades manually.'};
  return {title:'Free Trades',text:'Automatic when every team’s outgoing package matches one of: '+r.packages.map(p=>p.name+': '+p.minPlayers+'–'+p.maxPlayers+' players, each '+(p.overallComparison==='under'?'under ':'at most ')+p.overall+' OVR; '+p.minPicks+'–'+p.maxPicks+' picks; '+Object.entries(p.roundLimits).filter(([,max])=>max>0).map(([round,max])=>'R'+round+' up to '+max).join(', ')).join(' | ')+'. All trade approval requirements still apply.'};
}
