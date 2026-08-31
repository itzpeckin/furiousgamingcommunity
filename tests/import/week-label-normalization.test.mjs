import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { normalizeGame } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';

async function resolver() {
  const source = await readFile(new URL('../../league-engine/week-context.js', import.meta.url), 'utf8');
  const context = {window:{FranchiseHQ:{}}};
  runInNewContext(source, context, {filename:'league-engine/week-context.js'});
  return context.window.FranchiseHQ.canonicalWeekContext.resolve;
}

test('canonical one-based game weeks are not incremented again for display', async () => {
  const resolve = await resolver();
  assert.equal(resolve({stage:'preseason',weekIndex:1},1,'preseason').week,1);
  assert.deepEqual(
    {...resolve({stage:'regular-season',stageIndex:null,weekIndex:9},9,'regular-season')},
    {phase:'regular',week:9,round:null,label:'Regular Season'}
  );
});

test('route authority wins and legacy zero-based source-only weeks still normalize', async () => {
  const resolve = await resolver();
  assert.deepEqual(
    {...resolve({routePath:'xbsx/742482/week/pre/3/schedules',stageIndex:1,weekIndex:2},2,'regular-season')},
    {phase:'preseason',week:3,round:null,label:'Preseason'}
  );
  assert.equal(resolve({stageIndex:1,weekIndex:0},0,'regular-season').week,1);
});

test('live read model retains only approved route provenance with canonical week', () => {
  const game = normalizeGame({
    external_id:'game-1',
    stage:'regular-season',
    week_index:8,
    source_route_path:'xbsx/742482/week/reg/8/schedules',
    source_record_json:JSON.stringify({weekIndex:7,privateExportToken:'must-not-leak'})
  });
  assert.equal(game.week,8);
  assert.equal(game.source.weekIndex,8);
  assert.equal(game.source.routePath,'xbsx/742482/week/reg/8/schedules');
  assert.equal(JSON.stringify(game).includes('must-not-leak'),false);
});
