// Madden Tools' current franchise index plus legacy names visible in the
// supplied Coach Central captures. Names identify sheets, not their tiers.
const offense=['4th Sunday of October','Air Raid Gun','Air Raid Pistol','Backer Attacker',"Boot Scootin'",'Campus Wide','Chain Mover','Claws and Effect','Dawn Sweetness','Four Minute','Fullback Fury','Gadget','Heavy I','Heavy Sets','Heavy Strong','Max Protect','Motion in the Ocean','Multiplicity','Old School Football','Pitch Perfect','Pull Party','QB Runs','Red Zone Passing','Run N Shoot','Run N Shoot Gun','Screen Game','Shot Plays','Shotgun 2-Back','Slants-R-Us','Slot TE-am','Sneak Heat','SOT','Substation Spread','The Display','Triple Option','Two Minute','Varsity Double','West Coast','Wide Empty','Wide Slot','Wide Trips','Wildcat'];
const defense=['3-3-5','3rd Down Lab','4-3','Badger','Deep Freeze','Dollar','Grandpa Soul',"Hit 'Em at the Line",'Mug Life','Nickel','Nickel Mug','Not So EZ RZ','Phantom Pressure','QB Contain','Quarters World','Red Storm 4-2-5','Run Stop','Slaw','The Florist','The Manifesto','The Shark','Trap House','3-4','4-2-5','Dime'];
export const PLAYSHEET_CATALOG={version:'playsheets-2026-10-04',sources:['https://madden.tools/playbooks/playsheets'],
  playsheets:[...offense.map(name=>({name,category:'Offense'})),...defense.map(name=>({name,category:'Defense'}))]
    .map(s=>({...s,id:s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}))};
export const PLAYSHEET_BY_ID=new Map(PLAYSHEET_CATALOG.playsheets.map(s=>[s.id,s]));
const key=value=>String(value||'').toLowerCase().replace(/\s*playsheet\s*$/,'').replace(/[^a-z0-9]/g,'');
const names=new Map(PLAYSHEET_CATALOG.playsheets.map(s=>[key(s.name),s.id]));
// The in-game I can be rendered as 1 in screen text. No fuzzy name matching:
// an unknown label must remain unreadable rather than matching an allowed sheet.
names.set('heavy1','heavy-i');
export const playsheetId=name=>names.get(key(name))||null;
export function normalizePlaysheets(value){
  if(value?.complete!==true||!Array.isArray(value.slots)||value.slots.length!==4)return {complete:false,slots:[]};
  const slots=value.slots.map((s,i)=>{
    if(s?.slot!==i+1||s.clear!==true||!['equipped','locked','empty'].includes(s.state))return null;
    const id=s.state==='equipped'?playsheetId(s.name):null;
    return {slot:i+1,state:s.state,id,name:id?PLAYSHEET_BY_ID.get(id).name:null};
  });
  return {complete:slots.every(s=>s&&(s.state!=='equipped'||s.id)),slots:slots.filter(Boolean)};
}
