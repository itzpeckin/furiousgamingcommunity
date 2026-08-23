const RELEASE='6.0.2';

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}
  });
}

function safeUrl(value){
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return null;
    return u;
  }catch{return null}
}

function allowedEaHost(hostname){
  const h=String(hostname||'').toLowerCase();
  return h==='ea.com'||h.endsWith('.ea.com')||
    h==='easports.com'||h.endsWith('.easports.com');
}

async function resolveLeague(env,slug){
  const db=env?.DB||env?.D1||env?.FRANCHISE_HQ_DB;
  if(!db)return {db:null,league:null};
  try{
    const league=await db.prepare(`SELECT * FROM leagues WHERE slug=? LIMIT 1`).bind(slug).first();
    return {db,league};
  }catch{return {db,league:null}}
}

export {RELEASE,json,safeUrl,allowedEaHost,resolveLeague};
