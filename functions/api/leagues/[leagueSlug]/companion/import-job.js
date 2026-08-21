const RELEASE='5.9.10.6.5.4';
const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const text=v=>String(v??'').trim();

function ownerId(request){
  return text(request.headers.get('x-franchisehq-platform-owner-account-id'));
}
function worker(context){
  return context.env?.FRANCHISE_IMPORT_WORKER || null;
}
function origin(request){
  const url=new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function onRequestPost(context){
  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);
  const accountId=ownerId(context.request);
  if(!accountId)return json({ok:false,release:RELEASE,error:'Commissioner account is required.'},401);

  const leagueSlug=text(context.params?.leagueSlug);
  if(!leagueSlug)return json({ok:false,release:RELEASE,error:'League slug is required.'},400);

  const response=await binding.fetch('https://franchise-import.internal/start',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({leagueSlug,ownerAccountId:accountId,origin:origin(context.request)})
  });
  return new Response(response.body,{status:response.status,headers:response.headers});
}

export async function onRequestGet(context){
  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);
  const accountId=ownerId(context.request);
  if(!accountId)return json({ok:false,release:RELEASE,error:'Commissioner account is required.'},401);

  const leagueSlug=text(context.params?.leagueSlug);
  const requestUrl=new URL(context.request.url);
  const id=text(requestUrl.searchParams.get('id'));
  if(!leagueSlug)return json({ok:false,release:RELEASE,error:'League slug is required.'},400);

  const u=new URL('https://franchise-import.internal/status');
  u.searchParams.set('leagueSlug',leagueSlug);
  u.searchParams.set('ownerAccountId',accountId);
  u.searchParams.set('origin',origin(context.request));
  if(id)u.searchParams.set('id',id);

  const response=await binding.fetch(u.toString(),{headers:{accept:'application/json'}});
  return new Response(response.body,{status:response.status,headers:response.headers});
}
