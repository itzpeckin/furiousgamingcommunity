import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  normalizePublicPlayerId,
  normalizePublicTeamSlug,
  publicPlayerPath,
  publicTeamPath
} from '../../functions/_lib/public-identity-routes.js';
import { normalizePlayer } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';
import { onRequestGet as readPublicPlayer } from '../../functions/api/leagues/[leagueSlug]/players/[publicPlayerId].js';
import { onRequestGet as readPublicTeam } from '../../functions/api/leagues/[leagueSlug]/teams/[teamSlug].js';

const publicId='plr_0123456789abcdef0123456789abcdef';

test('public identity routes accept only opaque player IDs and bounded team slugs', () => {
  assert.equal(normalizePublicPlayerId(publicId.toUpperCase()),publicId);
  assert.equal(normalizePublicPlayerId('player-row-42'),null);
  assert.equal(normalizePublicTeamSlug('TB'),'tb');
  assert.equal(normalizePublicTeamSlug('../../private'),null);
  assert.equal(publicPlayerPath('furious-gaming-community',publicId),`/leagues/furious-gaming-community/players/${publicId}`);
  assert.equal(publicTeamPath('furious-gaming-community','TB'),'/leagues/furious-gaming-community/teams/tb');
});

test('active player DTO carries the permanent public identity separately from its source join key', () => {
  const player=normalizePlayer({external_id:'source-player-42',team_external_id:'source-team-9',display_name:'Stable Player'},publicId);
  assert.equal(player.id,'source-player-42');
  assert.equal(player.publicId,publicId);
  assert.equal(normalizePlayer({external_id:'source-player-42'},'not-public').publicId,null);
});

test('team and player identity contracts remain membership protected', async () => {
  const playerResponse=await readPublicPlayer({
    request:new Request(`https://franchisehq.app/api/leagues/fgc/players/${publicId}`),
    params:{leagueSlug:'fgc',publicPlayerId:publicId},
    env:{}
  });
  const teamResponse=await readPublicTeam({
    request:new Request('https://franchisehq.app/api/leagues/fgc/teams/tb'),
    params:{leagueSlug:'fgc',teamSlug:'tb'},
    env:{}
  });
  assert.equal(playerResponse.status,401);
  assert.equal(teamResponse.status,401);
});

test('browser router promotes identity links to canonical league paths and retains hash compatibility', async () => {
  const [app,navigation,liveSnapshotBoot,leagueRoute,playerEndpoint,teamEndpoint]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../platform/navigation.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/live-snapshot-boot.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/leagues/[[path]].js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/players/[publicPlayerId].js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/teams/[teamSlug].js',import.meta.url),'utf8')
  ]);
  assert.match(app,/\/players\/\$\{encodeURIComponent\(publicId\)\}/);
  assert.match(app,/\/teams\/\$\{encodeURIComponent\(teamSlug\)\}/);
  assert.match(app,/configureLocationAdapter/);
  assert.match(app,/data-open-value-card/);
  assert.match(app,/data-roster-player-detail/);
  assert.match(app,/data-team-id/);
  assert.match(navigation,/window\.addEventListener\('popstate', handleLocationChange\)/);
  assert.match(liveSnapshotBoot,/location\.pathname/);
  assert.match(liveSnapshotBoot,/\(teams\|players\)/);
  assert.match(liveSnapshotBoot,/HQ\?\.navigation\?\.currentRoute\?\.\(\)/);
  assert.match(leagueRoute,/requestedUrl\.pathname/);
  assert.match(playerEndpoint,/rawDatabaseIdsExposed:false/);
  assert.match(teamEndpoint,/rawDatabaseIdsExposed:false/);
  assert.doesNotMatch(playerEndpoint,/player_identity_id:/);
  assert.doesNotMatch(teamEndpoint,/externalId:/);
});
