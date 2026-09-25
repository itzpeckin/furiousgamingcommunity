/* FHQ_BUILD: 8.0.10 */
import { json } from '../../../../_lib/cloud-platform.js';
import { createEaClient, makeEaLoginUrl } from '../../../../_lib/ea-client.js';
import { authorizedEaState, configured, readEaBody, fail, eaErrorResponse, publicConnection, activeEaConnection, createEaSetup, loadEaSetup, lockEaSetup, setupScope, connectionScope, sealEa, openEa, parseEaRedirect } from '../../../../_lib/ea-direct.js';

function publicSetup(row,payload={}){
  return{id:row.id,...(row.stage==='persona'?{personas:(payload.personas||[]).map(p=>({id:`${p.platform}:${p.id}`,name:p.name,platform:p.platform}))}:{}),
    ...(row.stage==='franchise'?{leagues:(payload.leagues||[]).map(p=>({id:String(p.leagueId),name:String(p.leagueName||p.name||'Madden franchise')}))}:{})};
}
// Re-check authority at the mutation, not only before an awaited EA request or
// encryption. Disconnect, a new setup, logout, and membership revocation must
// win over an older in-flight setup.
const SETUP_MUTATION_GUARD=`EXISTS (
  SELECT 1 FROM ea_direct_setups setup
  JOIN sessions session ON session.id=setup.session_id AND session.user_id=setup.user_id
  JOIN league_memberships membership ON membership.league_id=setup.league_id AND membership.user_id=setup.user_id
  WHERE setup.id=? AND setup.league_id=? AND setup.user_id=? AND setup.session_id=?
    AND setup.stage=? AND setup.lock_until=?
    AND julianday(setup.expires_at)>julianday('now') AND julianday(setup.lock_until)>julianday('now')
    AND session.revoked_at IS NULL AND julianday(session.expires_at)>julianday('now')
    AND (session.absolute_expires_at IS NULL OR julianday(session.absolute_expires_at)>julianday('now'))
    AND membership.active=1 AND membership.role='commissioner'
)`;
function setupMutationArgs(state,setup,lock,stage){
  return[setup.id,state.league.id,state.session.user.id,state.session.sessionId,stage,lock];
}
function requireSetupMutation(result){
  if(!Number(result?.meta?.changes))fail('SETUP_EXPIRED','This EA setup changed or expired. Start Connect EA Account again.');
}
async function status(state){
  const connection=await activeEaConnection(state.db,state.league.id);
  const setup=await state.db.prepare(`SELECT * FROM ea_direct_setups WHERE league_id=? AND user_id=? AND session_id=? AND julianday(expires_at)>julianday('now') AND stage IN ('code','persona','franchise') ORDER BY created_at DESC LIMIT 1`)
    .bind(state.league.id,state.session.user.id,state.session.sessionId).first();
  const payload=setup?.payload_cipher?await openEa(state.env,setupScope(setup),setup.payload_cipher):{};
  return{ok:true,configured:configured(state.env),status:setup?.stage==='persona'?'choosing-profile':setup?.stage==='franchise'?'choosing-franchise':connection?.status||'not-connected',
    connection:publicConnection(connection),setup:setup?publicSetup(setup,payload):null,
    ...(setup?.stage==='code'?{loginUrl:makeEaLoginUrl(state.env,setup.oauth_state)}:{})};
}
export async function onRequestGet(context){
  try{const state=await authorizedEaState(context);if(state.response)return state.response;return json(await status(state));}catch(error){return eaErrorResponse(error);}
}
export async function onRequestPost(context){
  try{
    const state=await authorizedEaState(context);if(state.response)return state.response;
    if(!configured(state.env))fail('NOT_CONFIGURED','EA Direct is not configured yet.');
    const body=await readEaBody(context.request),action=String(body.action||'');
    if(action==='disconnect'){
      await state.db.batch([
        state.db.prepare(`UPDATE ea_direct_collection_jobs SET status='cancelled',state_cipher=NULL,message='EA connection disconnected.',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND status IN ('queued','running')`).bind(state.league.id),
        state.db.prepare(`UPDATE ea_direct_connections SET status='disconnected',credential_cipher=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND status!='disconnected'`).bind(state.league.id),
        state.db.prepare(`UPDATE ea_direct_setups SET stage='expired',payload_cipher=NULL WHERE league_id=?`).bind(state.league.id)
      ]);
      return json(await status(state));
    }
    if(action==='begin'){
      const setup=await createEaSetup(state);
      return json({ok:true,configured:true,status:'not-connected',setup:{id:setup.id},loginUrl:makeEaLoginUrl(state.env,setup.oauth_state)});
    }
    if(!['exchange','select-persona','connect'].includes(action))fail('INVALID_ACTION','Choose a valid EA setup action.',400);
    const setup=await loadEaSetup(state,body.setupId),lock=await lockEaSetup(state.db,setup);
    try{
      const payload=setup.payload_cipher?await openEa(state.env,setupScope(setup),setup.payload_cipher):{},client=createEaClient(state.env);
      if(action==='exchange'){
        if(setup.stage!=='code')fail('STEP_ALREADY_COMPLETED','This sign-in step is already complete. Refresh the connection.');
        const token=await client.exchangeCode(parseEaRedirect(body.redirectUrl,setup.oauth_state));
        const personas=await client.personas(token.accessToken);
        if(!personas.length)fail('NO_GAME_PROFILE','EA did not return a Madden NFL 27 profile for this account. Use the EA account linked to your game.');
        const updated=await state.db.prepare(`UPDATE ea_direct_setups SET stage='persona',payload_cipher=?,lock_until=NULL WHERE id=? AND ${SETUP_MUTATION_GUARD}`)
          .bind(await sealEa(state.env,setupScope(setup),{token,personas}),setup.id,...setupMutationArgs(state,setup,lock,'code')).run();
        requireSetupMutation(updated);
      }else if(action==='select-persona'){
        if(setup.stage!=='persona')fail('INVALID_STEP','Choose your EA profile first.');
        const persona=(payload.personas||[]).find(p=>`${p.platform}:${p.id}`===String(body.personaId));
        if(!persona)fail('INVALID_PROFILE','Choose one of the profiles returned by EA.',400);
        const token=await client.personaToken(payload.token.accessToken,persona),session=await client.login(token,persona.platform);
        const leagues=await client.leagues(token,session,persona.platform);
        if(!leagues.length)fail('NO_FRANCHISES','EA did not return any franchises for this profile.');
        const updated=await state.db.prepare(`UPDATE ea_direct_setups SET stage='franchise',payload_cipher=?,lock_until=NULL WHERE id=? AND ${SETUP_MUTATION_GUARD}`)
          .bind(await sealEa(state.env,setupScope(setup),{token,persona,leagues}),setup.id,...setupMutationArgs(state,setup,lock,'persona')).run();
        requireSetupMutation(updated);
      }else{
        if(setup.stage!=='franchise')fail('INVALID_STEP','Choose your Madden franchise first.');
        const selected=(payload.leagues||[]).find(p=>String(p.leagueId)===String(body.externalLeagueId));
        if(!selected)fail('INVALID_FRANCHISE','Choose a franchise returned by EA.',400);
        const busy=await state.db.prepare(`SELECT id FROM ea_direct_collection_jobs WHERE league_id=? AND status IN ('queued','running') LIMIT 1`).bind(state.league.id).first();
        if(busy)fail('COLLECTION_RUNNING','Wait for the current collection to finish before changing connections.');
        const existing=await state.db.prepare(`SELECT source_franchise_id FROM franchise_seasons WHERE league_id=? AND status IN ('active','preview') ORDER BY created_at DESC LIMIT 1`).bind(state.league.id).first();
        if(existing?.source_franchise_id&&String(existing.source_franchise_id)!==String(selected.leagueId))fail('WRONG_FRANCHISE','This Madden franchise does not match the franchise already connected to this FHQ league. Your existing data was not changed.');
        const connection={id:`eac_${crypto.randomUUID()}`,league_id:state.league.id};
        const cipher=await sealEa(state.env,connectionScope(connection),payload.token);
        const guard=`${SETUP_MUTATION_GUARD} AND NOT EXISTS(SELECT 1 FROM ea_direct_collection_jobs WHERE league_id=? AND status IN ('queued','running'))`;
        const guardArgs=[...setupMutationArgs(state,setup,lock,'franchise'),state.league.id];
        const results=await state.db.batch([
          state.db.prepare(`UPDATE ea_direct_connections SET status='disconnected',credential_cipher=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND status!='disconnected' AND ${guard}`).bind(state.league.id,...guardArgs),
          state.db.prepare(`INSERT INTO ea_direct_connections(id,league_id,connected_by,status,platform,persona_id,persona_name,external_league_id,external_league_name,credential_cipher) SELECT ?,?,?,'connected',?,?,?,?,?,? WHERE ${guard}`)
            .bind(connection.id,state.league.id,state.session.user.id,payload.persona.platform,String(payload.persona.id),payload.persona.name,String(selected.leagueId),String(selected.leagueName||selected.name||'Madden franchise').slice(0,120),cipher,...guardArgs),
          state.db.prepare(`UPDATE ea_direct_setups SET stage='complete',payload_cipher=NULL,lock_until=NULL WHERE id=? AND ${guard}`).bind(setup.id,...guardArgs)
        ]);
        requireSetupMutation(results[1]);
      }
    }finally{await state.db.prepare(`UPDATE ea_direct_setups SET lock_until=NULL WHERE id=? AND lock_until=?`).bind(setup.id,lock).run();}
    return json(await status(state));
  }catch(error){return eaErrorResponse(error);}
}
