import assert from 'node:assert/strict';
import test from 'node:test';
import {discordRecovery,savedDiscordRecovery,screenshotRecoveryState} from '../../functions/_lib/discord-recovery.js';

test('Discord recovery distinguishes provider failures from image-reader failures without leaking payloads',()=>{
  for(const [status,code] of [[401,'DISCORD_SERVICE'],[403,'DISCORD_ACCESS'],[404,'DISCORD_CHANNEL'],[429,'DISCORD_WAIT'],[503,'DISCORD_TEMPORARY']]){
    const result=discordRecovery(Object.assign(new Error('private token and image URL'),{status,recoverySource:'discord',retryAfterSeconds:90,recoveryStage:'report'}));
    assert.equal(result.code,code);assert.equal(result.stage,'report');assert.doesNotMatch(JSON.stringify(result),/private token|image URL/);
    if(status===429)assert.ok(Date.parse(result.nextRetryAt)>Date.now()+85000);
    assert.equal(discordRecovery({status,recoverySource:'image'}).code,'IMAGE_SERVICE');
  }
  assert.equal(discordRecovery('Message Content access is no longer enabled.').code,'DISCORD_INTENT');
  assert.equal(discordRecovery('Discord API 403: Missing Permissions').code,'DISCORD_ACCESS');
  assert.equal(discordRecovery('unexpected processing failure').code,'DISCORD_UNKNOWN');
  assert.doesNotMatch(discordRecovery('unexpected processing failure').message,/permissions/);
});

test('stored recovery details reconstruct allowlisted wording and reject arbitrary provider content',()=>{
  const saved=savedDiscordRecovery(JSON.stringify({code:'IMAGE_SERVICE',message:'secret',owner:'secret',stage:'report',nextRetryAt:'invalid'}));
  assert.equal(saved.stage,'report');assert.equal(saved.nextRetryAt,null);assert.doesNotMatch(JSON.stringify(saved),/secret/);
  assert.equal(savedDiscordRecovery('Discord API 429: raw body').code,'DISCORD_WAIT');
  assert.equal(savedDiscordRecovery(null),null);
});

test('screenshot progress distinguishes history, reading, delivery, unavailable and stalled states',()=>{
  const now=Date.now(),base={enabled:true,lastScanAt:new Date(now).toISOString(),historyComplete:true,progress:{threads:2,historyComplete:2,pending:0,reportsPending:0}};
  assert.match(screenshotRecoveryState({...base,historyComplete:false}),/Reading earlier messages/);
  assert.match(screenshotRecoveryState({...base,progress:{pending:2}}),/awaiting image checks/);
  assert.match(screenshotRecoveryState({...base,progress:{reportsPending:2}}),/awaiting delivery/);
  assert.match(screenshotRecoveryState({...base,lastScanAt:'2020-01-01'}),/No recent scanner progress/);
  assert.match(screenshotRecoveryState(base,{readerReady:false}),/FHQ support/);
  assert.match(screenshotRecoveryState({...base,progress:{threads:0}},{kind:'loadouts'}),/Retry Schedule Sync/);
  assert.match(screenshotRecoveryState(base),/checks are complete/);
});
