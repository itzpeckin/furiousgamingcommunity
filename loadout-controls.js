/* Commissioner rules editor. Multi-position cards share one ability setting. */
(() => {
  'use strict';
  const groups=['QB','RB/FB','WR/TE','OL','Edge','DT','LB','CB','FS/SS','Team-wide','Staff-wide'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let draft=null,saveAction=null;
  function cards(){
    const {catalog,selected,search,position,category}=draft;
    const filtered=catalog.abilities.filter(a=>(!category||a.category===category)&&(!search||`${a.name} ${a.effects.join(' ')}`.toLowerCase().includes(search)));
    const sections=groups.filter(g=>!position||position===g).map(group=>{
      const abilities=filtered.filter(a=>a.positionGroups.includes(group));
      if(!abilities.length)return '';
      return `<section class="loadout-position"><h4>${esc(group)}</h4><div class="loadout-grid">${abilities.map(a=>`<article class="loadout-ability"><div class="loadout-row"><span class="loadout-icon"><img src="${esc(a.icon)}" alt="" loading="lazy"></span><div class="loadout-title"><strong>${esc(a.name)}</strong><small>${esc(a.category==='Development'?'XP & Development':a.category)}</small></div><label class="loadout-ban"><input type="checkbox" data-loadout-ban="${esc(a.id)}" ${selected.has(a.id)?'checked':''} aria-label="Ban ${esc(a.name)}">Ban</label></div><details><summary>Effects by tier</summary><ol type="I">${a.effects.map(effect=>`<li>${esc(effect)}</li>`).join('')}</ol>${a.note?`<p class="loadout-note">${esc(a.note)}</p>`:''}</details></article>`).join('')}</div></section>`;
    }).join('');
    return sections||'<p>No abilities match these filters.</p>';
  }
  function count(root){
    const node=root.querySelector('[data-loadout-count]');
    if(node)node.textContent=`${draft.selected.size} of ${draft.catalog.abilities.length} abilities banned · ${draft.selectedPlaysheets.size} playsheets banned${draft.dirty?' · Unsaved changes':''}`;
  }
  function render({settings,catalog,leagueSlug,onSave}){
    if(!catalog?.abilities?.length)return '';
    if(!draft||draft.leagueSlug!==leagueSlug||draft.revision!==settings.revision){
      draft={leagueSlug,revision:settings.revision,catalog,selected:new Set(settings.banned||[]),selectedPlaysheets:new Set(settings.bannedPlaysheets||[]),playsheetCatalog:settings.playsheetCatalog,enabled:settings.enabled,
        banDuplicates:settings.banDuplicates,search:'',position:'',category:'',dirty:false};
    }
    saveAction=onSave;
    const p=settings.progress||{};
    return `<section class="card loadout-rules" data-loadout-controls data-loadout-league="${esc(leagueSlug)}"><svg width="0" height="0" aria-hidden="true" class="loadout-filter-def"><filter id="loadout-glyph" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .2126 .7152 .0722 0 0"/><feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0 0 0 0.2 0.7 1 1"/></feComponentTransfer></filter></svg><div class="card-header"><div><h3>Weekly Loadout Rules</h3><p>Choose banned staff abilities and playsheets. Checks and results stay in each weekly matchup thread.</p></div><span class="pill">${settings.enabled?'Enabled':'Off'}</span></div><label class="loadout-toggle"><input type="checkbox" data-loadout-enabled ${draft.enabled?'checked':''} ${!settings.readerReady&&!draft.enabled?'disabled':''}><span>Automatically check screenshots in scheduling threads</span></label>${!settings.readerReady?'<p class="loadout-note">Automatic screenshot checks are not available yet. You can save your league’s rules, but the bot will not evaluate weekly loadouts until checking is enabled.</p>':''}<label class="loadout-toggle"><input type="checkbox" data-loadout-duplicates ${draft.banDuplicates?'checked':''}><span><strong>Ban duplicate staff abilities</strong><small>The same staff ability cannot appear twice. Every visible staff icon counts, with or without a checkmark. This duplicate rule applies only to staff abilities. Playsheet bans are selected below; trainers are excluded.</small></span></label><div class="loadout-filters"><input type="search" data-loadout-search value="${esc(draft.search)}" placeholder="Search abilities or effects" aria-label="Search abilities or effects"><select data-loadout-position aria-label="Position group"><option value="">All position groups</option>${groups.map(g=>`<option ${draft.position===g?'selected':''}>${esc(g)}</option>`).join('')}</select><select data-loadout-category aria-label="Ability category"><option value="">All categories</option>${['Offense','Defense','Development','Scouting','Personnel'].map(c=>`<option value="${c}" ${draft.category===c?'selected':''}>${c==='Development'?'XP & Development':c}</option>`).join('')}</select></div><p class="loadout-help">Checked means banned. An ability shown in several position groups has one shared rule.</p><div data-loadout-list>${cards()}</div><section class="loadout-playsheets"><h4>Playsheets</h4><p>Check a playsheet to ban it at every tier.</p><div class="loadout-grid">${(draft.playsheetCatalog?.playsheets||[]).map(p=>`<label class="loadout-ability loadout-row"><input type="checkbox" data-loadout-playsheet="${esc(p.id)}" ${draft.selectedPlaysheets.has(p.id)?'checked':''} aria-label="Ban ${esc(p.name)} Playsheet"><span><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></span></label>`).join('')}</div></section><div class="loadout-save"><span data-loadout-count aria-live="polite">${draft.selected.size} of ${catalog.abilities.length} abilities banned${draft.dirty?' · Unsaved changes':''}</span><button type="button" class="button button--primary" data-save-loadouts>Save Loadout Rules</button></div>${settings.lastError?`<p class="form-error">${esc(settings.lastError)}</p>`:''}${settings.enabled?`<p class="loadout-progress">${p.historyComplete||0}/${p.threads||0} current-week thread histories read · ${p.pending||0} awaiting checks · ${p.needsEvidence||0} need clearer evidence or a team link. Use <strong>/loadout status</strong> or <strong>/loadout missing</strong>.</p>`:''}</section>`;
  }
  function handle(event){
    const root=event.target.closest('[data-loadout-controls]');
    if(!root||!draft||root.dataset.loadoutLeague!==draft.leagueSlug)return;
    const node=event.target;
    if(node.matches('[data-loadout-ban]')){
      if(node.checked)draft.selected.add(node.dataset.loadoutBan);else draft.selected.delete(node.dataset.loadoutBan);
      root.querySelectorAll('[data-loadout-ban]').forEach(box=>{box.checked=draft.selected.has(box.dataset.loadoutBan);});draft.dirty=true;
    }else if(node.matches('[data-loadout-playsheet]')){if(node.checked)draft.selectedPlaysheets.add(node.dataset.loadoutPlaysheet);else draft.selectedPlaysheets.delete(node.dataset.loadoutPlaysheet);draft.dirty=true;}else if(node.matches('[data-loadout-enabled]')){draft.enabled=node.checked;draft.dirty=true;}
    else if(node.matches('[data-loadout-duplicates]')){draft.banDuplicates=node.checked;draft.dirty=true;}
    else if(node.matches('[data-loadout-search],[data-loadout-position],[data-loadout-category]')){
      draft.search=root.querySelector('[data-loadout-search]').value.trim().toLowerCase();
      draft.position=root.querySelector('[data-loadout-position]').value;draft.category=root.querySelector('[data-loadout-category]').value;
      root.querySelector('[data-loadout-list]').innerHTML=cards();
    }
    count(root);
  }
  document.addEventListener('change',handle);
  document.addEventListener('input',event=>{if(event.target.matches('[data-loadout-search]'))handle(event);});
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-save-loadouts]'),root=button?.closest('[data-loadout-controls]');
    if(!button||button.disabled||root?.dataset.loadoutLeague!==draft?.leagueSlug)return;
    event.preventDefault();
    saveAction?.({enabled:draft.enabled,banDuplicates:draft.banDuplicates,banned:[...draft.selected],bannedPlaysheets:[...draft.selectedPlaysheets],revision:draft.revision,catalogVersion:draft.catalog.version},draft.leagueSlug);
  });
  window.FHQ_LOADOUTS={render};
})();
