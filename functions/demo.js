export async function onRequestGet(){
  return new Response(null,{status:302,headers:{location:'/leagues/demo','cache-control':'no-store'}});
}
