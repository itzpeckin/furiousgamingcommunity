/* FHQ_BUILD: 7.3.3 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '7.3.3';
  let state = null;
  let busy = false;
  let errorMessage = '';
  let notice = '';
  let confirmation = '';
  let seasonDraft = { sourceSeasonId:'', displayName:'', seasonYear:'', confirmation:'' };

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug
    || HQ?.leagueTenant?.current?.()?.slug
    || decodeURIComponent(location.pathname.match(/\/leagues\/([^/?#]+)/i)?.[1] || '');
  const endpoint = () => `/api/leagues/${encodeURIComponent(slug())}/game-year-transition`;

  async function request(method='GET', body, preview=false) {
    const response = await fetch(`${endpoint()}${preview?'?preview=1':''}`, {
      method,
      credentials:'same-origin',
      cache:'no-store',
      headers:{accept:'application/json','content-type':'application/json'},
      body:body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
    if (!response.ok || payload.ok === false) throw new Error(payload.detail || payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  async function refresh(preview=false) {
    state = await request('GET',undefined,preview);
    rerender();
    return state;
  }

  function currentExpected() {
    const status = state?.transition?.status;
    if (!state?.transition) return state?.confirmations?.plan || '';
    if (status === 'planned') return state?.confirmations?.archive || '';
    if (status === 'archive-verified') return state?.confirmations?.detach || '';
    if (status === 'detached') return state?.confirmations?.removeActive || '';
    if (status === 'active-data-removed') return state?.confirmations?.removeArchive || '';
    return '';
  }

  async function runAction(action, extra={}) {
    if (busy || !state?.gameYear) return;
    busy = true;
    errorMessage = '';
    notice = 'Applying the protected operation…';
    rerender();
    try {
      do {
        state = await request('POST',{
          action,
          gameYearId:state.gameYear.id,
          confirmation,
          ...extra
        });
        if (action === 'rollback' && state?.rollback?.pending) {
          notice = `Recovery in progress · ${state.rollback.phase}`;
          rerender();
        }
      } while (action === 'rollback' && state?.rollback?.pending);
      confirmation = '';
      notice = 'Operation completed and audit evidence was retained.';
    } catch (error) {
      errorMessage = error.message;
      notice = 'The operation stopped safely.';
    } finally {
      busy = false;
      rerender();
    }
  }

  async function replaceCurrentImport() {
    if (busy || !state?.gameYear) return;
    busy = true;
    errorMessage = '';
    try {
      await request('POST',{
        action:'replace-current-import',
        gameYearId:state.gameYear.id,
        confirmation:state.confirmations.plan
      });
      notice = 'Current edition preserved. Open the importer to build a replacement candidate.';
      window.dispatchEvent(new CustomEvent('franchisehq:open-candidate-import'));
    } catch (error) { errorMessage = error.message; }
    finally { busy = false; rerender(); }
  }

  async function startSeason() {
    await runAction('start-franchise-season',{
      confirmation:seasonDraft.confirmation,
      sourceSeasonId:seasonDraft.sourceSeasonId,
      displayName:seasonDraft.displayName,
      seasonYear:Number(seasonDraft.seasonYear)
    });
    if (!errorMessage) seasonDraft={sourceSeasonId:'',displayName:'',seasonYear:'',confirmation:''};
  }

  function count(value) { return Number(value || 0).toLocaleString(); }
  function statusTone(status) {
    if (['active','restored','archive-verified','completed'].includes(status)) return 'success';
    if (['failed','archive-removed'].includes(status)) return 'danger';
    if (['detached','active-data-removed','archived'].includes(status)) return 'warning';
    return 'neutral';
  }

  function affectedGrid() {
    const counts = state?.affectedCounts;
    if (!counts) return '';
    const rows = [
      ['Total archived rows',counts.total],
      ['Snapshot records',counts.league_snapshot_records],
      ['Rostered snapshot players',counts.canonical_roster_snapshot_players],
      ['Statistics preview',counts.companion_canonical_statistics_preview],
      ['Source captures',counts.companion_route_captures],
      ['Team assignments to clear',counts.teamAssignments]
    ];
    return `<div class="game-year-count-grid">${rows.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${count(value)}</strong></div>`).join('')}</div>`;
  }

  function transitionAction() {
    const status = state?.transition?.status;
    if (!state?.transition) return { id:'plan-archive', label:'Create Archive Plan', expected:state?.confirmations?.plan };
    if (status === 'planned') return { id:'archive', label:'Create & Verify Archive', expected:state?.confirmations?.archive };
    if (status === 'archive-verified') return { id:'detach', label:'Detach Active Game Year', expected:state?.confirmations?.detach };
    if (status === 'detached') return { id:'remove-active-data', label:'Remove Detached Active Data', expected:state?.confirmations?.removeActive };
    if (status === 'active-data-removed') return { id:'remove-archive', label:'Permanently Remove Archive Copy', expected:state?.confirmations?.removeArchive };
    return null;
  }

  function renderPanel() {
    if (!state) return `<section class="card game-year-transition-card" data-game-year-transition-panel><div class="card-header"><div><span class="eyebrow">v${VERSION} · protected edition boundary</span><h3>Game Year & Season Transition</h3><p>Loading commissioner transition controls…</p></div><span class="pill pill--neutral">Loading</span></div></section>`;
    const gameYear=state.gameYear;
    if (!gameYear) return `<section class="card game-year-transition-card" data-game-year-transition-panel><div class="card-header"><div><span class="eyebrow">v${VERSION}</span><h3>Game Year & Season Transition</h3><p>Create a reviewed Madden season destination before managing edition transitions.</p></div><span class="pill pill--warning">No game year</span></div></section>`;
    const transition=state.transition;
    const action=transitionAction();
    const expected=action?.expected||currentExpected();
    const freeAgents=state.freeAgents||{status:'missing',count:null};
    const canRollback=['archive-verified','detached','active-data-removed','restoring'].includes(transition?.status);
    const activeSeason=state.franchiseSeasons?.find(season=>['active','preview'].includes(season.status))||state.franchiseSeasons?.[0];
    return `<section class="game-year-transition-stack" data-game-year-transition-panel>
      <article class="card game-year-transition-card">
        <div class="card-header"><div><span class="eyebrow">v${VERSION} · Madden edition boundary</span><h3>${esc(gameYear.displayName)}</h3><p>A Madden game year can contain several franchise seasons. League accounts, memberships, roles, sessions, settings, rules, audits, stable player identities, and GM history persist across every operation.</p></div><span class="pill pill--${statusTone(gameYear.status)}">${esc(gameYear.status)}</span></div>
        <div class="game-year-operation-grid">
          <section><span class="eyebrow">Same edition</span><h4>Replace Current Import</h4><p>Build a new private candidate for ${esc(gameYear.gameRelease)}. The active snapshot stays live until separately reviewed and activated.</p><button class="button button--primary" data-game-year-replace ${busy?'disabled':''}>Open Replacement Import</button></section>
          <section><span class="eyebrow">Same edition</span><h4>Start New Franchise Season</h4><p>Freeze ${esc(activeSeason?.displayName||'the current season')} totals and ownership history, then create another season inside ${esc(gameYear.gameRelease)}.</p><div class="game-year-season-fields"><input data-game-year-season-id placeholder="Reviewed source season ID" value="${esc(seasonDraft.sourceSeasonId)}"><input data-game-year-season-name placeholder="Display name" value="${esc(seasonDraft.displayName)}"><input data-game-year-season-year type="number" min="2000" max="2200" placeholder="Season year" value="${esc(seasonDraft.seasonYear)}"><input data-game-year-season-confirmation autocomplete="off" placeholder="${esc(state.confirmations.startSeason)}" value="${esc(seasonDraft.confirmation)}"></div><button class="button button--ghost" data-game-year-start-season ${busy||!seasonDraft.sourceSeasonId||!seasonDraft.displayName||!seasonDraft.seasonYear||seasonDraft.confirmation!==state.confirmations.startSeason?'disabled':''}>Freeze & Start Season</button></section>
        </div>
      </article>
      <article class="card game-year-transition-card game-year-transition-card--danger">
        <div class="card-header"><div><span class="eyebrow">Edition transition</span><h3>Archive / Remove Madden Game Year</h3><p>Inventory → immutable private archive → checksum verification → detach → active-data removal. Removing the archive copy is a separate final confirmation.</p></div><span class="pill pill--${statusTone(transition?.status||'not-planned')}">${esc(transition?.status||'Not planned')}</span></div>
        <div class="league-import-framework-note"><svg><use href="#icon-shield"></use></svg><span><strong>Preserved:</strong> ${esc(state.preservedDomains.join(', '))}.</span></div>
        ${freeAgents.status==='blocked'?`<div class="league-import-framework-note"><svg><use href="#icon-alert-triangle"></use></svg><span><strong>Free Agents remain blocked/unknown:</strong> the archive records a null count. It is never interpreted as zero.</span></div>`:''}
        ${affectedGrid()}
        ${errorMessage?`<div class="validation-errors"><strong>Stopped safely</strong><p>${esc(errorMessage)}</p></div>`:''}
        ${notice?`<p class="muted">${esc(notice)}</p>`:''}
        <div class="game-year-transition-actions">
          <button class="button button--ghost" data-game-year-preview ${busy?'disabled':''}>Review Exact Counts</button>
          ${action?`<label class="field"><span>Type ${esc(expected)} exactly</span><input data-game-year-confirmation autocomplete="off" value="${esc(confirmation)}"></label><button class="button ${action.id==='plan-archive'||action.id==='archive'?'button--primary':'button--danger'}" data-game-year-action="${esc(action.id)}" ${busy||confirmation!==expected?'disabled':''}>${busy?'Working…':esc(action.label)}</button>`:''}
          ${canRollback?`<button class="button button--ghost" data-game-year-rollback ${busy?'disabled':''}>Restore from Verified Archive</button>`:''}
        </div>
        <p class="muted">Active snapshot: ${esc(gameYear.activeSnapshotId||transition?.activeSnapshotIdBefore||'none')} · manifest: ${esc(transition?.manifestId||'not created')} · recovery bookmark: ${esc(transition?.recoveryBookmarkId||'not created')}</p>
      </article>
    </section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-game-year-transition-panel]').forEach(node=>{node.outerHTML=renderPanel();});
  }

  document.addEventListener('input',event=>{
    if(event.target.matches('[data-game-year-confirmation]'))confirmation=event.target.value;
    if(event.target.matches('[data-game-year-season-id]'))seasonDraft.sourceSeasonId=event.target.value;
    if(event.target.matches('[data-game-year-season-name]'))seasonDraft.displayName=event.target.value;
    if(event.target.matches('[data-game-year-season-year]'))seasonDraft.seasonYear=event.target.value;
    if(event.target.matches('[data-game-year-season-confirmation]'))seasonDraft.confirmation=event.target.value;
    if(event.target.matches('[data-game-year-season-id],[data-game-year-season-name],[data-game-year-season-year],[data-game-year-season-confirmation]')){
      const button=document.querySelector('[data-game-year-start-season]');
      if(button)button.disabled=busy||!seasonDraft.sourceSeasonId||!seasonDraft.displayName||!seasonDraft.seasonYear||seasonDraft.confirmation!==state?.confirmations?.startSeason;
    }
    if(event.target.matches('[data-game-year-confirmation]')){
      const button=document.querySelector('[data-game-year-action]');if(button)button.disabled=busy||confirmation!==currentExpected();
    }
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-game-year-preview]')){event.preventDefault();refresh(true).catch(error=>{errorMessage=error.message;rerender();});return;}
    if(event.target.closest('[data-game-year-replace]')){event.preventDefault();replaceCurrentImport();return;}
    if(event.target.closest('[data-game-year-start-season]')){event.preventDefault();startSeason();return;}
    const action=event.target.closest('[data-game-year-action]');
    if(action){event.preventDefault();if(confirm(`Continue with ${action.textContent.trim()}?`))runAction(action.dataset.gameYearAction);return;}
    if(event.target.closest('[data-game-year-rollback]')){
      event.preventDefault();
      const expected=state?.confirmations?.rollback;
      const entered=prompt(`Type ${expected} exactly to restore the verified archive.`)||'';
      if(entered===expected){confirmation=entered;runAction('rollback');}
    }
  });

  if(!HQ?.defineModuleService)throw new Error('platform/core.js must load before game-year-transition.js.');
  HQ.defineModuleService('platform','gameYearTransition',{refresh,renderPanel,diagnostics:()=>({release:VERSION,busy,state,error:errorMessage})},{replace:true,alias:'gameYearTransition'});
  HQ.manifest?.register?.({scope:'module',module:'platform',id:'game-year-transition',service:'gameYearTransition',script:'league-engine/game-year-transition.js',version:VERSION,dependencies:['auth','leagueTenant'],capabilities:['game-year-boundary','franchise-season-close','immutable-archive','typed-confirmation','recovery-bookmark','no-free-agent-zero-default']});
  setTimeout(()=>refresh().catch(()=>{}),0);
})();
