import { json, database, canonicalLeagueSlug } from '../../_lib/cloud-platform.js';
const RELEASE='7.0.1';
export async function onRequestGet(context){
  const db=database(context.env);
  if(!db)return json({ok:false,release:RELEASE,error:'Database binding is missing.'},503);
  const result=await db.prepare(`SELECT name,slug FROM leagues WHERE public_status='active' ORDER BY name,slug`).all();
  const leagues=(result.results||[]).map(row=>({name:row.name,slug:canonicalLeagueSlug(row.slug),canonicalPath:`/leagues/${canonicalLeagueSlug(row.slug)}`}));
  return json({ok:true,release:RELEASE,count:leagues.length,leagues});
}
