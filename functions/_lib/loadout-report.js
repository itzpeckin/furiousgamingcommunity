import {ABILITY_BY_ID} from './loadout-catalog.js';
import {PLAYSHEET_BY_ID} from './playsheet-catalog.js';

export function reportMarks(env){
  const emoji=(name,id,fallback)=>/^\d{17,20}$/.test(String(id||''))?`<:${name}:${id}>`:fallback;
  // Plain glyph fallback never turns an unresolved read into a pass.
  return {legal:emoji('fhq_pass',env.LOADOUT_PASS_EMOJI_ID,'✓'),illegal:emoji('fhq_fail',env.LOADOUT_FAIL_EMOJI_ID,'✕'),unreadable:'?',unused:'—'};
}
export function loadoutReportLines(observed,result,env){
  const mark=reportMarks(env),staff=result.slotResults||observed?.slots?.map(s=>({...s,status:'unreadable'}))||[];
  const lines=['**Gameday Abilities**',...staff.map(s=>{
    if(s.status==='unused')return `— Slot ${s.slot} — ${s.state==='locked'?'Locked':'Empty'}`;
    const names=(s.candidates||[]).map(id=>ABILITY_BY_ID.get(id)?.name||'Unknown').join(' / ')||'Unclear';
    return `${mark[s.status]||'?'} Slot ${s.slot} — ${names} · ${s.status==='legal'?'LEGAL':s.status==='illegal'?'ILLEGAL':'UNRESOLVED'}`;
  })];
  if(!staff.length)lines.push('? Staff abilities could not be fully read.');
  lines.push('','**Playsheets**');
  const sheets=result.playsheetResults||[];
  if(!sheets.length)lines.push('? Playsheets could not be fully read.');
  for(const s of sheets){
    if(s.status==='unused')lines.push(`— Slot ${s.slot} — ${s.state==='locked'?'Locked':'Empty'}`);
    else lines.push(`${mark[s.status]||'?'} ${PLAYSHEET_BY_ID.get(s.id)?.name||'Unclear'} Playsheet — ${s.status==='legal'?'LEGAL':s.status==='illegal'?'ILLEGAL':'UNRESOLVED'}`);
  }
  const duplicate=result.duplicateCheck;
  lines.push('',`${mark[duplicate]||'—'} **Duplicate Ability Check: ${duplicate==='off'?'NOT BANNED':duplicate==='illegal'?'DUPLICATE DETECTED':duplicate==='legal'?'NONE DETECTED':'UNRESOLVED'}**`);
  lines.push('',`${mark[result.status]||'?'} **LOADOUT STATUS: ${result.status==='legal'?'LEGAL':result.status==='illegal'?'ILLEGAL':'UNRESOLVED'}**`);
  return lines.join('\n').slice(0,4000);
}
