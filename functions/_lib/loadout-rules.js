import { ABILITY_BY_ID, LOADOUT_CATALOG } from './loadout-catalog.js';

// These distinct abilities share a glyph in both supplied recordings. Tier color
// and duplicate-looking icons are never sufficient evidence of identity.
const SHARED_GLYPHS=[['trimmed-edges','all-hustle']];
export function normalizeLoadout(observed){
  if(observed?.kind==='other')return {kind:'other',complete:false,slots:[]};
  if(observed?.kind!=='loadout'||observed.complete!==true||!Array.isArray(observed.slots)||observed.slots.length!==6)
    return {kind:'uncertain',complete:false,slots:[]};
  const slots=[];
  for(let index=0;index<6;index++){
    const slot=observed.slots[index];
    if(slot?.slot!==index+1||!['equipped','locked','empty'].includes(slot.state)||slot.clear!==true)
      return {kind:'uncertain',complete:false,slots:[]};
    if(slot.state!=='equipped'){slots.push({slot:index+1,state:slot.state,candidates:[]});continue;}
    if(!Array.isArray(slot.candidates)||!slot.candidates.length||slot.candidates.some(id=>!ABILITY_BY_ID.has(id)))
      return {kind:'uncertain',complete:false,slots:[]};
    let candidates=[...new Set(slot.candidates)];
    const writtenId=String(slot.writtenAbilityId||'');
    const writtenName=String(slot.writtenName||'').trim().toLowerCase();
    const written=ABILITY_BY_ID.get(writtenId);
    const detailConfirmed=slot.detailLinkedToSlot===true&&candidates.includes(writtenId)&&written?.name.toLowerCase()===writtenName;
    if(detailConfirmed)candidates=[writtenId];
    else for(const group of SHARED_GLYPHS)if(group.some(id=>candidates.includes(id)))candidates=[...new Set([...candidates,...group])];
    slots.push({slot:index+1,state:'equipped',candidates});
  }
  return {kind:'loadout',complete:true,slots,catalogVersion:LOADOUT_CATALOG.version};
}

export function evaluateLoadout(observed,{banned=[],banDuplicates=false}={}){
  if(observed?.kind==='other')return {status:'ignored',reason:'This image does not show a weekly staff loadout.'};
  if(observed?.complete!==true||observed.catalogVersion!==LOADOUT_CATALOG.version||observed.slots?.length!==6)
    return {status:'unreadable',reason:'Upload a clear, full Coach Central screenshot showing all six staff ability slots. Include ability-detail images for icons that cannot be identified.'};
  const equipped=observed.slots.filter(s=>s.state==='equipped'),bans=new Set(banned),violations=[],unclear=[];
  for(const slot of equipped){
    if(!slot.candidates?.length||slot.candidates.some(id=>!ABILITY_BY_ID.has(id)))return {status:'unreadable',reason:'An equipped staff ability could not be identified. Add its ability-detail screenshot.'};
    const blocked=slot.candidates.filter(id=>bans.has(id));
    if(blocked.length===slot.candidates.length)violations.push(`Slot ${slot.slot}: ${blocked.map(id=>ABILITY_BY_ID.get(id).name).join(' / ')} is banned.`);
    else if(blocked.length)unclear.push(`Slot ${slot.slot} could be a banned ability.`);
  }
  if(banDuplicates)for(let i=0;i<equipped.length;i++)for(let j=i+1;j<equipped.length;j++){
    const a=equipped[i],b=equipped[j],overlap=a.candidates.filter(id=>b.candidates.includes(id));
    if(a.candidates.length===1&&b.candidates.length===1&&overlap.length)violations.push(`${ABILITY_BY_ID.get(overlap[0]).name} is equipped in slots ${a.slot} and ${b.slot}. Duplicate staff abilities are banned.`);
    else if(overlap.length)unclear.push(`Slots ${a.slot} and ${b.slot} have an ambiguous icon match.`);
  }
  if(violations.length)return {status:'illegal',reason:violations.join(' ')};
  // Every equipped ability must be identified, even when current bans would not
  // change the outcome. A plausible partial read never earns a legal verdict.
  if(unclear.length||equipped.some(s=>s.candidates.length!==1))return {status:'unreadable',reason:'Add ability-detail screenshots with each unclear slot selected. Shared icons cannot prove which ability is equipped or whether it is duplicated.'};
  return {status:'legal',reason:'All equipped staff abilities were identified and meet this league’s saved rules.'};
}
