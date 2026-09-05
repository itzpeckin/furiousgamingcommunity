import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachProjectedPickSlots,
  projectDraftOrder,
  projectedPickLabel
} from '../../functions/_lib/draft-pick-projections.js';

const teams = [
  {teamKey:'tb',externalId:'1',abbreviation:'TB'},
  {teamKey:'gb',externalId:'2',abbreviation:'GB'},
  {teamKey:'kc',externalId:'3',abbreviation:'KC'}
];

test('inverse active standings estimate the first pick and update when records change', () => {
  const first = projectDraftOrder([
    {externalId:'1',dataJson:JSON.stringify({teamId:'1',wins:0,losses:11})},
    {externalId:'2',dataJson:JSON.stringify({teamId:'2',wins:3,losses:8})},
    {externalId:'3',dataJson:JSON.stringify({teamId:'3',wins:5,losses:6})}
  ], teams);
  assert.equal(first.available,true);
  assert.equal(first.teams[0].teamKey,'tb');
  assert.equal(first.teams[0].slot,1);

  const next = projectDraftOrder([
    {externalId:'1',dataJson:JSON.stringify({teamId:'1',wins:2,losses:11,weekIndex:13})},
    {externalId:'2',dataJson:JSON.stringify({teamId:'2',wins:1,losses:12,weekIndex:13})},
    {externalId:'3',dataJson:JSON.stringify({teamId:'3',wins:5,losses:8,weekIndex:13})}
  ], teams);
  assert.equal(next.teams[0].teamKey,'gb');
  assert.equal(next.teams[1].teamKey,'tb');
  assert.equal(next.standingsWeek,13);
});

test('draft pick projections follow the original team rather than the current owner', () => {
  const projection = projectDraftOrder([
    {externalId:'1',dataJson:JSON.stringify({teamId:'1',totalWins:0,totalLosses:11})},
    {externalId:'2',dataJson:JSON.stringify({teamId:'2',totalWins:2,totalLosses:9})},
    {externalId:'3',dataJson:JSON.stringify({teamId:'3',totalWins:7,totalLosses:4})}
  ], teams);
  const [pick] = attachProjectedPickSlots([{
    id:'pick-1',round:1,originalTeamKey:'tb',currentTeamKey:'kc'
  }], projection);
  assert.equal(pick.projectedSlot,1);
  assert.equal(pick.projectedPick,'1.01');
  assert.equal(pick.projectedRecord,'0-11');
});

test('record ties are deterministic and explicitly approximate', () => {
  const projection = projectDraftOrder([
    {externalId:'1',dataJson:JSON.stringify({teamId:'1',wins:2,losses:9})},
    {externalId:'2',dataJson:JSON.stringify({teamId:'2',wins:2,losses:9})},
    {externalId:'3',dataJson:JSON.stringify({teamId:'3',wins:7,losses:4})}
  ], teams);
  assert.equal(projection.officialTiebreakersApplied,false);
  assert.deepEqual(projection.teams.slice(0,2).map(row => row.teamKey),['gb','tb']);
  assert.equal(projection.teams[0].tiedWithSameRecord,true);
  assert.equal(projection.teams[1].tiedWithSameRecord,true);
});

test('incomplete standings do not fabricate projected slots', () => {
  const projection = projectDraftOrder([
    {externalId:'1',dataJson:JSON.stringify({teamId:'1',wins:0,losses:1})}
  ], teams);
  assert.equal(projection.available,false);
  assert.deepEqual(projection.teams,[]);
  assert.equal(attachProjectedPickSlots([{round:1,originalTeamKey:'tb'}], projection)[0].projectedPick,null);
  assert.equal(projectedPickLabel(7,32),'7.32');
});
