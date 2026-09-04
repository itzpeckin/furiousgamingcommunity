import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  configuredDraftPickBaseline,
  configuredLeagueDraftPickSource
} from '../../functions/_lib/draft-pick-baselines.js';
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
