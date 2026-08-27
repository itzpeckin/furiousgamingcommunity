import { json, database, canonicalLeagueSlug } from '../../_lib/cloud-platform.js';
const RELEASE='7.2.0';
export async function onRequestGet(context){
  const db=database(context.env);
  if(!db)return json({ok:false,release:RELEASE,error:'Database binding is missing.'},503);
  const result=await db.prepare(`SELECT name,slug,timezone,branding_json FROM leagues WHERE public_status='active' AND tenant_status='enabled' ORDER BY name,slug`).all();
  const leagues=(result.results||[]).map(row=>({
    name:row.name,
    slug:canonicalLeagueSlug(row.slug),
    timezone:row.timezone,
    branding:(()=>{try{return JSON.parse(row.branding_json||'{}')}catch{return {}}})(),
    canonicalPath:`/leagues/${canonicalLeagueSlug(row.slug)}`
  }));
  return json({ok:true,release:RELEASE,count:leagues.length,leagues});
}
