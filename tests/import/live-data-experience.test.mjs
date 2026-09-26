import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  MADDEN_RATING_FIELDS,
  freeAgentStateFromMappingRun,
  inferMaddenContractUnit,
  safeAbilityValues,
  safeRatingValues,
  sourceRosterStatus,
  sourceSupportedContract
} from '../../functions/_lib/live-data-experience.js';
import { normalizePlayer, normalizeStanding, normalizeTeam } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';

async function sourceLifecycleFixture(){
  const listeners=new Map(),requests=[],stored=new Map();
  let tenant={id:'route-placeholder',slug:'league-a',serverResolved:false};
  const HQ={leagueTenant:{current:()=>tenant,getCurrentLeague:()=>tenant},
    defineModuleService(_module,name,service,options){HQ[options?.alias||name]=service;return service;},
    leagueSchema:{emptySnapshot:()=>({source:{},teams:[],players:[],games:[],stats:[]})},leagueMockAdapter:{},
    storage:{diagnostics:()=>({localAvailable:true}),get:key=>stored.get(key),set:(key,value)=>{stored.set(key,value);return true;}},
    appRouter:{render(){}},events:{emit(){}}};
  const context={URL,console,structuredClone,Date,Map,setTimeout,clearTimeout,
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    location:{origin:'https://example.test',pathname:'/leagues/league-a',hash:'#commissioner'},
    document:{readyState:'loading',addEventListener(){},querySelector:()=>null},
    sessionStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
    window:{FranchiseHQ:HQ,localStorage:{getItem:()=>null},addEventListener(name,fn){listeners.set(name,[...(listeners.get(name)||[]),fn]);},
      dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}},
    fetch:url=>new Promise(resolve=>requests.push({url,resolve:payload=>resolve({ok:true,json:async()=>payload})}))};
  for(const file of ['repository','data-state','live-read-model','live-snapshot-boot']){
    runInNewContext(await readFile(new URL(`../../league-engine/${file}.js`,import.meta.url),'utf8'),context);
  }
  return {HQ,requests,resolveTenant(next){tenant=next;context.window.dispatchEvent(new context.CustomEvent('franchisehq:league-tenant-changed'));},
    summary:(id='snapshot-a',slug='league-a',leagueId='tenant-a')=>({state:'live',league:{id:leagueId,slug},snapshot:{id,seasonYear:2027,weekIndex:8},domains:{teams:32,statistics:878}})};
}

test('Madden Data becomes selectable after tenant resolution interrupts startup and concurrent refreshes',async()=>{
  const f=await sourceLifecycleFixture();
  assert.equal(f.HQ.leagueData.status().hasLiveSnapshot,false);
  f.resolveTenant({id:'tenant-a',slug:'league-a',serverResolved:true});
  const other=f.HQ.liveData.refresh();
  assert.equal(f.requests.length,2,'same-tenant startup and page refresh share one request');
  f.requests[0].resolve(f.summary('stale-placeholder'));
  f.requests[1].resolve(f.summary());
  await other;await f.HQ.liveSnapshotBoot.boot();
  assert.equal(f.HQ.leagueData.status().hasLiveSnapshot,true);
  assert.equal(f.HQ.leagueData.status().activeMode,'live');
  assert.equal(f.HQ.leagueRepository.current().source.snapshotId,'snapshot-a');
});

test('source recovery preserves explicit source choices and excludes late responses from another tenant',async()=>{
  const f=await sourceLifecycleFixture();
  f.resolveTenant({id:'tenant-a',slug:'league-a',serverResolved:true});
  const first=f.HQ.liveData.refresh();f.requests[1].resolve(f.summary());await first;
  f.HQ.leagueData.setMode('empty');
  const refresh=f.HQ.liveData.refresh();f.requests[2].resolve(f.summary());await refresh;
  assert.equal(f.HQ.leagueData.status().activeMode,'empty','an explicit No Data choice is preserved');
  assert.equal(f.HQ.leagueData.status().hasLiveSnapshot,true,'Madden Data remains selectable');
  f.HQ.leagueData.setMode('live');
  const pending=f.HQ.liveData.refresh();const rejected=assert.rejects(pending,/Live data changed/);
  f.resolveTenant({id:'tenant-b',slug:'league-b',serverResolved:true});
  const latest=f.HQ.liveData.refresh();
  f.requests[4].resolve(f.summary('snapshot-b','league-b','tenant-b'));await latest;
  f.requests[3].resolve(f.summary('late-a'));f.requests[0].resolve(f.summary('placeholder-a'));await rejected;
  assert.equal(f.HQ.leagueRepository.current().source.snapshotId,'snapshot-b');
  assert.equal(f.HQ.leagueData.status().activeMode,'live');
  assert.equal(f.HQ.leagueData.status().leagueId,'tenant-b');
});

test('a successful later refresh restores a failed startup and a failed refresh preserves Madden Data',async()=>{
  const f=await sourceLifecycleFixture();
  f.resolveTenant({id:'tenant-a',slug:'league-a',serverResolved:true});
  const first=f.HQ.liveSnapshotBoot.boot();
  const failed=assert.rejects(first,/temporary outage/);
  f.requests[1].resolve({ok:false,error:'temporary outage'});await failed;
  assert.equal(f.HQ.leagueData.status().hasLiveSnapshot,false);
  const recovery=f.HQ.liveData.refresh();f.requests[2].resolve(f.summary());await recovery;
  assert.equal(f.HQ.leagueData.status().activeMode,'live');
  const newer=f.HQ.liveData.refresh();const snapshotRead=f.HQ.liveData.getSnapshot();
  f.requests[3].resolve(f.summary('snapshot-new'));await newer;
  assert.equal((await snapshotRead).id,'snapshot-new','reads wait for the current refresh instead of mixing snapshots');
  const again=f.HQ.liveData.refresh();const failedAgain=assert.rejects(again,/temporary outage/);
  f.requests[4].resolve({ok:false,error:'temporary outage'});await failedAgain;
  assert.equal(f.HQ.leagueData.status().hasLiveSnapshot,true);
  assert.equal(f.HQ.leagueData.status().activeMode,'live');
  assert.equal((await f.HQ.liveData.getSnapshot()).id,'snapshot-new');
  f.requests[0].resolve(f.summary('old-placeholder'));
});

async function liveCacheFixture(){
  const listeners=new Map(),stored=new Map(),events=[];
  let service, snapshot='week6', delayed=null, slug='league-a';
  const context={URL,Date,Map,console,location:{origin:'https://example.test'},setTimeout:()=>{},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    document:{readyState:'loading',addEventListener(){},querySelector(){return null;}},
    sessionStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
    window:{FranchiseHQ:{leagueTenant:{getCurrentLeague:()=>({slug})},defineModuleService(_module,_name,value){service=value;}},
      addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>events.push(event)},
    fetch:async url=>{
      const payload=new URL(url).searchParams.has('domain')?{records:[{week:snapshot}]}:{snapshot:{id:snapshot},state:'live'};
      if(delayed&&new URL(url).searchParams.has('domain')){const wait=delayed;delayed=null;await wait;}
      return {ok:true,json:async()=>payload};
    }};
  runInNewContext(await readFile(new URL('../../league-engine/live-read-model.js',import.meta.url),'utf8'),context);
  return {service,events,stored,setSnapshot:value=>{snapshot=value;},delay:value=>{delayed=value;},changeTenant:value=>{slug=value;listeners.get('franchisehq:league-tenant-changed')();}};
}

test('active snapshot refresh replaces cached statistics and rejects an older pending read',async()=>{
  const f=await liveCacheFixture();
  await f.service.refresh();
  assert.equal((await f.service.getStatistics())[0].week,'week6');
  f.setSnapshot('week7');
  await f.service.refresh();
  let release;
  f.delay(new Promise(resolve=>{release=resolve;}));
  const old=f.service.getStatistics();
  const rejected=assert.rejects(old,/Live data changed/);
  await new Promise(resolve=>setImmediate(resolve));
  f.setSnapshot('week8');
  await f.service.refresh();
  assert.equal((await f.service.getStatistics())[0].week,'week8');
  release();await rejected;
  assert.equal((await f.service.getStatistics())[0].week,'week8');
  assert.equal(f.events.at(-1).detail.snapshotId,'week8');
  assert.equal([...f.stored.keys()].some(key=>key.includes(':week7:statistics')),false);
});

test('tenant change cannot install statistics from the previous league',async()=>{
  const f=await liveCacheFixture();
  await f.service.refresh();
  let release;f.delay(new Promise(resolve=>{release=resolve;}));
  const rejected=assert.rejects(f.service.getStatistics(),/Live data changed/);
  await new Promise(resolve=>setImmediate(resolve));
  f.changeTenant('league-b');f.setSnapshot('league-b-week8');
  await f.service.refresh();release();await rejected;
  assert.equal((await f.service.getStatistics())[0].week,'league-b-week8');
});

test('game and player statistics refresh on snapshot change without reloading the page',async()=>{
  const app=await readFile(new URL('../../app.js',import.meta.url),'utf8');
  const listeners=new Map();let rows=[{week:6}],pending=null;
  const context={window:{addEventListener:(name,fn)=>listeners.set(name,fn)},document:{querySelector:()=>null},
    playerStatisticsState:{loaded:false,rows:[],revision:0,snapshotId:null},
    liveReadModel:()=>({getStatistics:async()=>{if(pending){const promise=pending;pending=null;return promise;}return rows;}}),
    matchupCompactModelCache:new Map(),matchupTeamStatsCache:new Map(),matchupPanelCache:new Map(),
    rerenderPlayerStatHosts(){},refreshOpenPlayerGameLogs(){},rebuildCanonicalStatisticsIndexCooperative(){},activeMatchupGame:null};
  runInNewContext(app.slice(app.indexOf('  async function hydratePlayerStatistics('),app.indexOf('  function renderLivePlayerStatistics(')),context);
  const refresh=listeners.get('franchisehq:live-read-refreshed');
  await refresh({detail:{snapshotId:'week6'}});
  for(const key of ['matchupCompactModelCache','matchupTeamStatsCache','matchupPanelCache'])context[key].set('game8','No statistics');
  let release;pending=new Promise(resolve=>{release=resolve;});
  const old=refresh({detail:{snapshotId:'week7'}});
  rows=[{week:7},{week:8}];
  await refresh({detail:{snapshotId:'week8'}});
  release([{week:6}]);await old;
  assert.equal(context.playerStatisticsState.rows.at(-1).week,8);
  assert.equal(context.playerStatisticsState.loaded,true);
  for(const key of ['matchupCompactModelCache','matchupTeamStatsCache','matchupPanelCache'])assert.equal(context[key].size,0);
  const panel={innerHTML:''};
  const modal={querySelector:selector=>selector==='[data-matchup-tab-content]'?panel:{dataset:{matchupTab:'player'}}};
  context.document.querySelector=()=>modal;
  context.activeMatchupGame={id:'game8'};
  context.hydrateMatchupTeamStatistics=async()=>{};
  context.matchupPanelCacheKey=()=> 'game8:player';
  context.prepareMatchupRuntime=()=>context.matchupPanelCache.set('game8:player',`Updated Week ${context.playerStatisticsState.rows.at(-1).week}`);
  rows=[{week:8},{week:9}];
  await refresh({detail:{snapshotId:'week9'}});
  assert.equal(panel.innerHTML,'Updated Week 9','the already open Player Stats tab updates too');
});

test('all source-supported Madden ratings survive the member read model and unknown fields do not', () => {
  const source=Object.fromEntries(MADDEN_RATING_FIELDS.map((field,index)=>[field,45+(index%55)]));
  source.internalScoutingGrade=99;
  source.invalidRating=101;
  const ratings=safeRatingValues(source);
  assert.equal(Object.keys(ratings).length,MADDEN_RATING_FIELDS.length);
  assert.deepEqual(Object.keys(ratings),[...MADDEN_RATING_FIELDS]);
  assert.equal('internalScoutingGrade' in ratings,false);
});

test('public ability DTO retains display facts and excludes internal Madden identifiers', () => {
  const abilities=safeAbilityValues({signatureSlotList:[{
    isEmpty:false,locked:false,ovrThreshold:85,
    signatureAbility:{signatureTitle:'Deep Out Elite',signatureDescription:'Improved catching on deep outside passes.',rank:2,isUnlocked:true,abilityGUID:'private-guid',activationId:'private-id'}
  }]});
  assert.deepEqual(abilities,[{title:'Deep Out Elite',description:'Improved catching on deep outside passes.',rank:'2',threshold:85,unlocked:true}]);
  assert.equal(JSON.stringify(abilities).includes('private-guid'),false);
  assert.equal(JSON.stringify(abilities).includes('activationId'),false);
});

test('contract DTO uses documented Madden units and does not manufacture current-year splits', () => {
  const contract=sourceSupportedContract({contractYearsLeft:3,contractLength:5,contractSalary:72500000,contractBonus:18000000,sourceCapHit:14350,capReleaseNetSavings:5150,capReleasePenalty:9200});
  assert.equal(contract.yearsRemaining,3);
  assert.equal(contract.length,5);
  assert.equal(contract.totalSalary,72500000);
  assert.equal(contract.totalBonus,18000000);
  assert.equal(contract.capHit,14350000);
  assert.equal(contract.releaseNetSavings,5150000);
  assert.equal(contract.releasePenalty,9200000);
  assert.equal(contract.currentYearSalary,null);
  assert.equal(contract.currentYearBonus,null);
  const retainedCanonicalConflict=sourceSupportedContract({
    contract_years_remaining:6,contractYearsLeft:5,contractLength:6
  });
  assert.equal(retainedCanonicalConflict.yearsRemaining,5);
  assert.equal(retainedCanonicalConflict.length,6);
  const retainedMadden27=sourceSupportedContract({capHit:3997,capReleaseNetSavings:10000000,capReleasePenalty:10651});
  assert.equal(retainedMadden27.capHit,39970000);
  assert.equal(retainedMadden27.releaseNetSavings,10000000);
  assert.equal(retainedMadden27.releasePenalty,106510000);
  assert.equal(retainedMadden27.sourceUnits.capHit,'madden-ten-thousands');
  assert.equal(retainedMadden27.sourceUnits.releasePenalty,'madden-ten-thousands');
});

test('contract currency units are format-derived and impose no cap-hit ceiling', () => {
  const retainedBosa={capHit:5485,capReleasePenalty:2218,capReleaseNetSavings:32670000};
  assert.equal(inferMaddenContractUnit([retainedBosa]),'madden-ten-thousands');
  assert.equal(sourceSupportedContract(retainedBosa).capHit,54850000);
  assert.equal(sourceSupportedContract({...retainedBosa,capHit:10000,capReleasePenalty:6733}).capHit,100000000);
  assert.equal(sourceSupportedContract({...retainedBosa,capHit:25000,capReleasePenalty:21733}).capHit,250000000);

  const legacy={sourceCapHit:14350,capReleasePenalty:9200,capReleaseNetSavings:5150};
  assert.equal(inferMaddenContractUnit([legacy]),'madden-thousands');
  assert.equal(sourceSupportedContract(legacy).capHit,14350000);
  assert.equal(inferMaddenContractUnit([retainedBosa,legacy]),null);
});

test('roster state is source-derived for active, injured reserve, practice squad, and Free Agents', () => {
  assert.equal(sourceRosterStatus({},'team-1'),'active');
  assert.equal(sourceRosterStatus({isOnIR:true},'team-1'),'injured-reserve');
  assert.equal(sourceRosterStatus({isOnPracticeSquad:true},'team-1'),'practice-squad');
  assert.equal(sourceRosterStatus({isFreeAgent:true},''),'free-agent');
});

test('blocked Free Agents remain unknown and only an unblocked explicit zero is empty-confirmed', () => {
  const blocked=freeAgentStateFromMappingRun({free_agent_count:0,warnings_json:JSON.stringify(['Player mapper reported 1 warning.','Free Agent roster was captured but is blocked: Export error: Failed to retrieve team roster.'])});
  assert.equal(blocked.status,'blocked');
  assert.equal(blocked.count,null);
  assert.equal(blocked.interpretedAsZero,false);
  assert.match(blocked.reason,/Free Agent roster/i);
  const empty=freeAgentStateFromMappingRun({free_agent_count:0,warnings_json:'[]'});
  assert.equal(empty.status,'empty-confirmed');
  assert.equal(empty.count,0);
});

test('normalized player exposes every approved rating, ability, contract, and source roster state without raw export fields', () => {
  const sourceRatings=Object.fromEntries(MADDEN_RATING_FIELDS.map(field=>[field,88]));
  const player=normalizePlayer({
    external_id:'player-27',team_external_id:'team-27',display_name:'Source Player',position:'WR',overall:91,
    height_inches:76,weight_lbs:218,
    source_record_json:JSON.stringify({...sourceRatings,contractYearsLeft:2,contractLength:4,contractSalary:48000000,contractBonus:12000000,capHit:8750,franchiseHqContractUnit:'madden-thousands',isOnIR:true,privateExportToken:'secret',signatureSlotList:[{isEmpty:false,locked:false,ovrThreshold:90,signatureAbility:{signatureTitle:'Route Technician',signatureDescription:'Sharper cuts.',rank:1,isUnlocked:true,abilityGUID:'hidden'}}]})
  });
  assert.equal(Object.keys(player.ratings).length,MADDEN_RATING_FIELDS.length);
  assert.equal(player.abilities[0].title,'Route Technician');
  assert.equal(player.contract.capHit,8750000);
  assert.equal(player.contract.currentYearSalary,null);
  assert.equal(player.rosterStatus,'injured-reserve');
  assert.equal(player.heightInches,76);
  assert.equal(player.weightLbs,218);
  assert.equal(JSON.stringify(player).includes('privateExportToken'),false);
  assert.equal(JSON.stringify(player).includes('abilityGUID'),false);
});

test('retained Madden team cap space survives both team and standing read-model paths', () => {
  const team=normalizeTeam({
    external_id:'team-27',display_name:'Baltimore Ravens',
    source_record_json:JSON.stringify({record:{capRoom:43.75}})
  });
  const standing=normalizeStanding({
    team_id:'team-27',team_name:'Baltimore Ravens',
    source_record_json:JSON.stringify({record:{salaryCapRoom:51250000}})
  });
  assert.equal(team.source.capAvailable,43.75);
  assert.equal(standing.source.capAvailable,51250000);
});

test('browser and endpoint source contracts keep Free Agents unknown without platform callout clutter', async () => {
  const [app,endpoint,readModel,styles]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/players/free-agents.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js',import.meta.url),'utf8'),
    readFile(new URL('../../styles.css',import.meta.url),'utf8')
  ]);
  assert.equal(app.includes('/players/free-agents'),false);
  assert.deepEqual(MADDEN_RATING_FIELDS.filter(field=>!app.includes(field)),[]);
  assert.equal(app.includes('filtered.slice(0,500)'),false);
  assert.ok(app.includes('data-player-pagination'));
  assert.ok(app.includes('Free Agent data is unavailable'));
  assert.equal(app.includes('This is not zero.'),false);
  assert.equal(app.includes('renderLiveDataStatus'),false);
  assert.equal(app.includes('data-live-source-status'),false);
  assert.equal(app.includes('active snapshot players'),false);
  assert.ok(app.includes("if(liveTeamDirectory?.snapshot) return null"));
  assert.ok(endpoint.includes("mode:'active-snapshot'"));
  assert.equal(endpoint.includes('COMPANION_EXPORTS'),false);
  assert.equal(endpoint.includes('companion_route_captures'),false);
  assert.ok(readModel.includes('freeAgents'));
  assert.ok(readModel.includes('integrity'));
  assert.match(readModel,/retained\.capRoom/);
  assert.match(readModel,/capAvailable:numeric/);
  assert.ok(styles.includes('FranchiseHQ 7.3.6 — authoritative live-data experience'));
  assert.equal(styles.includes('.live-source-status'),false);
  assert.equal(styles.includes('.free-agent-source-state'),false);
  assert.ok(styles.includes("wrapper.dataset.verticalScroll='page'")||app.includes("wrapper.dataset.verticalScroll='page'"));
});

test('Production player-card and Trade Center adapters preserve ratings and contract units', async () => {
  const appSource = await readFile(new URL('../../app.js',import.meta.url),'utf8');
  assert.match(appSource, /ratings:\{\.\.\.\(player\?\.ratings\|\|raw\.ratings\|\|\{\}\),\.\.\.corePlayerRatings\(raw,player\?\.ratings\|\|raw\.ratings\|\|\{\}\)\}/);
  assert.match(appSource, /function tradeCalculatorMillions\(value\)/);
  assert.match(appSource, /salary:tradeCalculatorMillions\(view\.salary\)/);
  assert.match(appSource, /capHit:tradeCalculatorMillions\(view\.capHit\)/);
  assert.match(appSource, /salary:tradeCalculatorMillions\(player\.salary\)/);
  assert.match(appSource, /capHit:tradeCalculatorMillions\(player\.capHit\)/);
  assert.match(appSource, /franchisehq:trade-live-cache:v2/);
  assert.match(appSource, /function seasonTeamStatRows\(\)[\s\S]*const additiveFields=new Set\(/);
  assert.match(appSource, /current\.raw\[field\]=Number\(current\.raw\[field\]\|\|0\)\+value/);
  assert.doesNotMatch(appSource, /Madden team records are season-to-date snapshots/);
});

test('global league shell is hydrated from league data without platform implementation callouts', async () => {
  const [appSource,indexSource] = await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../index.html',import.meta.url),'utf8')
  ]);
  assert.match(indexSource, /data-active-league-context>Loading league data/);
  assert.match(indexSource, /data-live-week-chip/);
  assert.doesNotMatch(indexSource, /controlled-beta-notice|Controlled beta|Powered by the active Madden snapshot/);
  assert.doesNotMatch(indexSource, /Season 4 · Week 8 · Mock Data/);
  assert.match(appSource, /applyActiveSnapshotShell\(snapshotValue,currentContext\)/);
  assert.doesNotMatch(appSource, /Live Madden Data|Active Madden 27 snapshot/);
});
