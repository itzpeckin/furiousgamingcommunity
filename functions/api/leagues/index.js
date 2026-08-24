import { json, database, canonicalLeagueSlug } from '../../_lib/cloud-platform.js';
export async function onRequestGet(context){
  const db=database(context.env);
  if(!db)return json({ok:false,release:'6.1.0',error:'Database binding is missing.'},503);
  const result=await db.prepare(`SELECT id,name,slug,public_status,created_at FROM leagues WHERE public_status='active' ORDER BY created_at,id`).all();
  const leagues=(result.results||[]).map(row=>({id:row.id,name:row.name,slug:canonicalLeagueSlug(row.slug),canonicalPath:`/leagues/${canonicalLeagueSlug(row.slug)}`,status:row.public_status,createdAt:row.created_at}));
  return json({ok:true,release:'6.1.0',multiTenant:true,count:leagues.length,leagues});
}
