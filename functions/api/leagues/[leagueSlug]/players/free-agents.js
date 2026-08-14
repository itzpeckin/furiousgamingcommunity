import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE='5.9.10.6.1a';

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);

  const db=database(context.env);
  const league=await resolveLeague(context.env,slug);
  if(!db||!league)return json({ok:false,error:'Not found.'},404);

  let rows=[];
  try{
    const result=await db.prepare(`SELECT player_id,player_name,position,overall,age,dev_trait,raw_json
      FROM canonical_free_agents WHERE league_id=? ORDER BY overall DESC,player_name ASC LIMIT 2000`)
      .bind(league.id).all();
    rows=result.results||[];
  }catch(error){
    // The table will not exist until 5.9.10.6.1 integration is run once.
    if(/no such table/i.test(String(error?.message||error))){
      return json({ok:true,release:RELEASE,players:[],integrated:false});
    }
    return json({ok:false,error:'Free Agent directory unavailable.',detail:error?.message||String(error)},500);
  }

  const players=rows.map(row=>{
    let raw={};
    try{raw=JSON.parse(row.raw_json||'{}')}catch{}
    return{
      id:String(row.player_id),
      name:row.player_name||raw.displayName||raw.fullName||'Unknown Player',
      displayName:row.player_name||raw.displayName||raw.fullName||'Unknown Player',
      teamId:'FA',
      position:row.position||raw.position||raw.positionName||raw.pos||'',
      overall:row.overall,
      age:row.age,
      devTrait:row.dev_trait||raw.devTrait||raw.developmentTrait||raw.dev||null,
      rosterStatus:'free-agent',
      status:'free-agent',
      source:{...raw,teamId:'FA',rosterStatus:'free-agent',status:'free-agent'}
    };
  });

  return json({ok:true,release:RELEASE,integrated:true,count:players.length,players});
}
