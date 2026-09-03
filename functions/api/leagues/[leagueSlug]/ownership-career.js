import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership, requireCommissioner } from '../../../_lib/permissions.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from '../../../_lib/league-teams.js';
import { buildGmSeasonSummaries, careerTotals } from '../../../_lib/gm-career.js';
import { currentFranchiseContext, ownershipChangeStatements } from '../../../_lib/ownership-periods.js';
import { createTenantAuditContext, writeTenantAuditEvent } from '../../../_lib/tenant-context.js';

const RELEASE='7.4.0.3';
const safeTeamKey=value=>/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(String(value||'').trim().toLowerCase());
const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};
const text=value=>value===null||value===undefined?'':String(value).trim();

async function access(context,commissioner=false){
  const authorization=await (commissioner?requireCommissioner(context):requireActiveMembership(context));
  if(!authorization.authorized)return{response:authorization.response};
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||authorization.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  return{db,league,authorization};
}

function sourceRecord(row={}){
  const raw=parse(row.data_json)||{};
  const nested=typeof raw.source_record_json==='string'?parse(raw.source_record_json):(raw.source_record_json||raw.source||null);
  return nested&&typeof nested==='object'?{...nested,...raw}:raw;
}

function gameValue(raw={},keys=[]){
  for(const key of keys)if(raw[key]!==undefined&&raw[key]!==null&&raw[key]!=='')return raw[key];
  return null;
}

async function activeCareerGames(db,leagueId,franchiseSeasonId,teams){
  const result=await db.prepare(`SELECT records.external_id,records.data_json
    FROM league_active_snapshots active
    JOIN league_snapshot_records records ON records.league_id=active.league_id AND records.snapshot_id=active.snapshot_id
    WHERE active.league_id=? AND records.domain='games' ORDER BY records.external_id`).bind(leagueId).all();
  return(result?.results||[]).map(row=>{
    const raw=sourceRecord(row);
    const homeExternal=text(gameValue(raw,['home_team_external_id','homeTeamId','home_team_id','homeId']));
    const awayExternal=text(gameValue(raw,['away_team_external_id','awayTeamId','away_team_id','awayId']));
    return{
      id:row.external_id,
      franchiseSeasonId,
      stage:text(gameValue(raw,['stage','stage_name','stageName','seasonStage'])),
      week:Number(gameValue(raw,['week_index','weekIndex','week']))||0,
      status:text(gameValue(raw,['status','game_status','gameStatus'])),
      homeTeamKey:resolveTeam(teams,homeExternal)?.teamKey||'',
      awayTeamKey:resolveTeam(teams,awayExternal)?.teamKey||'',
      homeScore:Number(gameValue(raw,['home_score','homeScore'])),
      awayScore:Number(gameValue(raw,['away_score','awayScore']))
    };
  });
}

function publicSeason(row={}){
  return{
    franchiseSeasonId:row.franchise_season_id,
    seasonYear:Number(row.season_year)||null,
    label:row.display_name||String(row.season_year||'Season'),
    teams:parse(row.teams_json)||[],
    regularWins:Number(row.regular_wins||0),regularLosses:Number(row.regular_losses||0),regularTies:Number(row.regular_ties||0),
    playoffWins:Number(row.playoff_wins||0),playoffLosses:Number(row.playoff_losses||0),playoffTies:Number(row.playoff_ties||0),
    playoffAppearance:Number(row.playoff_appearance||0),conferenceChampionships:Number(row.conference_championships||0),
    superBowlAppearances:Number(row.super_bowl_appearances||0),superBowlChampionships:Number(row.super_bowl_championships||0),
    gameCount:Number(row.game_count||0),frozen:Boolean(row.frozen_at)
  };
}

function emptyLiveSeason(identityId,franchiseSeasonId,teams=[]){
  return{gmIdentityId:identityId,franchiseSeasonId,teams:[...new Set(teams)],regularWins:0,regularLosses:0,regularTies:0,playoffWins:0,playoffLosses:0,playoffTies:0,playoffAppearance:0,conferenceChampionships:0,superBowlAppearances:0,superBowlChampionships:0,gameCount:0};
}

async function leagueCareerResponse(current,teams){
  const contextState=await currentFranchiseContext(current.db,current.league.id);
  const identityResult=await current.db.prepare(`SELECT id,public_id,display_name
    FROM gm_identities identity WHERE identity.league_id=? AND (
      EXISTS (SELECT 1 FROM team_ownership_periods period WHERE period.league_id=identity.league_id AND period.gm_identity_id=identity.id)
      OR EXISTS (SELECT 1 FROM gm_season_summaries summary WHERE summary.league_id=identity.league_id AND summary.gm_identity_id=identity.id)
    ) ORDER BY lower(display_name),id`).bind(current.league.id).all();
  const periodResult=await current.db.prepare(`SELECT id,gm_identity_id,team_key,franchise_season_id,started_at,ended_at,
      started_stage,started_week,ended_stage,ended_week
    FROM team_ownership_periods WHERE league_id=? ORDER BY started_at,id`).bind(current.league.id).all();
  const periods=periodResult?.results||[];
  const games=await activeCareerGames(current.db,current.league.id,contextState.franchiseSeasonId,teams);
  const currentBuilt=buildGmSeasonSummaries({games,periods,franchiseSeasonId:contextState.franchiseSeasonId});
  const activeSeason=await current.db.prepare(`SELECT id,display_name,season_year FROM franchise_seasons WHERE id=? AND league_id=? LIMIT 1`)
    .bind(contextState.franchiseSeasonId||'',current.league.id).first();
  const historyResult=await current.db.prepare(`SELECT summary.*,season.display_name,season.season_year
    FROM gm_season_summaries summary JOIN franchise_seasons season ON season.id=summary.franchise_season_id AND season.league_id=summary.league_id
    WHERE summary.league_id=? AND summary.franchise_season_id<>?
    ORDER BY season.season_year,summary.gm_identity_id`).bind(current.league.id,contextState.franchiseSeasonId||'').all();
  const historyByIdentity=new Map();
  for(const row of historyResult?.results||[]){
    const id=text(row.gm_identity_id);
    if(!historyByIdentity.has(id))historyByIdentity.set(id,[]);
    historyByIdentity.get(id).push(publicSeason(row));
  }
  const currentByIdentity=new Map(currentBuilt.summaries.map(summary=>[text(summary.gmIdentityId),summary]));
  const teamName=key=>resolveTeam(teams,key)?.displayName||String(key).toUpperCase();
  const owners=(identityResult?.results||[]).map(identity=>{
    const identityId=text(identity.id);
    const currentPeriodTeams=periods.filter(period=>text(period.gm_identity_id)===identityId&&text(period.franchise_season_id)===text(contextState.franchiseSeasonId)&&!period.ended_at).map(period=>text(period.team_key)).filter(Boolean);
    const currentSummary=currentByIdentity.get(identityId)||emptyLiveSeason(identityId,contextState.franchiseSeasonId,currentPeriodTeams);
    const includeLive=Boolean(contextState.franchiseSeasonId&&(currentByIdentity.has(identityId)||currentPeriodTeams.length));
    const liveSeason={...currentSummary,seasonYear:Number(activeSeason?.season_year)||contextState.seasonYear,label:activeSeason?.display_name||`Season ${contextState.seasonYear}`,frozen:false};
    const seasons=[...(historyByIdentity.get(identityId)||[]),...(includeLive?[liveSeason]:[])];
    const totals=careerTotals(seasons);
    const teamDetails=totals.teams.map(key=>({teamKey:key,displayName:teamName(key)}));
    const currentTeams=[...new Set(currentPeriodTeams)].map(key=>({teamKey:key,displayName:teamName(key)}));
    return{
      owner:{publicId:identity.public_id,displayName:identity.display_name},
      currentTeams,
      totals:{...totals,teams:teamDetails},
      seasons:seasons.map(season=>({...season,teams:(season.teams||[]).map(key=>({teamKey:key,displayName:teamName(key)}))})),
      currentGameAttributionCount:currentBuilt.attributedGames.filter(row=>text(row.gmIdentityId)===identityId).length
    };
  }).sort((left,right)=>
    Number(right.totals.superBowlChampionships)-Number(left.totals.superBowlChampionships)
    ||Number(right.totals.superBowlAppearances)-Number(left.totals.superBowlAppearances)
    ||Number(right.totals.playoffAppearances)-Number(left.totals.playoffAppearances)
    ||Number(right.totals.regularWins)-Number(left.totals.regularWins)
    ||String(left.owner.displayName).localeCompare(String(right.owner.displayName))
  ).map((owner,index)=>({...owner,rank:index+1}));
  return json({
    ok:true,release:RELEASE,state:owners.length?'ready':'empty',view:'league',owners,
    reconciliation:{membershipAuthority:true,maddenOwnerNamesUsed:false,crossTenantInference:false},
    activeSnapshotChanged:false,freeAgentInterpretedAsZero:false
  });
}

export async function onRequestGet(context){
  try{
    const current=await access(context,false);if(current.response)return current.response;
    const url=new URL(context.request.url),requested=text(url.searchParams.get('teamKey')).toLowerCase(),view=text(url.searchParams.get('view')).toLowerCase();
    if(requested&&!safeTeamKey(requested))return json({ok:false,error:'Invalid team key.'},400);
    const teams=await activeLeagueTeams(current.db,current.league.id);
    if(view==='league')return leagueCareerResponse(current,teams);
    const assignments=await activeTeamAssignments(current.db,current.league.id,teams);
    const membershipTeam=resolveTeam(teams,current.authorization.session.membership?.teamId);
    const team=resolveTeam(teams,requested||membershipTeam?.teamKey||'');
    if(!team)return json({ok:true,release:RELEASE,state:'unassigned',career:null});
    const assignment=assignments.get(team.teamKey)||null;
    if(!assignment)return json({ok:true,release:RELEASE,state:'unassigned',team:{teamKey:team.teamKey,displayName:team.displayName,abbreviation:team.abbreviation},career:null});
    const identity=await current.db.prepare(`SELECT id,public_id,display_name FROM gm_identities WHERE league_id=? AND user_id=? LIMIT 1`)
      .bind(current.league.id,assignment.userId).first();
    if(!identity)return json({ok:true,release:RELEASE,state:'pending-reconciliation',team:{teamKey:team.teamKey,displayName:team.displayName,abbreviation:team.abbreviation},owner:{displayName:assignment.displayName},career:null});

    const contextState=await currentFranchiseContext(current.db,current.league.id);
    const periodResult=await current.db.prepare(`SELECT id,gm_identity_id,team_key,franchise_season_id,started_at,ended_at,
        started_stage,started_week,ended_stage,ended_week
      FROM team_ownership_periods WHERE league_id=? ORDER BY started_at,id`).bind(current.league.id).all();
    const games=await activeCareerGames(current.db,current.league.id,contextState.franchiseSeasonId,teams);
    const currentBuilt=buildGmSeasonSummaries({games,periods:periodResult?.results||[],franchiseSeasonId:contextState.franchiseSeasonId});
    const live=currentBuilt.summaries.find(row=>row.gmIdentityId===identity.id)||{
      gmIdentityId:identity.id,franchiseSeasonId:contextState.franchiseSeasonId,teams:[team.teamKey],regularWins:0,regularLosses:0,regularTies:0,playoffWins:0,playoffLosses:0,playoffTies:0,playoffAppearance:0,conferenceChampionships:0,superBowlAppearances:0,superBowlChampionships:0,gameCount:0
    };
    const activeSeason=await current.db.prepare(`SELECT id,display_name,season_year FROM franchise_seasons WHERE id=? AND league_id=? LIMIT 1`)
      .bind(contextState.franchiseSeasonId||'',current.league.id).first();
    const historyResult=await current.db.prepare(`SELECT summary.*,season.display_name,season.season_year
      FROM gm_season_summaries summary JOIN franchise_seasons season ON season.id=summary.franchise_season_id AND season.league_id=summary.league_id
      WHERE summary.league_id=? AND summary.gm_identity_id=? AND summary.franchise_season_id<>?
      ORDER BY season.season_year`).bind(current.league.id,identity.id,contextState.franchiseSeasonId||'').all();
    const teamName=key=>resolveTeam(teams,key)?.displayName||String(key).toUpperCase();
    const liveSeason={...live,seasonYear:Number(activeSeason?.season_year)||contextState.seasonYear,label:activeSeason?.display_name||`Season ${contextState.seasonYear}`,frozen:false};
    const seasons=[...(historyResult?.results||[]).map(publicSeason),liveSeason];
    const totals=careerTotals(seasons);
    const relevantAttributions=currentBuilt.attributedGames.filter(row=>row.gmIdentityId===identity.id);
    return json({
      ok:true,release:RELEASE,state:'ready',
      team:{teamKey:team.teamKey,displayName:team.displayName,abbreviation:team.abbreviation},
      owner:{publicId:identity.public_id,displayName:identity.display_name},
      career:{
        totals:{...totals,teams:totals.teams.map(key=>({teamKey:key,displayName:teamName(key)}))},
        seasons:seasons.map(season=>({...season,teams:(season.teams||[]).map(key=>({teamKey:key,displayName:teamName(key)}))})),
        currentGameAttributionCount:relevantAttributions.length,
        reconciliation:{membershipAuthority:true,maddenOwnerNamesUsed:false,crossTenantInference:false}
      }
    });
  }catch(error){
    console.error('Ownership career read failed:',error?.message||error);
    return json({ok:false,release:RELEASE,error:'Ownership career history could not be loaded.'},500);
  }
}

export async function onRequestPost(context){
  try{
    const current=await access(context,true);if(current.response)return current.response;
    let body={};try{body=await context.request.json()}catch{}
    if(body.action!=='reconcile-current-assignments')return json({ok:false,error:'Unsupported ownership action.',release:RELEASE},400);
    const teams=await activeLeagueTeams(current.db,current.league.id);
    const assignments=await activeTeamAssignments(current.db,current.league.id,teams);
    const statements=[];
    for(const [teamKey,assignment] of assignments){
      const planned=await ownershipChangeStatements(current.db,{leagueId:current.league.id,userId:assignment.userId,displayName:assignment.displayName,nextTeamKey:teamKey});
      statements.push(...planned.statements);
    }
    if(statements.length)await current.db.batch(statements);
    const audit=createTenantAuditContext(context,current.league,current.authorization.session,'ownership.current_assignments_reconciled');
    await writeTenantAuditEvent(current.db,audit,{resourceType:'team_ownership_period',resourceId:current.league.id,detail:{assignmentCount:assignments.size,statementCount:statements.length,maddenOwnerNamesUsed:false}});
    return json({ok:true,release:RELEASE,reconciledAssignments:assignments.size,changedStatements:statements.length,activeSnapshotChanged:false,freeAgentInterpretedAsZero:false});
  }catch(error){
    console.error('Ownership reconciliation failed:',error?.message||error);
    return json({ok:false,release:RELEASE,error:'Ownership reconciliation stopped safely.'},500);
  }
}
