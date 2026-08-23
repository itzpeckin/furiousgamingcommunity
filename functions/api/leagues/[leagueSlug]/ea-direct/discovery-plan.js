import {RELEASE,json} from './_common.js';

export async function onRequestGet({params}){
  return json({
    ok:true,
    release:RELEASE,
    mode:'session-capture-discovery',
    leagueSlug:String(params?.leagueSlug||''),
    productionImportConnected:false,
    canonicalWrites:0,
    phases:[
      {id:1,name:'Authenticate in an authorized EA/Madden client',complete:false},
      {id:2,name:'Observe EA-controlled franchise-list request metadata',complete:false},
      {id:3,name:'Sanitize request/response metadata',complete:false},
      {id:4,name:'Identify league-list contract and required non-secret headers',complete:false},
      {id:5,name:'Test short-lived session token against verified endpoint',complete:false},
      {id:6,name:'Confirm Furious Gaming Community league identifier',complete:false}
    ],
    prohibited:[
      'EA password collection',
      'credential interception from another user',
      'hard-coded guessed Madden endpoints',
      'canonical database writes during discovery'
    ]
  });
}
