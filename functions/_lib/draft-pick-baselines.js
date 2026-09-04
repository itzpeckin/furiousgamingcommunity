import { canonicalTeamKey, resolveTeam } from './league-teams.js';
import {
  DRAFT_PICK_SOURCE_CATALOG,
  FGC_DRAFT_PICK_OVERLAY,
  MADDEN_27_DRAFT_PICK_SOURCE
} from './draft-pick-source-data.js';

export const DRAFT_PICK_BASELINE_RELEASE = '7.4.0.7';
export const DRAFT_PICK_ROUNDS = Object.freeze([1,2,3,4,5,6,7]);
export const DRAFT_PICK_HORIZON = 3;

const year = value => {
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=1900&&parsed<=3000?parsed:null;
};

const releaseKey = value => String(value||'madden-unspecified').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'madden-unspecified';

export function draftClassesForSeason(seasonYear, horizon = DRAFT_PICK_HORIZON) {
  const current=year(seasonYear);
  if(!current)throw new TypeError('A valid Franchise season year is required to initialize draft picks.');
  return Array.from({length:horizon},(_,index)=>current+index+1);
}

export function draftPickContinuityKey({leagueId,draftClass,round,originalTeamKey}) {
  const parts=[String(leagueId||'').trim(),year(draftClass),Number(round),canonicalTeamKey(originalTeamKey)];
  if(!parts[0]||!parts[1]||!DRAFT_PICK_ROUNDS.includes(parts[2])||!parts[3])throw new TypeError('A complete permanent draft-pick identity is required.');
  return parts.join(':');
}

export function stableDraftPickId(identity) {
  return `pick:${draftPickContinuityKey(identity)}`;
}

export function genericBaselineId(leagueId, gameRelease, sourceKey = 'franchisehq-generic-own-picks', sourceVersion = 1) {
  const league=String(leagueId||'').trim();
  if(!league)throw new TypeError('A league is required for the draft-pick baseline.');
  return `draft_baseline:${league}:${releaseKey(gameRelease)}:${releaseKey(sourceKey)}:v${Number(sourceVersion)||1}`;
}

function normalizedTeams(teams = []) {
  return [...new Map((teams||[]).map(team=>{
    const teamKey=canonicalTeamKey(team?.teamKey??team?.id??team);
    return [teamKey,{...(typeof team==='object'?team:{}),teamKey,id:teamKey}];
  }).filter(([teamKey])=>teamKey)).values()].sort((a,b)=>a.teamKey.localeCompare(b.teamKey));
}

function releaseSource(gameRelease) {
  return releaseKey(gameRelease)===releaseKey(MADDEN_27_DRAFT_PICK_SOURCE.gameRelease)
    ? MADDEN_27_DRAFT_PICK_SOURCE
    : null;
}

function applySourceOverrides(entries, source, teams, classes, strict = false) {
  const entryMap=new Map(entries.map(entry=>[`${entry.draftClass}:${entry.round}:${entry.originalTeamKey}`,entry]));
  const classSet=new Set(classes),unresolved=[],applied=[];
  for(const [draftClass,round,originalLabel,currentLabel] of source?.overrides||[]){
    if(!classSet.has(Number(draftClass)))continue;
    const original=resolveTeam(teams,originalLabel),current=resolveTeam(teams,currentLabel);
    if(!original||!current){
      if(strict)unresolved.push({draftClass:Number(draftClass),round:Number(round),originalLabel,currentLabel});
      continue;
    }
    const identity=`${Number(draftClass)}:${Number(round)}:${original.teamKey}`;
    const entry=entryMap.get(identity);
    if(!entry){
      if(strict)unresolved.push({draftClass:Number(draftClass),round:Number(round),originalLabel,currentLabel});
      continue;
    }
    entry.currentTeamKey=current.teamKey;
    applied.push({...entry,originalLabel,currentLabel});
  }
  return{entries:[...entryMap.values()],unresolved,applied};
}

export function configuredDraftPickBaseline({gameRelease,seasonYear,teams=[],sourceKey=null,leagueSlug=null}) {
  const canonicalTeams=normalizedTeams(teams),classes=draftClassesForSeason(seasonYear);
  const entries=classes.flatMap(draftClass=>canonicalTeams.flatMap(team=>DRAFT_PICK_ROUNDS.map(round=>({
    draftClass,round,originalTeamKey:team.teamKey,currentTeamKey:team.teamKey
  }))));
  const generic=releaseSource(gameRelease);
  const strictGeneric=Boolean(generic&&canonicalTeams.length===generic.expectedTeamCount);
  const genericResult=applySourceOverrides(entries,generic,canonicalTeams,classes,strictGeneric);
  if(genericResult.unresolved.length)throw new TypeError('The Madden release draft-pick source could not be resolved against every active NFL team.');
  let finalResult=genericResult,overlay=null;
  if(sourceKey){
    overlay=DRAFT_PICK_SOURCE_CATALOG[String(sourceKey||'').trim()]||null;
    if(!overlay||!overlay.leagueSlug)throw new TypeError('The requested league draft-pick source is not configured.');
    if(canonicalTeamKey(leagueSlug)!==canonicalTeamKey(overlay.leagueSlug))throw new TypeError('The requested draft-pick source is not authorized for this league.');
    if(releaseKey(gameRelease)!==releaseKey(overlay.gameRelease))throw new TypeError('The requested draft-pick source does not match this Madden release.');
    if(Number(seasonYear)!==Number(overlay.effectiveSeasonYear))throw new TypeError('The requested draft-pick source does not match the active Franchise season.');
    if(canonicalTeams.length!==overlay.expectedTeamCount)throw new TypeError(`The requested draft-pick source requires exactly ${overlay.expectedTeamCount} active teams.`);
    finalResult=applySourceOverrides(genericResult.entries,overlay,canonicalTeams,classes,true);
    if(finalResult.unresolved.length)throw new TypeError('The league draft-pick source could not be resolved against every active NFL team.');
  }
  return{
    entries:finalResult.entries,
    classes,
    teamCount:canonicalTeams.length,
    expectedPickCount:canonicalTeams.length*classes.length*DRAFT_PICK_ROUNDS.length,
    sourceKey:overlay?.key||generic?.key||'franchisehq-generic-own-picks',
    sourceVersion:Number(overlay?.version||generic?.version||1),
    sourceReference:overlay?.sourceReference||generic?.sourceReference||null,
    normalizedMappingSha256:overlay?.normalizedMappingSha256||generic?.normalizedMappingSha256||null,
    genericOverrideCount:genericResult.applied.length,
    leagueOverrideCount:overlay?finalResult.applied.length:0,
    configuredLeagueSource:Boolean(overlay)
  };
}

export function configuredLeagueDraftPickSource() {
  return FGC_DRAFT_PICK_OVERLAY;
}

export async function applyVersionedDraftPickBaseline(db,{leagueId,franchiseSeasonId,seasonYear,gameRelease,teams=[],baselineKey,baselineVersion,sourceType='league-specific',sourceReference=null,contentSha256=null,entries=[]}) {
  const league=String(leagueId||'').trim(),season=String(franchiseSeasonId||'').trim(),key=String(baselineKey||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-'),version=Number(baselineVersion);
  const teamKeys=[...new Set((teams||[]).map(team=>canonicalTeamKey(team?.teamKey??team?.id??team)).filter(Boolean))].sort(),teamSet=new Set(teamKeys),classes=draftClassesForSeason(seasonYear),classSet=new Set(classes);
  if(!league||!season||!key||!Number.isInteger(version)||version<1)throw new TypeError('League, Franchise season, baseline key, and positive version are required.');
  if(!['league-specific','imported-sheet'].includes(sourceType))throw new TypeError('A league-specific or imported-sheet baseline source is required.');
  const normalized=[],seen=new Set();
  for(const raw of entries||[]){
    const draftClass=year(raw?.draftClass),round=Number(raw?.round),originalTeamKey=canonicalTeamKey(raw?.originalTeamKey),currentTeamKey=canonicalTeamKey(raw?.currentTeamKey??raw?.ownerTeamKey);
    const identity=`${draftClass}:${round}:${originalTeamKey}`;
    if(!classSet.has(draftClass)||!DRAFT_PICK_ROUNDS.includes(round)||!teamSet.has(originalTeamKey)||!teamSet.has(currentTeamKey)||seen.has(identity))throw new TypeError('The league draft-pick baseline contains an invalid or duplicate pick identity.');
    seen.add(identity);normalized.push({draftClass,round,originalTeamKey,currentTeamKey});
  }
  const expected=teamKeys.length*classes.length*DRAFT_PICK_ROUNDS.length;
  if(!teamKeys.length||normalized.length!==expected)throw new TypeError(`The league draft-pick baseline must contain exactly ${expected} picks for the active three-class horizon.`);
  const baselineId=`draft_baseline:${league}:${releaseKey(gameRelease)}:${key}:v${version}`;
  await db.prepare(`INSERT INTO league_draft_pick_baselines
    (id,league_id,baseline_key,baseline_version,game_release,source_type,source_reference,content_sha256,status,effective_season_year,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?, 'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET source_reference=excluded.source_reference,content_sha256=excluded.content_sha256,
      status='active',updated_at=CURRENT_TIMESTAMP`)
    .bind(baselineId,league,key,version,String(gameRelease||'Madden unspecified'),sourceType,
      String(sourceReference||'')||null,String(contentSha256||'')||null,Number(seasonYear)).run();
  const statements=[];
  for(const entry of normalized){
    const continuityKey=draftPickContinuityKey({leagueId:league,...entry}),pickId=stableDraftPickId({leagueId:league,...entry}),entryId=`draft_baseline_entry:${baselineId}:${entry.draftClass}:${entry.round}:${entry.originalTeamKey}`;
    statements.push(db.prepare(`INSERT INTO league_draft_pick_baseline_entries
      (id,baseline_id,league_id,draft_class,round,original_team_key,baseline_owner_team_key,created_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(baseline_id,draft_class,round,original_team_key) DO UPDATE SET baseline_owner_team_key=excluded.baseline_owner_team_key`)
      .bind(entryId,baselineId,league,entry.draftClass,entry.round,entry.originalTeamKey,entry.currentTeamKey));
    statements.push(db.prepare(`INSERT OR IGNORE INTO league_draft_picks
      (id,league_id,franchise_season_id,draft_class,round,original_team_key,current_team_key,source_authority,continuity_key,source_baseline_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'franchisehq-ledger',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(pickId,league,season,entry.draftClass,entry.round,entry.originalTeamKey,entry.currentTeamKey,continuityKey,baselineId));
    statements.push(db.prepare(`UPDATE league_draft_picks SET current_team_key=?,source_baseline_id=?,
        revision=revision+CASE WHEN current_team_key<>? THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND continuity_key=? AND COALESCE(source_baseline_id,'')<>?
        AND (source_baseline_id IS NOT NULL OR current_team_key=original_team_key)
        AND NOT EXISTS (SELECT 1 FROM draft_pick_ledger_events event
          WHERE event.league_id=league_draft_picks.league_id AND event.draft_pick_id=league_draft_picks.id
            AND event.event_type IN ('trade-approved','commissioner-correction'))`)
      .bind(entry.currentTeamKey,baselineId,entry.currentTeamKey,league,continuityKey,baselineId));
    statements.push(db.prepare(`INSERT OR IGNORE INTO draft_pick_ledger_events
      (id,league_id,draft_pick_id,event_type,to_team_key,baseline_id,detail_json,created_at)
      SELECT ?,? ,id,'baseline-updated',current_team_key,?,? ,CURRENT_TIMESTAMP FROM league_draft_picks
      WHERE league_id=? AND continuity_key=? AND source_baseline_id=?`)
      .bind(`draft_pick_event:${baselineId}:${continuityKey}`,league,baselineId,JSON.stringify({release:DRAFT_PICK_BASELINE_RELEASE,baselineVersion:version}),league,continuityKey,baselineId));
  }
  for(let index=0;index<statements.length;index+=72)await db.batch(statements.slice(index,index+72));
  const applicationId=`draft_baseline_application:${baselineId}:${seasonYear}`;
  await db.prepare(`INSERT INTO league_draft_pick_baseline_applications
    (id,baseline_id,league_id,franchise_season_id,season_year,expected_pick_count,applied_pick_count,status,applied_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'complete',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET expected_pick_count=excluded.expected_pick_count,
      applied_pick_count=excluded.applied_pick_count,status='complete',updated_at=CURRENT_TIMESTAMP`)
    .bind(applicationId,baselineId,league,season,Number(seasonYear),expected,expected).run();
  return{baselineId,baselineKey:key,baselineVersion:version,classes,expectedPickCount:expected};
}

export async function ensureDraftPickHorizon(db,{leagueId,franchiseSeasonId,seasonYear,gameRelease,teams=[]}) {
  const league=String(leagueId||'').trim(),season=String(franchiseSeasonId||'').trim();
  const canonicalTeams=normalizedTeams(teams),teamKeys=canonicalTeams.map(team=>team.teamKey);
  if(!league||!season)throw new TypeError('League and Franchise season identities are required.');
  if(!canonicalTeams.length)throw new TypeError('At least one active league team is required to initialize draft picks.');
  const configured=configuredDraftPickBaseline({gameRelease,seasonYear,teams:canonicalTeams});
  const {classes}=configured,baselineKey=configured.sourceKey,baselineVersion=configured.sourceVersion;
  const baselineId=genericBaselineId(league,gameRelease,baselineKey,baselineVersion),expected=configured.expectedPickCount;
  const applicationId=`draft_baseline_application:${baselineId}:${seasonYear}`;
  const teamPlaceholders=teamKeys.map(()=>'?').join(',');
  const existing=await db.prepare(`SELECT COUNT(*) AS count FROM league_draft_picks
    WHERE league_id=? AND draft_class BETWEEN ? AND ? AND continuity_key IS NOT NULL
      AND original_team_key IN (${teamPlaceholders})`)
    .bind(league,classes[0],classes.at(-1),...teamKeys).first();
  if(Number(existing?.count||0)>=expected){
    return {baselineId,baselineKey,baselineVersion,classes,teamCount:canonicalTeams.length,
      expectedPickCount:expected,createdOrPresent:Number(existing.count),initialized:false,
      sourceReference:configured.sourceReference,normalizedMappingSha256:configured.normalizedMappingSha256};
  }
  const completed=await db.prepare(`SELECT status,expected_pick_count AS expectedPickCount,applied_pick_count AS appliedPickCount
    FROM league_draft_pick_baseline_applications WHERE id=? AND league_id=? AND franchise_season_id=?`)
    .bind(applicationId,league,season).first();
  if(completed?.status==='complete'&&Number(completed.expectedPickCount)===expected&&Number(completed.appliedPickCount)===expected){
    const present=await db.prepare(`SELECT COUNT(*) AS count FROM league_draft_picks
      WHERE league_id=? AND draft_class BETWEEN ? AND ? AND continuity_key IS NOT NULL
        AND original_team_key IN (${teamPlaceholders})`)
      .bind(league,classes[0],classes.at(-1),...teamKeys).first();
    if(Number(present?.count||0)>=expected){
      return {baselineId,baselineKey,baselineVersion,classes,teamCount:canonicalTeams.length,
        expectedPickCount:expected,createdOrPresent:Number(present.count),initialized:false,
        sourceReference:configured.sourceReference,normalizedMappingSha256:configured.normalizedMappingSha256};
    }
  }
  await db.prepare(`INSERT OR IGNORE INTO league_draft_pick_baselines
    (id,league_id,baseline_key,baseline_version,game_release,source_type,source_reference,content_sha256,status,effective_season_year,created_at,updated_at)
    VALUES (?,?,?,?,?,'franchisehq-generic',?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
    .bind(baselineId,league,baselineKey,baselineVersion,String(gameRelease||'Madden unspecified'),
      configured.sourceReference,configured.normalizedMappingSha256,Number(seasonYear)).run();
  const statements=[];
  for(const entry of configured.entries){
    const {draftClass,round,originalTeamKey,currentTeamKey}=entry;
    const continuityKey=draftPickContinuityKey({leagueId:league,draftClass,round,originalTeamKey});
    const pickId=stableDraftPickId({leagueId:league,draftClass,round,originalTeamKey});
    const entryId=`draft_baseline_entry:${baselineId}:${draftClass}:${round}:${originalTeamKey}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO league_draft_pick_baseline_entries
      (id,baseline_id,league_id,draft_class,round,original_team_key,baseline_owner_team_key,created_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(entryId,baselineId,league,draftClass,round,originalTeamKey,currentTeamKey));
    statements.push(db.prepare(`INSERT OR IGNORE INTO league_draft_picks
      (id,league_id,franchise_season_id,draft_class,round,original_team_key,current_team_key,source_authority,
       continuity_key,source_baseline_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'franchisehq-ledger',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(pickId,league,season,draftClass,round,originalTeamKey,currentTeamKey,continuityKey,baselineId));
    statements.push(db.prepare(`INSERT OR IGNORE INTO draft_pick_ledger_events
      (id,league_id,draft_pick_id,event_type,to_team_key,baseline_id,detail_json,created_at)
      SELECT ?,? ,id,'baseline-created',current_team_key,?,? ,CURRENT_TIMESTAMP
      FROM league_draft_picks WHERE league_id=? AND continuity_key=?`)
      .bind(`draft_pick_event:${continuityKey}:created`,league,baselineId,JSON.stringify({release:DRAFT_PICK_BASELINE_RELEASE,
        seasonYear:Number(seasonYear),sourceKey:baselineKey,sourceVersion:baselineVersion}),league,continuityKey));
  }
  for(let index=0;index<statements.length;index+=75)await db.batch(statements.slice(index,index+75));
  const present=await db.prepare(`SELECT COUNT(*) AS count FROM league_draft_picks
      WHERE league_id=? AND draft_class BETWEEN ? AND ? AND continuity_key IS NOT NULL
        AND original_team_key IN (${teamPlaceholders})`)
    .bind(league,classes[0],classes.at(-1),...teamKeys).first();
  if(Number(present?.count||0)<expected)throw new Error('The draft-pick horizon could not be initialized completely. Retry is safe.');
  await db.prepare(`INSERT INTO league_draft_pick_baseline_applications
    (id,baseline_id,league_id,franchise_season_id,season_year,expected_pick_count,applied_pick_count,status,applied_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'complete',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET expected_pick_count=excluded.expected_pick_count,
      applied_pick_count=excluded.applied_pick_count,status='complete',updated_at=CURRENT_TIMESTAMP`)
    .bind(applicationId,baselineId,league,season,Number(seasonYear),expected,expected).run();
  return {baselineId,baselineKey,baselineVersion,classes,teamCount:canonicalTeams.length,
    expectedPickCount:expected,createdOrPresent:Number(present?.count||0),initialized:true,
    sourceReference:configured.sourceReference,normalizedMappingSha256:configured.normalizedMappingSha256};
}
