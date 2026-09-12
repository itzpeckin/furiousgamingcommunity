import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  DISCORD_GLOBAL_COMMANDS,
  DISCORD_RETIRED_GLOBAL_COMMANDS,
  DISCORD_SCHEDULE_THREAD_COMMANDS,
  discordGlobalCommandsNamed
} from '../../functions/_lib/discord-commands.js';
import { onRequestPost as discordInteractions } from '../../functions/api/discord/interactions.js';
import { flushDiscordDeliveries, queueTradeRoomUpdate, tradeConversationMessage } from '../../functions/_lib/discord-delivery.js';
import { tradeDecisionCustomId } from '../../functions/_lib/discord-trade-components.js';
import {
  ensureDiscordGlobalCommands,
  reconcileDiscordGlobalCommands,
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
  discordGuildRoles,
  discordGuildPermissionAllowsInstall
} from '../../functions/_lib/discord-installation.js';
import { syncDiscordScheduleThreads } from '../../functions/_lib/discord-schedule.js';
import { ensureDraftPickHorizon } from '../../functions/_lib/draft-pick-baselines.js';
import { activeLeagueTeams } from '../../functions/_lib/league-teams.js';
import { executeTradeCenterAction } from '../../functions/api/leagues/[leagueSlug]/trade-center.js';

async function applyMigrations(database){
  const files=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for(const file of files)database.exec(await readFile(path.join(ROOT,file),'utf8'));
}

function d1(database,trace=()=>{}){
  return {
    prepare(sql){
      trace(String(sql));
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

function interaction({id='100000000000000099',guild='100000000000000001',channel='100000000000000055',user='100000000000000011',name='league-site',options=[],permissions=null,type=2,data=null}={}){
  const identity={id:user,username:`member-${user.slice(-2)}`,global_name:`Member ${user.slice(-2)}`,avatar:null};
  return {
    id,application_id:'100000000000000009',token:`token-${id}`,type,channel_id:channel,
    ...(guild?{guild_id:guild,member:{...(permissions===null?{}:{permissions:String(permissions)}),user:identity}}:{user:identity}),
    data:data||{id:`command-${id}`,name,type:1,options}
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

function seedNflStandingsFixture(database,{leagueId='league-a',week=14}={}){
  const snapshotId=seedActiveWeek(database,{leagueId,week});
  const teams=[
    ['TB','Tampa Bay Buccaneers','NFC','South'],['SF','San Francisco 49ers','NFC','West'],
    ['DAL','Dallas Cowboys','NFC','East'],['NYG','New York Giants','NFC','East'],['PHI','Philadelphia Eagles','NFC','East'],['WAS','Washington Commanders','NFC','East'],
    ['CHI','Chicago Bears','NFC','North'],['DET','Detroit Lions','NFC','North'],['GB','Green Bay Packers','NFC','North'],['MIN','Minnesota Vikings','NFC','North'],
    ['ATL','Atlanta Falcons','NFC','South'],['CAR','Carolina Panthers','NFC','South'],['NO','New Orleans Saints','NFC','South'],
    ['ARI','Arizona Cardinals','NFC','West'],['LAR','Los Angeles Rams','NFC','West'],['SEA','Seattle Seahawks','NFC','West'],
    ['BUF','Buffalo Bills','AFC','East'],['MIA','Miami Dolphins','AFC','East'],['NE','New England Patriots','AFC','East'],['NYJ','New York Jets','AFC','East'],
    ['BAL','Baltimore Ravens','AFC','North'],['CIN','Cincinnati Bengals','AFC','North'],['CLE','Cleveland Browns','AFC','North'],['PIT','Pittsburgh Steelers','AFC','North'],
    ['HOU','Houston Texans','AFC','South'],['IND','Indianapolis Colts','AFC','South'],['JAX','Jacksonville Jaguars','AFC','South'],['TEN','Tennessee Titans','AFC','South'],
    ['DEN','Denver Broncos','AFC','West'],['KC','Kansas City Chiefs','AFC','West'],['LV','Las Vegas Raiders','AFC','West'],['LAC','Los Angeles Chargers','AFC','West']
  ];
  database.prepare(`DELETE FROM league_snapshot_records WHERE snapshot_id=? AND domain='teams'`).run(snapshotId);
  let nfcSeed=0,afcSeed=0;
  teams.forEach(([abbreviation,displayName,conference,division],index)=>{
    const externalId=String(1001+index),seed=conference==='NFC'?++nfcSeed:++afcSeed;
    seedSnapshotRecord(database,{snapshotId,leagueId,domain:'teams',externalId,data:{
      external_id:externalId,display_name:displayName,abbreviation,conference_name:conference,division_name:`${conference} ${division}`
    }});
    seedSnapshotRecord(database,{snapshotId,leagueId,domain:'standings',externalId,data:{
      external_id:externalId,teamId:externalId,teamName:displayName,totalWins:17-seed,totalLosses:seed-1,
      conferenceName:conference,divisionName:`${conference} ${division}`,rank:seed,seed,weekIndex:week
    }});
  });
  database.prepare(`UPDATE league_snapshots SET team_count=32,standing_count=32 WHERE id=?`).run(snapshotId);
  return snapshotId;
}

function seedDiscordStatFixture(database,{leagueId='league-a',week=13}={}){
  const snapshotId=seedActiveWeek(database,{leagueId,week});
  const players=[
    {external_id:'player-tb',team_external_id:'1001',display_name:'Baker Example',position:'QB',overall:91,age:30,development_trait:'Star',portrait_id:'654321'},
    {external_id:'player-sf',team_external_id:'1002',display_name:'Brock Example',position:'QB',overall:89,age:26,development_trait:'Normal'},
    {external_id:'receiver-tb',team_external_id:'1001',display_name:'Mike Example',position:'WR',overall:88,age:27,development_trait:'Star'},
    {external_id:'chase-rb',team_external_id:'1001',display_name:'Chase Runner',position:'HB',overall:87,age:24,development_trait:'Superstar',portrait_id:'123456'},
    {external_id:'chase-edge',team_external_id:'1002',display_name:'Chase Defender',position:'REDGE',overall:90,age:25,development_trait:'Star'},
    {external_id:'kicker-tb',team_external_id:'1001',display_name:'Casey Kicker',position:'K',overall:82,age:28,development_trait:'Normal',portrait_id:'654322'}
  ];
  players.forEach(player=>seedSnapshotRecord(database,{snapshotId,leagueId,domain:'players',externalId:player.external_id,data:player}));
  const stats=[
    ['tb-pass-w1',{category:'passing',player_external_id:'player-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({passYds:100,passTDs:1,passInts:0,passComp:6,passAtt:10,passCompPct:60,passerRating:95})}],
    ['tb-pass-w2',{category:'passing',player_external_id:'player-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:2,metrics_json:JSON.stringify({passYds:150,passTDs:2,passInts:1,passComp:9,passAtt:15,passCompPct:60,passerRating:110})}],
    ['sf-pass-w1',{category:'passing',player_external_id:'player-sf',team_external_id:'1002',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({passYds:999,passTDs:9,passComp:30,passAtt:40,passCompPct:75,passerRating:140})}],
    ['tb-rec-w1',{category:'receiving',player_external_id:'receiver-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({recYds:80,recTDs:1,recCatches:7})}],
    ['tb-rec-w2',{category:'receiving',player_external_id:'receiver-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:2,metrics_json:JSON.stringify({recYds:120,recTDs:2,recCatches:8})}],
    ['chase-rush-w1',{category:'rushing',player_external_id:'chase-rb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({rushYds:96,rushTDs:1,rushFum:1,rushAtt:18,rushYdsPerGame:96,rushToPct:60,rush20PlusYds:2,rushBrokenTackles:4,rushYdsAfterContact:42,rushLongest:31})}],
    ['chase-rec-w1',{category:'receiving',player_external_id:'chase-rb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({recCatches:4,recYds:38,recTDs:1,recYdsPerGame:38,recCatchPct:80,recToPct:25,recDrops:0,recYdsAfterCatch:25,recLongest:18})}],
    ['chase-defense-w1',{category:'defense',player_external_id:'chase-edge',team_external_id:'1002',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({defTotalTackles:7,defSacks:2,defInts:1,defForcedFum:1,defFumRec:1,defTDs:1,defDeflections:2,defIntReturnYds:21,defSafeties:0})}],
    ['kicker-w1',{category:'kicking',player_external_id:'kicker-tb',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({fGAtt:4,fGMade:3,fG50PlusMade:1,xPMade:4,xPAtt:4})}],
    ['tb-team-w1',{category:'team-game',team_external_id:'1001',season_year:2026,stage:'regular-season',week_index:1,metrics_json:JSON.stringify({offTotalYdsGained:350,offPassYds:250,offPassTDs:3,offRushYds:100,offRushTDs:1,off1stDowns:20,off3rdDownConv:5,off3rdDownAtt:10,offRedZones:4,offRedZoneTDs:3,offRedZoneFGs:1,offIntsLost:1,offFumLost:0,tOGiveaways:1,defTotalYds:280,defPassYds:200,defRushYds:80,defSacks:3,defIntsRec:2,defForcedFum:1,defFumRec:1,defRedZones:5,defRedZoneTDs:2,defRedZoneFGs:1,tOTakeaways:3,penalties:5,penaltyYds:45})}],
    ['tb-team-w2',{category:'team-game',team_external_id:'1001',season_year:null,stage:'regular-season',week_index:2,metrics_json:JSON.stringify({offTotalYdsGained:225,offPassYds:150,offPassTDs:2,offRushYds:75,offRushTDs:1,off1stDowns:15,off3rdDownConv:4,off3rdDownAtt:8,offRedZones:2,offRedZoneTDs:1,offRedZoneFGs:0,offIntsLost:1,offFumLost:0,tOGiveaways:1,defTotalYds:210,defPassYds:140,defRushYds:70,defSacks:2,defIntsRec:1,defForcedFum:0,defFumRec:0,defRedZones:2,defRedZoneTDs:1,defRedZoneFGs:0,tOTakeaways:1,penalties:4,penaltyYds:30})}],
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
  assert.equal(DISCORD_GLOBAL_COMMANDS.length,37);
  assert.equal(new Set(DISCORD_GLOBAL_COMMANDS.map(command=>command.name)).size,37);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.map(command=>command.name),[
    'standings','playoffs','eliminated','schedule','games','leaders','player','team','trade-block','trade-history','news',
    'gotw','league-site','twitch','join','gm-history','confidence','rules','trade',
    ...Array.from({length:18},(_,index)=>`week${index+1}`)
  ]);
  assert.deepEqual(DISCORD_RETIRED_GLOBAL_COMMANDS,['stats','player-stats','team-stats']);
  assert.equal(DISCORD_SCHEDULE_THREAD_COMMANDS.length,18);
  for(const command of DISCORD_GLOBAL_COMMANDS){
    assert.match(command.name,/^[a-z0-9-]{1,32}$/);
    assert.ok(command.description.length>=1&&command.description.length<=100);
  }
  const trade=DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='trade');
  assert.ok(trade.options.some(option=>option.name==='multi-team'));
  const create=trade.options.find(option=>option.name==='create');
  assert.match(create.options.find(option=>option.name==='send-1').description,/counts may differ/);
  assert.match(create.options.find(option=>option.name==='receive-2').description,/independent of send slots/);
  const schedule=DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='schedule');
  assert.deepEqual(schedule.options.map(option=>option.name),['current','week','team']);
  assert.equal(schedule.options.find(option=>option.name==='week').options.find(option=>option.name==='number').required,true);
  assert.equal(schedule.options.find(option=>option.name==='team').options.find(option=>option.name==='name').autocomplete,true);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='games').options.map(option=>option.name),['unplayed','played','all']);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='standings').options.map(option=>option.name),['all','division','conference','team']);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='gm-history').options.map(option=>option.name),['all','player']);
  assert.deepEqual(DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='rules').options.map(option=>option.name),['all','category','section','rule']);
  const leaders=DISCORD_GLOBAL_COMMANDS.find(command=>command.name==='leaders');
  assert.deepEqual(leaders.options.map(option=>option.name),['passing','rushing','receiving','defense','kicking']);
  assert.deepEqual(leaders.options.find(option=>option.name==='receiving').options.map(option=>option.name),['catches','yards','touchdowns']);
});

test('/standings distinguishes all divisions, all conferences, one team, and one named division while /playoffs returns each conference top 10',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedNflStandingsFixture(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey();
    const run=async(id,name,options=[])=>{
      const response=await discordInteractions(await signedContext({db,key,interaction:interaction({id,name,options})}));
      return response.json();
    };
    const divisions=await run('100000000000000071','standings',[{type:1,name:'division'}]);
    assert.equal(divisions.data.embeds[0].fields.length,8);
    assert.equal(divisions.data.embeds[0].fields.reduce((count,field)=>count+field.value.split('\n').length,0),32);
    const conferences=await run('100000000000000072','standings',[{type:1,name:'conference'}]);
    assert.equal(conferences.data.embeds[0].fields.length,2);
    assert.equal(conferences.data.embeds[0].fields.reduce((count,field)=>count+field.value.split('\n').length,0),32);
    const buccaneers=await run('100000000000000073','standings',[{type:1,name:'team',options:[{type:3,name:'name',value:'tb'}]}]);
    assert.match(buccaneers.data.content,/Tampa Bay Buccaneers.*16-0/s);
    assert.doesNotMatch(buccaneers.data.content,/San Francisco/);
    const nfcEast=await run('100000000000000074','standings',[{type:1,name:'division',options:[{type:3,name:'name',value:'NFC East'}]}]);
    assert.equal((nfcEast.data.content.match(/\*\*/g)||[]).length,10);
    assert.match(nfcEast.data.content,/Dallas Cowboys/);
    assert.doesNotMatch(nfcEast.data.content,/Tampa Bay Buccaneers/);
    const playoffs=await run('100000000000000075','playoffs');
    assert.equal(playoffs.data.embeds[0].fields.length,2);
    for(const field of playoffs.data.embeds[0].fields){
      assert.equal(field.value.split('\n').length,10);
      assert.equal((field.value.match(/In the Hunt/g)||[]).length,3);
    }
    const schedule=await run('100000000000000076','schedule',[{type:1,name:'week',options:[{type:4,name:'number',value:14}]}]);
    assert.match(schedule.data.content,/🟢 SF \(15-1\) @ 🟢 TB \(16-0\)/);
    assert.doesNotMatch(schedule.data.content,/\*\*/);
    const current=await run('100000000000000077','schedule',[{type:1,name:'current'}]);
    assert.match(current.data.content,/Week 14/);
    const teamSchedule=await run('100000000000000078','schedule',[{type:1,name:'team',options:[{type:3,name:'name',value:'tb'}]}]);
    assert.match(teamSchedule.data.content,/Tampa Bay Buccaneers Schedule/);
  }finally{database.close()}
});

test('/eliminated lists only teams with no division or Wild Card path through a 17-game record ceiling',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    const snapshotId=seedNflStandingsFixture(database,{leagueId:'league-a',week:14});
    const nfcWins=[12,10,9,9,8,7,7,7,6,6,5,5,4,4,3,2];
    nfcWins.forEach((wins,index)=>{
      const externalId=String(1001+index);
      const row=database.prepare(`SELECT data_json AS dataJson FROM league_snapshot_records
        WHERE snapshot_id=? AND domain='standings' AND external_id=?`).get(snapshotId,externalId);
      const data=JSON.parse(row.dataJson);
      database.prepare(`UPDATE league_snapshot_records SET data_json=?
        WHERE snapshot_id=? AND domain='standings' AND external_id=?`).run(JSON.stringify({
          ...data,totalWins:wins,totalLosses:14-wins,totalTies:0,rank:index+1,seed:index+1
      }),snapshotId,externalId);
    });
    seedSnapshotRecord(database,{snapshotId,leagueId:'league-a',domain:'games',externalId:'game-eliminated',data:{
      external_id:'game-eliminated',season_year:2026,stage:'regular-season',week_index:14,
      away_team_external_id:'1016',home_team_external_id:'1014',status:'scheduled'
    }});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000096',name:'eliminated'
    })}));
    const payload=await response.json(),embed=payload.data.embeds[0];
    assert.equal(embed.title,'Eliminated from Playoff Contention');
    assert.match(embed.description,/best possible 17-game record/);
    assert.match(embed.description,/tied record ceiling remains alive/);
    assert.match(embed.fields.find(field=>field.name==='NFC').value,/Seattle Seahawks \(SEA\).*2-12.*best 5-12/s);
    assert.doesNotMatch(embed.fields.map(field=>field.value).join('\n'),/Tampa Bay Buccaneers/);
    assert.doesNotMatch(embed.fields.map(field=>field.value).join('\n'),/Arizona Cardinals/);
    assert.match(embed.footer.text,/Record-only mathematical elimination/);
    const scheduleResponse=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000097',name:'schedule',options:[{type:1,name:'week',options:[{type:4,name:'number',value:14}]}]
    })}));
    const schedule=(await scheduleResponse.json()).data.content;
    assert.match(schedule,/🟢 SF \(10-4\) @ 🟢 TB \(12-2\)/);
    assert.match(schedule,/🔴 SEA \(2-12\) @ ⚪ ARI \(4-10\)/);
    assert.doesNotMatch(schedule,/\*\*/);
  }finally{database.close()}
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
    const channelIds=['100000000000000051','100000000000000052','100000000000000053','100000000000000054'];
    const committeeRoleId='100000000000000061';
    const requests=[];
    globalThis.fetch=async(url,options={})=>{
      requests.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      if(/\/guilds\/100000000000000001\/channels$/.test(String(url))){
        return new Response(JSON.stringify(channelIds.map((id,index)=>({id,type:0,name:['scheduling','trade-committee','league-news','private-trades'][index],position:index}))),{
          status:200,headers:{'content-type':'application/json'}
        });
      }
      if(/\/guilds\/100000000000000001\/roles$/.test(String(url))){
        return new Response(JSON.stringify([
          {id:'100000000000000001',name:'@everyone',position:0,managed:false,mentionable:true},
          {id:'100000000000000060',name:'Bot role',position:3,managed:true,mentionable:true},
          {id:'100000000000000062',name:'Hidden committee',position:2,managed:false,mentionable:false},
          {id:committeeRoleId,name:'Trade Committee',position:4,managed:false,mentionable:true}
        ]),{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response('{"id":"command-upserted"}',{status:200,headers:{'content-type':'application/json'}});
    };
    const response=await postDiscordInstallation(leagueApiContext(d1(database),{
      slug:'alpha',token:'token-a',method:'POST',env:{DISCORD_BOT_TOKEN:'test-token'},body:{
        action:'configure-channels',scheduleChannelId:channelIds[0],tradeCommitteeChannelId:channelIds[1],tradeCommitteeRoleId:committeeRoleId,notificationChannelId:channelIds[2],tradeChannelId:channelIds[3]
      }
    }));
    const payload=await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.deepEqual({
      schedule:payload.installation.scheduleChannelId,
      committee:payload.installation.tradeCommitteeChannelId,
      committeeRole:payload.installation.tradeCommitteeRoleId,
      notifications:payload.installation.notificationChannelId,
      trades:payload.installation.tradeChannelId
    },{schedule:channelIds[0],committee:channelIds[1],committeeRole:committeeRoleId,notifications:channelIds[2],trades:channelIds[3]});
    assert.deepEqual(payload.roles,[{id:committeeRoleId,name:'Trade Committee',color:0,position:4,mentionable:true}]);
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

test('Discord role discovery exposes only mentionable commissioner-selectable roles',async()=>{
  const roles=await discordGuildRoles({DISCORD_BOT_TOKEN:'test-token'},'100000000000000001',{fetchImpl:async()=>
    new Response(JSON.stringify([
      {id:'100000000000000001',name:'@everyone',position:0,managed:false,mentionable:true},
      {id:'100000000000000002',name:'Managed',position:4,managed:true,mentionable:true},
      {id:'100000000000000003',name:'Not Mentionable',position:3,managed:false,mentionable:false},
      {id:'100000000000000004',name:'Trade Committee',position:2,managed:false,mentionable:true}
    ]),{status:200,headers:{'content-type':'application/json'}})
  });
  assert.deepEqual(roles,[{id:'100000000000000004',name:'Trade Committee',color:0,position:2,mentionable:true}]);
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
  assert.deepEqual(requests.map(item=>item.body.name),['standings','playoffs','eliminated']);

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
    ['POST','standings'],['POST','playoffs'],['POST','eliminated']
  ]);
});

test('release tooling can select only the exact trade command without retiring any other name',async()=>{
  assert.deepEqual(discordGlobalCommandsNamed(['trade']).map(command=>command.name),['trade']);
  assert.throws(()=>discordGlobalCommandsNamed(['not-a-command']),/Unknown Discord command name/);
  const source=await readFile(path.join(ROOT,'tools/register-discord-commands.mjs'),'utf8');
  assert.match(source,/arg==='--name'/);
  assert.match(source,/exactNameUpsert\?\[\]:DISCORD_RETIRED_GLOBAL_COMMANDS/);
  assert.match(source,/reconcileDiscordGlobalCommands\([\s\S]+commands,\{retiredNames:retiredCommands\}/);
});

test('global command reconciliation retires only exact FranchiseHQ legacy statistic names',async()=>{
  const requests=[];
  const fetchImpl=async(url,options={})=>{
    const method=options.method||'GET';requests.push({url:String(url),method,body:options.body?JSON.parse(options.body):null});
    if(method==='GET')return new Response(JSON.stringify([
      {id:'legacy-stats',name:'stats'},{id:'legacy-player',name:'player-stats'},
      {id:'foreign-command',name:'community-command'},{id:'current-player',name:'player'}
    ]),{status:200,headers:{'content-type':'application/json'}});
    if(method==='DELETE')return new Response(null,{status:204});
    return new Response('{"id":"upserted"}',{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await reconcileDiscordGlobalCommands({
    DISCORD_CLIENT_ID:'100000000000000009',DISCORD_BOT_TOKEN:'secret'
  },DISCORD_GLOBAL_COMMANDS.slice(0,2),{retiredNames:DISCORD_RETIRED_GLOBAL_COMMANDS,fetchImpl});
  assert.deepEqual(result.retired.map(item=>item.name),['stats','player-stats']);
  assert.deepEqual(requests.filter(item=>item.method==='DELETE').map(item=>item.url.split('/').at(-1)),['legacy-stats','legacy-player']);
  assert.equal(requests.some(item=>item.url.includes('foreign-command')),false);
  assert.equal(requests.some(item=>item.url.includes('current-player')&&item.method==='DELETE'),false);
});

test('signed autocomplete returns tenant teams without creating command receipts',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    const snapshotId=seedActiveWeek(database,{leagueId:'league-a',week:13});
    seedSnapshotRecord(database,{snapshotId,leagueId:'league-a',domain:'players',externalId:'sf-player',data:{
      external_id:'sf-player',team_external_id:'1002',display_name:'Christian Example',position:'HB',overall:95
    }});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000087',name:'standings',type:4,options:[{type:1,name:'team',options:[
        {type:3,name:'name',value:'bucc',focused:true}
      ]}]
    })}));
    const payload=await response.json();
    assert.equal(payload.type,8);
    assert.deepEqual(payload.data.choices,[{name:'Tampa Bay Buccaneers (TB)',value:'tb'}]);

    const ownerResponse=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000088',name:'trade',type:4,options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner',focused:true}
      ]}]
    })}));
    const ownerPayload=await ownerResponse.json();
    assert.equal(ownerPayload.type,8);
    assert.equal(ownerPayload.data.choices.length,1);
    assert.match(ownerPayload.data.choices[0].name,/San Francisco 49ers.*Discord 100000000000000012.*@member-owner-sf/);
    assert.equal(ownerPayload.data.choices[0].value,'owner:100000000000000012');

    const assetResponse=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000093',name:'trade',type:4,options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner:100000000000000012'},
        {type:3,name:'receive-1',value:'Christian',focused:true}
      ]}]
    })}));
    const assetPayload=await assetResponse.json();
    assert.equal(assetPayload.type,8);
    assert.deepEqual(assetPayload.data.choices,[{
      name:'Player · Christian Example · HB · SF',value:'player:sf-player'
    }]);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM discord_interaction_receipts`).get().count,0);
  }finally{database.close()}
});

test('/rules subcommands autocomplete commissioner-authored names from only the connected league',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedLeague(database,{id:'league-b',slug:'beta',guild:'100000000000000002'});
    seedMember(database,{leagueId:'league-b',userId:'user-b',discordId:'100000000000000022'});
    const document=title=>JSON.stringify({categories:[{title,sections:[{title:'Game Management',rules:[{title:'Conversion Attempts',text:'Follow the published fourth-down limits.'}]}]}]});
    database.prepare(`INSERT INTO league_rules_documents (league_id,rules_json) VALUES (?,?)`).run('league-a',document('4th Down Rules'));
    database.prepare(`INSERT INTO league_rules_documents (league_id,rules_json) VALUES (?,?)`).run('league-b',document('Going for it on 4th'));
    const db=d1(database),key=await signingKey();
    const autocomplete=async({id,guild,user,value})=>discordInteractions(await signedContext({db,key,interaction:interaction({
      id,guild,user,name:'rules',type:4,options:[{type:1,name:'category',options:[{type:3,name:'name',value,focused:true}]}]
    })}));
    const alpha=await (await autocomplete({id:'100000000000000094',guild:'100000000000000001',user:'100000000000000011',value:'4th'})).json();
    const beta=await (await autocomplete({id:'100000000000000095',guild:'100000000000000002',user:'100000000000000022',value:'going'})).json();
    assert.deepEqual(alpha.data.choices,[{name:'Category · 4th Down Rules',value:'category:0'}]);
    assert.deepEqual(beta.data.choices,[{name:'Category · Going for it on 4th',value:'category:0'}]);
    assert.equal(alpha.data.choices.some(item=>/Going for it/.test(item.name)),false);
    const result=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000096',name:'rules',options:[{type:1,name:'category',options:[{type:3,name:'name',value:'category:0'}]}]
    })}));
    assert.match((await result.json()).data.content,/4th Down Rules.*Conversion Attempts.*published fourth-down limits/s);
  }finally{database.close()}
});

test('Discord player autocomplete accepts partial names and returns every matching player',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedDiscordStatFixture(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000089',name:'player',type:4,options:[
        {type:3,name:'name',value:'Chase',focused:true}
      ]
    })}));
    const choices=(await response.json()).data.choices;
    assert.deepEqual(choices.map(item=>item.name),[
      'Chase Defender · REDGE · SF','Chase Runner · HB · TB'
    ]);
  }finally{database.close()}
});

test('/games separates played and unplayed matchups for the active scheduled week',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    const snapshotId=seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`UPDATE league_snapshot_records SET data_json=? WHERE snapshot_id=? AND domain='games'`).run(JSON.stringify({
      external_id:'game-final',season_year:null,stage:'regular-season',week_index:13,
      away_team_external_id:'1002',home_team_external_id:'1001',status:'final',away_score:17,home_score:24
    }),snapshotId);
    seedSnapshotRecord(database,{snapshotId,leagueId:'league-a',domain:'games',externalId:'game-open',data:{
      external_id:'game-open',season_year:null,stage:'regular-season',week_index:13,
      away_team_external_id:'1001',home_team_external_id:'1002',status:'1',away_score:0,home_score:0
    }});
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000090',name:'games',options:[{type:1,name:'all'}]
    })}));
    const content=(await response.json()).data.content;
    assert.match(content,/Regular Season Week 13 Games/);
    assert.match(content,/Played \(1\).*SF 17 @ TB 24/s);
    assert.match(content,/Unplayed \(1\).*TB @ SF/s);
    assert.doesNotMatch(content,/Week 12/);
    const played=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000091',name:'games',options:[{type:1,name:'played'}]
    })}));
    const playedContent=(await played.json()).data.content;
    assert.match(playedContent,/SF 17 @ TB 24/);
    assert.doesNotMatch(playedContent,/TB @ SF/);
    const unplayed=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000092',name:'games',options:[{type:1,name:'unplayed'}]
    })}));
    const unplayedContent=(await unplayed.json()).data.content;
    assert.match(unplayedContent,/TB @ SF/);
    assert.doesNotMatch(unplayedContent,/SF 17 @ TB 24/);
  }finally{database.close()}
});

test('/trade create resolves the selected registered Discord owner to the authoritative assigned team',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const db=d1(database);
    await ensureDraftPickHorizon(db,{leagueId:'league-a',franchiseSeasonId:'season-a',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams:[{teamKey:'tb'},{teamKey:'sf'}]});
    const key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000092',name:'trade',options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner:100000000000000012'},
        {type:3,name:'send-1',value:'pick:pick:league-a:2027:1:tb'},
        {type:3,name:'send-2',value:'pick:pick:league-a:2027:2:tb'},
        {type:3,name:'receive-1',value:'pick:pick:league-a:2027:1:sf'}
      ]}]
    })}));
    const payload=await response.json();
    assert.equal(payload.data.flags,64);
    assert.match(payload.data.content,/sent to San Francisco 49ers/i);
    assert.deepEqual(database.prepare(`SELECT team_key AS teamKey FROM trade_workflow_participants ORDER BY team_key`).all().map(row=>row.teamKey),['sf','tb']);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_assets`).get().count,3);
    assert.deepEqual(database.prepare(`SELECT notification_type AS type,user_id AS userId FROM league_notifications ORDER BY type`).all().map(row=>({...row})),[
      {type:'received',userId:'owner-sf'},{type:'sent',userId:'user-a'}
    ]);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM discord_delivery_events`).get().count,2);
  }finally{database.close()}
});

test('/trade create opens one private owner thread and its buttons record the receiving team decision',async()=>{
  const database=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    database.prepare(`UPDATE discord_league_installations SET trade_channel_id='100000000000000066' WHERE league_id='league-a'`).run();
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const db=d1(database);
    await ensureDraftPickHorizon(db,{leagueId:'league-a',franchiseSeasonId:'season-a',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams:[{teamKey:'tb'},{teamKey:'sf'}]});
    const requests=[];
    globalThis.fetch=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;
      requests.push({url:String(url),method:options.method,body});
      if(String(url).endsWith('/threads'))return new Response('{"id":"100000000000000077"}',{status:200,headers:{'content-type':'application/json'}});
      if(String(url).includes('/thread-members/'))return new Response(null,{status:204});
      return new Response('{"id":"100000000000000078"}',{status:200,headers:{'content-type':'application/json'}});
    };
    const key=await signingKey(),env={DISCORD_BOT_TOKEN:'test-bot-token'};
    const created=await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000061',name:'trade',options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner:100000000000000012'},
        {type:3,name:'send-1',value:'pick:pick:league-a:2027:1:tb'},
        {type:3,name:'send-2',value:'pick:pick:league-a:2027:2:tb'},
        {type:3,name:'receive-1',value:'pick:pick:league-a:2027:1:sf'}
      ]}]
    })}));
    const createdPayload=await created.json();
    assert.match(createdPayload.data.content,/private negotiation thread was opened/i);
    const room={...database.prepare(`SELECT trade_id AS tradeId,revision,discord_thread_id AS threadId,status FROM discord_trade_rooms`).get()};
    assert.equal(room.revision,1);
    assert.equal(room.threadId,'100000000000000077');
    assert.equal(room.status,'active');
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_assets WHERE trade_id=?`).get(room.tradeId).count,3);
    const threadCreate=requests.find(request=>request.url.endsWith('/threads'));
    assert.match(threadCreate.url,/\/channels\/100000000000000066\/threads$/);
    assert.equal(threadCreate.body.type,12);
    assert.equal(threadCreate.body.invitable,false);
    assert.equal(requests.filter(request=>request.url.includes('/thread-members/')).length,2);
    const threadMessage=requests.find(request=>request.url.endsWith('/100000000000000077/messages'));
    assert.equal(threadMessage.body.components[0].components.length,3);
    assert.match(threadMessage.body.components[0].components.find(button=>button.label==='Counter Offer').url,/#trade-center\//);
    const acceptId=threadMessage.body.components[0].components.find(button=>button.label==='Accept Trade').custom_id;
    const rejectId=threadMessage.body.components[0].components.find(button=>button.label==='Reject Trade').custom_id;
    const proposerReject=await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000065',guild:'100000000000000001',channel:'100000000000000077',user:'100000000000000011',type:3,
      data:{custom_id:rejectId,component_type:2}
    })}));
    const proposerRejectPayload=await proposerReject.json();
    assert.equal(proposerRejectPayload.type,4);
    assert.match(proposerRejectPayload.data.content,/cannot reject its own offer/);
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(room.tradeId).status,'negotiating');
    const accepted=await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000062',guild:'100000000000000001',channel:'100000000000000077',user:'100000000000000012',type:3,
      data:{custom_id:acceptId,component_type:2}
    })}));
    const acceptedPayload=await accepted.json();
    assert.equal(acceptedPayload.type,7);
    assert.match(acceptedPayload.data.content,/awaiting Trade Committee review/);
    assert.equal(acceptedPayload.data.components,undefined);
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(room.tradeId).status,'committee');
    assert.equal(database.prepare(`SELECT status FROM discord_trade_rooms WHERE trade_id=?`).get(room.tradeId).status,'committee');
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM discord_delivery_events WHERE resource_id=? AND visibility='direct-message' AND status<>'suppressed'`).get(room.tradeId).count,0);
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('partner rejection retains a terminal Discord DM for both team owners',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const db=d1(database),league={id:'league-a',slug:'alpha',name:'Alpha League',features:{}},teams=await activeLeagueTeams(db,'league-a');
    await ensureDraftPickHorizon(db,{leagueId:'league-a',franchiseSeasonId:'season-a',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams});
    const request=new Request('https://franchisehq.app/api/leagues/alpha/trade-center',{method:'POST'});
    const proposed=await executeTradeCenterAction({db,league,teams,request,
      session:{user:{id:'user-a',displayName:'TB Owner'},membership:{role:'team_owner',teamId:'tb',teamKey:'tb'}}},{
        action:'propose',transfers:[
          {assetType:'draft-pick',assetId:'pick:league-a:2027:1:tb',fromTeamKey:'tb',toTeamKey:'sf'},
          {assetType:'draft-pick',assetId:'pick:league-a:2027:1:sf',fromTeamKey:'sf',toTeamKey:'tb'}
        ]
      });
    const current=database.prepare(`SELECT revision,mutation_token AS mutationToken FROM trade_workflows WHERE id=?`).get(proposed.tradeId);
    await executeTradeCenterAction({db,league,teams,request,
      session:{user:{id:'owner-sf',displayName:'SF Owner'},membership:{role:'team_owner',teamId:'sf',teamKey:'sf'}}},{
        action:'reject',tradeId:proposed.tradeId,revision:current.revision,mutationToken:current.mutationToken
      });
    assert.deepEqual(database.prepare(`SELECT user_id AS userId FROM league_notifications
      WHERE trade_id=? AND notification_type='rejected' ORDER BY user_id`).all(proposed.tradeId).map(row=>row.userId),['owner-sf','user-a']);
    assert.deepEqual(database.prepare(`SELECT discord_user_id AS discordUserId,status FROM discord_delivery_events
      WHERE resource_id=? AND event_type='rejected' ORDER BY discord_user_id`).all(proposed.tradeId).map(row=>({...row})),[
        {discordUserId:'100000000000000011',status:'pending'},
        {discordUserId:'100000000000000012',status:'pending'}
      ]);
  }finally{database.close()}
});

test('final trade updates archive and lock the existing room while revisions reopen that same thread',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    database.prepare(`INSERT INTO trade_workflows
      (id,league_id,franchise_season_id,status,revision,mutation_token,proposer_user_id,proposer_team_key,review_threshold)
      VALUES ('trade-lifecycle','league-a','season-a','approved',1,'token-1','user-a','tb',1)`).run();
    database.prepare(`INSERT INTO discord_trade_rooms
      (id,league_id,trade_id,revision,discord_guild_id,parent_channel_id,discord_thread_id,status)
      VALUES ('room-a','league-a','trade-lifecycle',1,'100000000000000001','100000000000000066','100000000000000077','approved')`).run();
    database.prepare(`INSERT INTO discord_delivery_events
      (id,league_id,user_id,discord_user_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
      VALUES ('intermediate-dm','league-a','user-a','100000000000000011','accepted','trade_workflow','trade-lifecycle','direct-message','{}','intermediate-dm')`).run();
    database.prepare(`INSERT INTO discord_delivery_events
      (id,league_id,user_id,discord_user_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
      VALUES ('terminal-dm','league-a','user-a','100000000000000011','approved','trade_workflow','trade-lifecycle','direct-message','{}','terminal-dm')`).run();
    const db=d1(database),requests=[];
    const fetchImpl=async(url,options={})=>{
      requests.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null});
      return options.method==='PATCH'?new Response(null,{status:204})
        :new Response('{"id":"100000000000000078"}',{status:200,headers:{'content-type':'application/json'}});
    };
    await queueTradeRoomUpdate(db,{league:{id:'league-a',slug:'alpha'},tradeId:'trade-lifecycle',
      eventKey:'approved-final',title:'Trade approved',message:'The Trade Committee approved this trade.',closeRoom:true});
    assert.equal(database.prepare(`SELECT status FROM discord_delivery_events WHERE id='intermediate-dm'`).get().status,'suppressed');
    assert.equal(database.prepare(`SELECT status FROM discord_delivery_events WHERE id='terminal-dm'`).get().status,'pending');
    database.prepare(`DELETE FROM discord_delivery_events WHERE id='terminal-dm'`).run();
    assert.deepEqual(await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-token'},db,{leagueId:'league-a',fetchImpl}),
      {sent:1,failed:0,skipped:false});
    assert.deepEqual(requests.map(item=>({method:item.method,body:item.body})),[
      {method:'POST',body:requests[0].body},
      {method:'PATCH',body:{archived:true,locked:true}}
    ]);
    assert.match(requests[0].body.content,/Trade approved/);
    assert.equal(database.prepare(`SELECT status FROM discord_trade_rooms WHERE id='room-a'`).get().status,'archived');

    database.prepare(`UPDATE trade_workflows SET status='negotiating',revision=2,mutation_token='token-2' WHERE id='trade-lifecycle'`).run();
    requests.length=0;
    await queueTradeRoomUpdate(db,{league:{id:'league-a',slug:'alpha'},tradeId:'trade-lifecycle',
      eventKey:'revision-2',eventType:'revision-submitted',title:'Trade revision submitted',message:'Revision 2 is ready.'});
    await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-token'},db,{leagueId:'league-a',fetchImpl});
    assert.deepEqual(requests.map(item=>({method:item.method,body:item.body})),[
      {method:'PATCH',body:{archived:false,locked:false}},
      {method:'POST',body:requests[1].body}
    ]);
    assert.equal(database.prepare(`SELECT discord_thread_id AS threadId,status FROM discord_trade_rooms WHERE id='room-a'`).get().threadId,'100000000000000077');
    assert.equal(database.prepare(`SELECT status FROM discord_trade_rooms WHERE id='room-a'`).get().status,'active');
  }finally{database.close()}
});

test('a receiving owner can accept from the fallback Bot DM when private threads are unavailable',async()=>{
  const database=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const db=d1(database);
    await ensureDraftPickHorizon(db,{leagueId:'league-a',franchiseSeasonId:'season-a',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams:[{teamKey:'tb'},{teamKey:'sf'}]});
    const key=await signingKey();
    await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000063',name:'trade',options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner:100000000000000012'},
        {type:3,name:'send-1',value:'pick:pick:league-a:2027:1:tb'},
        {type:3,name:'receive-1',value:'pick:pick:league-a:2027:1:sf'}
      ]}]
    })}));
    const tradeId=database.prepare(`SELECT id FROM trade_workflows`).get().id,requests=[];
    const fetchImpl=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;
      requests.push({url:String(url),method:options.method,body});
      if(String(url).endsWith(['','users','@me','channels'].join('/')))return new Response(`{"id":"${body.recipient_id}88"}`,{status:200,headers:{'content-type':'application/json'}});
      return new Response('{"id":"100000000000000079"}',{status:200,headers:{'content-type':'application/json'}});
    };
    await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-bot-token'},db,{leagueId:'league-a',fetchImpl});
    const received=requests.find(request=>request.url.includes('10000000000000001288/messages'));
    assert.equal(received.body.components[0].components.length,3);
    const acceptId=received.body.components[0].components.find(button=>button.label==='Accept Trade').custom_id;
    globalThis.fetch=fetchImpl;
    const context=await signedContext({db,key,env:{DISCORD_BOT_TOKEN:'test-bot-token'},interaction:interaction({
      id:'100000000000000064',guild:null,channel:'10000000000000001288',user:'100000000000000012',type:3,
      data:{custom_id:acceptId,component_type:2}
    })});
    const pending=[];context.waitUntil=promise=>pending.push(promise);
    const accepted=await discordInteractions(context),payload=await accepted.json();
    assert.equal(payload.type,7);
    assert.match(payload.data.content,/awaiting Trade Committee review/);
    await Promise.all(pending);
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(tradeId).status,'committee');
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('Discord player autocomplete searches the active snapshot once instead of loading every player page',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    const snapshotId=seedActiveWeek(database,{leagueId:'league-a',week:13});
    const insert=database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`);
    for(let index=0;index<650;index++)insert.run(snapshotId,'league-a','players',`player-${index}`,JSON.stringify({
      external_id:`player-${index}`,team_external_id:index%2?'1001':'1002',display_name:index%125===0?`Needle Player ${index}`:`Roster Player ${index}`,
      position:index%2?'HB':'WR',overall:70+(index%29)
    }));
    const queries=[],db=d1(database,sql=>queries.push(sql)),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000139',name:'player',type:4,options:[{type:3,name:'name',value:'Needle',focused:true}]
    })}));
    const choices=(await response.json()).data.choices;
    assert.equal(choices.length,6);
    assert.ok(choices.every(item=>item.name.includes('Needle Player')));
    const playerQueries=queries.filter(sql=>sql.includes("record.domain='players'"));
    assert.equal(playerQueries.length,1);
    assert.match(playerQueries[0],/LIMIT 25/);
    assert.doesNotMatch(playerQueries[0],/OFFSET/i);
  }finally{database.close()}
});

test('committee denial reasons update the private thread and the same trade can be revised without losing prior votes',async()=>{
  const database=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    for(let index=1;index<=3;index++)seedMember(database,{leagueId:'league-a',userId:`reviewer-${index}`,
      discordId:`10000000000000002${index}`,teamId:null,role:'commissioner'});
    database.prepare(`UPDATE discord_league_installations SET trade_channel_id='100000000000000066',
      trade_committee_channel_id='100000000000000067',trade_committee_role_id='100000000000000068'
      WHERE league_id='league-a'`).run();
    seedActiveWeek(database,{leagueId:'league-a',week:13});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const db=d1(database);
    const teams=await activeLeagueTeams(db,'league-a');
    await ensureDraftPickHorizon(db,{leagueId:'league-a',franchiseSeasonId:'season-a',seasonYear:2026,
      gameRelease:'Madden NFL 27',teams});
    let messageNumber=78;
    globalThis.fetch=async(url)=>{
      if(String(url).endsWith('/threads'))return new Response('{"id":"100000000000000077"}',{status:200,headers:{'content-type':'application/json'}});
      if(String(url).includes('/thread-members/'))return new Response(null,{status:204});
      return new Response(JSON.stringify({id:`1000000000000000${messageNumber++}`}),{status:200,headers:{'content-type':'application/json'}});
    };
    const key=await signingKey(),env={DISCORD_BOT_TOKEN:'test-bot-token'};
    await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000141',name:'trade',options:[{type:1,name:'create',options:[
        {type:3,name:'owner',value:'owner:100000000000000012'},
        {type:3,name:'send-1',value:'pick:pick:league-a:2027:1:tb'},
        {type:3,name:'receive-1',value:'pick:pick:league-a:2027:1:sf'}
      ]}]
    })}));
    const tradeId=database.prepare(`SELECT id FROM trade_workflows`).get().id;
    const acceptId=tradeDecisionCustomId('accept',tradeId,1);
    await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000142',channel:'100000000000000077',user:'100000000000000012',type:3,
      data:{custom_id:acceptId,component_type:2}
    })}));
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(tradeId).status,'committee');
    const queuedCommittee={...database.prepare(`SELECT league_id AS leagueId,event_type AS eventType,
      resource_id AS resourceId,payload_json AS payloadJson FROM discord_delivery_events
      WHERE resource_id=? AND event_type='review-required'
        AND visibility='private-channel'
        AND channel_id='100000000000000067'
      LIMIT 1`).get(tradeId)};
    const committeeMessage=await tradeConversationMessage(db,queuedCommittee);
    const ownerMessage=await tradeConversationMessage(db,{leagueId:'league-a',eventType:'thread-update',resourceId:tradeId,
      payloadJson:JSON.stringify({title:'Trade accepted',message:'Awaiting review.',tradeId,leagueSlug:'alpha'})});
    assert.deepEqual(committeeMessage.embeds,ownerMessage.embeds,'committee and owner rooms render the same trade package');
    assert.match(committeeMessage.content,/^<@&100000000000000068>/);
    assert.deepEqual(committeeMessage.embeds.filter(embed=>/ receives$/.test(embed.title)).map(embed=>embed.title).sort(),
      ['San Francisco 49ers receives','Tampa Bay Buccaneers receives']);
    assert.match(committeeMessage.embeds.flatMap(embed=>embed.fields||[]).map(field=>field.value).join('\n'),/2027 — ROUND 1/);
    assert.doesNotMatch(committeeMessage.content,/San Francisco 49ers receives|Tampa Bay Buccaneers receives/);
    assert.deepEqual(committeeMessage.allowed_mentions,{roles:['100000000000000068'],users:[],replied_user:false});
    assert.deepEqual(committeeMessage.components[0].components.map(button=>button.label),['Approve','Deny']);
    const denyId=tradeDecisionCustomId('review-deny',tradeId,1);
    const denyButton=await discordInteractions(await signedContext({db,key,env,interaction:interaction({
      id:'100000000000000143',channel:'100000000000000067',user:'100000000000000021',type:3,
      data:{custom_id:denyId,component_type:2}
    })}));
    const modal=await denyButton.json();
    assert.equal(modal.type,9);
    assert.equal(modal.data.components[0].components[0].required,false);
    for(let index=1;index<=3;index++){
      const submitted=await discordInteractions(await signedContext({db,key,env,interaction:interaction({
        id:`10000000000000015${index}`,channel:'100000000000000067',user:`10000000000000002${index}`,type:5,
        data:{custom_id:denyId,components:[{type:1,components:[{type:4,custom_id:'reason',value:`Reason ${index}`}]}]}
      })}));
      const submittedPayload=await submitted.json();
      assert.equal(submittedPayload.type,7);
      assert.deepEqual(submittedPayload.data.embeds.at(-1),{
        title:'Trade status',
        description:`**${index<3?'Accepted':'Rejected'}**\n**Approvals:** 0\n**Rejections:** ${index}`,
        color:0x4f8cff
      });
      assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(tradeId).status,index<3?'committee':'rejected');
    }
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_reviews WHERE trade_id=? AND revision=1`).get(tradeId).count,3);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_messages WHERE trade_id=? AND event_type='changes-requested'`).get(tradeId).count,1);
    assert.equal(database.prepare(`SELECT status FROM discord_trade_rooms WHERE trade_id=?`).get(tradeId).status,'rejected');
    const revisionMessage=await tradeConversationMessage(db,{leagueId:'league-a',eventType:'thread-update',resourceId:tradeId,
      payloadJson:JSON.stringify({title:'Changes requested',message:'Revise and resubmit.',tradeId,leagueSlug:'alpha'})});
    assert.deepEqual(revisionMessage.components[0].components.map(button=>button.label),['Revise Trade']);
    const rejectedUpdate=database.prepare(`SELECT payload_json AS payloadJson FROM discord_delivery_events
      WHERE resource_id=? AND visibility='private-channel' AND event_type='thread-update' AND payload_json LIKE '%Reason 3%' LIMIT 1`).get(tradeId);
    assert.match(rejectedUpdate.payloadJson,/Reason 3/);

    await executeTradeCenterAction({db,league:{id:'league-a',slug:'alpha',name:'Alpha League',features:{}},teams,
      session:{user:{id:'owner-sf',displayName:'SF Owner'},membership:{role:'team_owner',teamId:'sf',teamKey:'sf'}},
      request:new Request('https://franchisehq.app/api/leagues/alpha/trade-center',{method:'POST'})},{
        action:'counter',tradeId,revision:1,note:'Adjusted terms',transfers:[
          {assetType:'draft-pick',assetId:'pick:league-a:2027:1:sf',fromTeamKey:'sf',toTeamKey:'tb'},
          {assetType:'draft-pick',assetId:'pick:league-a:2027:1:tb',fromTeamKey:'tb',toTeamKey:'sf'}
        ]
      });
    await queueTradeRoomUpdate(db,{league:{id:'league-a',slug:'alpha'},tradeId,eventKey:'test-revision-2',
      eventType:'revision-submitted',title:'Trade revision submitted',message:'Revision 2 is ready for owner acceptance.'});
    const revised={...database.prepare(`SELECT status,revision,rejected_at AS rejectedAt FROM trade_workflows WHERE id=?`).get(tradeId)};
    assert.deepEqual(revised,{status:'negotiating',revision:2,rejectedAt:null});
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_reviews WHERE trade_id=? AND revision=1`).get(tradeId).count,3);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM trade_workflow_reviews WHERE trade_id=? AND revision=2`).get(tradeId).count,0);
    assert.deepEqual(database.prepare(`SELECT team_key AS teamKey,accepted_revision AS acceptedRevision
      FROM trade_workflow_participants WHERE trade_id=? ORDER BY team_key`).all(tradeId).map(row=>({...row})),[
        {teamKey:'sf',acceptedRevision:2},{teamKey:'tb',acceptedRevision:null}
      ]);
    assert.deepEqual({...database.prepare(`SELECT discord_thread_id AS threadId,revision,status FROM discord_trade_rooms WHERE trade_id=?`).get(tradeId)},
      {threadId:'100000000000000077',revision:2,status:'active'});
    const revisedMessage=await tradeConversationMessage(db,{leagueId:'league-a',eventType:'revision-submitted',resourceId:tradeId,
      payloadJson:JSON.stringify({title:'Revision submitted',message:'Review revision 2.',tradeId,leagueSlug:'alpha'})});
    assert.deepEqual(revisedMessage.components[0].components.map(button=>button.label),['Accept Trade','Reject Trade','Counter Offer']);
  }finally{globalThis.fetch=originalFetch;database.close()}
});

test('/trade-block add and remove are private, roster-authorized, and use player autocomplete',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedDiscordStatFixture(database,{leagueId:'league-a'});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    database.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name)
      VALUES ('identity-chase','league-a','chase-runner','Chase Runner')`).run();
    database.prepare(`INSERT INTO player_source_aliases
      (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
      VALUES ('league-a','madden-companion','franchise-a','chase-rb','identity-chase','season-a','season-a')`).run();
    const db=d1(database),key=await signingKey();
    const autocomplete=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000076',name:'trade-block',type:4,options:[{type:1,name:'add',options:[
        {type:3,name:'player',value:'Chase',focused:true}
      ]}]
    })}));
    assert.deepEqual((await autocomplete.json()).data.choices,[{
      name:'Chase Runner · HB · 87 OVR',value:'chase-rb'
    }]);
    const added=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000077',name:'trade-block',options:[{type:1,name:'add',options:[
        {type:3,name:'player',value:'chase-rb'},{type:3,name:'looking-for',value:'Young corner or a pick'}
      ]}]
    })}));
    const addedPayload=await added.json();
    assert.equal(addedPayload.data.flags,64);
    assert.match(addedPayload.data.content,/added to the Trade Block/);
    assert.deepEqual({...database.prepare(`SELECT active,requested_return AS requestedReturn FROM trade_block_listings`).get()}, {
      active:1,requestedReturn:'Young corner or a pick'
    });
    const viewed=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000079',name:'trade-block',options:[{type:1,name:'view'}]
    })}));
    const viewedPayload=await viewed.json();
    const playerCard=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000080',name:'player',options:[{type:3,name:'name',value:'Chase Runner'}]
    })}));
    const playerCardEmbed=(await playerCard.json()).data.embeds[0];
    const tradeBlockEmbed=viewedPayload.data.embeds[0];
    assert.equal(viewedPayload.data.embeds.length,1);
    for(const key of ['title','description','url','color'])assert.deepEqual(tradeBlockEmbed[key],playerCardEmbed[key]);
    assert.deepEqual(tradeBlockEmbed.fields.map(field=>field.name),['Overall','Age','Development','Looking For']);
    assert.equal(tradeBlockEmbed.fields.find(field=>field.name==='Overall').value,'87');
    assert.equal(tradeBlockEmbed.fields.find(field=>field.name==='Age').value,'24');
    assert.equal(tradeBlockEmbed.fields.find(field=>field.name==='Development').value,'Superstar');
    assert.equal(tradeBlockEmbed.fields.find(field=>field.name==='Looking For').value,'Young corner or a pick');
    assert.doesNotMatch(tradeBlockEmbed.fields.map(field=>field.value).join(' '),/Rush Yds|Rushing TDs/);
    assert.equal(tradeBlockEmbed.thumbnail.url,'https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/123456.png');
    assert.equal(tradeBlockEmbed.footer.text,'alpha League · Trade Block');
    assert.match(tradeBlockEmbed.url,/\/leagues\/alpha#players\//);
    const removed=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000078',name:'trade-block',options:[{type:1,name:'remove',options:[
        {type:3,name:'player',value:'chase-rb'}
      ]}]
    })}));
    assert.equal((await removed.json()).data.flags,64);
    assert.equal(database.prepare(`SELECT active FROM trade_block_listings`).get().active,0);
  }finally{database.close()}
});

test('Discord Player Cards use compact position statistics and portraits while team statistics remain complete',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedDiscordStatFixture(database,{leagueId:'league-a'});
    const db=d1(database),key=await signingKey();
    const teamResponse=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000086',name:'team',options:[{type:3,name:'name',value:'tb'}]
    })}));
    const teamPayload=await teamResponse.json();
    assert.equal(teamPayload.data.embeds[0].title,'Tampa Bay Buccaneers Team Statistics');
    const teamFields=teamPayload.data.embeds[0].fields.map(field=>field.value).join(' ');
    assert.match(teamFields,/Pass Yds:\*\* 400/);
    assert.match(teamFields,/Pass TDs:\*\* 5/);
    assert.match(teamFields,/3rd Down %:\*\* 50/);
    assert.match(teamFields,/INTs:\*\* 3/);
    assert.match(teamFields,/Red Zone Score % Allowed:\*\* 57\.1%/);
    assert.doesNotMatch(teamFields,/999/);

    const leaders=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000084',name:'leaders',options:[{type:2,name:'receiving',options:[
        {type:1,name:'touchdowns'}
      ]}]
    })}));
    assert.match((await leaders.json()).data.content,/Mike Example.*3/s);

    const player=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000083',name:'player',options:[{type:3,name:'name',value:'player-tb'}]
    })}));
    const playerPayload=await player.json();
    assert.equal(playerPayload.data.embeds[0].title,'Baker Example');
    assert.equal(playerPayload.data.embeds[0].fields.find(field=>field.name==='Overall').value,'91');
    assert.equal(playerPayload.data.embeds[0].fields.find(field=>field.name==='Age').value,'30');
    assert.equal(playerPayload.data.embeds[0].fields.at(-1).name,'2026 · Major Statistics');
    assert.match(playerPayload.data.embeds[0].fields.at(-1).value,/Completion Percentage:\*\* 60%/);
    assert.match(playerPayload.data.embeds[0].fields.at(-1).value,/Yards:\*\* 250/);
    assert.match(playerPayload.data.embeds[0].fields.at(-1).value,/TDs:\*\* 3/);
    assert.match(playerPayload.data.embeds[0].fields.at(-1).value,/INTs:\*\* 1/);
    assert.doesNotMatch(playerPayload.data.embeds[0].fields.at(-1).value,/Attempts|Passer Rating|Sacks Taken/);
    assert.equal(playerPayload.data.embeds[0].thumbnail.url,'https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/654321.png');
    assert.equal(playerPayload.data.embeds[0].footer.text,'alpha League · Major position statistics');
    assert.match(playerPayload.data.embeds[0].url,/\/leagues\/alpha#players\/player-tb/);

    const receiver=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000089',name:'player',options:[{type:3,name:'name',value:'Mike Example'}]
    })}));
    const receiverStats=(await receiver.json()).data.embeds[0].fields.at(-1).value;
    assert.match(receiverStats,/Receptions:\*\* 15.*Yards:\*\* 200.*TDs:\*\* 3/s);
    assert.doesNotMatch(receiverStats,/Catch %|Target Share|Drops|YAC/);

    const chases=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000091',name:'player',options:[{type:3,name:'name',value:'Chase'}]
    })}));
    const chasePayload=await chases.json();
    assert.equal(chasePayload.data.embeds.length,2);
    const runner=chasePayload.data.embeds.find(embed=>embed.title==='Chase Runner');
    const defender=chasePayload.data.embeds.find(embed=>embed.title==='Chase Defender');
    assert.match(runner.fields.map(field=>field.value).join(' '),/Attempts:\*\* 18.*Yards:\*\* 96.*TDs:\*\* 1.*Fumbles:\*\* 1/s);
    assert.doesNotMatch(runner.fields.map(field=>field.value).join(' '),/Rush Yds \/ Game|Rush Share|Receptions|Rec Yds/);
    assert.match(defender.fields.map(field=>field.value).join(' '),/Tackles:\*\* 7.*Sacks:\*\* 2.*INTs:\*\* 1/s);
    assert.doesNotMatch(defender.fields.map(field=>field.value).join(' '),/Forced Fumbles|Fumble Recoveries|Defensive TDs/);

    const kicker=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000098',name:'player',options:[{type:3,name:'name',value:'Casey Kicker'}]
    })}));
    const kickerEmbed=(await kicker.json()).data.embeds[0];
    assert.match(kickerEmbed.fields.at(-1).value,/FG Attempted:\*\* 4.*FG Made:\*\* 3/s);
    assert.doesNotMatch(kickerEmbed.fields.at(-1).value,/50\+|XP/);
    assert.equal(kickerEmbed.thumbnail.url,'https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/654322.png');
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
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
      VALUES ('user-b','100000000000000033','member-b','Second GM')`).run();
    database.prepare(`INSERT INTO gm_identities
      (id,league_id,user_id,public_id,display_name) VALUES ('gm-b','league-a','user-b','gm-public-b','Second GM')`).run();
    database.prepare(`INSERT INTO team_ownership_periods
      (id,league_id,gm_identity_id,team_key,franchise_season_id,started_at,started_stage,started_week)
      VALUES ('period-a','league-a','gm-a','tb','season-2026',CURRENT_TIMESTAMP,'preseason',1)`).run();
    const db=d1(database),key=await signingKey();
    const response=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000082',name:'gm-history',options:[{type:1,name:'player',options:[{type:3,name:'name',value:'user-a'}]}]
    })}));
    const payload=await response.json();
    assert.match(payload.data.content,/Member user-a/);
    assert.match(payload.data.content,/1-0/);
    assert.doesNotMatch(payload.data.content,/Second GM/);
    const all=await discordInteractions(await signedContext({db,key,interaction:interaction({
      id:'100000000000000083',name:'gm-history',options:[{type:1,name:'all'}]
    })}));
    const allContent=(await all.json()).data.content;
    assert.match(allContent,/Member user-a/);
    assert.match(allContent,/Second GM/);
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

test('a repeated same-week import reuses the matchup thread even when Madden changes the external game id',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a',userId:'commissioner-a',discordId:'100000000000000011',teamId:'tb',role:'commissioner'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    database.prepare(`UPDATE discord_league_installations SET schedule_channel_id='100000000000000055' WHERE league_id='league-a'`).run();
    const db=d1(database),requests=[],league={id:'league-a',slug:'alpha',name:'Alpha League'};
    let messageId=87;
    const fetchImpl=async(url,options={})=>{
      requests.push({url:String(url),method:options.method||'GET'});
      if(/\/messages$/.test(String(url))){messageId+=1;return new Response(JSON.stringify({id:`1000000000000000${messageId}`}),{status:200,headers:{'content-type':'application/json'}})}
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
    const original=seedActiveWeek(database,{leagueId:'league-a',week:14});
    assert.equal((await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:original,source:'candidate-import',fetchImpl
    })).created,1);

    const replacement='snapshot-league-a-14-replacement';
    database.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,season_year,week_index,team_count,game_count,manifest_json,validation_status)
      VALUES (?,'league-a','active',2026,14,2,1,'{}','ready')`).run(replacement);
    database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json)
      SELECT ?,league_id,domain,external_id,data_json FROM league_snapshot_records
      WHERE snapshot_id=? AND domain='teams'`).run(replacement,original);
    seedSnapshotRecord(database,{snapshotId:replacement,leagueId:'league-a',domain:'games',externalId:'madden-renumbered-game',data:{
      external_id:'madden-renumbered-game',season_year:2026,stage:'regular-season',week_index:14,
      away_team_external_id:'1002',home_team_external_id:'1001',status:'scheduled'
    }});
    database.prepare(`UPDATE league_active_snapshots SET snapshot_id=? WHERE league_id='league-a'`).run(replacement);
    const repeated=await syncDiscordScheduleThreads({DISCORD_BOT_TOKEN:'test-token'},db,{
      league,snapshotId:replacement,source:'candidate-import',fetchImpl
    });
    assert.equal(repeated.ok,true);
    assert.equal(repeated.created,0);
    assert.equal(requests.filter(request=>/\/messages$/.test(request.url)).length,1);
    assert.deepEqual({...database.prepare(`SELECT COUNT(*) AS count,game_external_id AS gameId,snapshot_id AS snapshotId,status
      FROM discord_schedule_threads WHERE league_id='league-a' AND week_index=14`).get()}, {
      count:1,gameId:'madden-renumbered-game',snapshotId:replacement,status:'active'
    });
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

test('durable legacy trade delivery opens a DM and preserves the FranchiseHQ fallback link',async()=>{
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
    assert.match(requests[1].body.content,/Use the buttons below/);
    assert.equal(requests[1].body.components,undefined);
    assert.match(requests[1].body.content,/\/leagues\/alpha#trade-center\/trade-a/);
    assert.equal(database.prepare(`SELECT status FROM discord_delivery_events WHERE idempotency_key='league-notification:notice-delivery'`).get().status,'sent');
  }finally{database.close()}
});

test('trade delivery sends both owners mobile-safe divided team cards and one clean workflow status',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await applyMigrations(database);
    seedLeague(database,{id:'league-a',slug:'alpha',guild:'100000000000000001'});
    seedMember(database,{leagueId:'league-a'});
    seedMember(database,{leagueId:'league-a',userId:'owner-sf',discordId:'100000000000000012',teamId:'sf'});
    const snapshotId=seedActiveWeek(database,{leagueId:'league-a',week:14});
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('season-a','league-a','madden-companion','franchise-a','2026','Madden NFL 27','Season 2026',2026,'active')`).run();
    const players=[
      ['identity-tb','public-tb','source-tb','Tristan Example','1001','LT',95,27,'Superstar',3997,10000000,10651,'tb','sf'],
      ['identity-tb-2','public-tb-2','source-tb-2','Rueben Example','1001','REDG',88,22,'Star',725,4200000,1800,'tb','sf'],
      ['identity-sf','public-sf','source-sf','George Example','1002','TE',97,29,'X-Factor',566,0,4696,'sf','tb'],
      ['identity-sf-2','public-sf-2','source-sf-2','Sauce Example','1002','CB',94,26,'Superstar',2500,8000000,7000,'sf','tb']
    ];
    players.forEach(([identityId,publicId,sourceId,name,teamId,position,overall,age,development,capHit,capReleaseNetSavings,capReleasePenalty])=>{
      database.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name) VALUES (?,'league-a',?,?)`).run(identityId,publicId,name);
      database.prepare(`INSERT INTO player_source_aliases
        (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
        VALUES ('league-a','madden-companion','franchise-a',?,?, 'season-a','season-a')`).run(sourceId,identityId);
      seedSnapshotRecord(database,{snapshotId,leagueId:'league-a',domain:'players',externalId:sourceId,data:{
        external_id:sourceId,team_external_id:teamId,display_name:name,position,overall,age,development_trait:development,
        capHit,capReleaseNetSavings,capReleasePenalty
      }});
    });
    database.prepare(`INSERT INTO trade_workflows
      (id,league_id,franchise_season_id,status,revision,mutation_token,proposer_user_id,proposer_team_key,review_threshold)
      VALUES ('trade_11111111-1111-4111-8111-111111111111','league-a','season-a','negotiating',1,'token','user-a','tb',3)`).run();
    database.prepare(`INSERT INTO trade_workflow_participants (trade_id,league_id,team_key) VALUES ('trade_11111111-1111-4111-8111-111111111111','league-a','tb')`).run();
    database.prepare(`INSERT INTO trade_workflow_participants (trade_id,league_id,team_key) VALUES ('trade_11111111-1111-4111-8111-111111111111','league-a','sf')`).run();
    players.forEach((player,ordinal)=>{
      const identityId=player[0],sourceId=player[2],fromTeamKey=player[12],toTeamKey=player[13];
      database.prepare(`INSERT INTO trade_workflow_assets
        (id,trade_id,league_id,revision,asset_type,player_identity_id,source_player_id,from_team_key,to_team_key,ordinal)
        VALUES (?,'trade_11111111-1111-4111-8111-111111111111','league-a',1,'player',?,?,?,?,?)`)
        .run(`asset-${ordinal}`,identityId,sourceId,fromTeamKey,toTeamKey,ordinal);
    });
    database.prepare(`INSERT INTO league_notifications
      (id,league_id,user_id,trade_id,notification_type,title,message) VALUES
      ('notice-sent','league-a','user-a','trade_11111111-1111-4111-8111-111111111111','sent','Trade sent','Your offer was sent.')`).run();
    database.prepare(`INSERT INTO league_notifications
      (id,league_id,user_id,trade_id,notification_type,title,message) VALUES
      ('notice-received','league-a','owner-sf','trade_11111111-1111-4111-8111-111111111111','received','Trade received','You received an offer.')`).run();
    const requests=[];
    const fetchImpl=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;requests.push({url:String(url),method:options.method,body});
      if(String(url).endsWith(['','users','@me','channels'].join('/')))return new Response(`{"id":"${body.recipient_id}88"}`,{status:200,headers:{'content-type':'application/json'}});
      return new Response('{"id":"message-a"}',{status:200,headers:{'content-type':'application/json'}});
    };
    const result=await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-bot-token'},d1(database),{leagueId:'league-a',limit:10,fetchImpl});
    assert.deepEqual(result,{sent:2,failed:0,skipped:false});
    const messages=requests.filter(request=>/\/messages$/.test(request.url));
    assert.equal(messages.length,2);
    for(const request of messages){
      const teamEmbeds=request.body.embeds.slice(0,2);
      assert.deepEqual(teamEmbeds.map(embed=>embed.title).sort(),['San Francisco 49ers receives','Tampa Bay Buccaneers receives']);
      const details=request.body.embeds.flatMap(embed=>embed.fields||[]).map(field=>field.value).join('\n');
      assert.match(details,/\[Tristan Example\].*Position.*LT.*Overall.*95.*Development.*Superstar.*Age.*27.*Cap Hit.*\$39,970,000.*Release Penalty.*\$106,510,000.*Net Release Savings.*\$10,000,000/s);
      assert.match(details,/\[George Example\].*Position.*TE.*Overall.*97.*Development.*X-Factor.*Age.*29.*Cap Hit.*\$5,660,000.*Release Penalty.*\$46,960,000.*Net Release Savings.*\$0/s);
      assert.match(details,/Rueben Example/);
      assert.match(details,/Sauce Example/);
      assert.equal(teamEmbeds.every(embed=>embed.fields.length===2),true,'one real field is retained per asset');
      assert.equal(teamEmbeds.every(embed=>embed.fields.every(field=>field.name!=='\u200b'&&field.value!=='\u200b')),true,'mobile-collapsible invisible fields are removed');
      assert.equal(teamEmbeds.flatMap(embed=>embed.fields.slice(0,-1)).every(field=>field.value.endsWith('━━━━━━━━━━━━━━━━━━━━')),true,'a visible divider closes every non-final asset');
      const status=request.body.embeds.at(-1);
      assert.deepEqual(status,{title:'Trade status',description:'**Negotiating**\n**Approvals:** 0\n**Rejections:** 0',color:0x4f8cff});
      assert.doesNotMatch(details,/Madden contract facts|owner decisions|Committee review/);
      assert.doesNotMatch(details,/Acquiring estimate|estimated room change|projected available/);
      assert.doesNotMatch(request.body.content,/^https:\/\//m);
    }

    database.prepare(`UPDATE trade_workflows SET status='committee' WHERE id='trade_11111111-1111-4111-8111-111111111111'`).run();
    const committeeMessage=await tradeConversationMessage(d1(database),{
      leagueId:'league-a',eventType:'review-required',resourceId:'trade_11111111-1111-4111-8111-111111111111',
      payloadJson:JSON.stringify({title:'Trade review required',message:'Review this package.',tradeId:'trade_11111111-1111-4111-8111-111111111111',leagueSlug:'alpha'})
    });
    assert.ok(committeeMessage.content.length<=2000);
    assert.doesNotMatch(committeeMessage.content,/Tristan Example|Rueben Example|George Example|Sauce Example/);
    const committeeDetails=committeeMessage.embeds.flatMap(embed=>embed.fields||[]).map(field=>field.value).join('\n');
    for(const name of ['Tristan Example','Rueben Example','George Example','Sauce Example'])assert.match(committeeDetails,new RegExp(name));
    assert.deepEqual(committeeMessage.embeds.filter(embed=>/ receives$/.test(embed.title)),
      messages[0].body.embeds.filter(embed=>/ receives$/.test(embed.title)));
    assert.deepEqual(committeeMessage.components[0].components.map(button=>button.label),['Approve','Deny']);
    assert.deepEqual(committeeMessage.embeds.at(-1),{title:'Trade status',description:'**Accepted**\n**Approvals:** 0\n**Rejections:** 0',color:0x4f8cff});

    database.prepare(`INSERT INTO discord_delivery_events
      (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
      VALUES ('committee-rich','league-a','100000000000000067','review-required','trade_workflow','trade_11111111-1111-4111-8111-111111111111','private-channel',?,?)`)
      .run(JSON.stringify({title:'Trade review required',message:'Review this package.',tradeId:'trade_11111111-1111-4111-8111-111111111111',leagueSlug:'alpha'}),'committee-rich');
    const fallbackRequests=[];
    const strippedEmbedFetch=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):null;
      fallbackRequests.push({url:String(url),method:options.method,body});
      return new Response(JSON.stringify({id:`message-${fallbackRequests.length}`,embeds:[],flags:0}),{
        status:200,headers:{'content-type':'application/json'}
      });
    };
    assert.deepEqual(await flushDiscordDeliveries({DISCORD_BOT_TOKEN:'test-bot-token'},d1(database),{
      leagueId:'league-a',limit:10,fetchImpl:strippedEmbedFetch
    }),{sent:1,failed:0,skipped:false});
    assert.deepEqual(fallbackRequests.map(request=>request.method),['POST','PATCH','PATCH']);
    assert.equal(fallbackRequests.filter(request=>request.method==='POST').length,1,'the permission-safe package replaces the incomplete post');
    assert.deepEqual(fallbackRequests[1].body.embeds,committeeMessage.embeds);
    assert.deepEqual(fallbackRequests[1].body.components,committeeMessage.components);
    assert.deepEqual(fallbackRequests[2].body.embeds,[]);
    assert.deepEqual(fallbackRequests[2].body.components,committeeMessage.components);
    for(const name of ['Tristan Example','Rueben Example','George Example','Sauce Example'])assert.match(fallbackRequests[2].body.content,new RegExp(name));
    assert.match(fallbackRequests[2].body.content,/━━━━━━━━━━━━━━━━━━━━/,'permission-safe fallback retains the asset divider');
    assert.match(fallbackRequests[2].body.content,/TRADE STATUS.*Accepted/s);
    assert.equal(database.prepare(`SELECT status FROM discord_delivery_events WHERE id='committee-rich'`).get().status,'sent');
    assert.equal(database.prepare(`SELECT last_error AS error FROM discord_delivery_events WHERE id='committee-rich'`).get().error,null);
  }finally{database.close()}
});
