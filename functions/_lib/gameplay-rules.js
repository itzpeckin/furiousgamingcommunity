export const GAMEPLAY_STATS = Object.freeze({
  rushing: {rushAtt:'carries',rushYds:'rushing yards',rushTDs:'rushing touchdowns',rushFum:'rushing fumbles'},
  passing: {passAtt:'passing attempts',passComp:'completions',passYds:'passing yards',passTDs:'passing touchdowns',passInts:'interceptions thrown'}
});
export const HALF_WEIGHT_POSITIONS = ['FB','K','P','LT','LG','C','RG','RT','OL','LS'];
export const ABILITY_POSITIONS = ['QB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL','LE','RE','EDGE','DT','LOLB','MLB','ROLB','OLB','LB','CB','FS','SS','S','K','P','LS'];
export function abilityPositionKey(value){
  const p=String(value||'').trim().toUpperCase();
  return ({HB:'RB',ILB:'MLB',LEDG:'LE',LEDGE:'LE',REDG:'RE',REDGE:'RE'})[p]||p;
}
export function abilityPositionWeights(rule={}){
  return Object.fromEntries(ABILITY_POSITIONS.map(p=>[p,rule.positionWeighting==='custom'
    ?(rule.positionWeights?.[p]??1):rule.positionWeighting==='half-specialists'&&HALF_WEIGHT_POSITIONS.includes(p)?0.5:1]));
}
export function abilityPositionWeight(position,rule){return abilityPositionWeights(rule)[abilityPositionKey(position)]??1;}
export function abilityWeightSummary(rule){
  const groups=new Map();
  for(const [position,weight] of Object.entries(abilityPositionWeights(rule))){
    if(weight===1)continue;
    groups.set(weight,[...(groups.get(weight)||[]),position]);
  }
  return groups.size?[...groups].map(([weight,positions])=>positions.join(', ')+' = '+weight).join('; ')+'; all other positions = 1.':'Every position = 1.';
}
export function defaultGameplayRules(){
  return {rushing:{enabled:true,stat:'rushAtt',comparison:'minimum',limit:10},
    passing:{enabled:false,stat:'passAtt',comparison:'minimum',limit:10},
    abilities:{enabled:true,limit:7.5,traits:'superstar-and-xfactor',positionWeighting:'equal',policy:'development-exempt'}};
}
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
export function validateGameplayRules(input){
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Provide the league gameplay rules.');
  const result={};
  for(const kind of ['rushing','passing']){
    const r=input[kind];
    if(!r||typeof r.enabled!=='boolean'||!Object.hasOwn(GAMEPLAY_STATS[kind],r.stat)
      ||!['minimum','maximum'].includes(r.comparison))invalid(`Choose valid ${kind} rule options.`);
    if(typeof r.limit!=='number'||!Number.isInteger(r.limit)||r.limit<0||r.limit>10000)invalid(`${kind} limit must be a whole number from 0 to 10,000.`);
    result[kind]={enabled:r.enabled,stat:r.stat,comparison:r.comparison,limit:r.limit};
  }
  const a=input.abilities;
  if(!a||typeof a.enabled!=='boolean'||!['superstar-and-xfactor','xfactor-only'].includes(a.traits)
    ||!['equal','half-specialists','custom'].includes(a.positionWeighting)||!['strict','development-exempt'].includes(a.policy))invalid('Choose valid roster ability rule options.');
  if(typeof a.limit!=='number'||!Number.isFinite(a.limit)||a.limit<0||a.limit>100||a.limit*4%1!==0)invalid('Ability allowance must be from 0 to 100 in quarter-player increments.');
  result.abilities={enabled:a.enabled,limit:a.limit,traits:a.traits,positionWeighting:a.positionWeighting,policy:a.policy};
  if(a.positionWeighting==='custom'){
    if(!a.positionWeights||typeof a.positionWeights!=='object'||Array.isArray(a.positionWeights))invalid('Choose a count for each position.');
    if(Object.keys(a.positionWeights).some(p=>!ABILITY_POSITIONS.includes(p)))invalid('Choose supported roster positions.');
    for(const p of ABILITY_POSITIONS){
      const value=a.positionWeights[p];
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10||value*4%1!==0)invalid('Position counts must be from 0 to 10 in quarter-player increments.');
    }
    result.abilities.positionWeights={...a.positionWeights};
  }
  return result;
}
export function gameplayRulesFromDocument(document,leagueId=null){
  // Honor explicit saved policies; unconfigured positions always count as one.
  return document?.gameplayRules ? validateGameplayRules(document.gameplayRules) : defaultGameplayRules(leagueId);
}
export async function readGameplayRules(db,leagueId){
  const row=await db.prepare('SELECT settings_json AS settingsJson FROM league_settings WHERE league_id=?').bind(leagueId).first();
  return gameplayRulesFromDocument(JSON.parse(row?.settingsJson||'{}'),leagueId);
}
export function statRuleViolation(value,rule){
  return rule.enabled&&Number.isFinite(value)&&(rule.comparison==='maximum'?value>rule.limit:value<rule.limit);
}
export function gameplayRuleSummary(rules){
  const result=['rushing','passing'].map(kind=>({title:kind==='rushing'?'Rushing rule':'Passing rule',text:rules[kind].enabled
    ?`Team ${rules[kind].comparison}: ${rules[kind].limit} ${GAMEPLAY_STATS[kind][rules[kind].stat]} per completed regular-season game. Discord checks all weeks in the current season; missing statistics are unverified.`:'Disabled.'}));
  const a=rules.abilities;
  result.push({title:'Roster ability allowance',text:a.enabled?`${a.limit} weighted ${a.traits==='xfactor-only'?'X-Factor':'Superstar and X-Factor'} players per team. ${abilityWeightSummary(a)} ${a.policy==='strict'?'Above the allowance is a roster violation.':'Season-opening and acquisition benchmark; earned development may exceed it. Above-benchmark totals need acquisition/history evidence before a violation can be confirmed.'}`:'Disabled.'});
  return result;
}
