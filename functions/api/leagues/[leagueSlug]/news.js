import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../_lib/permissions.js';
import { executeLeagueNewsAction, leagueNewsState, LEAGUE_NEWS_RELEASE } from '../../../_lib/league-news.js';

async function requestContext(context) {
  const authorization=await requireActiveMembership(context);
  if(!authorization.authorized)return {response:authorization.response};
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return {response:json({ok:false,error:'Invalid league slug.'},400)};
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||authorization.session.membership?.leagueId!==league.id){
    return {response:json({ok:false,error:'Not found.'},404)};
  }
  return {db,league,session:authorization.session,request:context.request};
}

export async function onRequestGet(context){
  try{
    const c=await requestContext(context);if(c.response)return c.response;
    const includeDrafts=new URL(context.request.url).searchParams.get('drafts')==='1';
    return json(await leagueNewsState({...c,includeDrafts}));
  }catch(error){
    return json({ok:false,release:LEAGUE_NEWS_RELEASE,error:error?.message||'League News could not be loaded.'},Number(error?.status)||500);
  }
}

export async function onRequestPost(context){
  try{
    const c=await requestContext(context);if(c.response)return c.response;
    const raw=await context.request.text();
    if(new TextEncoder().encode(raw).byteLength>16*1024)return json({ok:false,error:'News request is too large.'},413);
    let body;try{body=raw?JSON.parse(raw):{}}catch{return json({ok:false,error:'Request body must be valid JSON.'},400)}
    return json(await executeLeagueNewsAction(c,body));
  }catch(error){
    return json({ok:false,release:LEAGUE_NEWS_RELEASE,error:error?.message||'League News action failed.'},Number(error?.status)||500);
  }
}
