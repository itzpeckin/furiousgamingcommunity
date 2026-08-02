(function registerTradeAssetResolver(global){
  'use strict';
  const HQ=global.FranchiseHQ;
  if(!HQ?.defineModuleService) return;
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  function roster(){return HQ.modules?.league?.rosters||HQ.leagueRosters||null}
  function currentSource(){return HQ.leagueData?.currentSource?.()||{mode:'empty',available:false}}
  function normalizePick(input={}){return{type:'pick',teamId:String(input.teamId||''),year:Number(input.year||0),round:Number(input.round||0),pick:Number(input.pick||0)||null}}
  function resolvePlayer(id){
    const player=roster()?.findPlayer?.(String(id||''));
    if(!player)return freeze({type:'player',id:String(id||''),exists:false,available:false,status:'missing',reason:'Player does not exist in the active snapshot.'});
    const unavailable=['retired','released','free-agent','unassigned'].includes(String(player.rosterStatus||'').toLowerCase());
    return freeze({type:'player',id:player.id,exists:true,available:!unavailable,teamId:player.teamId||null,name:player.name,position:player.position,overall:player.overall,rosterStatus:player.rosterStatus,injuryStatus:player.injuryStatus,status:unavailable?'unavailable':'available',reason:unavailable?'Player is not assigned to an active roster.':null,source:currentSource()});
  }
  function resolvePick(input){
    const pick=normalizePick(input);const valid=!!pick.teamId&&pick.year>0&&pick.round>=1&&pick.round<=7;
    return freeze({...pick,exists:valid,available:valid,status:valid?'available':'invalid',reason:valid?null:'Draft pick metadata is incomplete.',source:currentSource()});
  }
  function resolve(asset){if(!asset)return freeze({exists:false,available:false,status:'missing',reason:'Asset is missing.'});return asset.type==='player'?resolvePlayer(asset.id):resolvePick(asset)}
  function resolveMany(assets=[]){return freeze((Array.isArray(assets)?assets:[]).map(resolve))}
  function verifyOwnership(asset,teamId){const r=resolve(asset);return freeze({...r,expectedTeamId:String(teamId||''),ownershipValid:r.type==='pick'?r.teamId===String(teamId||''):r.teamId===String(teamId||''),available:Boolean(r.available&&(r.type==='pick'?r.teamId===String(teamId||''):r.teamId===String(teamId||'')))})}
  function validateTransfers(transfers=[]){
    const rows=(Array.isArray(transfers)?transfers:[]).map(t=>{const r=verifyOwnership(t.asset,t.fromTeamId);return freeze({...t,resolution:r,valid:Boolean(t.fromTeamId&&t.toTeamId&&t.fromTeamId!==t.toTeamId&&r.available)})});
    const issues=[];const keys=new Set();rows.forEach((row,i)=>{const key=row.asset?.type==='player'?`player:${row.asset.id}`:`pick:${row.asset?.teamId}:${row.asset?.year}:${row.asset?.round}`;if(keys.has(key))issues.push({index:i,code:'duplicate-asset',message:'The same asset appears more than once.'});keys.add(key);if(!row.valid)issues.push({index:i,code:'invalid-transfer',message:row.resolution?.reason||'Asset cannot be transferred by this team.'})});
    return freeze({valid:issues.length===0&&rows.length>0,transfers:rows,issues});
  }
  const service=freeze({version:'5.7.0',resolve,resolvePlayer,resolvePick,resolveMany,verifyOwnership,validateTransfers,diagnostics(){const source=currentSource();return freeze({service:'trade-assets',version:'5.7.0',sourceMode:source.mode||'empty',rosterService:Boolean(roster()),healthy:Boolean(roster()&&HQ.leagueData)})}});
  HQ.defineModuleService('league','tradeAssets',service,{alias:'tradeAssets',replace:true});
})(window);
