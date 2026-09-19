import { findTeamBranding } from './team-branding.js';

const text=value=>{
  if(value===null||value===undefined)return null;
  const normalized=String(value).trim();
  return normalized||null;
};

const teamText=(team,...keys)=>{
  for(const key of keys){
    const value=text(team?.[key]);
    if(value)return value;
  }
  return null;
};

export function canonicalTeamExternalId(team={}){
  return teamText(team,'externalId','external_id','teamId','team_id','id');
}

export function canonicalTeamIdentity(team={}){
  const normalized={
    abbreviation:teamText(team,'abbreviation','abbrName','abbr_name','teamAbbr','team_abbr'),
    displayName:teamText(team,'displayName','display_name','fullName','full_name','teamName','team_name'),
    cityName:teamText(team,'cityName','city_name','city'),
    nickname:teamText(team,'nickname','nickName','nick_name','name')
  };
  const branding=findTeamBranding(normalized);
  if(branding?.key)return `nfl:${branding.key}`;
  const exact=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const abbreviation=exact(normalized.abbreviation),displayName=exact(normalized.displayName);
  return abbreviation&&displayName?`exact:${abbreviation}:${displayName}`:null;
}

export function buildTeamIdentityRebase(sourceTeams=[],destinationTeams=[]){
  if(!sourceTeams.length||sourceTeams.length!==destinationTeams.length){
    throw new Error('The active and newly mapped team sets do not contain the same number of teams.');
  }
  const uniqueById=(teams,label)=>{
    const map=new Map();
    for(const team of teams){
      const id=canonicalTeamExternalId(team);
      if(!id||map.has(id))throw new Error(`${label} contains a missing or duplicate team ID.`);
      map.set(id,team);
    }
    return map;
  };
  const sourceById=uniqueById(sourceTeams,'The active snapshot');
  const destinationById=uniqueById(destinationTeams,'The newly mapped League Info dataset');
  const destinationsByIdentity=new Map();
  for(const team of destinationTeams){
    const identity=canonicalTeamIdentity(team);
    if(!identity)continue;
    if(!destinationsByIdentity.has(identity))destinationsByIdentity.set(identity,[]);
    destinationsByIdentity.get(identity).push(team);
  }
  const teamIdMap=new Map(),usedDestinationIds=new Set();
  for(const [sourceId,sourceTeam] of sourceById){
    let destination=destinationById.get(sourceId)||null;
    if(destination){
      const sourceIdentity=canonicalTeamIdentity(sourceTeam),destinationIdentity=canonicalTeamIdentity(destination);
      if(sourceIdentity&&destinationIdentity&&sourceIdentity!==destinationIdentity){
        throw new Error(`Team ID ${sourceId} identifies different teams in the active and newly mapped datasets.`);
      }
    }
    if(!destination){
      const identity=canonicalTeamIdentity(sourceTeam);
      const matches=identity?destinationsByIdentity.get(identity)||[]:[];
      if(matches.length!==1){
        throw new Error(`The active team ${sourceId} does not have one unique identity match in the newly mapped League Info dataset.`);
      }
      destination=matches[0];
    }
    const destinationId=canonicalTeamExternalId(destination);
    if(usedDestinationIds.has(destinationId)){
      throw new Error('Multiple active teams resolve to the same newly mapped League Info team.');
    }
    usedDestinationIds.add(destinationId);
    teamIdMap.set(sourceId,destinationId);
  }
  if(usedDestinationIds.size!==destinationTeams.length){
    throw new Error('The newly mapped League Info team set was not matched completely.');
  }
  return{
    teamIdMap,
    audit:{
      proof:'complete-one-to-one-team-identity',
      sourceTeamCount:sourceTeams.length,
      destinationTeamCount:destinationTeams.length,
      remappedTeamCount:[...teamIdMap].filter(([sourceId,destinationId])=>sourceId!==destinationId).length
    }
  };
}

export function rebaseScheduleTeamIds(games=[],teamIdMap=new Map()){
  let remappedGameCount=0,remappedReferenceCount=0;
  const records=(games||[]).map(game=>{
    let changed=false;
    const next={...game};
    for(const field of ['away_team_external_id','home_team_external_id']){
      const sourceId=text(game?.[field]);
      if(!sourceId)continue;
      const destinationId=teamIdMap.get(sourceId);
      if(!destinationId)throw new Error(`The retained schedule references unknown team ${sourceId}.`);
      if(destinationId!==sourceId){
        next[field]=destinationId;
        changed=true;
        remappedReferenceCount+=1;
      }
    }
    if(changed)remappedGameCount+=1;
    return changed?next:game;
  });
  return{records,remappedGameCount,remappedReferenceCount};
}

const gameExternalId=game=>teamText(game,'external_id','externalId','gameId','game_id','id');

export function extendTeamIdRebaseFromMatchingGames(sourceGames=[],referenceGames=[],baseTeamIdMap=new Map()){
  const referenceByGameId=new Map();
  for(const game of referenceGames||[]){
    const id=gameExternalId(game);
    if(!id||referenceByGameId.has(id))continue;
    referenceByGameId.set(id,game);
  }
  const extendedTeamIdMap=new Map(baseTeamIdMap),inferredTeamIdMap=new Map(),inferredSourceByDestination=new Map();
  let matchedGameCount=0,matchedReferenceCount=0;
  for(const sourceGame of sourceGames||[]){
    const gameId=gameExternalId(sourceGame),referenceGame=gameId?referenceByGameId.get(gameId):null;
    if(!referenceGame)continue;
    matchedGameCount+=1;
    for(const field of ['away_team_external_id','home_team_external_id']){
      const sourceTeamId=text(sourceGame?.[field]),referenceTeamId=text(referenceGame?.[field]);
      if(!sourceTeamId||!referenceTeamId)continue;
      const destinationTeamId=baseTeamIdMap.get(referenceTeamId);
      if(!destinationTeamId){
        throw new Error(`The retained game ${gameId} references an active team outside the verified team identity map.`);
      }
      const existingDestination=extendedTeamIdMap.get(sourceTeamId);
      if(existingDestination&&existingDestination!==destinationTeamId){
        throw new Error(`The retained schedule team ${sourceTeamId} resolves to conflicting current teams.`);
      }
      const existingSource=inferredSourceByDestination.get(destinationTeamId);
      if(existingSource&&existingSource!==sourceTeamId){
        throw new Error(`Multiple retained schedule teams resolve to current team ${destinationTeamId}.`);
      }
      extendedTeamIdMap.set(sourceTeamId,destinationTeamId);
      inferredTeamIdMap.set(sourceTeamId,destinationTeamId);
      inferredSourceByDestination.set(destinationTeamId,sourceTeamId);
      matchedReferenceCount+=1;
    }
  }
  return{
    teamIdMap:extendedTeamIdMap,
    audit:{
      proof:'matching-game-team-identity',
      matchedGameCount,
      matchedReferenceCount,
      inferredTeamCount:inferredTeamIdMap.size,
      inferredRemappedTeamCount:[...inferredTeamIdMap].filter(([sourceId,destinationId])=>sourceId!==destinationId).length
    }
  };
}
