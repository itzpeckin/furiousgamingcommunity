/* FHQ_BUILD: 7.4.4.2 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '7.4.4.2';
  let state = null;
  let loading = null;
  let lastError = null;
  let patched = false;
  let localConfidence = null;

  const clone = value => JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const identity = () => {
    const snapshot = HQ?.auth?.getSnapshot?.() || {};
    return snapshot.authenticated && snapshot.user
      ? {id:String(snapshot.user.id),teamId:snapshot.membership?.teamId || null}
      : {id:'anonymous',teamId:null};
  };
  const endpoint = () => {
    const value = slug();
    if (!value) throw new Error('A server-resolved league is required.');
    return `/api/leagues/${encodeURIComponent(value)}/competition`;
  };

  async function request(action = null, payload = {}) {
    const response = await fetch(endpoint(), action ? {
      method:'POST', credentials:'same-origin', cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({action,...payload})
    } : {
      credentials:'same-origin', cache:'no-store', headers:{accept:'application/json'}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `League competition request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    state = data;
    lastError = null;
    patchGamesService();
    window.dispatchEvent(new CustomEvent('franchisehq:competition-updated', {detail:diagnostics()}));
    return data;
  }

  async function load(force = false) {
    if (state && !force) return state;
    if (loading) return loading;
    loading = request().catch(error => {
      lastError = error;
      if (Number(error?.status) !== 401 && Number(error?.status) !== 404) {
        console.warn('[League Competition]', error?.message || error);
      }
      throw error;
    }).finally(() => { loading = null; });
    return loading;
  }

  function currentEntry() {
    const userId = identity().id;
    const entry = state?.confidence?.entry;
    if (entry && String(entry.userId) === userId) return freeze(clone(entry));
    return freeze({userId,season:String(state?.context?.seasonYear || 2026),status:'draft',picks:{},submittedWeeks:{},updatedAt:null,submittedAt:null});
  }

  function config() {
    if (!state?.confidence) return localConfidence?.config?.() || freeze({season:'2026',status:'locked',openWeeks:[],entries:{}});
    const entry = currentEntry();
    return freeze({
      season:String(state.confidence.season),
      status:state.confidence.status,
      openWeeks:[...(state.confidence.openWeeks || [])],
      entries:{[entry.userId]:entry},
      entryCount:Number(state.confidence.entryCount || 0),
      weeks:clone(state.confidence.weeks || [])
    });
  }

  function weekForGame(gameId) {
    return state?.games?.find(game => String(game.id) === String(gameId))?.weekIndex ?? null;
  }

  function isWeekOpen(week, userId = identity().id) {
    if (!state) return localConfidence?.isWeekOpen?.(week,userId) || false;
    if (!state.features?.confidencePool || String(userId) !== identity().id) return false;
    const entry = currentEntry();
    return (state.confidence?.openWeeks || []).includes(Number(week))
      && !entry.submittedWeeks?.[String(week)];
  }

  function validateWeek(week, userId = identity().id) {
    if (!state) return localConfidence?.validateWeek?.(week,userId)
      || {week:Number(week),valid:false,issues:['Competition state is loading.'],totalGames:0,picked:0,submitted:false};
    const games = (state.games || []).filter(game => game.stage === 'regular' && Number(game.weekIndex) === Number(week));
    const entry = currentEntry();
    const issues = [];
    const values = [];
    for (const game of games) {
      const pick = entry.picks?.[game.id];
      if (!pick?.selectedTeamId) issues.push(`Missing winner for ${game.id}`);
      if (!Number.isInteger(Number(pick?.confidence))) issues.push(`Missing confidence for ${game.id}`);
      else values.push(Number(pick.confidence));
    }
    if (new Set(values).size !== values.length) issues.push(`Duplicate confidence values in Week ${week}`);
    const expected = new Set(games.map((_, index) => index + 1));
    if (values.length === games.length && values.some(value => !expected.has(value))) {
      issues.push(`Confidence values must use 1 through ${games.length}`);
    }
    return freeze({week:Number(week),valid:Boolean(games.length) && !issues.length,issues,
      totalGames:games.length,picked:games.filter(game => entry.picks?.[game.id]?.selectedTeamId).length,
      submitted:Boolean(entry.submittedWeeks?.[String(week)])});
  }

  function validateEntry(userId = identity().id) {
    if (!state) return localConfidence?.validateEntry?.(userId)
      || {valid:false,issues:['Competition state is loading.'],totalGames:0,picked:0};
    const weeks = [...new Set((state.games || []).filter(game => game.stage === 'regular').map(game => game.weekIndex))];
    const validations = weeks.map(week => validateWeek(week,userId));
    const entry = currentEntry();
    return freeze({valid:validations.length > 0 && validations.every(item => item.valid),
      issues:validations.flatMap(item => item.issues),
      totalGames:validations.reduce((sum,item) => sum + item.totalGames,0),
      picked:Object.values(entry.picks || {}).filter(pick => pick?.selectedTeamId).length});
  }

  async function mutate(action, payload = {}) {
    return request(action,payload);
  }

  async function saveSelection(gameId, selectedTeamId) {
    await mutate('save-confidence-pick',{gameId,selectedTeamId,field:'selection'});
    return {ok:true,entry:currentEntry()};
  }
  async function saveConfidence(gameId, confidenceValue) {
    await mutate('save-confidence-pick',{gameId,confidenceValue,field:'confidence'});
    return {ok:true,entry:currentEntry()};
  }
  async function savePick(gameId, selectedTeamId, confidenceValue) {
    await mutate('save-confidence-pick',{gameId,selectedTeamId,confidenceValue,field:'pick'});
    return {ok:true,entry:currentEntry()};
  }
  async function clearWeek(weekIndex) {
    await mutate('clear-confidence-week',{weekIndex});
    return {ok:true,entry:currentEntry()};
  }
  async function clearSeason() {
    await mutate('clear-confidence-season');
    return {ok:true,entry:currentEntry()};
  }
  async function submitWeek(weekIndex) {
    await mutate('submit-confidence-week',{weekIndex});
    return {ok:true,entry:currentEntry(),week:Number(weekIndex)};
  }
  async function setSubmissionWindow(startWeek,endWeek) {
    await mutate('open-confidence-window',{startWeek,endWeek});
    return config();
  }
  async function closeSubmissionWindow() {
    await mutate('set-confidence-status',{status:'locked'});
    return config();
  }
  async function setStatus(status) {
    if (status === 'open') throw new Error('Choose the first and last open weeks.');
    await mutate('set-confidence-status',{status});
    return config();
  }
  function leaderboard() {
    return freeze(clone(state?.confidence?.leaderboard || localConfidence?.leaderboard?.() || []));
  }
  function score(userId = identity().id) {
    const row = leaderboard().find(item => String(item.userId) === String(userId));
    return row || freeze({userId,totalPoints:0,correctPicks:0,weeks:[]});
  }

  async function autoAssign(week, userId = identity().id) {
    if (!state) return localConfidence?.autoAssign?.(week,userId) || {ok:false,error:'Competition state is loading.'};
    const service = HQ?.modules?.league?.games;
    const weekGames = service?.getWeek?.(week)?.games || [];
    const predictions = weekGames.map(game => {
      const prediction = localConfidence?.getMatchupPrediction?.(game.id);
      return {game,prediction,selectedTeamId:prediction?.predictedTeamId || game.homeId};
    });
    predictions.sort((a,b) => Number(a.prediction?.certainty || 0) - Number(b.prediction?.certainty || 0));
    for (let index=0; index<predictions.length; index += 1) {
      const item = predictions[index];
      await savePick(item.game.id,item.selectedTeamId,index+1);
    }
    return {ok:true,entry:currentEntry()};
  }

  function patchGamesService() {
    const games = HQ?.modules?.league?.games || HQ?.leagueGames;
    if (!games?.confidence) return false;
    if (!patched) localConfidence = {...games.confidence};
    Object.assign(games.confidence,{
      config,isWeekOpen,getEntry:currentEntry,saveSelection,saveConfidence,savePick,
      clearWeek,clearSeason,autoAssign,validateWeek,validateEntry,submitWeek,
      setSubmissionWindow,closeSubmissionWindow,setStatus,score,leaderboard
    });
    patched = true;
    return true;
  }

  function officialGameId(week, stage = 'regular') {
    if (!state) return null;
    return state.gotw?.[`${String(stage || 'regular').toLowerCase()}:${Number(week)}`] || null;
  }
  async function saveOfficial(week, gameId, stage = 'regular') {
    const game = state?.games?.find(item => String(item.id) === String(gameId)
      && Number(item.weekIndex) === Number(week)
      && String(item.stage) === String(stage));
    if (!game) return {ok:false,error:'The selected matchup is not available for this week.'};
    try {
      await mutate('set-gotw',{gameId});
      window.dispatchEvent(new CustomEvent('franchisehq:gotw-changed', {detail:{week:Number(week),gameId:String(gameId)}}));
      return {ok:true,gameId:String(gameId)};
    } catch (error) {
      return {ok:false,error:error?.message || String(error)};
    }
  }

  function diagnostics() {
    return freeze({service:'competition',version:VERSION,loaded:Boolean(state),loading:Boolean(loading),
      serverBacked:true,leagueSlug:slug(),seasonYear:state?.context?.seasonYear || null,
      snapshotId:state?.context?.snapshotId || null,gameCount:state?.games?.length || 0,
      confidenceEntryCount:state?.confidence?.entryCount || 0,lastError:lastError?.message || null});
  }

  const service = {load,refresh:() => load(true),getState:() => state ? freeze(clone(state)) : null,
    gotw:{getOfficialGameId:officialGameId,saveOfficial},confidence:{config,isWeekOpen,getEntry:currentEntry,
      saveSelection,saveConfidence,savePick,clearWeek,clearSeason,autoAssign,validateWeek,validateEntry,
      submitWeek,setSubmissionWindow,closeSubmissionWindow,setStatus,score,leaderboard},diagnostics};
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before competition.js.');
  HQ.defineModuleService('league','competition',service,{replace:true,alias:'competition'});

  patchGamesService();
  window.addEventListener('franchisehq:auth-changed',event => {
    state = null;
    if (event.detail?.status === 'ready') load(true).catch(() => {});
  });
  window.addEventListener('franchisehq:live-snapshot-booted',() => load(true).catch(() => {}));
  setTimeout(() => load().catch(() => {}),0);
})();
