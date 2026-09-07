import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  DISCORD_GLOBAL_COMMANDS,
  DISCORD_SCHEDULE_THREAD_COMMANDS
} from '../../functions/_lib/discord-commands.js';
import { onRequestPost as discordInteractions } from '../../functions/api/discord/interactions.js';
import { flushDiscordDeliveries } from '../../functions/_lib/discord-delivery.js';
import {
  ensureDiscordGlobalCommands,
  upsertDiscordGlobalCommands,
  upsertDiscordGuildCommands
} from '../../functions/_lib/discord-api.js';
import { AUTH_CONSTANTS, hashToken } from '../../functions/_lib/auth.js';
import {
  onRequestGet as getDiscordInstallation,
  onRequestPost as postDiscordInstallation
} from '../../functions/api/leagues/[leagueSlug]/discord.js';
import {
  discordAuthorizedGuild,
  discordGuildPermissionAllowsInstall
} from '../../functions/_lib/discord-installation.js';
import { syncDiscordScheduleThreads } from '../../functions/_lib/discord-schedule.js';

async function applyMigrations(database){
  const files=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for(const file of files)database.exec(await readFile(path.join(ROOT,file),'utf8'));
}

function d1(database){
  return {
    prepare(sql){
      let values=[];
      const statement=database.prepare(sql);
      const api={
        bind(...next){values=next;return api},
        async first(){return statement.get(...values)||null},
        async all(){return {results:statement.all(...values)}},
        async run(){const result=statement.run(...values);return {success:true,meta:{changes:Number(result.changes||0)}}}
      };
      return api;
    },
    async batch(statements){
      const results=[];database.exec('BEGIN');
      try{for(const statement of statements)results.push(await statement.run());database.exec('COMMIT');return results}
      catch(error){database.exec('ROLLBACK');throw error}
    }
  };
}

function hex(bytes){return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}

async function signingKey(){
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  return {pair,publicKey:hex(await crypto.subtle.exportKey('raw',pair.publicKey))};
}

async function signedContext({db,key,interaction,env={}}){
  const body=JSON.stringify(interaction),timestamp=String(Math.floor(Date.now()/1000));
  const signature=await crypto.subtle.sign({name:'Ed25519'},key.pair.privateKey,new TextEncoder().encode(`${timestamp}${body}`));
  return {
    env:{DB:db,DISCORD_PUBLIC_KEY:key.publicKey,...env},
    request:new Request('https://franchisehq.app/api/discord/interactions',{
      method:'POST',headers:{'content-type':'application/json','x-signature-ed25519':hex(signature),'x-signature-timestamp':timestamp},body
    })
  };
}

function interaction({id='100000000000000099',guild='100000000000000001',channel='100000000000000055',user='100000000000000011',name='league-site',options=[],permissions=null,type=2}={}){
  return {
    id,application_id:'100000000000000009',token:`token-${id}`,type,guild_id:guild,channel_id:channel,
    member:{...(permissions===null?{}:{permissions:String(permissions)}),user:{id:user,username:`member-${user.slice(-2)}`,global_name:`Member ${user.slice(-2)}`,avatar:null}},
    data:{id:`command-${id}`,name,type:1,options}
  };
}

function seedLeague(database,{id,slug,guild}){
  database.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,current_season,current_week,discord_guild_id,discord_connected,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,2026,10,?,1,'active','enabled','America/Chicago')`).run(id,`${slug} League`,'FranchiseHQ',slug,guild);
  database.prepare(`INSERT INTO discord_league_installations
    (id,league_id,discord_guild_id,application_id,status) VALUES (?,?,?,?,'active')`)
    .run(`install-${id}`,id,guild,'100000000000000009');
}

function seedMember(database,{leagueId,userId='user-a',discordId='100000000000000011',active=1,teamId='tb',role='team_owner'}){
  database.prepare(`INSERT OR IGNORE INTO users
    (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
    .run(userId,discordId,`member-${userId}`,`Member ${userId}`);
  database.prepare(`INSERT INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,?)`)
    .run(`membership-${leagueId}-${userId}`,leagueId,userId,role,teamId,active);
}

function seedActiveWeek(database,{leagueId,week=14}={}){
  const snapshotId=`snapshot-${leagueId}-${week}`;
  database.prepare(`INSERT INTO league_snapshots
    (id,league_id,status,season_year,week_index,team_count,game_count,manifest_json,validation_status)
    VALUES (?,?,'active',2026,?,2,1,'{}','ready')`).run(snapshotId,leagueId,week);
  database.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES (?,?)
    ON CONFLICT(league_id) DO UPDATE SET snapshot_id=excluded.snapshot_id`).run(leagueId,snapshotId);
  const records=[
    ['teams','1001',{external_id:'1001',display_name:'Tampa Bay Buccaneers',abbreviation:'TB'}],
    ['teams','1002',{external_id:'1002',display_name:'San Francisco 49ers',abbreviation:'SF'}],
    ['games',`game-${week}`,{
      external_id:`game-${week}`,season_year:2026,stage:'regular-season',week_index:week,
      away_team_external_id:'1002',home_team_external_id:'1001',status:'scheduled'
    }]
  ];
  for(const [domain,externalId,data] of records){
    database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`)
      .run(snapshotId,leagueId,domain,externalId,JSON.stringify(data));
  }
  return snapshotId;
}

function seedSnapshotRecord(database,{snapshotId,leagueId,domain,externalId,data}){
  database.prepare(`INSERT INTO league_snapshot_records
    (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`)
    .run(snapshotId,leagueId,domain,externalId,JSON.stringify(data));
}

function seedDiscordStatFixture(database,{leagueId='league-a',week=13}={}){
  const snapshotId=seedActiveWeek(database,{leagueId,week});
  const players=[
    {external_id:'player-tb',team_external_id:'1001',display_name:'Baker Example',position:'QB',overall:91,age:30,development_trait:'Star'},
    {external_id:'player-sf',team_external_id:'1002',display_name:'Brock Example',position:'QB',overall:89,age:26,development_trait:'Normal'},
    {external_id:'receiver-tb',team_external_id:'1001',display_name:'Mike Example',position:'WR',overall:88,age:27,development_trait:'Star'}
  ];
  players.forEach(player=>seedSnapshotRecord(database,{snapshotId,leagueId,domain:'players',externalId:player.external_id,data:player}));
  const stats=[
    ['tb-pass-w1',{category:'passing',player_external_id:'player-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({passYds:100,passTDs:1,passComp:6,passAtt:10,passCompPct:60,passerRating:95})}],
    ['tb-pass-w2',{category:'passing',player_external_id:'player-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:2,metrics_json:JSON.stringify({passYds:150,passTDs:2,passComp:9,passAtt:15,passCompPct:60,passerRating:110})}],
    ['sf-pass-w1',{category:'passing',player_external_id:'player-sf',team_external_id:'1002',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({passYds:999,passTDs:9,passComp:30,passAtt:40,passCompPct:75,passerRating:140})}],
    ['tb-rec-w1',{category:'receiving',player_external_id:'receiver-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({recYds:80,recTDs:1,recCatches:7})}],
    ['tb-rec-w2',{category:'receiving',player_external_id:'receiver-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:2,metrics_json:JSON.stringify({recYds:120,recTDs:2,recCatches:8})}],
    ['tb-pre',{category:'passing',player_external_id:'player-tb',team_external_id:'1001',season_year:2026,stage:'preseason',week_index:1,metrics_json:JSON.stringify({passYds:5000,passTDs:50,passComp:50,passAtt:50})}]
  ];
  stats.forEach(([externalId,data])=>seedSnapshotRecord(database,{snapshotId,leagueId,domain:'statistics',externalId,data:{external_key:externalId,...data}}));
  database.prepare(`UPDATE league_snapshots SET player_count=?,statistic_count=? WHERE id=?`).run(players.length,stats.length,snapshotId);
  return snapshotId;
}

async function seedSession(database,{userId,token}){
  database.prepare(`INSERT INTO sessions
    (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,'2099-01-01T00:00:00.000Z')`)
    .run(`session-${userId}`,userId,await hashToken(token));
}

function leagueApiContext(db,{slug,token,method='GET',body=null,clientId='100000000000000009',env={}}){
  return {params:{leagueSlug:slug},env:{DB:db,DISCORD_CLIENT_ID:clientId,...env},request:new Request(
    `https://franchisehq.app/api/leagues/${encodeURIComponent(slug)}/discord`,{
      method,headers:{Cookie:`${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${token}`,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    }
  )};
}

test('global Discord command inventory restores legacy week commands and remains multi-league capable',()=>{
  assert.equal(DISCORD_GLOBAL_COMMANDS.length,36);
  assert.equal(new Set(DISCORD_GLOBAL_COMMANDS.map(command=>command.name)).size,36);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.map(command=>command.name),[
    'standings','schedule','stats','player-stats','team-stats','leaders','player','trade-block','trade-history','news',
    'gotw','league-site','twitch','join','gm-history','confidence','rules','trade',
    ...Array.from({length:18},(_,index)=>`week${index+1}`)
  ]);
  assert.equal(DISCORD_SCHEDULE_THREAD_COMMANDS.length,18);
  for(const command of DISCORD_GLOBAL_COMMANDS){
    assert.match(command.name,/^[a-z0-9-]{1,32}$/);
    assert.ok(command.description.length>=1&&command.description.length<=100);
  }
  const trade=DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='trade');
  assert.ok(trade.options.some(option=>option.name==='multi-team'));
});

test('Discord installation verifies the selected guild against the authenticated user permission list',async()=>{
  const requests=[];
  const guild=await discordAuthorizedGuild('oauth-user-token','100000000000000077',{
    fetchImpl:async(url,options={})=>{
      requests.push({url:String(url),authorization:options.headers?.Authorization});
      return new Response(JSON.stringify([
        {id:'100000000000000066',owner:false,permissions:'0'},
        {id:'100000000000000077',owner:false,permissions:'32'}
      ]),{status:200,headers:{'content-type':'application/json'}});
    }
  });
  assert.equal(guild.id,'100000000000000077');
  assert.equal(discordGuildPermissionAllowsInstall(guild.permissions),true);
  assert.deepEqual(requests,[{
    url:`https://discord.com/api/v10/${'users'}/@me/guilds?limit=200`,
    authorization:'Bearer oauth-user-token'
  }]);
  assert.equal(discordGuildPermissionAllowsInstall('8'),true);
  assert.equal(discordGuildPermissionAllowsInstall('0'),false);
  assert.equal(await discordAuthorizedGuild('oauth-user-token','100000000000000088',{
    fetchImpl:async()=>new Response('[]',{status:200,headers:{'content-type':'application/json'}})
  }),null);
});

test('commissioners map one Discord server to one league and can disable it without deleting the relationship',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedLeague(database,{id:'league-b',slug:'bravo',guild:'100000000000000002'});
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000021',role:'commissioner'});
    seedMember(database,{leagueId:'league-b',userId:'commissioner-b',discordId:'100000000000000022',role:'commissioner'});
    await seedSession(database,{userId:'commissioner-a',token:'token-a'});
    await seedSession(database,{userId:'commissioner-b',token:'token-b'});
    database.exec(`DELETE FROM discord_league_installations; UPDATE leagues SET discord_guild_id=NULL,discord_connected=0;`);
    const db=d1(database),guildId='100000000000000077',committee='100000000000000078';
    const connected=await postDiscordInstallation(leagueApiContext(db,{slug:'alpha',token:'token-a',method:'POST',body:{
      action:'connect',guildId,tradeCommitteeChannelId:committee
    }}));
    const connectedPayload=await connected.json();
    assert.equal(connected.status,200,JSON.stringify(connectedPayload));
    assert.equal(connectedPayload.installation.guildId,guildId);
    assert.equal(connectedPayload.installation.tradeCommitteeChannelId,committee);
    assert.equal(connectedPayload.globalCommands,true);
    assert.match(connectedPayload.connectUrl,/\/api\/leagues\/alpha\/discord\/connect$/);
    assert.equal(connectedPayload.automaticConnection,true);

    const duplicate=await postDiscordInstallation(leagueApiContext(db,{slug:'bravo',token:'token-b',method:'POST',body:{
      action:'connect',guildId
    }}));
    assert.equal(duplicate.status,409);
    assert.match((await duplicate.json()).error,/already connected to another/i);

    const loaded=await getDiscordInstallation(leagueApiContext(db,{slug:'alpha',token:'token-a'}));
    assert.equal((await loaded.json()).installation.guildId,guildId);
    const disabled=await postDiscordInstallation(leagueApiContext(db,{slug:'alpha',token:'token-a',method:'POST',body:{action:'disable'}}));
    assert.equal((await disabled.json()).installation.status,'disabled');
    assert.deepEqual({...database.prepare(`SELECT discord_guild_id AS guildId,discord_connected AS connected FROM leagues WHERE id='league-a'`).get()},{guildId,connected:0});
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM tenant_audit_events WHERE league_id='league-a' AND action LIKE 'discord_installation_%'`).get().count,2);
  }finally{database.close()}
});

test('commissioners select verified existing Discord channels and refresh command definitions',async()=>{
  const database=new DatabaseSync(':memory:');
  const originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000021',role:'commissioner'});
    await seedSession(database,{userId:'commissioner-a',token:'token-a'});
    const channelIds=['100000000000000051','100000000000000052','100000000000000053'];
    const requests=[];
    globalThis.fetch=async(url,options={})=>{
      requests.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      if(/\/guilds\/100000000000000001\/channels$/.test(String(url))){
        return new Response(JSON.stringify(channelIds.map((id,index)=>({id,type:0,name:['scheduling','trade-committee','league-news'][index],position:index}))),{
          status:200,headers:{'content-type':'application/json'}
        });
      }
      return new Response('{"id":"command-upserted"}',{status:200,headers:{'content-type':'application/json'}});
    };
    const response=await postDiscordInstallation(leagueApiContext(d1(database),{
      slug:'alpha',token:'token-a',method:'POST',env:{DISCORD_BOT_TOKEN:'test-token'},body:{
        action:'configure-channels',scheduleChannelId:channelIds[0],tradeCommitteeChannelId:channelIds[1],notificationChannelId:channelIds[2]
      }
    }));
    const payload=await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.deepEqual({
      schedule:payload.installation.scheduleChannelId,
      committee:payload.installation.tradeCommitteeChannelId,
      notifications:payload.installation.notificationChannelId
    },{schedule:channelIds[0],committee:channelIds[1],notifications:channelIds[2]});
    assert.equal(requests.filter(request=>/\/applications\/100000000000000009\/commands$/.test(request.url)&&request.method==='POST').length,DISCORD_GLOBAL_COMMANDS.length);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE league_id='league-a' AND action='discord_installation_configure-channels'`).get().count,1);

    const invalid=await postDiscordInstallation(leagueApiContext(d1(database),{
      slug:'alpha',token:'token-a',method:'POST',env:{DISCORD_BOT_TOKEN:'test-token'},body:{
        action:'configure-channels',scheduleChannelId:'100000000000000099'
      }
    }));
    assert.equal(invalid.status,400);
    assert.match((await invalid.json()).error,/connected Discord server/i);
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('global command registration upserts by name without bulk replacement',async()=>{
  const requests=[];
  const fetchImpl=async(url,options={})=>{
    requests.push({url:String(url),method:options.method,body:JSON.parse(options.body||'{}')});
    return new Response(JSON.stringify({id:`command-${requests.length}`}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const registered=await upsertDiscordGlobalCommands({
    DISCORD_CLIENT_ID:'100000000000000009',DISCORD_BOT_TOKEN:'secret'
  },DISCORD_GLOBAL_COMMANDS.slice(0,3),{fetchImpl});
  assert.equal(registered.length,3);
  assert.equal(requests.length,3);
  assert.ok(requests.every(item=>item.method==='POST'));
  assert.ok(requests.every(item=>/\/applications\/100000000000000009\/commands$/.test(item.url)));
  assert.deepEqual(requests.map(item=>item.body.name),['standings','schedule','stats']);

  requests.length=0;
  await upsertDiscordGuildCommands({
    DISCORD_CLIENT_ID:'100000000000000009',DISCORD_BOT_TOKEN:'secret'
  },'100000000000000077',DISCORD_GLOBAL_COMMANDS.slice(0,2),{fetchImpl});
  assert.ok(requests.every(item=>item.method==='POST'));
  assert.ok(requests.every(item=>/\/applications\/100000000000000009\/guilds\/100000000000000077\/commands$/.test(item.url)));

  requests.length=0;
  const ensureFetch=async(url,options={})=>{
    requests.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
    if((options.method||'GET')==='GET')return new Response(JSON.stringify([{name:'standings'},{name:'schedule'}]),{
      status:200,headers:{'content-type':'application/json'}
    });
    return new Response('{"id":"command-created"}',{status:200,headers:{'content-type':'application/json'}});
  };
  await ensureDiscordGlobalCommands({
    DISCORD_CLIENT_ID:'100000000000000009',DISCORD_BOT_TOKEN:'secret'
  },DISCORD_GLOBAL_COMMANDS.slice(0,3),{fetchImpl:ensureFetch});
  assert.deepEqual(requests.map(item=>[item.method,item.body?.name||null]),[
    ['POST','standings'],['POST','schedule'],['POST','stats']
  ]);
});

test('signed autocomplete returns tenant teams without creating command receipts',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000087',name:'standings',type:4,options:[
        {type:3,name:'view',value:'bucc',focused:true}
      ]
    })}));
    const payload=await response.json();
    assert.equal(payload.type,8);
    assert.deepEqual(payload.data.choices,[{name:'Team · Tampa Bay Buccaneers (TB)',value:'team:tb'}]);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM discord_interaction_receipts`).get().count,0);
  }finally{database.close()}
});

test('Discord statistics are season-cumulative, team-scoped, and expose rich player previews',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedDiscordStatFixture(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey();
    const teamResponse=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000086',name:'team-stats',options:[
        {type:3,name:'team',value:'tb'},{type:3,name:'category',value:'passing'}
      ]
    })}));
    const teamPayload=await teamResponse.json();
    assert.match(teamPayload.data.content,/Tampa Bay Buccaneers/);
    assert.match(teamPayload.data.content,/Pass Yds 250/);
    assert.match(teamPayload.data.content,/Pass TDs 3/);
    assert.match(teamPayload.data.content,/Comp % 60/);
    assert.doesNotMatch(teamPayload.data.content,/1,249|5,250|999/);

    const playerStats=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000085',name:'player-stats',options:[
        {type:3,name:'player',value:'player-tb'},{type:3,name:'category',value:'passing'}
      ]
    })}));
    const playerStatsPayload=await playerStats.json();
    assert.match(playerStatsPayload.data.content,/Baker Example Franchise Career/);
    assert.match(playerStatsPayload.data.content,/2026 · Passing/);
    assert.match(playerStatsPayload.data.content,/Pass Yds 250/);
    assert.doesNotMatch(playerStatsPayload.data.content,/W1|W2|5,250/);

    const leaders=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000084',name:'leaders',options:[
        {type:3,name:'category',value:'receiving'},{type:3,name:'metric',value:'recTDs'}
      ]
    })}));
    assert.match((await leaders.json()).data.content,/Mike Example.*3/s);

    const player=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000083',name:'player',options:[{type:3,name:'name',value:'player-tb'}]
    })}));
    const playerPayload=await player.json();
    assert.equal(playerPayload.data.embeds[0].title,'Baker Example');
    assert.equal(playerPayload.data.embeds[0].fields.find(field=>field.name==='Overall').value,'91');
    assert.equal(playerPayload.data.embeds[0].fields.find(field=>field.name==='Age').value,'30');
    assert.match(playerPayload.data.embeds[0].fields.at(-1).value,/Pass Yds: 250/);
    assert.match(playerPayload.data.content,/\/leagues\/alpha#players\/player-tb/);
  }finally{database.close()}
});

test('GM History includes current-season results before the season is archived',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    const snapshotId=seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`UPDATE league_snapshot_records SET data_json=?
      WHERE snapshot_id=? AND league_id='league-a' AND domain='games'`).run(JSON.stringify({
        external_id:'game-13',season_year:2026,stage:'regular-season',week_index:13,
        away_team_external_id:'1002',home_team_external_id:'1001',status:'final',away_score:17,home_score:24
      }),snapshotId);
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-2026','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    database.prepare(`INSERT INTO gm_identities
      (id,league_id,user_id,public_id,display_name) VALUES ('gm-a','league-a','user-a','gm-public-a','Member user-a')`).run();
    database.prepare(`INSERT INTO team_ownership_periods
      (id,league_id,gm_identity_id,team_key,franchise_season_id,started_at,started_stage,started_week)
      VALUES ('period-a','league-a','gm-a','tb','season-2026',CURRENT_TIMESTAMP,'preseason',1)`).run();
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000082',name:'gm-history',options:[{type:3,name:'name',value:'user-a'}]
    })}));
    const payload=await response.json();
    assert.match(payload.data.content,/Member user-a/);
    assert.match(payload.data.content,/1-0/);
  }finally{database.close()}
});

test('/week14 bootstraps one commissioner league and creates identity-driven matchup threads',async()=>{
  const database=new DatabaseSync(':memory:');
  const originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    database.exec(`DELETE FROM discord_league_installations; UPDATE leagues SET discord_guild_id=NULL,discord_connected=0;`);
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000011',teamId:'tb',role:'commissioner'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    seedActiveWeek(database,{leagueId:'league-a',week:14});
    const requests=[];
    globalThis.fetch=async(url,options={})=>{
      const request={url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null};
      requests.push(request);
      if(/\/channels\/100000000000000055\/messages$/.test(request.url)){
        return new Response('{"id":"100000000000000088"}',{status:200,headers:{'content-type':'application/json'}});
      }
      if(/\/messages\/100000000000000088\/threads$/.test(request.url)){
        return new Response('{"id":"100000000000000088","type":11}',{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({
      db,key,env:{DISCORD_CLIENT_ID:'100000000000000009',DISCORD_BOT_TOKEN:'test-token'},
      interaction:interaction({id:'100000000000000089',name:'week14',permissions:'32'})
    }));
    const payload=await response.json();
    assert.equal(payload.type,4);
    assert.equal(payload.data.flags,64);
    assert.match(payload.data.content,/Week 14 schedule synchronized/i);
    const starter=requests.find(item=>/\/messages$/.test(item.url));
    assert.match(starter.body.content,/<@100000000000000011>/);
    assert.match(starter.body.content,/<@100000000000000012>/);
    assert.deepEqual(starter.body.allowed_mentions,{parse:[],users:['100000000000000011','100000000000000012']});
    assert.equal(database.prepare(`SELECT connection_source FROM discord_league_installations WHERE league_id='league-a'`).get().connection_source,'signed-command-bootstrap');
    assert.deepEqual({...database.prepare(`SELECT status,week_index,thread_count,registered_owner_count
      FROM discord_schedule_sync_runs WHERE league_id='league-a'`).get()}, {
      status:'completed',week_index:14,thread_count:1,registered_owner_count:2
    });
    assert.deepEqual({...database.prepare(`SELECT status,home_discord_user_id,away_discord_user_id
      FROM discord_schedule_threads WHERE league_id='league-a'`).get()}, {
      status:'active',home_discord_user_id:'100000000000000011',away_discord_user_id:'100000000000000012'
    });
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('a live import creates the complete new schedule before removing prior FranchiseHQ threads',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000011',teamId:'tb',role:'commissioner'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    database.prepare(`UPDATE discord_league_installations SET schedule_channel_id='100000000000000055'
      WHERE league_id='league-a'`).run();
    const db=d1(database),requests=[];
    let starter=87;
    const fetchImpl=async(url,options={})=>{
      const request={url:String(url),method:options.method||'GET'};requests.push(request);
      if(request.method==='DELETE')return new Response(null,{status:204});
      if(/\/messages$/.test(request.url)){
        starter+=1;
        return new Response(JSON.stringify({id:`1000000000000000${starter}`}),{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const league={id:'league-a',slug:'alpha',name:'Alpha League'};
    const week13=seedActiveWeek(database,{leagueId:'league-a',week:13});
    const first=await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:week13,source:'candidate-import',fetchImpl
    });
    assert.equal(first.ok,true);
    assert.equal(first.removedPriorThreads,0);

    const week14=seedActiveWeek(database,{leagueId:'league-a',week:14});
    const second=await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:week14,source:'candidate-import',fetchImpl
    });
    assert.equal(second.ok,true);
    assert.equal(second.created,1);
    assert.equal(second.removedPriorThreads,1);
    assert.equal(requests.filter(request=>request.method==='DELETE').length,1);
    assert.deepEqual(database.prepare(`SELECT week_index AS week,status FROM discord_schedule_threads
      WHERE league_id='league-a' ORDER BY week_index`).all().map(row=>({...row})),[
      {week:13,status:'archived'},{week:14,status:'active'}
    ]);
  }finally{database.close()}
});

test('a failed replacement schedule leaves the prior active threads untouched',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000011',teamId:'tb',role:'commissioner'});
    database.prepare(`UPDATE discord_league_installations SET schedule_channel_id='100000000000000055'
      WHERE league_id='league-a'`).run();
    const db=d1(database),league={id:'league-a',slug:'alpha',name:'Alpha League'};
    const workingFetch=async(url,options={})=>{
      if(/\/messages$/.test(String(url)))return new Response('{"id":"100000000000000088"}',{status:200,headers:{'content-type':'application/json'}});
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const week13=seedActiveWeek(database,{leagueId:'league-a',week:13});
    assert.equal((await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:week13,source:'candidate-import',fetchImpl:workingFetch
    })).ok,true);

    const week14=seedActiveWeek(database,{leagueId:'league-a',week:14});
    const requests=[];
    const failingFetch=async(url,options={})=>{
      requests.push({url:String(url),method:options.method||'GET'});
      return new Response('{"message":"temporary failure"}',{status:500,headers:{'content-type':'application/json'}});
    };
    const failed=await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:week14,source:'candidate-import',fetchImpl:failingFetch
    });
    assert.equal(failed.ok,false);
    assert.equal(requests.some(request=>request.method==='DELETE'),false);
    assert.deepEqual({...database.prepare(`SELECT week_index AS week,status FROM discord_schedule_threads
      WHERE league_id='league-a' AND week_index=13`).get()},{week:13,status:'active'});
  }finally{database.close()}
});

test('signed Discord commands resolve guild to one tenant and reject cross-tenant access',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedLeague(database,{id:'league-b',slug:'bravo',guild:'100000000000000002'});
    seedMember(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey();

    const allowed=await discordInteractions(await signedContext({db,key,interaction:interaction()}));
    const allowedPayload=await allowed.json();
    assert.equal(allowed.status,200);
    assert.equal(allowedPayload.type,4);
    assert.match(allowedPayload.data.content,/alpha League/);
    assert.match(allowedPayload.data.content,/\/leagues\/alpha/);
    assert.equal(allowedPayload.data.flags,0);

    const denied=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000098',guild:'100000000000000002'
    })}));
    const deniedPayload=await denied.json();
    assert.equal(deniedPayload.type,4);
    assert.equal(deniedPayload.data.flags,64);
    assert.match(deniedPayload.data.content,/Join this league first/);
    assert.doesNotMatch(deniedPayload.data.content,/alpha/i);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM discord_interaction_receipts WHERE league_id='league-a'`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM discord_interaction_receipts WHERE league_id='league-b'`).get().count,0);
  }finally{database.close()}
});

test('/join creates active unassigned access and does not grant team authority',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({name:'join'})}));
    const payload=await response.json();
    assert.equal(payload.type,4);
    assert.equal(payload.data.flags,64);
    assert.match(payload.data.content,/active but unassigned/i);
    assert.deepEqual({...database.prepare(`SELECT role,team_id,active FROM league_memberships WHERE league_id='league-a'`).get()},{
      role:'team_owner',team_id:null,active:1
    });
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE league_id='league-a' AND action='discord_member_joined'`).get().count,1);

    const tradeAttempt=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000097',name:'trade',options:[{type:1,name:'create',options:[
        {type:3,name:'opponent',value:'sf'},{type:3,name:'send',value:'player:test-a'},{type:3,name:'receive',value:'player:test-b'}
      ]}]
    })}));
    assert.match((await tradeAttempt.json()).data.content,/assign you to a team/i);
  }finally{database.close()}
});

test('revoked membership cannot self-reactivate and interaction replay is idempotent',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a',active:0,teamId:null});
    const db=d1(database),key=await signingKey();
    const join=interaction({name:'join'});
    const denied=await discordInteractions(await signedContext({db,key,interaction:join}));
    assert.match((await denied.json()).data.content,/revoked/i);
    assert.equal(database.prepare(`SELECT active FROM league_memberships WHERE league_id='league-a'`).get().active,0);

    database.prepare(`UPDATE league_memberships SET active=1 WHERE league_id='league-a'`).run();
    const firstInteraction=interaction({id:'100000000000000096'});
    const first=await discordInteractions(await signedContext({db,key,interaction:firstInteraction}));
    assert.match((await first.json()).data.content,/alpha League/);
    const replay=await discordInteractions(await signedContext({db,key,interaction:firstInteraction}));
    assert.match((await replay.json()).data.content,/already received/i);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM discord_interaction_receipts
      WHERE interaction_id='100000000000000096'`).get().count,1);
  }finally{database.close()}
});

test('invalid or stale Discord signatures fail before tenant lookup',async()=>{
  const key=await signingKey();
  const body=JSON.stringify({id:'100000000000000095',type:1});
  const invalid=await discordInteractions({env:{DISCORD_PUBLIC_KEY:key.publicKey},request:new Request('https://franchisehq.app/api/discord/interactions',{
    method:'POST',headers:{'x-signature-ed25519':'00'.repeat(64),'x-signature-timestamp':String(Math.floor(Date.now()/1000))},body
  })});
  assert.equal(invalid.status,401);
  const staleTimestamp=String(Math.floor(Date.now()/1000)-600);
  const staleSignature=await crypto.subtle.sign({name:'Ed25519'},key.pair.privateKey,new TextEncoder().encode(`${staleTimestamp}${body}`));
  const stale=await discordInteractions({env:{DISCORD_PUBLIC_KEY:key.publicKey},request:new Request('https://franchisehq.app/api/discord/interactions',{
    method:'POST',headers:{'x-signature-ed25519':hex(staleSignature),'x-signature-timestamp':staleTimestamp},body
  })});
  assert.equal(stale.status,401);
});

test('Discord PING receives a signed PONG without changing data',async()=>{
  const key=await signingKey();
  const response=await discordInteractions(await signedContext({db:null,key,interaction:{id:'100000000000000094',type:1}}));
  assert.deepEqual(await response.json(),{type:1});
});

test('Twitch profile is global while visibility and membership remain league-scoped',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedLeague(database,{id:'league-b',slug:'bravo',guild:'100000000000000002'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-b'});
    const db=d1(database),key=await signingKey();
    const set=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000093',name:'twitch',options:[{type:1,name:'set',options:[
        {type:3,name:'channel',value:'https://twitch.tv/FHQOwner'}
      ]}]
    })}));
    const setPayload=await set.json();
    assert.equal(setPayload.data.flags,64);
    assert.match(setPayload.data.content,/twitch\.tv\/fhqowner/);
    assert.deepEqual({...database.prepare(`SELECT twitch_handle,twitch_url FROM user_stream_profiles`).get()}, {
      twitch_handle:'fhqowner',twitch_url:'https://www.twitch.tv/fhqowner'
    });

    const view=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000092',guild:'100000000000000002',name:'twitch',options:[{type:1,name:'view',options:[
        {type:6,name:'member',value:'100000000000000011'},{type:5,name:'private',value:true}
      ]}]
    })}));
    const viewPayload=await view.json();
    assert.equal(viewPayload.data.flags,64);
    assert.match(viewPayload.data.content,/twitch\.tv\/fhqowner/);
  }finally{database.close()}
});

test('published News is shared with Discord while drafts stay private to commissioners',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    database.prepare(`INSERT INTO league_news_posts
      (id,league_id,category,title,summary,body,status,author_user_id,published_at)
      VALUES ('published','league-a','Commissioner','Week 10 Advance','League advanced.','Full story.','published','user-a',CURRENT_TIMESTAMP)`).run();
    database.prepare(`INSERT INTO league_news_posts
      (id,league_id,category,title,summary,body,status,author_user_id)
      VALUES ('draft','league-a','Commissioner','Private Draft','Not public.','Private.','draft','user-a')`).run();
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000091',name:'news'
    })}));
    const payload=await response.json();
    assert.equal(payload.data.flags,0);
    assert.match(payload.data.content,/Week 10 Advance/);
    assert.doesNotMatch(payload.data.content,/Private Draft/);
  }finally{database.close()}
});

test('production-style execution defers inside three seconds and edits the original response',async()=>{
  const database=new DatabaseSync(':memory:');
  const originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey(),pending=[],requests=[];
    globalThis.fetch=async(url,options={})=>{
      requests.push({url:String(url),method:options.method,body:JSON.parse(options.body||'{}')});
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const context=await signedContext({db,key,interaction:interaction({id:'100000000000000090'})});
    context.waitUntil=promise=>pending.push(promise);
    const response=await discordInteractions(context);
    assert.deepEqual(await response.json(),{type:5,data:{allowed_mentions:{parse:[]}}});
    await Promise.all(pending);
    assert.equal(requests.length,1);
    assert.equal(requests[0].method,'PATCH');
    assert.match(requests[0].url,/\/webhooks\/100000000000000009\/token-100000000000000090\/messages\/@original$/);
    assert.match(requests[0].body.content,/alpha League/);
    assert.equal(database.prepare(`SELECT status FROM discord_interaction_receipts
      WHERE interaction_id='100000000000000090'`).get().status,'completed');
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('in-app trade notifications create durable private Discord delivery intents',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    database.prepare(`INSERT INTO league_notifications
      (id,league_id,user_id,trade_id,notification_type,title,message)
      VALUES ('notice-a','league-a','user-a',NULL,'received','Trade received','Open the Trade Center.')`).run();
    assert.deepEqual({...database.prepare(`SELECT league_id,user_id,discord_user_id,visibility,status,idempotency_key
      FROM discord_delivery_events WHERE idempotency_key='league-notification:notice-a'`).get()}, {
      league_id:'league-a',user_id:'user-a',discord_user_id:'100000000000000011',
      visibility:'direct-message',status:'pending',idempotency_key:'league-notification:notice-a'
    });
  }finally{database.close()}
});

test('durable trade delivery opens a DM and includes the private response command',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    database.prepare(`INSERT INTO discord_delivery_events
      (id,league_id,user_id,discord_user_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
      VALUES ('delivery-a','league-a','user-a','100000000000000011','received','trade_workflow','trade-a','direct-message',?,?)`)
      .run('{"title":"Trade received","message":"Open the Trade Center.","tradeId":"trade-a","leagueSlug":"alpha"}','league-notification:notice-delivery');
    const requests=[];
    const fetchImpl=async(url,options={})=>{
      requests.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null});
      if(String(url).endsWith(['','users','@me','channels'].join('/')))return new Response('{"id":"100000000000000088"}',{status:200,headers:{'content-type':'application/json'}});
      return new Response('{"id":"message-a"}',{status:200,headers:{'content-type':'application/json'}});
    };
    const result=await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-bot-token'},d1(database),{leagueId:'league-a',fetchImpl});
    assert.deepEqual(result,{sent:1,failed:0,skipped:false});
    assert.equal(requests.length,2);
    assert.match(requests[1].body.content,/\/trade accept trade:trade-a/);
    assert.match(requests[1].body.content,/\/leagues\/alpha#trade-center\/trade-a/);
    assert.equal(database.prepare(`SELECT status FROM discord_delivery_events WHERE idempotency_key='league-notification:notice-delivery'`).get().status,'sent');
  }finally{database.close()}
});
