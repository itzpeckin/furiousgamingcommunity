import { resolveTenant } from './tenant-context.js';
import { canonicalLeagueContext } from './league-context.js';
import { normalizeTeam,normalizePlayer,normalizeGame,normalizeStatisticCompact,normalizeStanding } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';
import { gameplayRulesFromDocument,GAMEPLAY_STATS,ABILITY_POSITIONS,abilityPositionWeights } from './gameplay-rules.js';
import { normalizeTradeCenterSettings } from './trade-center.js';
import { findTeamBranding } from './team-branding.js';
import { LOADOUT_CATALOG } from './loadout-catalog.js';
import { DEMO_ID,DEMO_SLUG,DEMO_REVISION,DEMO_DATE,DEMO_LEAGUE,buildDemoLeagueData } from './demo-league-data.js';

export function isPublicDemoTenant(tenant){
  return tenant?.id===DEMO_ID && tenant?.slug===DEMO_SLUG && tenant?.enabled===true
    && tenant?.configuration?.publicDemo===true;
}
let cachedModel;
function demoModel(){
if(cachedModel)return cachedModel;
const raw=buildDemoLeagueData();
const teams=raw.teams.map(t=>({...normalizeTeam({...t,logo_url:findTeamBranding(t)?.logoUrl}),owner:t.demoOwner,ownerRole:t.teamId==='dal'?'commissioner':'team_owner',teamKey:t.teamId}));
const players=raw.players.map(p=>normalizePlayer(p,p.publicId));
const games=raw.games.map(normalizeGame);
const domains={teams,players,games,statistics:raw.statistics.map(normalizeStatisticCompact),standings:raw.standings.map(normalizeStanding)};
const counts=Object.fromEntries(Object.entries(domains).map(([key,value])=>[key,value.length]));
const context=canonicalLeagueContext(DEMO_LEAGUE,{id:DEMO_REVISION,season_year:2027,week_index:8,manifest:{currentPeriod:{stage:'regular-season',week:8}}});
const dataStatus={code:'live',tone:'accent',available:true,stale:false,incomplete:false,label:'Demo data',message:'Fictional league data. Explore every page; changes are disabled.'};
const snapshot={id:DEMO_REVISION,status:'active',seasonYear:2027,weekIndex:8,currentPeriod:{stage:'regular-season',week:8},activatedAt:DEMO_DATE,createdAt:DEMO_DATE,validationStatus:'passed',validationScore:100,canonicalContext:context,dataStatus};
const summary={ok:true,publicDemo:true,readOnly:true,state:'live',league:DEMO_LEAGUE,snapshot,context,dataStatus,domains:counts,rosteredPlayers:players.length,freeAgents:{status:'ready',count:0,reason:null,interpretedAsZero:false,authority:'demo',sourceSnapshotId:DEMO_REVISION},integrity:{status:'passed',score:100,errorCount:0,warningCount:0,warnings:[]},cache:{policy:'client-memory',key:DEMO_REVISION}};
const features=['trade_center','trade_block','confidence_pool','game_of_the_week'].map(featureKey=>({featureKey,enabled:true,configuration:{}}));
const publicTeams=teams.map(t=>({...t,externalId:t.id,teamKey:t.id,abbreviation:t.abbreviation,displayName:t.displayName,owner:{displayName:t.owner},capSpace:raw.teams.find(r=>r.teamId===t.id).capAvailable}));
const settings=normalizeTradeCenterSettings({});
const gameplayRules=gameplayRulesFromDocument({},DEMO_ID);
const rules={categories:[
  {id:'demo-scheduling',title:'Scheduling & advances',rules:[{id:'schedule',title:'Schedule early',body:'Contact your opponent within 24 hours of an advance. Use your matchup thread to agree on a time.',enabled:true,media:[]},{id:'advance',title:'48-hour advances',body:'Finish games within the advance window. Contact a commissioner when you need help scheduling.',enabled:true,media:[]}]},
  {id:'demo-gameplay',title:'On the field',rules:[{id:'sportsmanship',title:'Keep it competitive',body:'Respect opponents, vary your play calls, and play through the final whistle.',enabled:true,media:[]}]},
  {id:'demo-trades',title:'Roster & trades',rules:[{id:'review',title:'Use the Trade Center',body:'All trades go through the Trade Center and committee review before players change teams.',enabled:true,media:[]}]}
]};
const posts=[
  {id:'demo-news-1',category:'Commissioner',title:'Welcome to Week 8',summary:'The playoff race is taking shape. Explore matchups, player leaders, and the latest trades.',body:'This is FHQ Demo League: a fictional season in the same platform your league uses. Browse all 32 teams, compare players, open a game recap, and explore Commish HQ. Every name, result, statistic, and league activity here is sample data.',publishedAt:DEMO_DATE,author:{displayName:'Demo Commissioner'}},
  {id:'demo-news-2',category:'Power Rankings',title:'Contenders separate from the pack',summary:'Seven weeks in, close division races are creating must-watch matchups.',body:'A strong defense and consistent quarterback play have led the early contenders. Open Standings to compare every division and visit Stats & Leaders for the individual performances driving this fictional season.',publishedAt:DEMO_DATE,author:{displayName:'Demo Newsroom'}},
  {id:'demo-news-3',category:'Trades',title:'A busy week in the Trade Center',summary:'Teams are adding depth ahead of the second half of the season.',body:'Explore sample negotiations, committee reviews, approved deals, and the league trade block in the real Trade Center.',publishedAt:DEMO_DATE,author:{displayName:'Demo Newsroom'}}
];
const picks=teams.flatMap((team,index)=>[2028,2029,2030].flatMap(year=>Array.from({length:7},(_,round)=>({id:`demo-pick-${team.id}-${year}-${round+1}`,draftClass:year,round:round+1,originalTeamKey:team.id,currentTeamKey:team.id,projectedPick:round*32+index+1,source:'demo'}))));
const workflows=['negotiating','committee','approved','rejected','approved'].map((status,index)=>{
  const from=index<2?'dal':teams[index].id,to=teams[index+7].id;
  const p=players.find(p=>p.teamId===from&&p.position==='WR');
  const pick=picks.find(p=>p.currentTeamKey===to&&p.draftClass===2028&&p.round===2);
  return {id:`demo-trade-${index+1}`,status,revision:1,proposerTeamKey:from,franchiseSeasonId:'demo-season-2027',note:'Fictional sample trade: receiver depth for a future draft pick.',freeTrade:false,reviewThreshold:2,createdAt:DEMO_DATE,updatedAt:DEMO_DATE,approvedAt:status==='approved'?DEMO_DATE:null,
    participants:[{teamKey:from,acceptedRevision:1,acceptedAt:DEMO_DATE},{teamKey:to,acceptedRevision:status==='negotiating'?null:1,acceptedAt:status==='negotiating'?null:DEMO_DATE}],
    assets:[{assetType:'player',playerIdentityId:p.id,playerPublicId:p.publicId,playerName:p.displayName,fromTeamKey:from,toTeamKey:to,player:p},{assetType:'pick',draftPickId:pick.id,fromTeamKey:to,toTeamKey:from}],
    messages:[{id:`demo-message-${index}`,displayName:'Demo GM',body:'Looking for a receiver to help our playoff push.',createdAt:DEMO_DATE}],reviews:[],review:{result:status==='approved'?'approved':'pending',approvals:status==='approved'?2:0,rejections:0,threshold:2}};
});
const transactions=workflows.filter(w=>w.status==='approved').map((w,index)=>{
  const asset=w.assets.find(a=>a.assetType==='player'),p=players.find(p=>p.id===asset.playerIdentityId);
  const move={playerId:p.id,playerName:p.displayName,fromTeamId:asset.fromTeamKey,toTeamId:asset.toTeamKey,position:p.position,overall:p.overall};
  return {id:`demo-transaction-${index+1}`,eventType:'trade',status:'confirmed',authority:'trade-center',executionStatus:'approved',season:2027,week:7,occurredAt:DEMO_DATE,teamIds:w.participants.map(p=>p.teamKey),playerIds:[p.id],workflowTradeId:w.id,permanentHref:`/leagues/demo#transactions/demo-transaction-${index+1}`,details:{},participants:[{id:p.id,name:p.displayName,position:p.position,overall:p.overall}],evidence:[{sourceType:'workflow',evidence:{moves:[move]}}],sourceTypes:['workflow'],sourceCount:1,corrected:false,corrections:[]};
});
cachedModel={raw,teams,players,games,domains,counts,snapshot,summary,features,publicTeams,settings,gameplayRules,rules,posts,picks,workflows,transactions};
return cachedModel;
}

function response(payload,status=200,method='GET'){
  return new Response(method==='HEAD'?null:JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-fhq-public-demo':DEMO_REVISION}});
}
export function publicDemoRoute(request){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/leagues\/([^/]+)(?:\/(.*))?$/i);
  let slug;try{slug=decodeURIComponent(match?.[1]||'').toLowerCase();}catch{return null;}
  if(slug===DEMO_SLUG)return {resource:(match[2]||'').replace(/\/$/,''),url};
  if(url.pathname==='/api/auth/me'&&url.searchParams.get('league')?.toLowerCase()===DEMO_SLUG)return {resource:'auth',url};
  return null;
}

// The dedicated demo data provider implements the application's existing read
// contracts. No anonymous visitor is granted a session or commissioner role,
// and no request is forwarded to customer data or operational handlers.
export async function publicDemoResponse(c){
  const route=publicDemoRoute(c.request);if(!route)return null;
  const method=c.request.method.toUpperCase();
  if(!['GET','HEAD'].includes(method))return response({ok:false,code:'DEMO_READ_ONLY',error:'This public demo is view only. League changes are disabled.'},403,method);
  const tenant=await resolveTenant(c.env,DEMO_SLUG);
  if(!isPublicDemoTenant(tenant))return response({ok:false,error:'Demo league is unavailable.'},404,method);
  const {raw,teams,players,games,domains,counts,snapshot,summary,features,publicTeams,settings,gameplayRules,rules,posts,picks,workflows,transactions}=demoModel();
  const {resource,url}=route;let payload=null;
  if(resource==='auth')payload={ok:true,authenticated:false,publicDemo:true,readOnly:true,user:null,membership:null,capabilities:[]};
  else if(!resource)payload={ok:true,publicDemo:true,tenant:{...DEMO_LEAGUE,status:'enabled',branding:tenant.branding,features:Object.fromEntries(features.map(f=>[f.featureKey,f])),domains:[],dataState:'live',counts,activeSnapshot:snapshot,publicDemo:true,canonicalPath:'/leagues/demo'},isolation:{leagueId:DEMO_ID,sharedSnapshot:false,sharedPlayerPool:false}};
  else if(resource==='snapshot/read-model'){
    const domain=url.searchParams.get('domain'),records=Object.hasOwn(domains,domain)?domains[domain]:null;
    if(records){
      const limit=Math.max(25,Math.min(500,Number(url.searchParams.get('limit'))||150));
      const cursor=url.searchParams.get('cursor')||'0';
      if(!/^\d{1,6}$/.test(cursor))return response({ok:false,error:'Invalid cursor.'},400,method);
      const offset=Number(cursor),page=records.slice(offset,offset+limit);
      payload={...summary,domain,records:page,nextCursor:offset+limit<records.length?String(offset+limit):null,complete:offset+limit>=records.length,pageSize:limit};
    }else payload={...summary,...(Object.hasOwn(domains,url.searchParams.get('sample'))?{sample:{domain:url.searchParams.get('sample'),record:domains[url.searchParams.get('sample')][0]}}:{})};
  }else if(resource==='news')payload={ok:true,posts};
  else if(resource==='rules')payload={ok:true,rules,workspace:{draft:rules,revision:1,dirty:false,updatedAt:DEMO_DATE},publication:{revision:1,publishedAt:DEMO_DATE},gameplaySummary:[],updatedAt:DEMO_DATE};
  else if(resource==='commissioner-hq')payload={ok:true,league:{...DEMO_LEAGUE,currentSeason:2027,currentWeek:8},settings:{revision:1,updatedAt:DEMO_DATE},gameplayRules,gameplayStats:GAMEPLAY_STATS,abilityPositions:ABILITY_POSITIONS,abilityPositionWeights:abilityPositionWeights(gameplayRules.abilities),quickControls:{seasonTradeLimitEnabled:true,freeTradeDesignationEnabled:true,calculatorEnabled:true,confidencePool:true},memberships:{total:32,active:32,pending:0,unassigned:0,assigned:32,online:8,commissioners:1,committee:3},activeSnapshot:{snapshotId:DEMO_REVISION,activatedAt:DEMO_DATE,validationStatus:'passed',validationScore:100},transactionCount:2,features,rules:{workspaceRevision:1,publicationRevision:1,publishedAt:DEMO_DATE,dirty:false},settingHistory:[],audit:[{id:'demo-audit-1',action:'rules_published',actorDisplayName:'Demo Commissioner',createdAt:DEMO_DATE,detail:{summary:'Published the sample league rulebook.'}}],attention:[],operations:{status:'healthy',alerts:[],checks:[]}};
  else if(resource==='memberships')payload={ok:true,league:DEMO_LEAGUE,teams:publicTeams,memberships:teams.map((t,index)=>({id:`demo-member-${index}`,userId:`demo-gm-${index}`,displayName:t.owner,role:index===16?'commissioner':'team_owner',teamId:t.id,active:true,discordUsername:null,avatarUrl:null})),audit:[]};
  else if(resource==='trade-center')payload={ok:true,league:DEMO_LEAGUE,session:{userId:'demo-visitor',role:'demo_viewer',teamKey:'dal'},season:{id:'demo-season-2027',seasonYear:2027},settings:{...settings,revision:1},teams:publicTeams,picks,workflows,listings:players.filter(p=>p.position==='WR'&&p.depthOrder===1).slice(0,12).map(p=>({id:`demo-block-${p.id}`,teamKey:p.teamId,assetType:'player',playerIdentityId:p.id,playerPublicId:p.publicId,playerName:p.displayName,requestedReturn:'Draft picks or defensive depth',needs:['CB','DT'],updatedAt:DEMO_DATE})),teamNeeds:[],notifications:[],tradeManagement:null};
  else if(resource==='competition')payload={ok:true,context:{snapshotId:DEMO_REVISION,seasonYear:2027,weekIndex:8},features:{confidencePool:true,gameOfTheWeek:true},games:games.map(g=>({...g,weekIndex:g.week})),gotw:{'regular:8':games.find(g=>g.week===8).id},confidence:{season:'2027',status:'locked',openWeeks:[],weeks:[],entry:{userId:'anonymous',picks:{},submittedWeeks:{}},entries:{},entryCount:32,leaderboard:teams.slice(0,10).map((t,index)=>({userId:`demo-gm-${index}`,displayName:t.owner,points:380-index*12,correct:70-index*2,total:112,rank:index+1}))}};
  else if(resource==='companion/export-url')payload={ok:true,leagueSlug:DEMO_SLUG,endpoint:{exportUrl:null},latestExport:{status:'ready',importLive:true,importStatus:'live',receivedAt:DEMO_DATE,capturedWeek:8,activeSnapshotWeek:8,captureCount:36,counts:{...counts,rosteredPlayers:players.length,freeAgentStatus:'empty-confirmed',freeAgentCount:0},warnings:[]}};
  else if(resource==='companion/yearly-schedule')payload={ok:true,preparedSeason:{id:'demo-season-2027',seasonYear:2027,calendarYear:2027,status:'active'},yearlyScheduleImport:{id:'demo-schedule',status:'published',seasonYear:2027,gameCount:games.length},firstSeasonPreparation:null};
  else if(resource==='companion/candidate-import')payload={ok:true,league:DEMO_LEAGUE,activeSnapshotId:DEMO_REVISION,destination:{id:'demo-season-2027',seasonYear:2027},source:{counts},run:{id:'demo-import',status:'live',currentPhase:'complete',resultCounts:counts,activatedSnapshotId:DEMO_REVISION,updatedAt:DEMO_DATE}};
  else if(resource==='game-year-transition')payload={ok:true,league:DEMO_LEAGUE,transition:null,currentGameYear:{id:'demo-game-year',title:'Madden Demo',year:2027},franchiseSeasons:[{id:'demo-season-2027',seasonYear:2027}],confirmations:{}};
  else if(resource==='ea-direct/connection')payload={ok:true,configured:true,status:'connected',connection:{platform:'xbox',leagueName:'FHQ Demo League',personaName:'Demo Commissioner',connectedAt:DEMO_DATE},previewVerified:true,weeklyReady:true,message:'Sample connection — EA actions are disabled in this demo.'};
  else if(resource==='ea-direct/sync')payload={ok:true,job:null};
  else if(resource==='discord')payload={ok:true,league:DEMO_LEAGUE,installation:{status:'active',guildId:'demo-server',guildName:'FHQ Demo League',scheduleChannelId:'demo-schedule',tradeChannelId:'demo-trades',notificationChannelId:'demo-news',connectedAt:DEMO_DATE},channels:[{id:'demo-schedule',name:'matchups'},{id:'demo-trades',name:'trade-room'},{id:'demo-news',name:'league-news'}],roles:[],channelError:null,roleError:null,coaching:{enabled:true,banned:[],readerReady:true},loadouts:{enabled:true,banned:[],readerReady:true,banDuplicates:true},loadoutCatalog:LOADOUT_CATALOG,scheduleSync:{status:'complete',currentWeek:8,createdAt:DEMO_DATE},globalCommands:true,automaticConnection:true,connectUrl:null,endpoint:null};
  else if(resource.startsWith('players/')){
    const id=resource.slice(8),player=players.find(p=>p.publicId===id||p.id===id);
    if(player)payload={ok:true,league:DEMO_LEAGUE,canonicalPath:`/leagues/demo/players/${player.publicId}`,player:{...player,active:{present:true,teamSlug:player.teamId,position:player.position,overall:player.overall,rosterStatus:player.rosterStatus}},publicId:player.publicId,sourcePlayerId:player.id};
  }else if(resource==='ownership-career'){
    const ownerRows=teams.map((t,index)=>({rank:index+1,owner:{id:`demo-gm-${index}`,displayName:t.owner},totals:{teams:[{displayName:t.displayName}],wins:t.record.wins,losses:t.record.losses,ties:t.record.ties,winPercentage:(t.record.wins+t.record.ties/2)/7,regularWins:t.record.wins,regularLosses:t.record.losses,regularTies:t.record.ties,pointsFor:raw.teams[index].ptsFor,pointsAgainst:raw.teams[index].ptsAgainst,scoredGames:7,gameCount:7,playoffAppearances:0,superBowlChampionships:0}}));
    const teamKey=url.searchParams.get('teamKey')||url.searchParams.get('team')||url.searchParams.get('teamId'),index=teams.findIndex(t=>t.id===teamKey);
    payload=index<0?{ok:true,state:'ready',owners:ownerRows}:{ok:true,state:'ready',team:teams[index],owner:ownerRows[index].owner,career:{totals:ownerRows[index].totals,seasons:[{seasonYear:2027,...ownerRows[index].totals}]}};
  }else if(resource==='player-career')payload={ok:true,state:'ready',snapshotId:DEMO_REVISION,playerId:url.searchParams.get('playerId'),seasons:[],career:{seasons:[],totals:{}},coverage:{}};
  else if(resource==='transactions/canonical'){
    const id=url.searchParams.get('transactionId');
    payload={ok:true,permissions:{canCorrect:false},availableSeasons:[2027],transactions:id?transactions.filter(t=>t.id===id):transactions,total:transactions.length,nextCursor:null};
  }
  if(!payload)return response({ok:false,code:'DEMO_READ_ONLY',error:'This operational endpoint is disabled in the public demo.'},403,method);
  return response({...payload,publicDemo:true,readOnly:true},200,method);
}
