(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  const VERSION = '7.3.1';
  let latest = null;
  let busy = false;
  let lastError = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[char]);
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const endpoint = () => `/api/leagues/${encodeURIComponent(slug())}/companion/identity-preview`;
  const headers = () => ({
    accept:'application/json',
    'content-type':'application/json',
    'x-franchisehq-platform-owner-account-id':String(account()?.id || '')
  });

  async function request(method, body) {
    busy = true;
    lastError = null;
    rerender();
    try {
      const response = await fetch(endpoint(), {
        method,
        headers:headers(),
        credentials:'same-origin',
        cache:'no-store',
        body:body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json().catch(() => ({ ok:false, error:`HTTP ${response.status}` }));
      if (!response.ok || payload.ok === false) throw Object.assign(
        new Error(payload.error || 'Identity preview request failed.'), { payload }
      );
      latest = payload;
      return payload;
    } catch (error) {
      lastError = error.message;
      console.error('[Identity Preview]', error.payload || error);
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  const refresh = () => request('GET');

  function reviewedSeason() {
    const value = selector => document.querySelector(selector)?.value?.trim() || '';
    return {
      sourceFranchiseId:value('[data-identity-source-franchise]'),
      sourceSeasonId:value('[data-identity-source-season]'),
      gameRelease:value('[data-identity-game-release]'),
      displayName:value('[data-identity-season-name]'),
      seasonYear:value('[data-identity-season-year]') || null
    };
  }

  const createPreview = () => request('POST', { season:reviewedSeason() });

  function teamSummary() {
    const teams = latest?.teams || [];
    const players = latest?.players || [];
    const counts = new Map();
    for (const player of players) {
      const key = String(player.teamExternalId || 'unassigned');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return teams.map(team => ({ ...team, playerCount:counts.get(String(team.externalId)) || 0 }));
  }

  function renderPanel() {
    const preview = latest?.preview || null;
    const season = preview?.season || {};
    const blocked = preview?.freeAgentStatus === 'blocked';
    const teams = teamSummary();
    return `<article class="card" data-identity-preview-panel>
      <div class="card-header"><div><span class="eyebrow">7.3.1 · permanent identity</span><h3>Private Team & Player Identity Preview</h3><p>Maps reviewed season identity to stable players without activating or resetting league data.</p></div><span class="pill pill--${preview ? (blocked ? 'warning' : 'success') : 'neutral'}">${esc(preview?.status || 'Not Generated')}</span></div>
      <div class="league-import-framework-grid">
        <div><span>Teams</span><strong>${preview?.teamCount ?? '—'}</strong></div>
        <div><span>Rostered Players</span><strong>${preview?.rosteredPlayerCount ?? '—'}</strong></div>
        <div><span>Free Agent Source</span><strong>${esc(preview?.freeAgentStatus || 'waiting')}</strong></div>
        <div><span>Free Agent Count</span><strong>${preview?.freeAgentCount == null ? 'Unknown' : preview.freeAgentCount}</strong></div>
        <div><span>Active Snapshot Changed</span><strong>No</strong></div>
      </div>
      ${blocked ? '<div class="validation-errors"><p><strong>Free Agents blocked upstream.</strong> This rostered-player-only preview is not evidence that the league has zero Free Agents.</p></div>' : ''}
      <div class="form-grid">
        <label>Source Franchise ID<input class="input" data-identity-source-franchise value="${esc(season.sourceFranchiseId || '')}" placeholder="Reviewed source franchise ID" /></label>
        <label>Source Season ID<input class="input" data-identity-source-season value="${esc(season.sourceSeasonId || '')}" placeholder="Reviewed permanent season key" /></label>
        <label>Game Release<input class="input" data-identity-game-release value="${esc(season.gameRelease || 'Madden NFL 27')}" /></label>
        <label>Season Display Name<input class="input" data-identity-season-name value="${esc(season.displayName || '')}" placeholder="League season name" /></label>
        <label>Season Year (optional)<input class="input" type="number" min="2000" max="2200" data-identity-season-year placeholder="2026" /></label>
      </div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-create-identity-preview ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Generate Private Preview'}</button><button class="button button--ghost" data-refresh-identity-preview ${busy ? 'disabled' : ''}>Refresh</button></div>
      ${lastError ? `<div class="validation-errors"><p>${esc(lastError)}</p></div>` : ''}
      ${teams.length ? `<details><summary><strong>${teams.length} mapped teams · ${latest.players?.length || 0} rostered players</strong></summary><div class="table-wrap"><table><thead><tr><th>Team</th><th>Stable Key</th><th>Rostered Players</th></tr></thead><tbody>${teams.map(team => `<tr><td>${esc(team.displayName)}</td><td>${esc(team.teamKey)}</td><td>${team.playerCount}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>Platform Owner only. Requires analyzed capture plus pending team/player mappings. This tool cannot activate a snapshot, reset Madden data, or publish a player pool.</span></div>
    </article>`;
  }

  function rerender() {
    const panel = document.querySelector('[data-identity-preview-panel]');
    if (panel) panel.outerHTML = renderPanel();
  }

  document.addEventListener('click', async event => {
    const create = event.target.closest('[data-create-identity-preview]');
    const refreshButton = event.target.closest('[data-refresh-identity-preview]');
    if (!create && !refreshButton) return;
    try { if (create) await createPreview(); else await refresh(); } catch {}
  });

  function diagnostics() {
    return Object.freeze({
      service:'identityPreview',
      version:VERSION,
      previewAvailable:Boolean(latest?.preview),
      status:latest?.preview?.status || 'not-generated',
      teamCount:latest?.preview?.teamCount || 0,
      rosteredPlayerCount:latest?.preview?.rosteredPlayerCount || 0,
      freeAgentStatus:latest?.preview?.freeAgentStatus || 'waiting',
      activeSnapshotChanged:false,
      activationPerformed:false,
      lastError
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before identity-preview.js.');
  HQ.defineModuleService('league','identityPreview',{
    refresh,createPreview,getPreview:() => latest,renderPanel,diagnostics
  },{ replace:true,alias:'identityPreview' });
})();
