import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  applyVersionedDraftPickBaseline,
  configuredDraftPickBaseline,
  configuredLeagueDraftPickSource,
  ensureDraftPickHorizon
} from '../../functions/_lib/draft-pick-baselines.js';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  FGC_DRAFT_PICK_OVERLAY,
  MADDEN_27_DRAFT_PICK_SOURCE,
  NFL_DRAFT_PICK_TEAM_LABELS
} from '../../functions/_lib/draft-pick-source-data.js';

const abbreviations = Object.freeze({
  '49ers':'sf',Bears:'chi',Bengals:'cin',Bills:'buf',Broncos:'den',Browns:'cle',Buccaneers:'tb',Cardinals:'ari',
  Chargers:'lac',Chiefs:'kc',Colts:'ind',Commanders:'was',Cowboys:'dal',Dolphins:'mia',Eagles:'phi',Falcons:'atl',
  Giants:'nyg',Jaguars:'jax',Jets:'nyj',Lions:'det',Packers:'gb',Panthers:'car',Patriots:'ne',Raiders:'lv',
  Rams:'lar',Ravens:'bal',Saints:'no',Seahawks:'sea',Steelers:'pit',Texans:'hou',Titans:'ten',Vikings:'min'
});

const teams = NFL_DRAFT_PICK_TEAM_LABELS.map(nickname=>({
  id:abbreviations[nickname],teamKey:abbreviations[nickname],abbreviation:abbreviations[nickname].toUpperCase(),nickname
}));
const labelsByKey = new Map(teams.map(team=>[team.teamKey,team.nickname]));

async function migrationFiles(){return(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort()}
async function migrate(database){for(const file of await migrationFiles())database.exec(await readFile(path.join(ROOT,file),'utf8'))}
function d1(database){return{
  prepare(sql){let values=[];const statement=database.prepare(sql);const api={
    bind(...next){values=next;return api},
    async first(){return statement.get(...values)||null},
    async all(){return{results:statement.all(...values)}},
    async run(){const result=statement.run(...values);return{success:true,meta:{changes:Number(result.changes||0)}}}
  };return api},
  async batch(statements){const results=[];database.exec('BEGIN');try{for(const statement of statements)results.push(await statement.run());database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}
}}

function sourceDigest(entries) {
  const normalized=entries.map(entry=>({
    draftClass:entry.draftClass,
    round:entry.round,
    originalTeam:labelsByKey.get(entry.originalTeamKey),
    currentTeam:labelsByKey.get(entry.currentTeamKey)
  })).sort((a,b)=>a.draftClass-b.draftClass||a.round-b.round||a.originalTeam.localeCompare(b.originalTeam));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function owner(preview,draftClass,round,originalTeam) {
  const originalTeamKey=abbreviations[originalTeam];
  return preview.entries.find(entry=>entry.draftClass===draftClass&&entry.round===round&&entry.originalTeamKey===originalTeamKey)?.currentTeamKey;
}

test('Madden 27 release source expands to a complete reusable 32-team three-year baseline',()=>{
  const preview=configuredDraftPickBaseline({gameRelease:'Madden NFL 27',seasonYear:2026,teams});
  assert.deepEqual(preview.classes,[2027,2028,2029]);
  assert.equal(preview.teamCount,32);
  assert.equal(preview.expectedPickCount,672);
  assert.equal(preview.entries.length,672);
  assert.equal(preview.genericOverrideCount,58);
  assert.equal(preview.leagueOverrideCount,0);
  assert.equal(preview.sourceKey,MADDEN_27_DRAFT_PICK_SOURCE.key);
  assert.equal(sourceDigest(preview.entries),MADDEN_27_DRAFT_PICK_SOURCE.normalizedMappingSha256);
  assert.equal(owner(preview,2027,1,'Colts'),'nyj');
  assert.equal(owner(preview,2027,4,'Cowboys'),'gb');
  assert.equal(owner(preview,2027,5,'Bears'),'ne');
});

test('FGC source is a private tenant-scoped 672-pick overlay with corrected fifth-round identity',()=>{
  const preview=configuredDraftPickBaseline({gameRelease:'Madden NFL 27',seasonYear:2026,teams,
    sourceKey:FGC_DRAFT_PICK_OVERLAY.key,leagueSlug:'furious-gaming-community'});
  assert.equal(preview.configuredLeagueSource,true);
  assert.equal(preview.expectedPickCount,672);
  assert.equal(preview.entries.length,672);
  assert.equal(preview.genericOverrideCount,58);
  assert.equal(preview.leagueOverrideCount,59);
  assert.equal(sourceDigest(preview.entries),FGC_DRAFT_PICK_OVERLAY.normalizedMappingSha256);
  assert.equal(owner(preview,2027,5,'Bears'),'kc');
  assert.equal(owner(preview,2027,5,'Buccaneers'),'ne');
  assert.equal(owner(preview,2027,5,'Chargers'),'chi');
  assert.equal(owner(preview,2027,5,'Ravens'),'min');
  assert.throws(()=>configuredDraftPickBaseline({gameRelease:'Madden NFL 27',seasonYear:2026,teams,
    sourceKey:FGC_DRAFT_PICK_OVERLAY.key,leagueSlug:'another-league'}),/not authorized for this league/i);
  assert.equal(configuredLeagueDraftPickSource(),FGC_DRAFT_PICK_OVERLAY);
});

test('the exact FGC source replaces only unprotected generic ownership and remains retry-safe',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');
    await migrate(database);
    database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?,?,?,?,?)`)
      .run('league-fgc','Furious Gaming Community','FranchiseHQ','furious-gaming-community','active','enabled');
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('season-fgc','league-fgc','madden-companion','742482','2026','Madden NFL 27','2026',2026,'active');
    const db=d1(database);
    await ensureDraftPickHorizon(db,{leagueId:'league-fgc',franchiseSeasonId:'season-fgc',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams});
    const protectedPick='pick:league-fgc:2027:5:chi';
    database.prepare(`UPDATE league_draft_picks SET current_team_key='tb',revision=revision+1 WHERE id=?`).run(protectedPick);
    database.prepare(`INSERT INTO draft_pick_ledger_events
      (id,league_id,draft_pick_id,event_type,from_team_key,to_team_key) VALUES (?,?,?,?,?,?)`)
      .run('protected-owner','league-fgc',protectedPick,'commissioner-correction','ne','tb');
    const configured=configuredDraftPickBaseline({gameRelease:'Madden NFL 27',seasonYear:2026,teams,
      sourceKey:FGC_DRAFT_PICK_OVERLAY.key,leagueSlug:'furious-gaming-community'});
    const apply=()=>applyVersionedDraftPickBaseline(db,{leagueId:'league-fgc',franchiseSeasonId:'season-fgc',
      seasonYear:2026,gameRelease:'Madden NFL 27',teams,baselineKey:configured.sourceKey,
      baselineVersion:configured.sourceVersion,sourceType:'imported-sheet',sourceReference:configured.sourceReference,
      contentSha256:configured.normalizedMappingSha256,entries:configured.entries});
    const first=await apply();
    assert.equal(first.expectedPickCount,672);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_draft_picks WHERE league_id='league-fgc'`).get().count,672);
    assert.equal(database.prepare(`SELECT current_team_key owner FROM league_draft_picks WHERE id=?`).get(protectedPick).owner,'tb');
    assert.equal(database.prepare(`SELECT current_team_key owner FROM league_draft_picks WHERE id='pick:league-fgc:2027:5:tb'`).get().owner,'ne');
    const beforeRetry=database.prepare(`SELECT COUNT(*) count FROM draft_pick_ledger_events WHERE league_id='league-fgc'`).get().count;
    await apply();
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM draft_pick_ledger_events WHERE league_id='league-fgc'`).get().count,beforeRetry);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_draft_pick_baseline_applications WHERE league_id='league-fgc' AND status='complete'`).get().count,2);
  }finally{database.close()}
});

test('season advancement preserves remaining classes and opens seven rounds for the new third year',()=>{
  const preview=configuredDraftPickBaseline({gameRelease:'Madden NFL 27',seasonYear:2027,teams});
  assert.deepEqual(preview.classes,[2028,2029,2030]);
  assert.equal(preview.entries.length,672);
  assert.equal(preview.genericOverrideCount,15);
  assert.equal(preview.entries.filter(entry=>entry.draftClass===2030).length,224);
  assert.ok(preview.entries.filter(entry=>entry.draftClass===2030).every(entry=>entry.currentTeamKey===entry.originalTeamKey));
});

test('unknown releases remain tenant-safe with original ownership instead of borrowing Madden 27 data',()=>{
  const preview=configuredDraftPickBaseline({gameRelease:'Madden NFL 28',seasonYear:2027,teams});
  assert.equal(preview.entries.length,672);
  assert.equal(preview.genericOverrideCount,0);
  assert.ok(preview.entries.every(entry=>entry.currentTeamKey===entry.originalTeamKey));
});
