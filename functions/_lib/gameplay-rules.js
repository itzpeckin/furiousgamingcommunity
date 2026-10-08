export const GAMEPLAY_STATS = Object.freeze({
  rushing: {rushAtt:'carries',rushYds:'rushing yards',rushTDs:'rushing touchdowns',rushFum:'rushing fumbles'},
  passing: {passAtt:'passing attempts',passComp:'completions',passYds:'passing yards',passTDs:'passing touchdowns',passInts:'interceptions thrown'}
});
export const HALF_WEIGHT_POSITIONS = ['FB','K','P','LT','LG','C','RG','RT','OL','LS'];
export function defaultGameplayRules(){
  return {rushing:{enabled:true,stat:'rushAtt',comparison:'minimum',limit:10},
    passing:{enabled:false,stat:'passAtt',comparison:'minimum',limit:10},
    abilities:{enabled:true,limit:7.5,traits:'superstar-and-xfactor',positionWeighting:'half-specialists',policy:'development-exempt'}};
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
    ||!['equal','half-specialists'].includes(a.positionWeighting)||!['strict','development-exempt'].includes(a.policy))invalid('Choose valid roster ability rule options.');
  if(typeof a.limit!=='number'||!Number.isFinite(a.limit)||a.limit<0||a.limit>100||a.limit*2%1!==0)invalid('Ability allowance must be from 0 to 100 in half-player increments.');
  result.abilities={enabled:a.enabled,limit:a.limit,traits:a.traits,positionWeighting:a.positionWeighting,policy:a.policy};
  return result;
}
export function gameplayRulesFromDocument(document){
  // Preserve the established bot behavior until a commissioner saves league-specific rules.
  return document?.gameplayRules ? validateGameplayRules(document.gameplayRules) : defaultGameplayRules();
}
export async function readGameplayRules(db,leagueId){
  const row=await db.prepare('SELECT settings_json AS settingsJson FROM league_settings WHERE league_id=?').bind(leagueId).first();
  return gameplayRulesFromDocument(JSON.parse(row?.settingsJson||'{}'));
}
export function statRuleViolation(value,rule){
  return rule.enabled&&Number.isFinite(value)&&(rule.comparison==='maximum'?value>rule.limit:value<rule.limit);
}
export function gameplayRuleSummary(rules){
  const result=['rushing','passing'].map(kind=>({title:kind==='rushing'?'Rushing rule':'Passing rule',text:rules[kind].enabled
    ?`Team ${rules[kind].comparison}: ${rules[kind].limit} ${GAMEPLAY_STATS[kind][rules[kind].stat]} per completed regular-season game. Discord checks all weeks in the current season; missing statistics are unverified.`:'Disabled.'}));
  const a=rules.abilities;
  result.push({title:'Roster ability allowance',text:a.enabled?`${a.limit} weighted ${a.traits==='xfactor-only'?'X-Factor':'Superstar and X-Factor'} players per team. ${a.positionWeighting==='equal'?'Every position counts as 1.':`${HALF_WEIGHT_POSITIONS.join(', ')} count as 0.5; all other positions count as 1.`} ${a.policy==='strict'?'Above the allowance is a roster violation.':'Season-opening and acquisition benchmark; earned development may exceed it. Above-benchmark totals need acquisition/history evidence before a violation can be confirmed.'}`:'Disabled.'});
  return result;
}
