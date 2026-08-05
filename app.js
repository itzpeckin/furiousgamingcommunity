(() => {
  'use strict';

  const pageContent = document.querySelector('[data-page-content]');
  const mainContent = document.getElementById('main-content');
  const sidebar = document.querySelector('[data-sidebar]');
  const mobileOverlay = document.querySelector('[data-mobile-overlay]');
  const profileButton = document.querySelector('[data-profile-button]');
  const profileMenu = document.querySelector('[data-profile-menu]');
  const commandModal = document.querySelector('[data-command-modal]');
  const commandInput = document.querySelector('[data-command-input]');
  const commandResults = document.querySelector('[data-command-results]');
  const stylePanel = document.querySelector('[data-style-panel]');
  const panelOverlay = document.querySelector('[data-panel-overlay]');
  const detailModal = document.querySelector('[data-detail-modal]');
  const detailContent = document.querySelector('[data-detail-content]');
  const toastRegion = document.querySelector('[data-toast-region]');
  const body = document.body;

  const accents = {
    blue: { hex: '#4f8cff', rgb: '79, 140, 255', label: 'Electric blue' },
    red: { hex: '#ff5b5f', rgb: '255, 91, 95', label: 'League red' },
    green: { hex: '#32d583', rgb: '50, 213, 131', label: 'Field green' },
    purple: { hex: '#9b7cff', rgb: '155, 124, 255', label: 'Prime purple' }
  };

  const state = {
    role: window.FranchiseHQ?.simulation?.getRole?.() || window.FranchiseHQ?.store?.getString?.('m1b-role', 'commissioner') || 'commissioner',
    accent: window.FranchiseHQ?.store?.getString?.('m1b-accent', 'blue') || 'blue',
    density: window.FranchiseHQ?.store?.getString?.('m1b-density', 'comfortable') || 'comfortable',
    teamSearch: '',
    teamConference: 'All',
    teamDivision: 'All',
    playerSearch: '',
    playerPosition: 'All',
    playerTeam: 'All',
    playerStatus: 'All',
    playerDev: 'All',
    playerMinOvr: 60,
    playerMaxOvr: 99,
    playerMinAge: 20,
    playerMaxAge: 45,
    playerSort: 'overall-desc',
    standingsView: 'division',
    confidenceStandingsView: 'season',
    confidenceStandingsWeek: 1,
    statsCategory: 'passing',
    statsScope: 'season',
    statsWeek: 1,
    statsTeam: 'All',
    statsMinimumGames: 0,
    statsSortKey: null,
    statsSortDirection: 'desc',
    statsTeamCategory: 'scoringOffense',
    scheduleWeek: 8,
    scheduleTeam: 'All',
    scheduleSection: 'schedule',
    confidenceWeek: 1,
    newsCategory: 'All',
    teamTab: 'roster',
    rosterGroup: 'All',
    rosterPosition: 'All',
    rosterDev: 'All',
    depthSelectedPlayer: null,
    teamSchedulePhase: 'regular',
    activityFilter: 'all',
    featuredGameId: null,
    homeLeaderMetrics: {
      passing: 'passingYards',
      rushing: 'rushingYards',
      receiving: 'receptions',
      defense: 'tackles'
    },
    gameCenterTab: 'team',
    recapFormat: 'landscape',
    recapStyle: 'broadcast'
  };

  const rawTeams = [
    ['BUF','Buffalo','Bills','AFC','East','#1565c0','#d50000'], ['MIA','Miami','Dolphins','AFC','East','#008e97','#fc4c02'],
    ['NE','New England','Patriots','AFC','East','#002244','#c60c30'], ['NYJ','New York','Jets','AFC','East','#125740','#ffffff'],
    ['BAL','Baltimore','Ravens','AFC','North','#241773','#000000'], ['CIN','Cincinnati','Bengals','AFC','North','#fb4f14','#000000'],
    ['CLE','Cleveland','Browns','AFC','North','#311d00','#ff3c00'], ['PIT','Pittsburgh','Steelers','AFC','North','#ffb612','#101820'],
    ['HOU','Houston','Texans','AFC','South','#03202f','#a71930'], ['IND','Indianapolis','Colts','AFC','South','#002c5f','#a2aaad'],
    ['JAX','Jacksonville','Jaguars','AFC','South','#006778','#d7a22a'], ['TEN','Tennessee','Titans','AFC','South','#0c2340','#4b92db'],
    ['DEN','Denver','Broncos','AFC','West','#fb4f14','#002244'], ['KC','Kansas City','Chiefs','AFC','West','#e31837','#ffb81c'],
    ['LV','Las Vegas','Raiders','AFC','West','#000000','#a5acaf'], ['LAC','Los Angeles','Chargers','AFC','West','#0080c6','#ffc20e'],
    ['DAL','Dallas','Cowboys','NFC','East','#003594','#869397'], ['NYG','New York','Giants','NFC','East','#0b2265','#a71930'],
    ['PHI','Philadelphia','Eagles','NFC','East','#004c54','#a5acaf'], ['WAS','Washington','Commanders','NFC','East','#5a1414','#ffb612'],
    ['CHI','Chicago','Bears','NFC','North','#0b162a','#c83803'], ['DET','Detroit','Lions','NFC','North','#0076b6','#b0b7bc'],
    ['GB','Green Bay','Packers','NFC','North','#203731','#ffb612'], ['MIN','Minnesota','Vikings','NFC','North','#4f2683','#ffc62f'],
    ['ATL','Atlanta','Falcons','NFC','South','#a71930','#000000'], ['CAR','Carolina','Panthers','NFC','South','#0085ca','#101820'],
    ['NO','New Orleans','Saints','NFC','South','#d3bc8d','#101820'], ['TB','Tampa Bay','Buccaneers','NFC','South','#d50a0a','#34302b'],
    ['ARI','Arizona','Cardinals','NFC','West','#97233f','#000000'], ['LAR','Los Angeles','Rams','NFC','West','#003594','#ffa300'],
    ['SF','San Francisco','49ers','NFC','West','#aa0000','#b3995d'], ['SEA','Seattle','Seahawks','NFC','West','#002244','#69be28']
  ];

  const owners = ["Strike", "Benny", "Blevins", "Devo", "Yankee", "Dr Malice", "Saluki", "Term", "Carter B", "Domino", "TP", "Antwan", "Broncos", "Turbo", "Casp", "Eddie", "Joey", "Nola", "L1nkin", "Cokills", "Big Red", "Chop", "Gas", "Potato", "Kobe", "Burning Pulse", "Ry", "Peckin", "Big June", "Kpmr", "Mcghee", "Wayneo"];
  const records = [[6,1],[4,3],[3,4],[2,5],[6,1],[4,3],[3,4],[5,2],[5,2],[3,4],[4,3],[2,5],[4,3],[7,0],[3,4],[5,2],[6,1],[3,4],[5,2],[2,5],[3,4],[6,1],[5,2],[4,3],[4,3],[2,5],[3,4],[5,2],[2,5],[4,3],[6,1],[3,4]];

  const teams = rawTeams.map((item, index) => {
    const [abbr, city, name, conference, division, primary, secondary] = item;
    const [wins, losses] = records[index];
    const ovr = seededNumber(`${abbr}-ovr`, 78, 91);
    const off = clamp(ovr + seededNumber(`${abbr}-off`, -4, 4), 75, 94);
    const def = clamp(ovr + seededNumber(`${abbr}-def`, -4, 4), 75, 94);
    const pf = wins * seededNumber(`${abbr}-pfw`, 25, 32) + losses * seededNumber(`${abbr}-pfl`, 17, 24);
    const pa = losses * seededNumber(`${abbr}-paw`, 27, 34) + wins * seededNumber(`${abbr}-pal`, 14, 23);
    return {
      id: abbr.toLowerCase(), abbr, city, name, fullName: `${city} ${name}`, conference, division, primary, secondary,
      owner: owners[index], wins, losses, ties: 0, record: `${wins}-${losses}`, ovr, off, def, pf, pa,
      streak: wins >= 5 ? `W${seededNumber(abbr,2,5)}` : losses >= 5 ? `L${seededNumber(abbr,1,3)}` : seededNumber(abbr,0,1) ? 'W2' : 'L1',
      cap: seededNumber(`${abbr}-cap`, 4, 48) + seededNumber(`${abbr}-capdec`,0,9)/10,
      rank: index + 1,
      divisionRank: 0,
      stadium: `${name} Stadium`,
      coach: `${firstNames()[index % firstNames().length]} ${lastNames()[(index * 3 + 7) % lastNames().length]}`
    };
  });

  [...new Set(teams.map(t => `${t.conference}-${t.division}`))].forEach(key => {
    teams.filter(t => `${t.conference}-${t.division}` === key).sort(sortStandings).forEach((team, index) => { team.divisionRank = index + 1; });
  });

  const positionBlueprint = [
    ['QB',2],['RB',3],['FB',1],['WR',5],['TE',3],['LT',2],['LG',2],['C',2],['RG',2],['RT',2],
    ['LE',2],['RE',2],['DT',3],['LOLB',2],['MLB',3],['ROLB',2],['CB',5],['FS',2],['SS',2],['K',1],['P',1]
  ];
  const offensePositions = ['QB','RB','FB','WR','TE','LT','LG','C','RG','RT'];
  const defensePositions = ['LE','RE','DT','LOLB','MLB','ROLB','CB','FS','SS'];
  const specialPositions = ['K','P'];
  const colleges = ['Oklahoma','Ohio State','Alabama','Georgia','Texas','LSU','Michigan','Oregon','Clemson','Penn State','Florida State','USC','Notre Dame','Tennessee','Washington','Miami'];

  const players = [];
  teams.forEach((team, teamIndex) => {
    let rosterIndex = 0;
    positionBlueprint.forEach(([position, count]) => {
      for (let depth = 1; depth <= count; depth += 1) {
        const first = firstNames()[(teamIndex * 5 + rosterIndex * 3 + depth) % firstNames().length];
        const last = lastNames()[(teamIndex * 7 + rosterIndex * 5 + depth * 2) % lastNames().length];
        const positionalBase = position === 'QB' && depth === 1 ? 84 : depth === 1 ? 80 : depth === 2 ? 74 : 69;
        const overall = clamp(positionalBase + seededNumber(`${team.abbr}-${position}-${depth}`, -4, 12), 62, 99);
        const ageBase = depth === 1 ? 25 : depth === 2 ? 24 : 23;
        const age = clamp(ageBase + seededNumber(`${team.abbr}-${position}-${depth}-age`, -2, 8), 21, 36);
        const dev = overall >= 94 ? 'X-Factor' : overall >= 89 ? 'Superstar' : overall >= 83 ? 'Star' : 'Normal';
        const years = clamp(seededNumber(`${team.abbr}-${position}-${depth}-years`, 1, 5), 1, 5);
        const salary = Math.max(0.8, Math.round(((overall - 60) * .72 + seededNumber(`${team.abbr}-${position}-salary`, 0, 8)) * 10) / 10);
        const name = `${first} ${last}`;
        const player = {
          id: `${team.id}-${position.toLowerCase()}-${depth}`,
          name, first, last, initials: `${first[0]}${last[0]}`, teamId: team.id, teamAbbr: team.abbr, teamName: team.fullName,
          position, depth, overall, age, dev, years, salary, capHit: Math.round((salary * .86) * 10) / 10,
          number: playerNumber(position, teamIndex, depth), college: colleges[(teamIndex + rosterIndex + depth) % colleges.length],
          height: playerHeight(position, teamIndex, depth), weight: playerWeight(position, teamIndex, depth),
          tradeBlock: seededNumber(`${team.abbr}-${position}-${depth}-block`,0,9) === 0,
          injury: seededNumber(`${team.abbr}-${position}-${depth}-inj`,0,24) === 0 ? 'Questionable' : 'Healthy'
        };
        player.ratings = createRatings(player);
        player.stats = createPlayerStats(player);
        players.push(player);
        rosterIndex += 1;
      }
    });
  });

  const schedule = buildSchedule();
  const newsArticles = buildNews();
  const pageNames = {
    home: 'League Home', 'league-activity': 'League Activity', teams: 'Teams', players: 'Players', standings: 'Standings', stats: 'Stats & Leaders',
    schedule: 'Schedule', news: 'League News', 'trade-center': 'Trade Center', 'trade-block': 'Trade Block',
    commissioner: 'Commissioner HQ', 'design-system': 'Design System'
  };

  function firstNames() {
    return ['Jalen','Marcus','Devin','Trevor','Cameron','Malik','Jordan','Darius','Xavier','Caleb','Tyler','Brandon','Jayden','Andre','Micah','Justin','Trey','Aiden','Chris','Evan','Noah','Isaiah','Elijah','Bryce','Derrick','Keenan','Rome','Zay','Rashawn','Cole','Mason','Logan','Nico','Jared','Quinn','Kyler','Tanner','Emmett','Dante','Kobe','DeShawn','Amari','Sterling','Jaxon','Cam','Lamar','Troy','Reed'];
  }

  function lastNames() {
    return ['Carter','Mitchell','Brooks','Harris','Johnson','Williams','Anderson','Thomas','Robinson','Lewis','Walker','Young','Hill','Moore','Brown','Taylor','Wilson','Davis','Clark','Allen','King','Wright','Turner','Campbell','Parker','Collins','Reed','Bennett','Foster','Ward','Jenkins','Price','Morris','Cook','Bailey','Cooper','Richardson','Bell','Murphy','Howard','Evans','Stewart','Miller','Adams','Jackson','Thompson','Nelson','James'];
  }

  function seededNumber(seed, min, max) {
    let hash = 2166136261;
    for (let i = 0; i < String(seed).length; i += 1) {
      hash ^= String(seed).charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return min + (Math.abs(hash) % (max - min + 1));
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function sortStandings(a, b) { return b.wins - a.wins || a.losses - b.losses || (b.pf - b.pa) - (a.pf - a.pa); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch])); }
  function teamById(id) { return teams.find(team => team.id === id || team.abbr.toLowerCase() === String(id).toLowerCase()); }
  function playerById(id) { return players.find(player => player.id === id); }
  function teamStyle(team) { return `--team:${team.primary};--team2:${team.secondary}`; }
  function formatMoney(value) { return `$${Number(value).toFixed(1)}M`; }
  function percent(value) { return `${Number(value).toFixed(1)}%`; }
  function routeBase(route) { return route.split('/')[0] || 'home'; }

  const GOTW_STORAGE_KEY = 'franchisehq:home.gotw.v1';
  function readGotwSelections() {
    try { return JSON.parse(localStorage.getItem(GOTW_STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function currentHomeWeek() {
    return schedule.find(week => Number(week.week) === Number(state.scheduleWeek || 8)) || schedule.find(week => Number(week.week) === 8) || schedule[0];
  }
  function officialGotwId(weekNumber = currentHomeWeek()?.week) {
    const selections = readGotwSelections();
    return selections[String(weekNumber)] || null;
  }
  function saveOfficialGotw(weekNumber, gameId) {
    const week = schedule.find(item => Number(item.week) === Number(weekNumber));
    if (!week || !week.games.some(game => String(game.id) === String(gameId))) return { ok:false, error:'The selected matchup is not available for this week.' };
    const selections = readGotwSelections();
    selections[String(weekNumber)] = String(gameId);
    localStorage.setItem(GOTW_STORAGE_KEY, JSON.stringify(selections));
    window.dispatchEvent(new CustomEvent('franchisehq:gotw-changed', { detail:{ week:Number(weekNumber), gameId:String(gameId) } }));
    return { ok:true, gameId:String(gameId) };
  }
  function allTimeTeamProfile(team) {
    const games = seededNumber(`${team.abbr}-all-time-games`, 210, 430);
    const wins = seededNumber(`${team.abbr}-all-time-wins`, Math.floor(games * .38), Math.floor(games * .67));
    const titles = seededNumber(`${team.abbr}-sb-titles`, 0, 6);
    return { games, wins, winPct: games ? wins / games : 0, superBowlTitles: titles };
  }
  function gotwWeekModel(weekNumber = currentHomeWeek()?.week) {
    const week = schedule.find(item => Number(item.week) === Number(weekNumber)) || currentHomeWeek();
    return {
      week: Number(week?.week || weekNumber || 1),
      officialGameId: officialGotwId(week?.week),
      games: (week?.games || []).map(game => {
        const away = teamById(game.awayId), home = teamById(game.homeId);
        const mapTeam = team => ({
          id:team.id, abbr:team.abbr, fullName:team.fullName, owner:team.owner, record:team.record,
          seasonWinPct:(Number(team.wins)||0) / Math.max(1,(Number(team.wins)||0)+(Number(team.losses)||0)+(Number(team.ties)||0)),
          ...allTimeTeamProfile(team)
        });
        return { ...game, away:mapTeam(away), home:mapTeam(home) };
      })
    };
  }

  function playerNumber(position, teamIndex, depth) {
    const ranges = { QB:[1,19], RB:[20,39], FB:[30,49], WR:[1,19], TE:[80,89], LT:[60,79], LG:[60,79], C:[50,69], RG:[60,79], RT:[60,79], LE:[90,99], RE:[90,99], DT:[90,99], LOLB:[40,59], MLB:[40,59], ROLB:[40,59], CB:[20,39], FS:[20,39], SS:[20,39], K:[1,19], P:[1,19] };
    const [min,max] = ranges[position] || [1,99];
    return min + ((teamIndex * 3 + depth * 7) % (max - min + 1));
  }

  function playerHeight(position, teamIndex, depth) {
    const base = ['LT','LG','C','RG','RT','DT'].includes(position) ? 76 : ['WR','CB','FS','SS'].includes(position) ? 72 : 73;
    const inches = base + seededNumber(`${position}-${teamIndex}-${depth}-h`, -2, 3);
    return `${Math.floor(inches / 12)}'${inches % 12}\"`;
  }

  function playerWeight(position, teamIndex, depth) {
    const bases = { QB:222,RB:212,FB:242,WR:198,TE:248,LT:315,LG:310,C:305,RG:310,RT:318,LE:270,RE:266,DT:310,LOLB:245,MLB:242,ROLB:244,CB:194,FS:202,SS:210,K:198,P:205 };
    return (bases[position] || 220) + seededNumber(`${position}-${teamIndex}-${depth}-w`, -12, 14);
  }

  function createRatings(player) {
    const common = {
      Speed: clamp(player.overall + seededNumber(`${player.id}-spd`,-8,8),55,99),
      Acceleration: clamp(player.overall + seededNumber(`${player.id}-acc`,-7,8),55,99),
      Awareness: clamp(player.overall + seededNumber(`${player.id}-awr`,-10,7),50,99),
      Strength: clamp(player.overall + seededNumber(`${player.id}-str`,-12,10),45,99),
      Agility: clamp(player.overall + seededNumber(`${player.id}-agi`,-9,9),48,99)
    };
    const specific = offensePositions.includes(player.position)
      ? { 'Ball Carrier Vision': clamp(player.overall + seededNumber(`${player.id}-bcv`,-9,8),45,99), 'Catch / Block': clamp(player.overall + seededNumber(`${player.id}-skill`,-7,8),45,99) }
      : defensePositions.includes(player.position)
        ? { Tackling: clamp(player.overall + seededNumber(`${player.id}-tak`,-8,9),45,99), Coverage: clamp(player.overall + seededNumber(`${player.id}-cov`,-10,9),40,99) }
        : { KickPower: clamp(player.overall + seededNumber(`${player.id}-kp`,-4,8),65,99), Accuracy: clamp(player.overall + seededNumber(`${player.id}-ka`,-6,7),60,99) };
    if (player.position === 'QB') specific['Throw Power'] = clamp(player.overall + seededNumber(`${player.id}-tp`,-4,8),70,99);
    if (['WR','TE','RB'].includes(player.position)) specific.Catching = clamp(player.overall + seededNumber(`${player.id}-cth`,-4,8),60,99);
    if (['CB','FS','SS'].includes(player.position)) specific['Man Coverage'] = clamp(player.overall + seededNumber(`${player.id}-man`,-5,8),55,99);
    return { ...common, ...specific };
  }

  function createPlayerStats(player) {
    const games = 7;
    const s = seed => seededNumber(`${player.id}-${seed}`,0,9999);
    if (player.position === 'QB') {
      const attempts = 170 + (s('att') % 115); const completions = Math.round(attempts * (.57 + (s('pct') % 120)/1000));
      return { games, passingYards: 1250 + (s('py') % 1350), passingTD: 8 + (s('ptd') % 18), interceptions: 2 + (s('int') % 10), attempts, completions, compPct: completions/attempts*100, rushingYards: s('qry') % 420, rushingTD: s('qrtd') % 6, fumbles: s('qfum') % 5, fantasy: 105 + (s('fp') % 900)/10 };
    }
    if (['RB','FB'].includes(player.position)) {
      return { games, carries: 45 + (s('car') % 115), rushingYards: 220 + (s('ry') % 770), rushingTD: 1 + (s('rtd') % 10), receptions: 8 + (s('rec') % 35), receivingYards: 55 + (s('rey') % 360), receivingTD: s('retd') % 5, fumbles: s('fum') % 5, fantasy: 55 + (s('fp') % 950)/10 };
    }
    if (['WR','TE'].includes(player.position)) {
      return { games, receptions: 14 + (s('rec') % 55), targets: 25 + (s('tgt') % 70), receivingYards: 180 + (s('rey') % 850), receivingTD: 1 + (s('retd') % 9), yardsPerCatch: 9 + (s('ypc') % 95)/10, fantasy: 45 + (s('fp') % 970)/10 };
    }
    if (defensePositions.includes(player.position)) {
      return { games, tackles: 16 + (s('tak') % 60), sacks: (s('sck') % 95)/10, interceptions: s('di') % 6, forcedFumbles: s('ff') % 4, passDeflections: 1 + (s('pd') % 11), defensiveTD: s('dtd') % 3, fantasy: 28 + (s('fp') % 760)/10 };
    }
    if (player.position === 'K') {
      const fga = 9 + (s('fga') % 14); const fgm = Math.max(0, fga - (s('miss') % 4));
      return { games, fgm, fga, fgPct: fgm/fga*100, long: 43 + (s('long') % 18), points: fgm*3 + 16 + (s('xp') % 14), fantasy: fgm*3 + (s('fp') % 120)/10 };
    }
    return { games, punts: 22 + (s('punts') % 18), average: 42 + (s('avg') % 80)/10, inside20: 5 + (s('i20') % 14), long: 52 + (s('long') % 18), fantasy: 0 };
  }

  function buildSchedule() {
    const weeks = [];
    const rotation = [...teams];
    for (let week = 1; week <= 9; week += 1) {
      const games = [];
      for (let i = 0; i < rotation.length / 2; i += 1) {
        const first = rotation[i];
        const second = rotation[rotation.length - 1 - i];
        const home = (week + i) % 2 === 0 ? first : second;
        const away = home === first ? second : first;
        let status = week < 8 ? 'final' : week === 8 && i < 5 ? 'final' : week === 8 && i === 5 ? 'live' : 'scheduled';
        const awayScore = status === 'scheduled' ? null : seededNumber(`${week}-${away.abbr}-${home.abbr}-a`, 13, 38);
        const homeScore = status === 'scheduled' ? null : seededNumber(`${week}-${away.abbr}-${home.abbr}-h`, 14, 41);
        games.push({
          id: `w${week}-${away.id}-${home.id}`, week, awayId: away.id, homeId: home.id, awayScore, homeScore, status,
          day: week === 8 && i === 0 ? 'THU' : i === 15 ? 'MON' : 'SUN',
          time: week === 8 && i === 5 ? 'Q3 · 4:12' : i === 15 ? '8:15 PM' : i % 5 === 0 ? '4:25 PM' : '1:00 PM',
          network: i === 0 ? 'PRIME' : i === 15 ? 'MNF' : i % 5 === 0 ? 'FOX' : 'CBS',
          stadium: home.stadium,
          headline: `${away.city} travels to ${home.city} for a Week ${week} matchup.`
        });
      }
      weeks.push({ week, games });
      const fixed = rotation[0];
      const rest = rotation.slice(1);
      rest.unshift(rest.pop());
      rotation.splice(0, rotation.length, fixed, ...rest);
    }
    return weeks;
  }

  function buildNews() {
    return [
      { id:'power-rankings-8', category:'Power Rankings', mark:'01', title:'Week 8 Power Rankings: Chiefs hold the top spot as Cowboys surge', excerpt:'Kansas City remains unbeaten, but Dallas and Baltimore are closing the gap as the playoff race starts to take shape.', author:'League Media', time:'18 minutes ago', read:'5 min read', featured:true },
      { id:'trade-approved-miami', category:'Trades', mark:'TR', title:'Miami and Las Vegas complete the season’s biggest defensive trade', excerpt:'The Dolphins add a veteran corner while Las Vegas secures a young starter and a future selection.', author:'Transaction Desk', time:'42 minutes ago', read:'3 min read' },
      { id:'week-eight-advance', category:'Commissioner', mark:'FGC', title:'Commissioner confirms Thursday night Week 8 advance', excerpt:'All remaining games must be completed and submitted before the scheduled advance window.', author:'Justin · Commissioner', time:'2 hours ago', read:'2 min read' },
      { id:'ravens-bengals-recap', category:'Game Recap', mark:'31', title:'Baltimore survives late Cincinnati rally in 31–24 division win', excerpt:'A fourth-quarter interception sealed the result after Cincinnati cut a 17-point lead to one possession.', author:'GameWire', time:'4 hours ago', read:'4 min read' },
      { id:'players-of-week', category:'Awards', mark:'MVP', title:'Players of the Week announced after a record-setting slate', excerpt:'A 412-yard quarterback performance and a four-sack defensive effort headline this week’s winners.', author:'League Media', time:'Yesterday', read:'3 min read' },
      { id:'trade-block-watch', category:'Trade Block', mark:'TB', title:'Five names to monitor before the committee deadline', excerpt:'Several contending teams have added veterans to the block as owners look to reshape their rosters.', author:'Transaction Desk', time:'Yesterday', read:'6 min read' },
      { id:'playoff-picture', category:'Analysis', mark:'7', title:'Playoff picture: three division races separated by one game', excerpt:'The NFC East, AFC South, and NFC West remain wide open entering the second half of the season.', author:'League Media', time:'2 days ago', read:'5 min read' }
    ];
  }

  function renderTeamMark(team, className = 'mini-team') {
    return `<span class="${className}" style="${teamStyle(team)}">${team.abbr}</span>`;
  }

  function renderPlayerIdentity(player, includeTeam = true) {
    const team = teamById(player.teamId);
    return `<div class="table-player"><span class="player-avatar" style="${teamStyle(team)}">${player.initials}</span><div><strong>${escapeHtml(player.name)}</strong><small>${includeTeam ? `${player.position} · ${team.abbr}` : `${player.position} · #${player.number}`}</small></div></div>`;
  }

  function devClass(dev) {
    return `dev-badge--${dev.toLowerCase().replace(/[^a-z]/g,'')}`;
  }

  function depthDevelopmentClass(dev) {
    const value=String(dev || 'Normal').toLowerCase().replace(/[^a-z]/g,'');
    if (value.includes('xfactor')) return 'formation-dev--xfactor';
    if (value.includes('superstar')) return 'formation-dev--superstar';
    if (value === 'star') return 'formation-dev--star';
    return 'formation-dev--normal';
  }


  function gameForTeamWeek(teamId, weekNumber) {
    return schedule.find(w=>w.week===weekNumber)?.games.find(g=>g.homeId===teamId||g.awayId===teamId) || null;
  }

  function opponentForGame(game, teamId) {
    if (!game) return null;
    return teamById(game.homeId===teamId ? game.awayId : game.homeId);
  }

  function previousGameCopy(teamId, weekNumber) {
    const game=gameForTeamWeek(teamId, Math.max(1,weekNumber-1));
    if (!game) return 'No previous result';
    const opponent=opponentForGame(game,teamId);
    if (game.status!=='final') return `vs ${opponent.abbr} · Scheduled`;
    const teamScore=game.homeId===teamId?game.homeScore:game.awayScore;
    const oppScore=game.homeId===teamId?game.awayScore:game.homeScore;
    return `${teamScore>oppScore?'W':'L'} ${teamScore}-${oppScore} vs ${opponent.abbr}`;
  }

  function topUnitPlayers(teamId, unit) {
    const positions=unit==='offense'?offensePositions:defensePositions;
    return players.filter(p=>p.teamId===teamId&&positions.includes(p.position))
      .sort((a,b)=>b.overall-a.overall||a.name.localeCompare(b.name)).slice(0,3);
  }

  function renderFeaturedPlayerRow(player) {
    return `<button type="button" class="featured-player-row" data-player-id="${player.id}">
      <span><strong>${escapeHtml(player.name)}</strong><small>${player.position}</small></span>
      <span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span>
      <span class="dev-badge ${devClass(player.dev)}">${player.dev}</span>
    </button>`;
  }

  function playoffHuntRows(conference) {
    const conferenceTeams=teams.filter(team=>team.conference===conference);
    const divisions=[...new Set(conferenceTeams.map(team=>team.division))];
    const divisionLeaders=divisions
      .map(division=>conferenceTeams.filter(team=>team.division===division).sort(sortStandings)[0])
      .filter(Boolean)
      .sort(sortStandings);
    const leaderIds=new Set(divisionLeaders.map(team=>team.id));
    const remaining=conferenceTeams.filter(team=>!leaderIds.has(team.id)).sort(sortStandings);
    const wildCards=remaining.slice(0,3);
    const inHunt=remaining.slice(3,6);
    const rows=[
      ...divisionLeaders.map(team=>({team,type:'Division leader'})),
      ...wildCards.map(team=>({team,type:'Wild card'})),
      ...inHunt.map(team=>({team,type:'In the hunt'}))
    ];
    const conferenceLeader=[...conferenceTeams].sort(sortStandings)[0];
    return rows.slice(0,10).map((row,index)=>{
      const team=row.team;
      const gamesPlayed=(Number(team.wins)||0)+(Number(team.losses)||0)+(Number(team.ties)||0);
      const winPct=gamesPlayed?((Number(team.wins)||0)+((Number(team.ties)||0)*0.5))/gamesPlayed:0;
      const gamesBehind=conferenceLeader
        ? (((Number(conferenceLeader.wins)||0)-(Number(team.wins)||0))+((Number(team.losses)||0)-(Number(conferenceLeader.losses)||0)))/2
        : 0;
      return {...row,seed:index+1,winPct,gamesBehind:Math.max(0,gamesBehind)};
    });
  }

  function renderConferenceSnapshot(conference) {
    const ranked=playoffHuntRows(conference);
    return `<article class="card home-standings-card">
      <div class="card-header"><div><span class="eyebrow">Playoff picture</span><h3>${conference} Standings</h3></div><button class="text-button" data-route="standings">View all <svg><use href="#icon-arrow"></use></svg></button></div>
      <div class="home-standings-columns" aria-hidden="true"><span></span><span>Team</span><span>W-L</span><span>PCT</span><span>GB</span></div>
      <div class="home-standings-list">
        ${ranked.map(({team,type,seed,winPct,gamesBehind})=>`<button type="button" data-team-id="${team.id}" data-route="teams/${team.id}" class="${seed===8?'wildcard-cutline':''}">
          <span class="seed">${seed}</span>${renderTeamMark(team)}
          <span class="home-standings-team"><strong>${team.fullName}</strong><small>${type}</small></span>
          <strong class="home-standings-record">${team.record}${team.ties?`-${team.ties}`:''}</strong>
          <span class="home-standings-pct">${winPct.toFixed(3).replace(/^0/,'')}</span>
          <span class="home-standings-gb">${gamesBehind===0?'—':Number.isInteger(gamesBehind)?gamesBehind:gamesBehind.toFixed(1)}</span>
        </button>`).join('')}
      </div>
    </article>`;
  }

  function leaderMetricConfig(category) {
    const metric=state.homeLeaderMetrics[category];
    const configs={
      passing:{
        positions:['QB'],
        tabs:[['passingYards','Yards'],['passingTD','TDs'],['interceptions','INTs']]
      },
      rushing:{
        positions:['RB','FB','QB'],
        tabs:[['rushingYards','Yards'],['rushingTD','TDs'],['fumbles','Fumbles']]
      },
      receiving:{
        positions:['WR','TE','RB','FB'],
        tabs:[['receptions','Receptions'],['receivingYards','Yards'],['receivingTD','TDs']]
      },
      defense:{
        positions:defensePositions,
        tabs:[['tackles','Tackles'],['sacks','Sacks'],['interceptions','INTs']]
      }
    };
    return {...configs[category],metric};
  }

  function renderHomeLeaderCard(category,title) {
    const cfg=leaderMetricConfig(category);
    const eligible=players.filter(p=>cfg.positions.includes(p.position)&&p.stats[cfg.metric]!==undefined)
      .sort((a,b)=>Number(b.stats[cfg.metric]||0)-Number(a.stats[cfg.metric]||0)||a.name.localeCompare(b.name)).slice(0,10);
    return `<article class="card home-leader-card home-leader-card--${category}">
      <div class="card-header home-leader-card__header">
        <div><h3>${title}</h3></div>
        <div class="mini-toggle" role="group" aria-label="${title} leaderboard statistic">
          ${cfg.tabs.map(([key,label])=>`<button type="button" data-home-leader-category="${category}" data-home-leader-metric="${key}" class="${cfg.metric===key?'is-active':''}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="home-leader-columns"><span>#</span><span>Player</span><span>${escapeHtml(cfg.tabs.find(([key])=>key===cfg.metric)?.[1]||'Value')}</span></div>
      <div class="home-leader-list">${eligible.map((player,index)=>`<button type="button" data-player-id="${player.id}">
        <span class="leader-rank">${index+1}</span>
        <span class="home-leader-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(teamById(player.teamId)?.abbr||'FA')}</small></span>
        <strong class="home-leader-value">${formatStatValue(cfg.metric,player.stats[cfg.metric])}</strong>
      </button>`).join('')||`<div class="home-leader-empty">No statistics available.</div>`}</div>
    </article>`;
  }

  function renderLeagueNewsTicker() {
    const approvedNews = window.FGC_TRADE?.getApprovedNews?.() || [];
    const items = [...approvedNews, ...newsArticles]
      .filter(item => item && item.id && item.title)
      .slice(0, 12);
    if (!items.length) return '';
    const tickerItems = items.map((item,index)=>{
      const summary = item.excerpt || item.summary || item.story || item.detail || 'Open the full story for the latest league update.';
      return `<button type="button" class="league-news-ticker__item" data-news-id="${escapeHtml(item.id)}" aria-label="Open headline: ${escapeHtml(item.title)}">
        <span class="league-news-ticker__category">${escapeHtml(item.category || 'League News')}</span>
        <span class="league-news-ticker__copy">
          <span class="league-news-ticker__headline">${escapeHtml(item.title)}</span>
          <span class="league-news-ticker__summary">${escapeHtml(summary)}</span>
        </span>
        <span class="league-news-ticker__separator" aria-hidden="true">•</span>
      </button>`;
    }).join('');
    return `<section class="league-news-ticker" aria-label="League headlines">
      <div class="league-news-ticker__label"><svg><use href="#icon-news"></use></svg><span>League Headlines</span></div>
      <div class="league-news-ticker__viewport">
        <div class="league-news-ticker__track">
          <div class="league-news-ticker__group">${tickerItems}</div>
          <div class="league-news-ticker__group" aria-hidden="true">${tickerItems}</div>
        </div>
      </div>
    </section>`;
  }

  function renderLeagueHome() {
    const currentWeek=currentHomeWeek();
    const availableGames=currentWeek.games;
    const officialGameId=officialGotwId(currentWeek.week);
    if(!state.featuredGameId||!availableGames.some(g=>g.id===state.featuredGameId)){
      const ranked=[...availableGames].sort((a,b)=>{
        const ar=teamById(a.awayId).wins+teamById(a.homeId).wins;
        const br=teamById(b.awayId).wins+teamById(b.homeId).wins;
        return br-ar;
      });
      state.featuredGameId=availableGames.some(game=>String(game.id)===String(officialGameId))?officialGameId:ranked[0]?.id;
    }
    const featured=availableGames.find(g=>g.id===state.featuredGameId)||availableGames[0];
    const isOfficialGotw=String(featured.id)===String(officialGameId);
    const away=teamById(featured.awayId),home=teamById(featured.homeId);
    const awayOff=topUnitPlayers(away.id,'offense'),homeOff=topUnitPlayers(home.id,'offense');
    const awayDef=topUnitPlayers(away.id,'defense'),homeDef=topUnitPlayers(home.id,'defense');
    const recentNews=newsArticles.slice(0,3);

    pageContent.innerHTML=`
      <div class="page-heading league-home-heading">
        <div><span class="eyebrow">Season 4 · Week ${currentWeek.week}</span><h1>League Home</h1></div>
        <div class="heading-actions"><button class="button button--ghost" data-route="league-activity"><svg><use href="#icon-activity"></use></svg>League Activity</button><button class="button button--primary" data-route="schedule"><svg><use href="#icon-calendar"></use></svg>Full Schedule</button></div>
      </div>

      ${renderLeagueNewsTicker()}

      <section class="week-ribbon-wrap">
        <div class="week-ribbon">
          ${availableGames.map(game=>{
            const a=teamById(game.awayId),h=teamById(game.homeId),done=game.status==='final';
            return `<button type="button" class="week-matchup-card ${game.id===featured.id?'is-active':''}" data-feature-game="${game.id}">
              <span class="week-matchup-time">${game.day} · ${done?'Final':game.time}</span>
              <span class="week-matchup-team">${renderTeamMark(a)}<strong>${a.abbr}</strong><small>${done?game.awayScore:a.record}</small></span>
              <span class="week-matchup-team">${renderTeamMark(h)}<strong>${h.abbr}</strong><small>${done?game.homeScore:h.record}</small></span>
              <span class="week-matchup-network">${game.network}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <div class="league-home-main">
        <div class="league-home-primary">
          <section class="featured-game card" data-game-id="${featured.id}" style="--away:${away.primary};--home:${home.primary}">
          <div class="featured-game-label">
            <span>${isOfficialGotw?'★ Game of the Week':'Selected Matchup'}</span>
            <small>${featured.day} · ${featured.time} · ${featured.network} · ${featured.stadium}</small>
          </div>

          <div class="featured-split featured-split--clickable" aria-label="Open Game Center">
            <div class="featured-half featured-half--away">
              <div class="featured-half-hero">
                ${renderTeamMark(away,'featured-team-logo')}
                <div class="featured-half-copy">
                  <span class="eyebrow">${away.city}</span>
                  <h2>${away.name}</h2>
                  <p>${away.record} · Owner: ${escapeHtml(away.owner)}</p>
                  <div class="previous-result"><span>Previous game</span><strong>${previousGameCopy(away.id,currentWeek.week)}</strong></div>
                </div>
              </div>
              <div class="featured-unit-stack">
                <div class="featured-unit">
                  <span class="eyebrow">Top Offense</span>
                  ${awayOff.map(renderFeaturedPlayerRow).join('')}
                </div>
                <div class="featured-unit">
                  <span class="eyebrow">Top Defense</span>
                  ${awayDef.map(renderFeaturedPlayerRow).join('')}
                </div>
              </div>
            </div>
<div class="featured-half featured-half--home">
              <div class="featured-half-hero featured-half-hero--home">
                <div class="featured-half-copy">
                  <span class="eyebrow">${home.city}</span>
                  <h2>${home.name}</h2>
                  <p>${home.record} · Owner: ${escapeHtml(home.owner)}</p>
                  <div class="previous-result"><span>Previous game</span><strong>${previousGameCopy(home.id,currentWeek.week)}</strong></div>
                </div>
                ${renderTeamMark(home,'featured-team-logo')}
              </div>
              <div class="featured-unit-stack">
                <div class="featured-unit">
                  <span class="eyebrow">Top Offense</span>
                  ${homeOff.map(renderFeaturedPlayerRow).join('')}
                </div>
                <div class="featured-unit">
                  <span class="eyebrow">Top Defense</span>
                  ${homeDef.map(renderFeaturedPlayerRow).join('')}
                </div>
              </div>
            </div>
          </div>
        </section>

        </div>

        <aside class="league-home-standings">
          ${renderConferenceSnapshot('AFC')}
          ${renderConferenceSnapshot('NFC')}
        </aside>

        <section class="home-leaders-section home-leaders-section--embedded">
          <div class="section-heading home-leaders-heading"><div><span class="section-number">02</span><h2>Stat Leaders</h2></div><button class="text-button" data-route="stats">View Full Leaderboard <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="home-leaders-grid home-leaders-grid--embedded">
            ${renderHomeLeaderCard('passing','Passing')}
            ${renderHomeLeaderCard('rushing','Rushing')}
            ${renderHomeLeaderCard('receiving','Receiving')}
            ${renderHomeLeaderCard('defense','Defense')}
          </div>
        </section>
      </div>
`;
  }

  function renderActivity() {
    const account = window.FGC_TRADE?.getCurrentAccount?.();
    const myTeamId = account?.teamId || null;
    const snapshot = window.FGC_TRADE?.getActivitySnapshot?.() || { approvedTrades:[], blockPlayers:[], blockPicks:[] };
    const filters = [
      ['all','All'],['transactions','Transactions'],['games','Games'],['news','News'],['my-franchise','My Franchise']
    ];

    const finalGames = schedule
      .flatMap(week => week.games.map(game => ({...game, week:week.week})))
      .filter(game => game.status === 'final')
      .slice(-8)
      .reverse();

    const activity = [];

    snapshot.approvedTrades.forEach((trade,index) => {
      activity.push({
        id:`trade-${trade.id}`, type:'transactions', kind:'Approved trade', icon:'icon-swap',
        title:`${trade.teamAName} and ${trade.teamBName} complete an approved trade`,
        copy:trade.summary || 'The committee review is complete and the transaction is now public.',
        time:trade.time || `${index+1} day ago`, teamIds:[trade.teamAId,trade.teamBId],
        route:`trade-center/history`, accent:'success'
      });
    });

    snapshot.blockPlayers.slice(0,6).forEach((listing,index) => {
      activity.push({
        id:`block-${listing.playerId}`, type:'transactions', kind:'Trade Block', icon:'icon-tag',
        title:`${listing.playerName} added to the Trade Block`,
        copy:`${listing.position} · ${listing.overall} OVR · ${listing.dev} development · ${listing.teamAbbr}`,
        time:index < 2 ? `${18 + index*11} minutes ago` : `${index} hours ago`,
        teamIds:[listing.teamId], playerId:listing.playerId, accent:'warning'
      });
    });

    finalGames.slice(0,5).forEach((game,index) => {
      const away=teamById(game.awayId), home=teamById(game.homeId);
      const winner=game.awayScore>game.homeScore?away:home;
      activity.push({
        id:`game-${game.id}`, type:'games', kind:'Final score', icon:'icon-trophy',
        title:`${winner.fullName} earn a Week ${game.week} victory`,
        copy:`${away.abbr} ${game.awayScore} · ${home.abbr} ${game.homeScore}`,
        time:index===0?'34 minutes ago':`${index+1} hours ago`,
        teamIds:[game.awayId,game.homeId], gameId:game.id, accent:'score'
      });
    });

    newsArticles.filter(article=>['Commissioner','Awards','Power Rankings','Analysis'].includes(article.category)).slice(0,5).forEach(article => {
      activity.push({
        id:`news-${article.id}`, type:'news', kind:article.category, icon:article.category==='Commissioner'?'icon-gavel':'icon-news',
        title:article.title, copy:article.excerpt, time:article.time,
        teamIds:[], newsId:article.id, accent:article.category==='Commissioner'?'accent':'neutral'
      });
    });

    const milestonePlayers = [...players].filter(p=>p.overall>=91).slice(0,3);
    milestonePlayers.forEach((player,index)=>{
      const team=teamById(player.teamId);
      activity.push({
        id:`milestone-${player.id}`, type:'news', kind:'Player milestone', icon:'icon-star',
        title:`${player.name} reaches a new franchise milestone`,
        copy:`${team.abbr} · ${player.position} · ${player.overall} OVR · ${player.dev}`,
        time:`${index+2} days ago`, teamIds:[player.teamId], playerId:player.id, accent:'player'
      });
    });

    const advanceArticle = newsArticles.find(article=>article.category==='Commissioner');
    if(advanceArticle){
      activity.unshift({
        id:'league-advance', type:'news', kind:'League advance', icon:'icon-clock',
        title:'Week 8 advance scheduled for Thursday night',
        copy:'Complete remaining games and submit results before the commissioner advance window.',
        time:'2 hours ago', teamIds:[], newsId:advanceArticle.id, accent:'accent'
      });
    }

    const filtered = activity.filter(item => {
      if(state.activityFilter==='all') return true;
      if(state.activityFilter==='my-franchise') return myTeamId && item.teamIds.includes(myTeamId);
      return item.type===state.activityFilter;
    });

    const ranked=[...teams].sort(sortStandings);
    const trending=[...players].sort((a,b)=>(b.overall+b.stats.touchdowns)-(a.overall+a.stats.touchdowns)).slice(0,5);
    const currentWeek=schedule.find(w=>w.week===8);
    const upcoming=(currentWeek?.games||[]).filter(g=>g.status!=='final').slice(0,3);

    pageContent.innerHTML = `
      <div class="page-heading activity-heading">
        <div><span class="eyebrow">TC-010 · League Activity</span><h1>League Activity</h1><p>The live heartbeat of Franchise HQ—transactions, games, announcements, milestones, and the activity that matters to your franchise.</p></div>
        <div class="heading-actions"><button class="button button--ghost" data-route="news"><svg><use href="#icon-news"></use></svg>League News</button><button class="button button--primary" data-route="trade-center"><svg><use href="#icon-swap"></use></svg>Start a Trade</button></div>
      </div>

      <div class="activity-filter-bar">
        <div class="segmented-tabs">${filters.map(([key,label])=>`<button type="button" data-activity-filter="${key}" class="${state.activityFilter===key?'is-active':''}">${label}</button>`).join('')}</div>
        <span class="result-count">${filtered.length} updates</span>
      </div>

      <div class="league-feed-layout">
        <section class="league-feed">
          ${filtered.length ? filtered.map(item=>`
            <article class="league-feed-item ${item.accent?`league-feed-item--${item.accent}`:''}" ${item.playerId?`data-player-id="${item.playerId}"`:item.gameId?`data-game-id="${item.gameId}"`:item.newsId?`data-news-id="${item.newsId}"`:item.route?`data-route="${item.route}"`:''}>
              <span class="league-feed-icon"><svg><use href="#${item.icon}"></use></svg></span>
              <div class="league-feed-content">
                <div class="league-feed-meta"><span>${escapeHtml(item.kind)}</span><time>${escapeHtml(item.time)}</time></div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.copy)}</p>
                ${item.teamIds.length?`<div class="league-feed-teams">${item.teamIds.map(id=>renderTeamMark(teamById(id))).join('')}</div>`:''}
              </div>
              <svg class="league-feed-arrow"><use href="#icon-arrow"></use></svg>
            </article>`).join('') : `
            <article class="empty-state card"><span class="empty-icon"><svg><use href="#icon-activity"></use></svg></span><h2>No franchise activity yet</h2><p>Your team-specific feed will populate when your franchise appears in games, transactions, Trade Block listings, or league news.</p></article>`}
        </section>

        <aside class="league-feed-sidebar">
          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">League leaders</span><h3>Power snapshot</h3></div><button class="text-button" data-route="standings">Full standings <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="power-snapshot">${ranked.slice(0,5).map((team,index)=>`<button data-team-id="${team.id}"><span class="power-rank">${index+1}</span>${renderTeamMark(team)}<span><strong>${team.fullName}</strong><small>${team.record} · ${team.pf-team.pa>=0?'+':''}${team.pf-team.pa} point diff</small></span></button>`).join('')}</div>
          </article>

          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">Most active</span><h3>Trending players</h3></div><button class="text-button" data-route="players">All players <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="trending-player-list">${trending.map((player,index)=>`<button data-player-id="${player.id}"><span class="trend-number">${index+1}</span>${renderPlayerIdentity(player)}<span class="trend-score">${player.overall}</span></button>`).join('')}</div>
          </article>

          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">Week 8</span><h3>Upcoming events</h3></div><button class="text-button" data-route="schedule">Schedule <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="upcoming-event-list">
              ${upcoming.map(game=>{const away=teamById(game.awayId),home=teamById(game.homeId);return`<button data-game-id="${game.id}"><span class="upcoming-date">${game.day}<strong>${game.time}</strong></span><span>${away.abbr} at ${home.abbr}<small>${game.network} · ${game.stadium}</small></span></button>`}).join('')}
              <div class="upcoming-league-event"><span class="league-feed-icon"><svg><use href="#icon-clock"></use></svg></span><span><strong>League advance</strong><small>Thursday · 10:00 PM</small></span></div>
            </div>
          </article>
        </aside>
      </div>`;
  }

  function leaderActivity(player, label, value) {
    const team = teamById(player.teamId);
    return `<div class="activity-item clickable-row" data-player-id="${player.id}"><span class="activity-icon activity-icon--player"><svg><use href="#icon-star"></use></svg></span><div><strong>${escapeHtml(player.name)} · ${team.abbr}</strong><p>${label}: <b>${value}</b></p><span>${player.position} · ${player.overall} OVR · ${player.dev}</span></div></div>`;
  }

  function gameActivity(game) {
    const away = teamById(game.awayId); const home = teamById(game.homeId);
    const winner = game.awayScore > game.homeScore ? away : home;
    return `<div class="activity-item clickable-row" data-game-id="${game.id}"><span class="activity-icon activity-icon--score"><svg><use href="#icon-trophy"></use></svg></span><div><strong>${winner.fullName} wins</strong><p>${away.abbr} ${game.awayScore} · ${home.abbr} ${game.homeScore}</p><span>Week ${game.week} · Final</span></div></div>`;
  }

  function newsActivity(article) {
    return `<div class="activity-item clickable-row" data-news-id="${article.id}"><span class="activity-icon activity-icon--news"><svg><use href="#icon-news"></use></svg></span><div><strong>${escapeHtml(article.category)}</strong><p>${escapeHtml(article.title)}</p><span>${escapeHtml(article.time)}</span></div></div>`;
  }

  function renderTeams() {
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">League directory</span><h1>Teams</h1><p>Browse every franchise, owner, record, rating, cap situation, roster, schedule, and team profile.</p></div><div class="heading-actions"><button class="button button--ghost" data-demo-toast="Team comparison will be added after the core league pages are complete."><svg><use href="#icon-chart"></use></svg>Compare teams</button></div></div>
      <div class="filter-bar">
        <label class="field field--grow"><span>Search teams or owners</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-team-search value="${escapeHtml(state.teamSearch)}" placeholder="Cowboys, Peckin, Dallas..." /></div></label>
        <label class="field"><span>Conference</span><select data-team-conference><option ${state.teamConference==='All'?'selected':''}>All</option><option ${state.teamConference==='AFC'?'selected':''}>AFC</option><option ${state.teamConference==='NFC'?'selected':''}>NFC</option></select></label>
        <label class="field"><span>Division</span><select data-team-division><option ${state.teamDivision==='All'?'selected':''}>All</option><option>East</option><option>North</option><option>South</option><option>West</option></select></label>
        <span class="result-count" data-team-count></span>
      </div>
      <div class="team-grid" data-team-grid></div>`;
    refreshTeamGrid();
  }

  function refreshTeamGrid() {
    const grid = document.querySelector('[data-team-grid]');
    if (!grid) return;
    const term = state.teamSearch.trim().toLowerCase();
    const ownedTeamId = window.FGC_TRADE?.getCurrentAccount?.()?.teamId || null;
    const filtered = teams.filter(team => {
      const matchesTerm = !term || `${team.fullName} ${team.abbr} ${team.owner}`.toLowerCase().includes(term);
      return matchesTerm && (state.teamConference === 'All' || team.conference === state.teamConference) && (state.teamDivision === 'All' || team.division === state.teamDivision);
    }).sort((a,b) => {
      if (ownedTeamId && a.id === ownedTeamId && b.id !== ownedTeamId) return -1;
      if (ownedTeamId && b.id === ownedTeamId && a.id !== ownedTeamId) return 1;
      return a.conference.localeCompare(b.conference) || a.division.localeCompare(b.division) || sortStandings(a,b);
    });
    document.querySelector('[data-team-count]').textContent = `${filtered.length} of 32 teams`;
    grid.innerHTML = filtered.length ? filtered.map(team => `
      <article class="team-card card" style="${teamStyle(team)}" data-team-id="${team.id}">
        <div class="team-card__top">${renderTeamMark(team,'team-logo')}<div class="team-card__record"><strong>${team.record}</strong><small>#${team.divisionRank} ${team.division}</small></div></div>
        <h3>${team.fullName}${ownedTeamId===team.id?'<span class="my-team-tag">MY TEAM</span>':''}</h3><span class="team-card__owner">${escapeHtml(team.owner)} · ${team.conference} ${team.division}</span>
        <div class="team-card__metrics"><span><strong>${team.ovr}</strong><small>Overall</small></span><span><strong>${team.off}</strong><small>Offense</small></span><span><strong>${team.def}</strong><small>Defense</small></span></div>
        <div class="team-card__footer"><span>${formatMoney(team.cap)} cap space</span><span>${team.streak}</span></div>
      </article>`).join('') : `<article class="card roadmap-state" style="grid-column:1/-1"><div class="roadmap-state__inner"><div class="roadmap-icon"><svg><use href="#icon-search"></use></svg></div><h2>No teams found</h2><p>Try clearing a filter or searching for another city, nickname, abbreviation, or owner.</p></div></article>`;
  }

  function rosterService() {
    return window.FranchiseHQ?.modules?.league?.rosters || window.FranchiseHQ?.leagueRosters || null;
  }

  function rosterPlayerView(player) {
    const raw = player?.raw || {};
    const contract = player?.contract || {};
    return {
      ...player,
      dev: player?.developmentTrait || raw.dev || raw.developmentTrait || 'Normal',
      injury: player?.injuryStatus || raw.injury || 'Healthy',
      years: Number(contract.yearsRemaining ?? contract.years ?? raw.years ?? raw.contractYears ?? 0) || 0,
      salary: Number(contract.salary ?? contract.totalSalary ?? raw.salary ?? 0) || 0,
      capHit: Number(contract.capHit ?? raw.capHit ?? raw.salary ?? 0) || 0,
      depth: player?.depthOrder ?? raw.depth ?? null,
      college: raw.college || raw.school || '—',
      imageUrl: raw.imageUrl || raw.playerImageUrl || raw.headshotUrl || raw.headshot || raw.photoUrl || raw.photo || raw.portraitUrl || raw.portrait || player?.imageUrl || player?.headshotUrl || null,
      imageAssetId: raw.imageAssetId || raw.portraitId || raw.headshotId || null,
      number: raw.number || raw.jerseyNumber || '—',
      height: raw.height || '—',
      weight: raw.weight || '—',
      tradeBlock: Boolean(raw.tradeBlock),
      initials: raw.initials || String(player?.name || '?').split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(),
      ratings: player?.ratings || raw.ratings || {},
      stats: player?.stats || raw.stats || {}
    };
  }

  function rosterTeamView(teamId) {
    const legacy = teamById(teamId);
    if (legacy) return legacy;
    const current = window.FranchiseHQ?.leagueData?.current?.();
    const team = (current?.teams || []).find(item => String(item.id) === String(teamId));
    if (!team) return null;
    const city = team.city || team.location || '';
    const name = team.name || team.nickname || team.abbr || team.id;
    return {
      ...team,
      id: String(team.id),
      abbr: team.abbr || team.shortName || String(team.id).toUpperCase(),
      fullName: team.fullName || [city, name].filter(Boolean).join(' ') || name,
      record: team.record || '—',
      primary: team.primary || '#27364f',
      secondary: team.secondary || '#8fa4c4'
    };
  }

  function rosterSourceLabel(provenance) {
    if (provenance?.mode === 'live') return provenance.sourceType === 'madden-companion' ? 'Madden Companion' : 'Verified Madden snapshot';
    if (provenance?.mode === 'demo') return 'Development Data';
    return 'No league data';
  }

  function formatRosterContract(player) {
    const view = rosterPlayerView(player);
    if (!view.years && !view.salary && !view.capHit) return 'Not provided';
    const years = view.years ? `${view.years} yr${view.years === 1 ? '' : 's'}` : 'Term unavailable';
    const money = view.capHit ? formatMoney(view.capHit) : view.salary ? formatMoney(view.salary) : 'Cap unavailable';
    return `${years} · ${money}`;
  }

  function schoolAbbreviation(value) {
    const school = String(value || '').trim();
    if (!school || school === '—') return '—';
    const normalized = school.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const known = {
      'oklahoma':'OKL','ohio state':'OSU','alabama':'ALA','georgia':'UGA','texas':'TEX','lsu':'LSU',
      'louisiana state':'LSU','michigan':'MCH','oregon':'ORE','clemson':'CLE','penn state':'PSU',
      'florida state':'FSU','usc':'USC','southern california':'USC','notre dame':'NDM','tennessee':'TEN',
      'washington':'WAS','miami':'MIA','ucla':'UCL','tcu':'TCU','auburn':'AUB','baylor':'BAY',
      'oklahoma state':'OKS','texas a m':'TAM','texas a&m':'TAM','virginia tech':'VTK','kansas state':'KSU'
    };
    if (known[normalized]) return known[normalized];
    const compact = school.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    if (compact.length >= 3) return compact.slice(0,3);
    return compact.padEnd(3,'X');
  }

  function rosterGroupForPlayer(player) {
    const status = String(player.rosterStatus || '').toLowerCase();
    if (status === 'injured-reserve') return 'Injured Reserve';
    if (status === 'practice-squad') return 'Practice Squad / Other';
    const pos = String(player.position || '').toUpperCase();
    if (['QB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL'].includes(pos)) return 'Offense';
    if (['K','P','LS','KR','PR'].includes(pos)) return 'Special Teams';
    if (pos) return 'Defense';
    return 'Other';
  }

  function renderRosterExperience(team, rosterModel) {
    const allPlayers = rosterModel.players.map(rosterPlayerView).sort((a,b) => (Number(b.overall)||0) - (Number(a.overall)||0) || String(a.name).localeCompare(String(b.name)));
    const positions = [...new Set(allPlayers.map(player => player.position).filter(Boolean))].sort();
    const devTraits = [...new Set(allPlayers.map(player => player.dev).filter(Boolean))].sort();
    const filtered = allPlayers.filter(player => {
      if (state.rosterGroup !== 'All' && rosterGroupForPlayer(player) !== state.rosterGroup) return false;
      if (state.rosterPosition !== 'All' && player.position !== state.rosterPosition) return false;
      if (state.rosterDev !== 'All' && player.dev !== state.rosterDev) return false;
      return true;
    });
    return `<div class="roster-experience roster-experience--clean">
      <div class="filter-bar roster-table-filters">
        <label class="field"><span>Roster Group</span><select data-roster-group><option value="All">Full Roster</option>${['Offense','Defense','Special Teams','Injured Reserve','Practice Squad / Other','Other'].map(value=>`<option value="${value}" ${state.rosterGroup===value?'selected':''}>${value}</option>`).join('')}</select></label>
        <label class="field"><span>Position</span><select data-roster-position><option value="All">All Positions</option>${positions.map(value=>`<option value="${escapeHtml(value)}" ${state.rosterPosition===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label>
        <label class="field"><span>Development</span><select data-roster-dev><option value="All">All Traits</option>${devTraits.map(value=>`<option value="${escapeHtml(value)}" ${state.rosterDev===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label>
        <span class="result-count">${filtered.length} player${filtered.length===1?'':'s'} · sorted by OVR</span>
      </div>
      <article class="card roster-table-card"><div class="table-wrap"><table class="team-roster-table team-roster-table--single"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Age</th><th>Development</th><th>Contract / Cap</th><th>Status</th></tr></thead><tbody>${filtered.map(player=>`<tr class="clickable-row roster-player-row" data-roster-player-detail="${escapeHtml(player.id||'')}"><td><div class="roster-player-inline"><span class="roster-player-inline__identity"><strong>${escapeHtml(player.name)}</strong><small>— ${escapeHtml(schoolAbbreviation(player.college))}</small></span><button type="button" class="roster-trade-button roster-trade-button--compact" data-add-player-trade="${escapeHtml(player.id||'')}">Trade</button></div></td><td><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall ?? '—'}</span></td><td>${player.age ?? '—'}</td><td><span class="dev-badge ${devClass(player.dev)}">${escapeHtml(player.dev)}</span></td><td>${escapeHtml(formatRosterContract(player))}</td><td><span class="pill ${player.injury==='Healthy'?'pill--success':'pill--warning'}">${escapeHtml(player.rosterStatus==='active'?player.injury:titleCase(String(player.rosterStatus||'other').replace(/-/g,' ')))}</span></td></tr>`).join('') || `<tr><td colspan="7"><div class="roster-no-results"><strong>No players match these filters.</strong><span>Change a roster filter to see more players.</span></div></td></tr>`}</tbody></table></div></article>
    </div>`;
  }

  function depthPlayerImageMarkup(player) {
    const imageUrl = String(player?.imageUrl || '').trim();
    if (imageUrl) {
      return `<span class="formation-player-card__image"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-placeholder');this.remove();"></span>`;
    }
    return `<span class="formation-player-card__image is-placeholder" aria-hidden="true"><svg><use href="#icon-user"></use></svg></span>`;
  }

  function scrollTeamTabsToTop() {
    const tabs = pageContent?.querySelector?.('[data-team-tabs]');
    if (!tabs) return;
    requestAnimationFrame(() => {
      const mainRect = mainContent?.getBoundingClientRect?.();
      const tabsRect = tabs.getBoundingClientRect();
      if (mainContent && mainRect) {
        const nextTop = mainContent.scrollTop + tabsRect.top - mainRect.top - 12;
        mainContent.scrollTo({ top: Math.max(0, nextTop), behavior: 'instant' });
      } else {
        const nextTop = window.scrollY + tabsRect.top - 12;
        window.scrollTo({ top: Math.max(0, nextTop), left: 0, behavior: 'instant' });
      }
    });
  }

  function renderRosterDepthChart(rosterModel) {
    const players = rosterModel.players.map(rosterPlayerView).sort((a,b)=>(Number(a.depth)||99)-(Number(b.depth)||99)||(Number(b.overall)||0)-(Number(a.overall)||0));
    const byPosition = position => players.filter(player => player.position === position);
    const split = (list, parity) => list.filter((_,index)=>index % 2 === parity);
    const stackMarkup = (label, list, area) => {
      if (!list.length) return `<div class="formation-position formation-position--empty" style="grid-area:${area}"><span>${label}</span></div>`;
      const ordered = [...list];
      const selectedIndex = ordered.findIndex(player => player.id === state.depthSelectedPlayer);
      if (selectedIndex > 0) ordered.unshift(...ordered.splice(selectedIndex,1));
      const visible = ordered.slice(0,3);
      const front = visible[0];
      const backups = visible.slice(1);
      return `<section class="formation-position" style="grid-area:${area}">
        <span class="formation-position__label">${label}</span>
        <div class="formation-depth-card">
          <button type="button" class="formation-depth-card__starter ${depthDevelopmentClass(front.dev)} ${state.depthSelectedPlayer===front.id?'is-selected':''}" data-depth-player-id="${escapeHtml(front.id||'')}" aria-label="Show ${escapeHtml(front.name)}">
            ${depthPlayerImageMarkup(front)}
            <span class="formation-player-card__ovr">${front.overall ?? '—'}</span>
            <strong>${escapeHtml(front.name)}</strong>
          </button>
          <div class="formation-depth-card__backups">
            ${[0,1].map(index=>{
              const player=backups[index];
              if (!player) return `<span class="formation-depth-card__backup formation-depth-card__backup--empty" aria-hidden="true"></span>`;
              return `<button type="button" class="formation-depth-card__backup ${depthDevelopmentClass(player.dev)} ${state.depthSelectedPlayer===player.id?'is-selected':''}" data-depth-player-id="${escapeHtml(player.id||'')}" aria-label="Show ${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><b>${player.overall ?? '—'}</b></button>`;
            }).join('')}
          </div>
        </div>
      </section>`;
    };
    const wr = byPosition('WR');
    const cb = byPosition('CB');
    const dt = byPosition('DT');
    const safeties = [...byPosition('FS'), ...byPosition('SS')].sort((a,b)=>(Number(a.depth)||99)-(Number(b.depth)||99)||(Number(b.overall)||0)-(Number(a.overall)||0));
    const offense = [
      stackMarkup('WR1', split(wr,0), 'wr1'), stackMarkup('LT',byPosition('LT'),'lt'), stackMarkup('LG',byPosition('LG'),'lg'), stackMarkup('C',byPosition('C'),'c'), stackMarkup('RG',byPosition('RG'),'rg'), stackMarkup('RT',byPosition('RT'),'rt'), stackMarkup('TE',byPosition('TE'),'te'), stackMarkup('WR2',split(wr,1),'wr2'), stackMarkup('QB',byPosition('QB'),'qb'), stackMarkup('RB',byPosition('RB'),'rb'), stackMarkup('FB',byPosition('FB'),'fb')
    ].join('');
    const defense = [
      stackMarkup('S',safeties,'s'), stackMarkup('LOLB',byPosition('LOLB'),'lolb'), stackMarkup('ILB',byPosition('MLB'),'mlb'), stackMarkup('ROLB',byPosition('ROLB'),'rolb'), stackMarkup('CB1',split(cb,0),'cb1'), stackMarkup('EDGE',byPosition('LE'),'le'), stackMarkup('DT1',split(dt,0),'dt1'), stackMarkup('DT2',split(dt,1),'dt2'), stackMarkup('EDGE',byPosition('RE'),'re'), stackMarkup('CB2',split(cb,1),'cb2')
    ].join('');
    return `<article class="card madden-depth-card"><div class="card-header"><div><span class="eyebrow">Interactive lineup</span><h3>Depth Chart</h3><p>Select a backup to bring it forward. Click the selected front card again to open the full player card.</p></div></div><div class="card-body"><div class="formation-section"><h4>Offense</h4><div class="football-formation football-formation--offense">${offense}</div></div><div class="formation-section"><h4>Defense</h4><div class="football-formation football-formation--defense">${defense}</div></div></div></article>`;
  }

  function openRosterPlayerDetail(playerId) {
    const legacy = playerById(playerId);
    if (legacy && window.FGC_TRADE?.openValueCard) {
      window.FGC_TRADE.openValueCard(playerId);
      return;
    }
    const normalized = rosterService()?.findPlayer?.(playerId);
    if (!normalized) return;
    const player = rosterPlayerView(normalized);
    const team = rosterTeamView(player.teamId);
    const ratings = Object.entries(player.ratings || {}).sort((a,b)=>Number(b[1])-Number(a[1]));
    openDetail(`<div class="modal-hero"><div><span class="eyebrow">${escapeHtml(team?.fullName || 'Free Agent')} · ${escapeHtml(player.position || '—')}</span><h2>${escapeHtml(player.name)}</h2><div class="player-profile-meta"><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall ?? '—'} OVR</span><span class="dev-badge ${devClass(player.dev)}">${escapeHtml(player.dev)}</span><span>Age ${player.age ?? '—'}</span></div></div></div><div class="modal-body"><div class="modal-summary-grid"><div><span>Contract</span><strong>${escapeHtml(formatRosterContract(player))}</strong></div><div><span>Injury</span><strong>${escapeHtml(player.injury)}</strong></div><div><span>Depth</span><strong>${player.depth ?? 'Not provided'}</strong></div><div><span>Roster Status</span><strong>${escapeHtml(titleCase(String(player.rosterStatus||'other').replace(/-/g,' ')))}</strong></div></div>${ratings.length?`<div class="rating-bars roster-detail-ratings">${ratings.map(([label,value])=>`<div class="rating-row"><span>${escapeHtml(label)}</span><div class="rating-track"><div class="rating-fill" style="width:${Math.max(0,Math.min(100,Number(value)||0))}%"></div></div><strong>${escapeHtml(String(value))}</strong></div>`).join('')}</div>`:''}<div class="heading-actions" style="justify-content:flex-start"><button class="button button--primary" data-close-detail>Close</button>${player.teamId?`<button class="button button--ghost" data-modal-team="${escapeHtml(player.teamId)}">View Team</button>`:''}</div></div>`);
  }

  function renderTeamDetail(teamId) {
    const team = teamById(teamId);
    if (!team) { setRoute('teams'); return; }
    const rosterModel = rosterService()?.getTeamRoster?.(team.id);
    const roster = rosterModel?.players?.map(rosterPlayerView) || [];
    const teamGames = schedule.flatMap(week => week.games).filter(game => game.homeId === team.id || game.awayId === team.id);
    const leaders = [...roster].sort((a,b) => b.overall - a.overall).slice(0,5);

    pageContent.innerHTML = `
      <div class="page-heading"><div><button class="text-button" data-route="teams"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>All teams</button></div><div class="heading-actions">${window.FGC_TRADE?.getCurrentAccount?.()?.teamId===team.id?`<button class="button button--ghost" data-open-block-drawer><svg><use href="#icon-tag"></use></svg>Manage Trade Block</button>`:''}<button class="button button--primary" data-start-team-trade="${team.id}"><svg><use href="#icon-swap"></use></svg>${window.FGC_TRADE?.getCurrentAccount?.()?.teamId===team.id?'Start Trade Proposal':`Start Trade w/ ${team.fullName}`}</button></div></div>
      <section class="team-hero" style="${teamStyle(team)}" data-abbr="${team.abbr}">
        <div class="team-hero__content">${renderTeamMark(team,'team-logo team-logo--large')}<div class="team-hero__copy"><span class="eyebrow">${team.conference} ${team.division} · Owner ${escapeHtml(team.owner)}</span><h1>${team.fullName}</h1><p>Head Coach ${escapeHtml(team.coach)} · ${team.stadium}</p></div><div class="team-hero__record"><strong>${team.record}</strong><span>#${team.divisionRank} in ${team.division} · ${team.streak}</span></div></div>
      </section>
      <div class="team-summary-grid">
        ${summaryTile('Overall',team.ovr,'Team rating')}${summaryTile('Offense',team.off,'Unit rating')}${summaryTile('Defense',team.def,'Unit rating')}${summaryTile('Points For',team.pf,`${(team.pf/7).toFixed(1)} per game`)}${summaryTile('Points Against',team.pa,`${(team.pa/7).toFixed(1)} per game`)}${summaryTile('Cap Space',formatMoney(team.cap),'Current estimate')}
      </div>
      <div class="subnav" data-team-tabs>
        ${['roster','depth','schedule','stats','cap','trade-history'].map(tab => `<button data-team-tab="${tab}" class="${state.teamTab===tab?'is-active':''}">${tab === 'depth' ? 'Depth Chart' : tab === 'trade-history' ? 'Trade History' : titleCase(tab)}</button>`).join('')}
      </div>
      <div data-team-tab-content>${renderTeamTab(team, rosterModel, roster, teamGames, leaders)}</div>`;
  }

  function summaryTile(label, value, detail) { return `<article class="summary-tile card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`; }
  function titleCase(value) { return value.replace(/\b\w/g, letter => letter.toUpperCase()); }
  function positionOrder(position) { return positionBlueprint.findIndex(([pos]) => pos === position); }

  function renderTeamTab(team, rosterModel, roster, teamGames, leaders) {
    if (!rosterModel) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><h2>Roster service unavailable</h2><p>The Roster Read Model has not loaded.</p></div></article>`;
    if (state.teamTab === 'depth') return renderRosterDepthChart(rosterModel);
    if (state.teamTab === 'schedule') return renderTeamSchedule(team, teamGames);
    if (state.teamTab === 'stats') return renderTeamStats(team, roster);
    if (state.teamTab === 'cap') return renderTeamCap(team, roster);
    if (state.teamTab === 'trade-history') return renderTeamTradeHistory(team);
    return renderRosterExperience(team, rosterModel);
  }

  function renderRosterPlayerActions(player, account) {
    const ownPlayer = account?.teamId === player.teamId;
    const active = ownPlayer ? window.FGC_TRADE?.onBlock?.(player) : window.FGC_TRADE?.isWatched?.(player.id);
    const starLabel = ownPlayer
      ? (active ? 'Remove from Trade Block' : 'Add to Trade Block')
      : (active ? 'Remove from Watch List' : 'Add to Watch List');
    return {
      star: `<button type="button" class="roster-star ${active?'is-active':''}" data-player-action="star" data-player-id-action="${player.id}" aria-pressed="${active?'true':'false'}" aria-label="${starLabel}" title="${starLabel}"><svg><use href="#icon-star"></use></svg></button>`,
      trade: `<button type="button" class="roster-trade-button" data-player-action="trade" data-player-id-action="${player.id}">Trade</button>`
    };
  }

  function renderRosterTable(roster) {
    const account = window.FGC_TRADE?.getCurrentAccount?.();
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">53-player mock roster</span><h3>Active roster</h3></div><span class="pill pill--neutral">${roster.length} records</span></div><div class="table-wrap" data-roster-scroll><table class="team-roster-table"><thead><tr><th class="quick-star-col"><span class="sr-only">Quick action</span></th><th>Player</th><th>OVR</th><th>Age</th><th>Development</th><th>Contract</th><th>Cap Hit</th><th>Status</th></tr></thead><tbody>${roster.map(player => { const actions=renderRosterPlayerActions(player,account); return `<tr class="clickable-row roster-player-row" data-player-id="${player.id}" data-roster-player-row="${player.id}"><td class="quick-star-col">${actions.star}</td><td><div class="roster-player-cell">${renderPlayerIdentity(player,false)}${actions.trade}</div></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span></td><td>${player.age}</td><td><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></td><td>${player.years} year${player.years===1?'':'s'}</td><td>${formatMoney(player.capHit)}</td><td><span class="pill ${player.injury==='Healthy'?'pill--success':'pill--warning'}">${player.injury}</span></td></tr>` }).join('')}</tbody></table></div></article>`;
  }

  function renderDepthChart(roster) {
    const groups = [
      ['QB',['QB']],['HB',['RB','FB']],['REC',['WR','TE']],['OL',['LT','LG','C','RG','RT']],
      ['DL',['LE','RE','DT']],['LB',['LOLB','MLB','ROLB']],['DB',['CB','FS','SS']],['ST',['K','P']]
    ];
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">Projected lineup</span><h3>Depth chart</h3></div><span class="pill pill--accent">Mock ordering</span></div><div class="card-body"><div class="depth-chart">${groups.map(([label, positions]) => {
      const groupPlayers = roster.filter(player => positions.includes(player.position)).sort((a,b) => b.overall-a.overall).slice(0,3);
      return `<div class="depth-row"><span class="depth-position">${label}</span>${groupPlayers.map(player => `<button class="depth-player" data-player-id="${player.id}"><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span><div><strong>${escapeHtml(player.name)}</strong><small>${player.position} · ${player.dev}</small></div></button>`).join('')}</div>`;
    }).join('')}</div></div></article>`;
  }

  function currentLeaguePhase() {
    return { phase: 'regular', week: 8 };
  }

  function buildExtendedTeamSchedule(team, existingGames) {
    const preseason = Array.from({length:3}, (_,index) => {
      const opponent = teams[(teams.findIndex(item=>item.id===team.id)+index+5) % teams.length];
      const home = index % 2 === 0;
      const status = 'final';
      const teamScore = seededNumber(`${team.id}-pre-${index}-team`,13,31);
      const oppScore = seededNumber(`${team.id}-pre-${index}-opp`,10,30);
      return {
        id:`pre-${index+1}-${team.id}-${opponent.id}`, phase:'preseason', phaseLabel:'Preseason', week:index+1,
        awayId:home?opponent.id:team.id, homeId:home?team.id:opponent.id,
        awayScore:home?oppScore:teamScore, homeScore:home?teamScore:oppScore, status,
        day:'SAT', time:'7:00 PM', network:'LOCAL', stadium:home?team.stadium:opponent.stadium
      };
    });
    const regular = [...existingGames];
    for (let week=10; week<=18; week+=1) {
      const opponent = teams[(teams.findIndex(item=>item.id===team.id)+week*3) % teams.length];
      const home = week % 2 === 0;
      regular.push({
        id:`w${week}-${home?opponent.id:team.id}-${home?team.id:opponent.id}`, phase:'regular', phaseLabel:'Regular Season', week,
        awayId:home?opponent.id:team.id, homeId:home?team.id:opponent.id,
        awayScore:null, homeScore:null, status:'scheduled', day:week===18?'SAT':'SUN', time:week%4===0?'4:25 PM':'1:00 PM', network:week%3===0?'FOX':'CBS', stadium:home?team.stadium:opponent.stadium
      });
    }
    regular.forEach(game => { game.phase='regular'; game.phaseLabel='Regular Season'; });
    const phase=currentLeaguePhase();
    const playoffs = phase.phase === 'playoffs' ? ['Wild Card','Divisional','Conference','Championship'].map((round,index)=>{
      const opponent=teams[(teams.findIndex(item=>item.id===team.id)+index+11)%teams.length];
      return {id:`po-${index}-${team.id}`,phase:'playoffs',phaseLabel:'Playoffs',round,week:index+1,awayId:opponent.id,homeId:team.id,awayScore:null,homeScore:null,status:'scheduled',day:'SUN',time:index===3?'6:30 PM':'4:30 PM',network:'NATIONAL',stadium:team.stadium};
    }) : [];
    return { preseason, regular, playoffs };
  }

  function renderTeamScheduleCard(game, teamId) {
    const opponent = teamById(game.homeId===teamId?game.awayId:game.homeId);
    const home = game.homeId===teamId;
    const final = game.status==='final';
    const live = game.status==='live';
    const teamScore = home?game.homeScore:game.awayScore;
    const oppScore = home?game.awayScore:game.homeScore;
    const result = final ? `${teamScore>oppScore?'W':'L'} ${teamScore}-${oppScore}` : live ? `LIVE ${teamScore}-${oppScore}` : `${home?'vs':'@'} ${opponent.abbr}`;
    return `<button type="button" class="team-schedule-card ${final?'is-final':live?'is-live':'is-upcoming'}" data-game-id="${escapeHtml(game.id)}"><span class="team-schedule-card__week">${game.round || `${game.phaseLabel} · Week ${game.week}`}</span><div class="team-schedule-card__matchup">${renderTeamMark(opponent,'mini-team')}<div><strong>${home?'vs':'@'} ${escapeHtml(opponent.fullName)}</strong><small>${escapeHtml(game.day)} · ${escapeHtml(game.time)} · ${escapeHtml(game.network)}</small></div></div><div class="team-schedule-card__result"><strong>${escapeHtml(result)}</strong><small>${final?'Final':live?'In Progress':'Upcoming'}</small></div></button>`;
  }

  function renderTeamSchedule(team, teamGames) {
    const scheduleByPhase=buildExtendedTeamSchedule(team,teamGames);
    const leaguePhase=currentLeaguePhase();
    if (state.teamSchedulePhase==='playoffs' && leaguePhase.phase!=='playoffs') state.teamSchedulePhase='regular';
    const availablePhases=['preseason','regular',...(leaguePhase.phase==='playoffs'?['playoffs']:[])];
    const selected=scheduleByPhase[state.teamSchedulePhase] || scheduleByPhase.regular;
    return `<div class="team-schedule-view"><div class="filter-bar team-schedule-filters"><div class="segmented-tabs">${availablePhases.map(phase=>`<button type="button" data-team-schedule-phase="${phase}" class="${state.teamSchedulePhase===phase?'is-active':''}">${phase==='preseason'?'Preseason':phase==='regular'?'Regular Season':'Playoffs'}</button>`).join('')}</div><span class="result-count">${selected.length} game${selected.length===1?'':'s'}</span></div><div class="team-schedule-list">${selected.map(game=>renderTeamScheduleCard(game,team.id)).join('') || `<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No playoff schedule yet</h3><p>Playoff games appear only after the league advances beyond the regular season.</p></div></article>`}</div></div>`;
  }

  function teamStatTable(title, players, columns, emptyMessage) {
    return `<article class="card team-stat-section"><div class="card-header"><div><span class="eyebrow">Position-specific production</span><h3>${title}</h3></div><span class="pill pill--neutral">${players.length} player${players.length===1?'':'s'}</span></div><div class="table-wrap"><table class="team-stat-table"><thead><tr><th>Player</th>${columns.map(column=>`<th>${column.label}</th>`).join('')}</tr></thead><tbody>${players.length?players.map(player=>`<tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id)}"><td><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)}</small></td>${columns.map(column=>`<td>${column.format?column.format(player.stats?.[column.key],player):escapeHtml(String(player.stats?.[column.key] ?? '—'))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length+1}">${emptyMessage}</td></tr>`}</tbody></table></div></article>`;
  }

  function renderTeamStats(team, roster) {
    const service=statisticsService();
    if(!service) return '<article class="card"><div class="card-body">Statistics service unavailable.</div></article>';
    const model=service.getTeamStats(team.id);
    const overview=model.overview||{};
    const categoryColumns={
      passing:statsColumnMap.passing,rushing:statsColumnMap.rushing,receiving:statsColumnMap.receiving,defense:statsColumnMap.defense,kicking:statsColumnMap.kicking,punting:statsColumnMap.punting
    };
    return `<div class="team-stats-view"><div class="team-stats-overview">${[['PPG',overview.pointsPerGame],['Allowed/G',overview.pointsAllowedPerGame],['Total Offense',overview.totalOffense],['Pass Offense',overview.passingOffense],['Rush Offense',overview.rushingOffense],['Takeaways',overview.takeaways],['Turnovers',overview.turnovers],['Turnover Diff',overview.turnoverDifferential],['Sacks',overview.sacks]].map(([label,value])=>summaryStatBox(label,Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1}))).join('')}</div>${Object.entries(categoryColumns).map(([category,columns])=>{const rows=model.totals?.[category]||[];return `<article class="card team-stat-section"><div class="card-header"><div><span class="eyebrow">Official Statistics service</span><h3>${titleCase(category)}</h3></div><span class="pill pill--neutral">${rows.length} players</span></div><div class="table-wrap"><table class="team-stat-table"><thead><tr><th>Player</th>${columns.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="clickable-row" data-player-id="${escapeHtml(row.id)}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.position)}</small></td>${columns.map(([key])=>`<td>${formatStatValue(key,row.stats?.[key])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length+1}">No ${category} statistics are available.</td></tr>`}</tbody></table></div></article>`}).join('')}</div>`;
  }

  function summaryStatBox(label,value) { return `<div class="stat-box"><span>${label}</span><strong>${value}</strong></div>`; }

  function renderTeamCap(team, roster) {
    const sorted = [...roster].sort((a,b)=>(Number(b.capHit)||0)-(Number(a.capHit)||0)||String(a.name).localeCompare(String(b.name)));
    const total = roster.reduce((sum,p)=>sum+(Number(p.capHit)||0),0);
    const largest = sorted[0]?.capHit || 0;
    return `<div class="content-grid content-grid--cap"><article class="card"><div class="card-header"><div><span class="eyebrow">Financial overview</span><h3>Salary cap</h3></div></div><div class="card-body"><div class="stat-box-grid">${summaryStatBox('Cap Space',formatMoney(team.cap))}${summaryStatBox('Active Commitments',formatMoney(total))}${summaryStatBox('Largest Cap Hit',formatMoney(largest))}${summaryStatBox('Expiring Deals',roster.filter(p=>p.years===1).length)}</div></div></article><article class="card cap-roster-card"><div class="card-header"><div><span class="eyebrow">Full roster salaries</span><h3>Player contracts</h3></div><span class="pill pill--neutral">${sorted.length} players</span></div><div class="table-wrap"><table class="cap-roster-table"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Years</th><th>Salary</th><th>Cap Hit</th></tr></thead><tbody>${sorted.map(player=>`<tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id||'')}"><td><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(schoolAbbreviation(player.college))}</small></td><td><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall ?? '—'}</span></td><td>${player.years || '—'}</td><td>${player.salary ? formatMoney(player.salary) : 'Not provided'}</td><td><strong>${player.capHit ? formatMoney(player.capHit) : 'Not provided'}</strong></td></tr>`).join('')}</tbody></table></div></article></div>`;
  }

  function renderTeamTradeHistory(team) {
    const rows = window.FGC_TRADE?.getTeamTradeHistory?.(team.id) || [];
    return `<div class="team-trade-history-view"><div class="section-heading"><div><span class="eyebrow">Permanent franchise transaction record</span><h2>${escapeHtml(team.fullName)} Trade History</h2><p>Committee-approved Franchise HQ transactions involving this team.</p></div><span class="pill pill--neutral">${rows.length} trade${rows.length===1?'':'s'}</span></div>${rows.length?`<div class="team-trade-history-list">${rows.map(row=>{const partners=row.teamIds.filter(id=>id!==team.id).map(id=>teamById(id)?.fullName||id).join(', ');return `<button type="button" class="team-trade-history-row card" ${row.kind==='multi'?`data-route="trade-center/multi-${escapeHtml(row.id)}"`:`data-route="trade-center/${escapeHtml(row.id)}"`}><span><strong>Trade #${escapeHtml(row.id)}</strong><small>${escapeHtml(row.date||'Date unavailable')} · ${escapeHtml(partners||'League transaction')}</small><em>${escapeHtml(row.summary||'No asset summary available')}</em></span><span class="pill pill--success">Approved</span></button>`}).join('')}</div>`:`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No completed trade history</h3><p>This franchise has not appeared in an approved Franchise HQ trade record.</p></div></article>`}</div>`;
  }

  function renderPlayers() {
    const sourceTeams = (window.FranchiseHQ?.leagueData?.current?.()?.teams || []).map(team => rosterTeamView(team.id)).filter(Boolean);
    const positions = [...new Set((rosterService()?.searchPlayers?.('') || []).map(player => player.position).filter(Boolean))].sort();
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">League Data roster directory</span><h1>Players</h1><p>Search the league by player name, team, position, status, development trait, age, and overall rating.</p></div><div class="heading-actions"><button class="button button--ghost" data-player-clear-filters><svg><use href="#icon-refresh"></use></svg>Clear filters</button></div></div>
      <div class="filter-bar roster-filter-bar">
        <label class="field field--grow"><span>Player search</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-player-search value="${escapeHtml(state.playerSearch)}" placeholder="Search player name, team, or position..." /></div></label>
        <label class="field"><span>Position</span><select data-player-position><option value="All">All</option>${positions.map(pos=>`<option value="${pos}" ${state.playerPosition===pos?'selected':''}>${pos}</option>`).join('')}</select></label>
        <label class="field"><span>Team</span><select data-player-team><option value="All">All teams</option><option value="__free_agents__" ${state.playerTeam==='__free_agents__'?'selected':''}>Free Agents / Unassigned</option>${sourceTeams.map(team=>`<option value="${escapeHtml(team.id)}" ${state.playerTeam===team.id?'selected':''}>${escapeHtml(team.abbr)} — ${escapeHtml(team.fullName)}</option>`).join('')}</select></label>
        <label class="field"><span>Status</span><select data-player-status>${['All','active','injured-reserve','practice-squad','free-agent','unassigned','other'].map(value=>`<option value="${value}" ${state.playerStatus===value?'selected':''}>${value==='All'?'All statuses':titleCase(value.replace(/-/g,' '))}</option>`).join('')}</select></label>
        <label class="field"><span>Development</span><select data-player-dev>${['All','Normal','Star','Superstar','X-Factor'].map(value=>`<option value="${value}" ${state.playerDev===value?'selected':''}>${value==='All'?'All traits':value}</option>`).join('')}</select></label>
        <label class="field"><span>OVR</span><div class="range-pair"><input type="number" min="0" max="99" data-player-min-ovr value="${state.playerMinOvr}" aria-label="Minimum overall"><span>to</span><input type="number" min="0" max="99" data-player-max-ovr value="${state.playerMaxOvr}" aria-label="Maximum overall"></div></label>
        <label class="field"><span>Age</span><div class="range-pair"><input type="number" min="18" max="60" data-player-min-age value="${state.playerMinAge}" aria-label="Minimum age"><span>to</span><input type="number" min="18" max="60" data-player-max-age value="${state.playerMaxAge}" aria-label="Maximum age"></div></label>
        <label class="field"><span>Sort</span><select data-player-sort><option value="overall-desc" ${state.playerSort==='overall-desc'?'selected':''}>Overall: High to Low</option><option value="age-asc" ${state.playerSort==='age-asc'?'selected':''}>Age: Youngest</option><option value="depth-asc" ${state.playerSort==='depth-asc'?'selected':''}>Depth Order</option><option value="name-asc" ${state.playerSort==='name-asc'?'selected':''}>Name: A–Z</option></select></label>
        <span class="result-count" data-player-count></span>
      </div>
      <article class="card"><div class="table-wrap"><table class="player-directory-table"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Age</th><th>Development</th><th>Team</th><th>Status</th><th>Contract / Cap</th></tr></thead><tbody data-player-table></tbody></table></div></article>`;
    refreshPlayerTable();
  }

  function refreshPlayerTable() {
    const tbody = document.querySelector('[data-player-table]');
    if (!tbody) return;
    const service = rosterService();
    let filtered = service?.searchPlayers?.({ query: state.playerSearch }) || [];
    filtered = filtered.filter(normalized => {
      const player = rosterPlayerView(normalized);
      if (state.playerPosition !== 'All' && player.position !== state.playerPosition) return false;
      if (state.playerTeam === '__free_agents__' && !['free-agent','unassigned'].includes(player.rosterStatus)) return false;
      if (state.playerTeam !== 'All' && state.playerTeam !== '__free_agents__' && player.teamId !== state.playerTeam) return false;
      if (state.playerStatus !== 'All' && player.rosterStatus !== state.playerStatus) return false;
      if (state.playerDev !== 'All' && player.dev !== state.playerDev) return false;
      if ((player.overall ?? 0) < state.playerMinOvr || (player.overall ?? 0) > state.playerMaxOvr) return false;
      if (player.age != null && (player.age < state.playerMinAge || player.age > state.playerMaxAge)) return false;
      return true;
    });
    const sorters = {
      'overall-desc': (a,b)=>(b.overall??-1)-(a.overall??-1)||a.name.localeCompare(b.name),
      'age-asc': (a,b)=>(a.age??999)-(b.age??999)||(b.overall??-1)-(a.overall??-1),
      'depth-asc': (a,b)=>(a.depthOrder??999)-(b.depthOrder??999)||(b.overall??-1)-(a.overall??-1),
      'name-asc': (a,b)=>a.name.localeCompare(b.name)
    };
    filtered.sort(sorters[state.playerSort] || sorters['overall-desc']);
    document.querySelector('[data-player-count]').textContent = `${filtered.length.toLocaleString()} result${filtered.length===1?'':'s'}`;
    tbody.innerHTML = filtered.slice(0,300).map(normalized => {
      const player = rosterPlayerView(normalized);
      const team = rosterTeamView(player.teamId);
      return `<tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id||'')}"><td><div class="roster-player-name roster-player-name--single"><strong>${escapeHtml(player.name)}</strong></div></td><td><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall ?? '—'}</span></td><td>${player.age ?? '—'}</td><td><span class="dev-badge ${devClass(player.dev)}">${escapeHtml(player.dev)}</span></td><td>${team?`<div class="table-team">${renderTeamMark(team)}<div><strong>${escapeHtml(team.abbr)}</strong><small>${escapeHtml(team.fullName)}</small></div></div>`:'<span class="pill pill--warning">Free Agent</span>'}</td><td><span class="pill ${player.rosterStatus==='active'?'pill--success':player.rosterStatus==='injured-reserve'?'pill--warning':'pill--neutral'}">${escapeHtml(titleCase(String(player.rosterStatus||'other').replace(/-/g,' ')))}</span></td><td>${escapeHtml(formatRosterContract(player))}</td></tr>`;
    }).join('') || `<tr><td colspan="7"><div class="roadmap-state"><div class="roadmap-state__inner"><h2>No matching players</h2><p>Change or clear the roster filters to see more records from the active snapshot.</p></div></div></td></tr>`;
  }

  function renderPlayerProfile(playerId) {
    const player = playerById(playerId);
    if (!player) { setRoute('players'); return; }
    const team = teamById(player.teamId);
    const ratings = Object.entries(player.ratings).sort((a,b)=>b[1]-a[1]);
    const similar = players.filter(p=>p.id!==player.id&&p.position===player.position).sort((a,b)=>Math.abs(a.overall-player.overall)-Math.abs(b.overall-player.overall)).slice(0,4);
    const gameLog = Array.from({length:7},(_,i)=>createGameLogRow(player,i+1));
    pageContent.innerHTML = `
      <div class="page-heading"><div><button class="text-button" data-route="players"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>Player database</button></div><div class="heading-actions"><button class="button button--ghost" data-watch-player="${player.id}"><svg><use href="#icon-star"></use></svg>${window.FGC_TRADE?.isWatched?.(player.id)?'Watching':'Watch player'}</button>${window.FGC_TRADE?.getCurrentAccount?.()?.teamId===player.teamId?`<button class="button button--primary" data-toggle-player-block="${player.id}"><svg><use href="#icon-tag"></use></svg>${window.FGC_TRADE?.onBlock?.(player)?'Remove from Trade Block':'Add to Trade Block'}</button>`:`<button class="button button--primary" data-add-player-trade="${player.id}"><svg><use href="#icon-swap"></use></svg>Add to trade</button>`}</div></div>
      <section class="player-profile-hero" style="${teamStyle(team)}" data-number="${player.number}">
        <div class="player-profile-portrait">${player.initials}</div>
        <div class="player-profile-copy"><span class="eyebrow">${team.fullName} · #${player.number}</span><h1>${escapeHtml(player.name)}</h1><div class="player-profile-meta"><span class="pill pill--accent">${player.position}</span><span>${player.height} · ${player.weight} lbs</span><span>Age ${player.age}</span><span>${escapeHtml(player.college)}</span><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></div></div>
        <div class="player-profile-rating"><strong>${player.overall}</strong><span>Overall Rating</span></div>
      </section>
      <div class="team-summary-grid">
        ${summaryTile('Team',team.abbr,team.record)}${summaryTile('Age',player.age,'Years old')}${summaryTile('Development',player.dev,'Progression trait')}${summaryTile('Contract',`${player.years} yrs`,formatMoney(player.salary))}${summaryTile('Cap Hit',formatMoney(player.capHit),'Current season')}${summaryTile('Trade Status',player.tradeBlock?'On Block':'Unavailable',player.injury)}
      </div>
      <div class="content-grid">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Madden-style attributes</span><h3>Core ratings</h3></div><span class="pill pill--neutral">Mock values</span></div><div class="rating-bars">${ratings.map(([label,value])=>`<div class="rating-row"><span>${label}</span><div class="rating-track"><div class="rating-fill" style="width:${value}%"></div></div><strong>${value}</strong></div>`).join('')}</div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Season production</span><h3>2026 statistics</h3></div><button class="text-button" data-route="stats">League ranks <svg><use href="#icon-arrow"></use></svg></button></div><div class="card-body"><div class="stat-box-grid">${renderPlayerStatBoxes(player)}</div></div></article>
      </div>
      <div class="content-grid content-grid--equal" style="margin-top:18px">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Weekly performance</span><h3>Game log</h3></div></div><div class="table-wrap"><table><thead><tr><th>Week</th><th>Opponent</th><th>Primary</th><th>Secondary</th><th>Fantasy</th></tr></thead><tbody>${gameLog.map(row=>`<tr><td>Week ${row.week}</td><td>${row.opponent}</td><td><strong>${row.primary}</strong></td><td>${row.secondary}</td><td>${row.fantasy.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Market comparison</span><h3>Similar players</h3></div></div><div class="activity-list">${similar.map(p=>leaderActivity(p,`${p.position} · ${p.dev}`,p.overall)).join('')}</div></article>
      </div>`;
  }

  function renderPlayerStatBoxes(player) {
    const s = player.stats;
    if (player.position==='QB') return `${summaryStatBox('Pass Yards',s.passingYards.toLocaleString())}${summaryStatBox('Pass TD',s.passingTD)}${summaryStatBox('INT',s.interceptions)}${summaryStatBox('Comp %',percent(s.compPct))}`;
    if (['RB','FB'].includes(player.position)) return `${summaryStatBox('Rush Yards',s.rushingYards.toLocaleString())}${summaryStatBox('Rush TD',s.rushingTD)}${summaryStatBox('Receptions',s.receptions)}${summaryStatBox('Rec Yards',s.receivingYards)}`;
    if (['WR','TE'].includes(player.position)) return `${summaryStatBox('Receptions',s.receptions)}${summaryStatBox('Rec Yards',s.receivingYards.toLocaleString())}${summaryStatBox('Rec TD',s.receivingTD)}${summaryStatBox('Yards / Catch',s.yardsPerCatch.toFixed(1))}`;
    if (defensePositions.includes(player.position)) return `${summaryStatBox('Tackles',s.tackles)}${summaryStatBox('Sacks',s.sacks.toFixed(1))}${summaryStatBox('Interceptions',s.interceptions)}${summaryStatBox('Forced Fumbles',s.forcedFumbles)}`;
    if (player.position==='K') return `${summaryStatBox('FG Made',s.fgm)}${summaryStatBox('FG Attempts',s.fga)}${summaryStatBox('FG %',percent(s.fgPct))}${summaryStatBox('Long',s.long)}`;
    return `${summaryStatBox('Punts',s.punts)}${summaryStatBox('Average',s.average.toFixed(1))}${summaryStatBox('Inside 20',s.inside20)}${summaryStatBox('Long',s.long)}`;
  }

  function createGameLogRow(player, week) {
    const teamGames = schedule[week-1].games;
    const game = teamGames.find(g=>g.homeId===player.teamId||g.awayId===player.teamId);
    const opponentId = game.homeId===player.teamId?game.awayId:game.homeId;
    const opponent = teamById(opponentId);
    const base = seededNumber(`${player.id}-week-${week}`,1,100);
    if (player.position==='QB') return { week, opponent:opponent.abbr, primary:`${170+base*3} YDS`, secondary:`${1+base%4} TD · ${base%3} INT`, fantasy:12+base/5 };
    if (['RB','FB'].includes(player.position)) return { week, opponent:opponent.abbr, primary:`${35+base*2} RUSH`, secondary:`${base%3} TD · ${base%5} REC`, fantasy:7+base/6 };
    if (['WR','TE'].includes(player.position)) return { week, opponent:opponent.abbr, primary:`${3+base%8} REC`, secondary:`${40+base*2} YDS · ${base%2} TD`, fantasy:6+base/7 };
    if (defensePositions.includes(player.position)) return { week, opponent:opponent.abbr, primary:`${3+base%9} TKL`, secondary:`${(base%25)/10} SCK · ${base%2} INT`, fantasy:4+base/8 };
    return { week, opponent:opponent.abbr, primary:`${1+base%4} FGM`, secondary:`${base%2} XP`, fantasy:3+base/10 };
  }

  function standingsService() {
    return window.FranchiseHQ?.modules?.league?.standings || window.FranchiseHQ?.leagueStandings || null;
  }

  function renderStandings() {
    const service=standingsService();
    if(!service){pageContent.innerHTML='<div class="empty-state"><h2>Standings unavailable</h2><p>The standings service has not loaded.</p></div>';return;}
    const season=scheduleService()?.getSeason?.()||{id:leagueYear(),currentWeek:state.scheduleWeek};
    const tabs = [['division','Division'],['conference','Conference'],['league','League'],['playoffs','Playoff Picture'],['confidence','Confidence Pool']];
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Season ${season.id} · Through Week ${season.currentWeek}</span><h1>Standings</h1><p>League races and Confidence Pool rankings powered by completed game results.</p></div><div class="heading-actions"><div class="segmented-tabs standings-primary-tabs">${tabs.map(([key,label])=>`<button data-standings-view="${key}" class="${state.standingsView===key?'is-active':''}">${label}</button>`).join('')}</div></div></div>
      <div data-standings-content>${renderStandingsContent()}</div>`;
  }

  function renderStandingsContent() {
    const service=standingsService();
    if(state.standingsView==='confidence') return renderConfidenceStandings();
    if (state.standingsView==='league') return renderStandingsTable(service.getStandings(),true,true);
    if (state.standingsView==='conference') {const groups=service.getConferenceStandings();return `<div class="content-grid content-grid--equal">${['AFC','NFC'].map(conf=>`<article class="card"><div class="card-header"><div><span class="eyebrow">Conference rankings</span><h3>${conf}</h3></div></div>${renderStandingsTable(groups[conf]||[],false,true)}</article>`).join('')}</div>`;}
    if (state.standingsView==='playoffs') return renderPlayoffPicture();
    const groups=service.getDivisionStandings();
    return `<div class="division-grid">${Object.entries(groups).map(([name,group])=>`<article class="card division-card"><div class="card-header"><div><span class="eyebrow">${name.split(' ')[0]}</span><h3>${name.split(' ').slice(1).join(' ')}</h3></div><span class="pill pill--neutral">${group[0]?.record||'0-0'} leader</span></div>${renderStandingsTable(group,false,false)}</article>`).join('')}</div>`;
  }

  function renderStandingsTable(group, wrapped=true, seeded=false) {
    const table = `<div class="table-wrap"><table class="standings-service-table"><thead><tr>${seeded?'<th>Rank</th>':''}<th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>DIV</th><th>CONF</th><th>PF</th><th>PA</th><th>DIFF</th><th>STRK</th></tr></thead><tbody>${group.map((row,index)=>{const team=teamById(row.teamId)||{};return `<tr class="clickable-row" data-team-id="${row.teamId}">${seeded?`<td><span class="seed">${row.leagueRank||row.conferenceRank||index+1}</span></td>`:''}<td><div class="table-team">${renderTeamMark(team)}<div><strong>${escapeHtml(row.team||team.fullName||row.teamId)}</strong><small>${row.conference} ${row.division}</small></div></div></td><td><strong>${row.wins}</strong></td><td>${row.losses}</td><td>${row.ties}</td><td>${Number(row.winPct).toFixed(3).replace(/^0/,'')}</td><td>${row.divisionRecord}</td><td>${row.conferenceRecord}</td><td>${row.pointsFor}</td><td>${row.pointsAgainst}</td><td class="${row.pointDifferential>=0?'streak--win':'streak--loss'}">${row.pointDifferential>=0?'+':''}${row.pointDifferential}</td><td><span class="streak ${String(row.streak).startsWith('W')?'streak--win':String(row.streak).startsWith('L')?'streak--loss':''}">${row.streak}</span></td></tr>`}).join('')}</tbody></table></div>`;
    return wrapped?`<article class="card">${table}</article>`:table;
  }

  function renderPlayoffPicture() {
    const picture=standingsService().getPlayoffPicture();
    return `<div class="playoff-grid">${['AFC','NFC'].map(conf=>{const data=picture[conf]||{seeds:[],inHunt:[]};return `<article class="card"><div class="card-header"><div><span class="eyebrow">Projected postseason</span><h3>${conf} Playoff Picture</h3></div><span class="pill pill--accent">7 teams qualify</span></div><div class="playoff-bracket">${data.seeds.map(row=>{const team=teamById(row.teamId);return `<div class="playoff-seed" data-team-id="${row.teamId}"><span class="seed">${row.seed}</span>${renderTeamMark(team)}<div><strong>${escapeHtml(row.team)}</strong><small>${row.type}</small></div><strong>${row.record}</strong></div>`}).join('')}${data.inHunt.length?`<div class="playoff-cutline-label">In the hunt</div>${data.inHunt.map(row=>{const team=teamById(row.teamId);return `<div class="playoff-seed playoff-seed--hunt" data-team-id="${row.teamId}"><span class="seed">—</span>${renderTeamMark(team)}<div><strong>${escapeHtml(row.team)}</strong><small>${row.pointDifferential>=0?'+':''}${row.pointDifferential} differential</small></div><strong>${row.record}</strong></div>`}).join('')}`:''}</div></article>`}).join('')}</div>`;
  }

  function renderConfidenceStandings() {
    const service=standingsService();
    const seasonRows=service.getConfidencePoolStandings();
    const maxWeek=Math.max(1,...(scheduleService()?.getAllGames?.()||[]).map(g=>Number(g.week)||1));
    const weeklyRows=service.getConfidencePoolWeek(state.confidenceStandingsWeek);
    const rows=state.confidenceStandingsView==='weekly'?weeklyRows:seasonRows;
    return `<div class="confidence-standings-shell">
      <article class="card confidence-standings-toolbar"><div><span class="eyebrow">Confidence Pool</span><h3>${state.confidenceStandingsView==='weekly'?`Week ${state.confidenceStandingsWeek} Results`:'Season Standings'}</h3><p>${state.confidenceStandingsView==='weekly'?'Compare points earned from completed games in the selected week.':'Track total points, correct picks, weekly wins, and remaining scoring potential.'}</p></div><div class="confidence-standings-controls"><div class="segmented-tabs"><button data-confidence-standings-view="season" class="${state.confidenceStandingsView==='season'?'is-active':''}">Season</button><button data-confidence-standings-view="weekly" class="${state.confidenceStandingsView==='weekly'?'is-active':''}">Weekly</button></div>${state.confidenceStandingsView==='weekly'?`<div class="week-nav compact"><button class="icon-button icon-button--small" data-confidence-standings-week="-1" ${state.confidenceStandingsWeek<=1?'disabled':''}>‹</button><strong>Week ${state.confidenceStandingsWeek}</strong><button class="icon-button icon-button--small" data-confidence-standings-week="1" ${state.confidenceStandingsWeek>=maxWeek?'disabled':''}>›</button></div>`:''}</div></article>
      <article class="card"><div class="table-wrap"><table class="confidence-standings-table"><thead><tr>${state.confidenceStandingsView==='weekly'?'<th>Rank</th><th>Owner</th><th>Team</th><th>Points</th><th>Correct</th><th>Final Games</th><th>Status</th>':'<th>Rank</th><th>Owner</th><th>Team</th><th>Total Points</th><th>Correct</th><th>Weeks Won</th><th>Average</th><th>Best Week</th><th>Max Remaining</th><th>Status</th>'}</tr></thead><tbody>${rows.map(row=>{const team=teamById(row.teamId);return `<tr><td><span class="seed">${row.rank}</span></td><td><strong>${escapeHtml(row.name)}</strong></td><td>${team?`<div class="table-team">${renderTeamMark(team)}<span>${team.abbr}</span></div>`:'—'}</td><td><strong>${state.confidenceStandingsView==='weekly'?row.points:row.totalPoints}</strong></td><td>${row.correctPicks}</td>${state.confidenceStandingsView==='weekly'?`<td>${row.finalGames}</td>`:`<td>${row.weeksWon}</td><td>${Number(row.averageWeeklyScore).toFixed(1)}</td><td>${row.bestWeek}</td><td>${row.remainingPossiblePoints}</td>`}<td><span class="pill ${row.status==='submitted'?'pill--success':'pill--neutral'}">${titleCase(row.status||'draft')}</span></td></tr>`}).join('')||`<tr><td colspan="${state.confidenceStandingsView==='weekly'?7:10}">No Confidence Pool entries have been saved yet.</td></tr>`}</tbody></table></div></article>
    </div>`;
  }

  function statisticsService() { return window.FranchiseHQ?.modules?.league?.statistics || window.FranchiseHQ?.leagueStatistics || null; }

  const statsColumnMap = {
    passing:[['games','GP'],['completions','CMP'],['attempts','ATT'],['compPct','CMP%'],['passingYards','YDS'],['passingTD','TD'],['interceptions','INT'],['yardsPerAttempt','Y/A'],['passerRating','RATE']],
    rushing:[['games','GP'],['carries','CAR'],['rushingYards','YDS'],['rushingTD','TD'],['yardsPerCarry','Y/C'],['fumbles','FUM'],['longRush','LONG']],
    receiving:[['games','GP'],['targets','TGT'],['receptions','REC'],['receivingYards','YDS'],['receivingTD','TD'],['yardsPerCatch','Y/R'],['drops','DROP'],['longReception','LONG']],
    defense:[['games','GP'],['tackles','TKL'],['tacklesForLoss','TFL'],['sacks','SACK'],['defensiveInterceptions','INT'],['passDeflections','PD'],['forcedFumbles','FF'],['fumbleRecoveries','FR'],['defensiveTD','TD']],
    kicking:[['games','GP'],['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['longFieldGoal','LONG'],['xpm','XPM'],['xpa','XPA'],['points','PTS']],
    punting:[['games','GP'],['punts','PUNTS'],['average','AVG'],['netAverage','NET'],['inside20','IN20'],['touchbacks','TB'],['longPunt','LONG']]
  };

  function renderStats() {
    const service=statisticsService();
    if(!service){ pageContent.innerHTML='<article class="card"><div class="card-body"><h2>Statistics unavailable</h2><p>The Statistics service has not loaded.</p></div></article>'; return; }
    const categories=[['passing','Passing'],['rushing','Rushing'],['receiving','Receiving'],['defense','Defense'],['kicking','Kicking'],['punting','Punting'],['team','Team Rankings']];
    const maxWeek=Math.max(1,...(scheduleService()?.getAllGames?.()||[]).map(game=>Number(game.week)||1));
    const teamOptions=['<option value="All">All teams</option>',...teams.map(team=>`<option value="${team.id}" ${state.statsTeam===team.id?'selected':''}>${escapeHtml(team.fullName)}</option>`)].join('');
    const content=state.statsCategory==='team'?renderTeamStatisticsLeaderboard(service):renderPlayerStatisticsLeaderboard(service);
    pageContent.innerHTML=`
      <div class="page-heading"><div><span class="eyebrow">League performance</span><h1>Stats & Leaders</h1><p>Service-backed season totals, weekly leaders, specialists, and team rankings.</p></div></div>
      <div class="stats-category-tabs segmented-tabs stats-category-tabs--wrap">${categories.map(([key,label])=>`<button data-stats-category="${key}" class="${state.statsCategory===key?'is-active':''}">${label}</button>`).join('')}</div>
      <article class="card stats-filter-card"><div class="stats-filter-grid">
        <label><span>View</span><select data-stats-scope ${state.statsCategory==='team'?'disabled':''}><option value="season" ${state.statsScope==='season'?'selected':''}>Full Season</option><option value="week" ${state.statsScope==='week'?'selected':''}>Weekly Leaders</option></select></label>
        <label><span>Week</span><select data-stats-week ${state.statsScope!=='week'||state.statsCategory==='team'?'disabled':''}>${Array.from({length:maxWeek},(_,i)=>`<option value="${i+1}" ${state.statsWeek===i+1?'selected':''}>Week ${i+1}</option>`).join('')}</select></label>
        <label><span>Team</span><select data-stats-team ${state.statsCategory==='team'?'disabled':''}>${teamOptions}</select></label>
        <label><span>Minimum games</span><select data-stats-min-games ${state.statsCategory==='team'?'disabled':''}>${[0,1,3,5,8].map(n=>`<option value="${n}" ${state.statsMinimumGames===n?'selected':''}>${n||'Any'}</option>`).join('')}</select></label>
      </div></article>
      ${content}`;
  }

  function renderPlayerStatisticsLeaderboard(service){
    const category=state.statsCategory;
    const supportedFields=service.getSupportedFields?.(category)||null;
    const columns=(statsColumnMap[category]||statsColumnMap.passing).filter(([key])=>!supportedFields||supportedFields.includes(key));
    const sortKey=state.statsSortKey||({passing:'passingYards',rushing:'rushingYards',receiving:'receivingYards',defense:'tackles',kicking:'points',punting:'average'}[category]);
    const options={teamId:state.statsTeam,minimumGames:state.statsMinimumGames,sortKey,direction:state.statsSortDirection,limit:100};
    const rows=state.statsScope==='week'?service.getWeeklyLeaders(state.statsWeek,category,options):service.getLeagueLeaders(category,options);
    const leaders=rows.slice(0,3);
    return `<div class="leader-grid">${leaders.map((row,index)=>renderLeaderCard({player:playerById(row.id)||row,value:formatStatValue(sortKey,row.stats?.[sortKey]),label:(columns.find(([key])=>key===sortKey)||columns[0])[1]},index+1,{})).join('')}</div>
      <article class="card"><div class="card-header"><div><span class="eyebrow">${state.statsScope==='week'?`Week ${state.statsWeek}`:'Season'} leaderboard</span><h3>${titleCase(category)} leaders</h3></div><span class="pill pill--neutral">${rows.length} players</span></div><div class="table-wrap"><table class="statistics-table"><thead><tr><th>Rank</th><th>Player</th><th>Team</th>${columns.map(([key,label])=>`<th><button class="stat-sort-button ${sortKey===key?'is-active':''}" data-stats-sort="${key}">${label}${sortKey===key?(state.statsSortDirection==='desc'?' ↓':' ↑'):''}</button></th>`).join('')}<th>OVR</th></tr></thead><tbody>${rows.map(row=>`<tr class="clickable-row" data-player-id="${escapeHtml(row.id)}"><td><span class="seed">${row.rank}</span></td><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.position)}</small></td><td>${escapeHtml(row.teamAbbr||'FA')}</td>${columns.map(([key])=>`<td class="cell-number">${formatStatValue(key,row.stats?.[key])}</td>`).join('')}<td><span class="rating-chip">${row.overall||'—'}</span></td></tr>`).join('')||`<tr><td colspan="${columns.length+4}">No ${category} statistics are available for these filters.</td></tr>`}</tbody></table></div></article>`;
  }

  function renderTeamStatisticsLeaderboard(service){
    const options=[['scoringOffense','Scoring Offense'],['scoringDefense','Scoring Defense'],['totalOffense','Total Offense'],['passingOffense','Passing Offense'],['rushingOffense','Rushing Offense'],['turnoverDifferential','Turnover Differential'],['sacks','Sacks'],['pointDifferential','Point Differential']];
    const rows=service.getTeamRankings(state.statsTeamCategory);
    return `<article class="card stats-team-ranking-toolbar"><div><span class="eyebrow">Team comparison</span><h3>League Team Rankings</h3></div><label><span>Ranking category</span><select data-stats-team-category>${options.map(([key,label])=>`<option value="${key}" ${state.statsTeamCategory===key?'selected':''}>${label}</option>`).join('')}</select></label></article>
      <article class="card"><div class="table-wrap"><table class="statistics-table"><thead><tr><th>Rank</th><th>Team</th><th>Games</th><th>Value</th><th>League Average</th></tr></thead><tbody>${rows.map(row=>{const team=teamById(row.teamId);return `<tr class="clickable-row" data-team-id="${row.teamId}"><td><span class="seed">${row.rank}</span></td><td><div class="table-team">${team?renderTeamMark(team):''}<strong>${escapeHtml(row.team)}</strong></div></td><td>${row.games}</td><td><strong>${Number(row.value).toLocaleString(undefined,{maximumFractionDigits:1})}</strong></td><td>${Number(row.leagueAverage).toLocaleString(undefined,{maximumFractionDigits:1})}</td></tr>`}).join('')}</tbody></table></div></article>`;
  }

  function formatStatValue(key,value) {
    if (value===undefined||value===null) return '—';
    if (['compPct','fgPct'].includes(key)) return percent(value);
    if (['sacks','fantasy','yardsPerCatch'].includes(key)) return Number(value).toFixed(1);
    return Number(value).toLocaleString();
  }

  function renderLeaderCard(leader,rank,data) {
    if (leader.team) {
      const team=leader.team;
      return `<article class="leader-card card" data-rank="${rank}" data-team-id="${team.id}"><div class="leader-card__top"><span class="rank-number">#${rank}</span><span class="pill pill--neutral">${team.record}</span></div><div class="leader-card__player">${renderTeamMark(team,'team-logo')}<div><strong>${team.fullName}</strong><span>${team.conference} ${team.division}</span></div></div><strong class="leader-value">${leader.value}<small>${leader.label}</small></strong></article>`;
    }
    const player=leader.player; const team=teamById(player.teamId);
    return `<article class="leader-card card" data-rank="${rank}" data-player-id="${player.id}"><div class="leader-card__top"><span class="rank-number">#${rank}</span><span class="pill pill--neutral">${player.position}</span></div><div class="leader-card__player"><span class="player-avatar" style="${teamStyle(team)}">${player.initials}</span><div><strong>${escapeHtml(player.name)}</strong><span>${team.abbr} · ${player.overall} OVR</span></div></div><strong class="leader-value">${leader.value}<small>${leader.label}</small></strong></article>`;
  }

  function scheduleService() { return window.FranchiseHQ?.modules?.league?.games || window.FranchiseHQ?.leagueGames || null; }

  function confidencePoolModel() {
    const service=scheduleService();
    if(!service) return null;
    const current=window.FGC_TRADE?.getCurrentAccount?.() || {id:'commissioner',handle:'Commissioner',teamId:'dal'};
    return {service,current,config:service.confidence.config(),entry:service.confidence.getEntry(current.id)};
  }

  function renderConfidencePicks() {
    const model=confidencePoolModel();
    if(!model) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Confidence Pool loading</h3><p>The Season & Games service is still initializing.</p></div></article>`;
    const {service,current,config,entry}=model;
    const week=service.getWeek(state.confidenceWeek);
    const weekOpen=service.confidence.isWeekOpen(state.confidenceWeek,current.id);const weekSubmitted=Boolean(entry.submittedWeeks?.[String(state.confidenceWeek)]);const locked=!weekOpen;
    const validation=service.confidence.validateEntry(current.id);
    return `<div class="confidence-pool-shell">
      <article class="card confidence-pool-status"><div><span class="eyebrow">Season ${config.season} Confidence Pool</span><h2>${weekSubmitted?`Week ${state.confidenceWeek} Submitted`:locked?`Week ${state.confidenceWeek} Closed`:`Week ${state.confidenceWeek} Open`}</h2><p>Submit each week separately while the Commissioner has that week open. Confidence values reset within each week.</p></div><div class="confidence-status-actions"><span class="pill ${locked?'pill--warning':'pill--success'}">${locked?'Locked':'Open'}</span><strong>${validation.picked} / ${validation.totalGames}</strong><small>games picked</small></div></article>
      <div class="week-control confidence-week-control"><div class="week-nav"><button class="icon-button icon-button--small" data-confidence-week-change="-1" ${state.confidenceWeek<=1?'disabled':''}><svg style="transform:rotate(90deg)"><use href="#icon-chevron"></use></svg></button><div class="week-label"><strong>Week ${state.confidenceWeek}</strong><span>${week.games.length} confidence values</span></div><button class="icon-button icon-button--small" data-confidence-week-change="1" ${state.confidenceWeek>=schedule.length?'disabled':''}><svg style="transform:rotate(-90deg)"><use href="#icon-chevron"></use></svg></button></div><div class="confidence-week-actions"><button class="button button--ghost" data-confidence-clear-week="${state.confidenceWeek}" ${locked?'disabled':''}>Clear Week</button><button class="button button--ghost button--danger-quiet" data-confidence-clear-season ${locked?'disabled':''}>Clear Season</button><button class="button button--ghost" data-confidence-auto="${state.confidenceWeek}" ${locked?'disabled':''}>Auto-Pick & Assign Week</button><button class="button button--primary" data-confidence-submit-week="${state.confidenceWeek}" ${locked?'disabled':''}>${weekSubmitted?'Week Submitted':'Submit Week'}</button></div></div>
      <div class="confidence-pick-list">${week.games.map(game=>{const away=teamById(game.awayId),home=teamById(game.homeId),pick=entry.picks?.[game.id]||{};return `<article class="card confidence-pick-card"><div class="confidence-matchup"><span>Week ${game.week}</span><strong>${away.abbr} @ ${home.abbr}</strong><small>${game.day} · ${game.time}</small></div><div class="confidence-team-choice"><button type="button" data-confidence-team="${game.id}:${away.id}" class="${pick.selectedTeamId===away.id?'is-selected':''}" ${locked?'disabled':''}>${renderTeamMark(away,'mini-team')}<span>${away.abbr}</span></button><button type="button" data-confidence-team="${game.id}:${home.id}" class="${pick.selectedTeamId===home.id?'is-selected':''}" ${locked?'disabled':''}>${renderTeamMark(home,'mini-team')}<span>${home.abbr}</span></button></div><label class="field confidence-value"><span>Confidence</span><select data-confidence-value="${game.id}" ${locked?'disabled':''}><option value="">Select</option>${week.games.map((_,i)=>`<option value="${i+1}" ${Number(pick.confidence)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label></article>`}).join('')}</div>
    </div>`;
  }

  function renderConfidenceResults() {
    const service=scheduleService();
    const board=service?.confidence?.leaderboard?.()||[];
    return `<article class="card confidence-results"><div class="card-header"><div><span class="eyebrow">Season leaderboard preview</span><h3>Confidence Pool Results</h3></div></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Owner</th><th>Team</th><th>Points</th><th>Correct</th><th>Status</th></tr></thead><tbody>${board.map((row,i)=>`<tr><td><strong>#${i+1}</strong></td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(teamById(row.teamId)?.abbr||'—')}</td><td><strong>${row.totalPoints}</strong></td><td>${row.correctPicks}</td><td><span class="pill ${row.status==='submitted'?'pill--success':'pill--neutral'}">${titleCase(row.status)}</span></td></tr>`).join('')||`<tr><td colspan="6">No Confidence Pool entries have been saved yet.</td></tr>`}</tbody></table></div></article>`;
  }

  function renderSchedule() {
    const service=scheduleService();
    const maxWeek=service?.getSeason?.().currentWeek ? schedule.length : schedule.length;
    const week = service?.getWeek?.(state.scheduleWeek) || schedule.find(item=>item.week===state.scheduleWeek) || schedule[0];
    const filtered = week.games.filter(game=>state.scheduleTeam==='All'||game.homeId===state.scheduleTeam||game.awayId===state.scheduleTeam);
    const pool=service?.confidence?.config?.();
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Season 4 calendar</span><h1>Schedule & Confidence Pool</h1><p>Review the league schedule, complete full-season predictions, and follow Confidence Pool results.</p></div></div>
      <div class="schedule-section-tabs segmented-tabs"><button data-schedule-section="schedule" class="${state.scheduleSection==='schedule'?'is-active':''}">League Schedule</button><button data-schedule-section="picks" class="${state.scheduleSection==='picks'?'is-active':''}">My Season Picks</button><button data-schedule-section="results" class="${state.scheduleSection==='results'?'is-active':''}">Pool Results</button>${pool?`<span class="pill ${pool.status==='open'?'pill--success':'pill--warning'}">Picks ${titleCase(pool.status)}</span>`:''}</div>
      ${state.scheduleSection==='picks'?renderConfidencePicks():state.scheduleSection==='results'?renderConfidenceResults():`<div class="week-control week-control--compact"><div class="week-nav"><button class="icon-button icon-button--small" data-week-change="-1" ${state.scheduleWeek===1?'disabled':''}><svg style="transform:rotate(90deg)"><use href="#icon-chevron"></use></svg></button><div class="week-label"><strong>Week ${state.scheduleWeek}</strong><span>${state.scheduleWeek<8?'Completed slate':state.scheduleWeek===8?'Current league week':'Upcoming slate'}</span></div><button class="icon-button icon-button--small" data-week-change="1" ${state.scheduleWeek===maxWeek?'disabled':''}><svg style="transform:rotate(-90deg)"><use href="#icon-chevron"></use></svg></button></div><label class="field"><span>Filter team</span><select data-schedule-team><option value="All">All teams</option>${teams.map(team=>`<option value="${team.id}" ${state.scheduleTeam===team.id?'selected':''}>${team.abbr} · ${team.fullName}</option>`).join('')}</select></label></div><div class="schedule-grid">${filtered.map(game=>renderGameCard(game)).join('')}</div>`}`;
  }

  function renderGameCard(game, perspectiveTeamId=null) {
    const away=teamById(game.awayId); const home=teamById(game.homeId);
    const isFinal=game.status==='final'; const isLive=game.status==='live';
    const winnerId=isFinal||isLive?(game.awayScore>game.homeScore?away.id:home.id):null;
    return `<article class="game-card card" data-game-id="${game.id}">
      <div class="game-card__meta"><span>WEEK ${game.week} · ${game.day}</span><span class="pill ${isFinal?'pill--neutral':isLive?'pill--danger':'pill--accent'}">${isFinal?'Final':isLive?'Live':game.time}</span></div>
      <div class="game-card__body">
        <div class="game-team">${renderTeamMark(away)}<div><strong>${away.fullName}</strong><span>${away.record}${perspectiveTeamId===away.id?' · Your team':''}</span></div></div>
        ${isFinal||isLive?`<div class="game-score"><strong class="${winnerId===away.id?'streak--win':''}">${game.awayScore}</strong><span>–</span><strong class="${winnerId===home.id?'streak--win':''}">${game.homeScore}</strong></div>`:`<div class="game-time"><strong>${game.time}</strong><span>${game.network}</span></div>`}
        <div class="game-team game-team--away"><div><strong>${home.fullName}</strong><span>${home.record}${perspectiveTeamId===home.id?' · Your team':''}</span></div>${renderTeamMark(home)}</div>
      </div>
      <div class="game-card__footer"><span>${game.stadium}</span><span>${isLive?'Live game data':isFinal?'View game summary':'Matchup preview'}</span></div>
    </article>`;
  }

  function renderNews() {
    const dynamicNews = window.FGC_TRADE?.getApprovedNews?.() || [];
    const allNews = [...dynamicNews, ...newsArticles];
    const categories=['All',...new Set(allNews.map(a=>a.category))];
    const filtered=allNews.filter(a=>state.newsCategory==='All'||a.category===state.newsCategory);
    const featured=filtered.find(a=>a.featured)||filtered[0]||allNews[0];
    const rest=filtered.filter(a=>a.id!==featured.id);
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Stories, announcements, and activity</span><h1>League News</h1><p>Approved trades, game recaps, power rankings, awards, commissioner updates, and automated league stories.</p></div><div class="heading-actions"><button class="button button--primary" data-demo-toast="The commissioner news editor will be connected after authentication and database setup."><svg><use href="#icon-news"></use></svg>Create post</button></div></div>
      <div class="filter-bar"><div class="segmented-tabs">${categories.map(category=>`<button data-news-category="${escapeHtml(category)}" class="${state.newsCategory===category?'is-active':''}">${escapeHtml(category)}</button>`).join('')}</div><span class="result-count">${filtered.length} stories</span></div>
      <article class="featured-news" data-news-id="${featured.id}"><div class="featured-news__content"><span class="pill pill--accent">${escapeHtml(featured.category)}</span><h2>${escapeHtml(featured.title)}</h2><p>${escapeHtml(featured.excerpt)}</p><div class="news-meta"><span>${escapeHtml(featured.author)}</span><span>•</span><span>${escapeHtml(featured.time)}</span><span>•</span><span>${escapeHtml(featured.read)}</span></div></div></article>
      <div class="news-grid">${rest.map(article=>renderNewsCard(article)).join('')}</div>`;
  }

  function renderNewsCard(article) {
    return `<article class="news-card card" data-news-id="${article.id}"><div class="news-card__art" data-mark="${escapeHtml(article.mark)}"><span class="pill pill--neutral">${escapeHtml(article.category)}</span></div><div class="news-card__body"><span class="eyebrow">${escapeHtml(article.time)}</span><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt)}</p><div class="news-card__footer"><span>${escapeHtml(article.author)}</span><span>${escapeHtml(article.read)}</span></div></div></article>`;
  }

  function renderDesignSystem() {
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Milestone 1A foundation</span><h1>Design System</h1><p>The reusable foundation now supports every interactive league page included in Milestone 1B.</p></div><div class="heading-actions"><button class="button button--primary" data-open-style-panel><svg><use href="#icon-palette"></use></svg>Preview appearance</button></div></div>
      <div class="design-section"><div class="section-heading"><div><span class="section-number">01</span><h2>Foundation</h2></div><p>Dark stadium-inspired surfaces with a replaceable accent system and responsive typography.</p></div><div class="foundation-grid"><article class="card"><div class="card-header"><div><span class="eyebrow">Color</span><h3>Core palette</h3></div></div><div class="swatch-grid"><div><span class="swatch swatch--canvas"></span><strong>Canvas</strong><small>#0B0E14</small></div><div><span class="swatch swatch--surface"></span><strong>Surface</strong><small>#131821</small></div><div><span class="swatch swatch--surface2"></span><strong>Raised</strong><small>#1A202B</small></div><div><span class="swatch swatch--accent"></span><strong>Accent</strong><small>${accents[state.accent].hex.toUpperCase()}</small></div><div><span class="swatch swatch--success"></span><strong>Success</strong><small>#39D98A</small></div><div><span class="swatch swatch--danger"></span><strong>Danger</strong><small>#FF5C6C</small></div></div></article><article class="card"><div class="card-header"><div><span class="eyebrow">Type</span><h3>Typography</h3></div></div><div class="type-samples"><div class="type-sample type-sample--display">League Command Center</div><div class="type-sample type-sample--heading">Trade Committee Review</div><div class="type-sample type-sample--body">Built for fast scanning, dense sports information, and clear transaction decisions.</div></div></article></div></div>
      <div class="design-section"><div class="section-heading"><div><span class="section-number">02</span><h2>Components</h2></div><p>Shared components now power league pages, profiles, filters, tables, schedules, and news.</p></div><article class="card"><div class="component-showcase"><div class="component-row"><div class="component-label"><strong>Actions</strong><small>Primary, secondary, quiet, and destructive</small></div><div class="component-demo"><button class="button button--primary">Primary action</button><button class="button button--secondary">Secondary</button><button class="button button--ghost">Ghost</button><button class="button button--danger">Decline</button></div></div><div class="component-row"><div class="component-label"><strong>Status</strong><small>Workflow and health labels</small></div><div class="component-demo"><span class="pill pill--success">Approved</span><span class="pill pill--warning">Pending</span><span class="pill pill--danger">Rejected</span><span class="pill pill--accent">Private</span><span class="pill pill--neutral">Mock data</span></div></div><div class="component-row"><div class="component-label"><strong>Team identity</strong><small>Color-aware fallback marks</small></div><div class="component-demo">${teams.slice(0,7).map(team=>renderTeamMark(team,'team-logo')).join('')}</div></div></div></article></div>`;
  }

  function renderRoadmap(route) {
    const data = {
      'trade-center': { title:'Private Trade Center', eyebrow:'Milestone 1C', icon:'icon-swap', copy:'Saved drafts, owner-to-owner negotiation rooms, revisions, acceptance, committee review, and final decisions will be built after the league-view experience.', items:['Private draft builder','Owner negotiation room','Versioned revisions','Committee submission','Approval announcements','Rejection feedback'] },
      'trade-block': { title:'Trade Block', eyebrow:'Milestone 1C', icon:'icon-tag', copy:'Owners will advertise available players, team needs, preferred return types, and contact options without exposing private trade calculations.', items:['Player availability','Team needs','Position filters','Owner contact','Watchlist alerts','Add to trade'] },
      commissioner: { title:'Commissioner HQ', eyebrow:'Future operations milestone', icon:'icon-sliders', copy:'League member assignments, committee roles, Madden export health, calculator settings, news controls, and audit records will live here.', items:['Discord assignments','Export status','Trade rules','Committee settings','News editor','Audit log'] }
    }[route] || { title:'Coming Soon',eyebrow:'Project roadmap',icon:'icon-construction',copy:'This area is prepared for a later milestone.',items:[] };
    pageContent.innerHTML=`<div class="page-heading"><div><span class="eyebrow">${data.eyebrow}</span><h1>${data.title}</h1><p>${data.copy}</p></div></div><article class="roadmap-state card"><div class="roadmap-state__inner"><div class="roadmap-icon"><svg><use href="#${data.icon}"></use></svg></div><h2>${data.title} is next in the build plan</h2><p>${data.copy}</p><div class="roadmap-list">${data.items.map(item=>`<span><svg><use href="#icon-check"></use></svg>${item}</span>`).join('')}</div><div class="heading-actions" style="justify-content:center"><button class="button button--primary" data-route="home">Return home</button><button class="button button--ghost" data-route="design-system">View design system</button></div></div></article>`;
  }

  function gameRosterRows(teamId) {
    return players.filter(p=>p.teamId===teamId).sort((a,b)=>{
      const unitOrder=p=>offensePositions.includes(p.position)?0:defensePositions.includes(p.position)?1:2;
      return unitOrder(a)-unitOrder(b)||b.overall-a.overall||a.position.localeCompare(b.position);
    });
  }

  function compactSeasonStats(player) {
    const s=player.stats;
    if(player.position==='QB') return `${s.passingYards.toLocaleString()} YDS · ${s.passingTD} TD · ${s.interceptions} INT`;
    if(['RB','FB'].includes(player.position)) return `${s.rushingYards.toLocaleString()} RUSH · ${s.rushingTD} TD`;
    if(['WR','TE'].includes(player.position)) return `${s.receptions} REC · ${s.receivingYards.toLocaleString()} YDS`;
    if(defensePositions.includes(player.position)) return `${s.tackles} TKL · ${Number(s.sacks).toFixed(1)} SCK · ${s.interceptions} INT`;
    if(player.position==='K') return `${s.fgm}/${s.fga} FG`;
    return `${s.punts||0} PUNTS · ${Number(s.average||0).toFixed(1)} AVG`;
  }

  function renderGameRoster(team) {
    return `<div class="game-center-roster">
      <div class="game-center-roster-head">${renderTeamMark(team,'team-logo')}<span><strong>${team.fullName}</strong><small>${team.record} · ${team.ovr} OVR</small></span></div>
      <div class="game-center-player-list">
        ${gameRosterRows(team.id).map(player=>`<button type="button" data-open-player-card="${player.id}">
          <span class="gc-position">${player.position}</span>
          <span><strong>${escapeHtml(player.name)}</strong><small>${compactSeasonStats(player)}</small></span>
          <span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span>
          <span class="dev-badge ${devClass(player.dev)}">${player.dev}</span>
        </button>`).join('')}
      </div>
    </div>`;
  }

  function gameStatValue(player, game, metric, low, high) {
    const base=seededNumber(`${game.id}-${player.id}-${metric}`,low,high);
    return Math.max(0,base);
  }

  function gameStatRows(team, game, category) {
    const roster=players.filter(p=>p.teamId===team.id);
    if(category==='passing'){
      return roster.filter(p=>p.position==='QB').slice(0,2).map(p=>({
        player:p, values:[
          `${gameStatValue(p,game,'cmp',14,31)}/${gameStatValue(p,game,'att',25,43)}`,
          gameStatValue(p,game,'passyd',145,385),
          gameStatValue(p,game,'passtd',0,4),
          gameStatValue(p,game,'passint',0,2)
        ]
      }));
    }
    if(category==='rushing'){
      return roster.filter(p=>['RB','FB','QB'].includes(p.position)).slice(0,4).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'car',2,22),
          gameStatValue(p,game,'rushyd',8,142),
          gameStatValue(p,game,'rushtd',0,2),
          Number((gameStatValue(p,game,'rushavg',20,72)/10).toFixed(1))
        ]
      })).sort((a,b)=>b.values[1]-a.values[1]);
    }
    if(category==='receiving'){
      return roster.filter(p=>['WR','TE','RB'].includes(p.position)).slice(0,6).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'rec',1,10),
          gameStatValue(p,game,'recyd',8,138),
          gameStatValue(p,game,'rectd',0,2),
          gameStatValue(p,game,'targets',2,13)
        ]
      })).sort((a,b)=>b.values[1]-a.values[1]);
    }
    if(category==='defense'){
      return roster.filter(p=>defensePositions.includes(p.position)).slice(0,7).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'tkl',1,12),
          Number((gameStatValue(p,game,'sack',0,20)/10).toFixed(1)),
          gameStatValue(p,game,'defint',0,1),
          gameStatValue(p,game,'tfl',0,4)
        ]
      })).sort((a,b)=>b.values[0]-a.values[0]);
    }
    return roster.filter(p=>specialPositions.includes(p.position)).map(p=>({
      player:p,
      values:p.position==='K'
        ? [`${gameStatValue(p,game,'fgm',0,4)}/${gameStatValue(p,game,'fga',1,4)}`,`${gameStatValue(p,game,'xpm',1,5)}/${gameStatValue(p,game,'xpa',1,5)}`,gameStatValue(p,game,'longfg',31,58),'—']
        : [gameStatValue(p,game,'punts',2,7),Number((gameStatValue(p,game,'puntavg',390,512)/10).toFixed(1)),gameStatValue(p,game,'inside20',0,4),'—']
    }));
  }

  function renderGameStatTable(team, game, category, labels) {
    const rows=gameStatRows(team,game,category);
    return `<div class="game-stat-team">
      <div class="game-stat-team-head">${renderTeamMark(team,'team-logo')}<strong>${team.abbr}</strong></div>
      <div class="game-stat-table">
        <div class="game-stat-row game-stat-row--head"><span>Player</span>${labels.map(x=>`<span>${x}</span>`).join('')}</div>
        ${rows.map(row=>`<button type="button" class="game-stat-row" data-open-player-card="${row.player.id}">
          <span><strong>${escapeHtml(row.player.name)}</strong><small>${row.player.position}</small></span>
          ${row.values.map(v=>`<span>${v}</span>`).join('')}
        </button>`).join('')}
      </div>
    </div>`;
  }

  function renderCompletedGameStats(away,home,game) {
    const groups=[
      ['Passing','passing',['C/A','YDS','TD','INT']],
      ['Rushing','rushing',['CAR','YDS','TD','AVG']],
      ['Receiving','receiving',['REC','YDS','TD','TGT']],
      ['Defense','defense',['TKL','SCK','INT','TFL']],
      ['Special Teams','special',['FG/P','XP/AVG','LONG/I20','—']]
    ];
    return `<div class="completed-game-stats">
      ${groups.map(([title,key,labels])=>`<section class="game-stat-section">
        <div class="game-stat-section-title"><span class="eyebrow">Box score</span><h3>${title}</h3></div>
        <div class="game-stat-pair">${renderGameStatTable(away,game,key,labels)}${renderGameStatTable(home,game,key,labels)}</div>
      </section>`).join('')}
    </div>`;
  }

  function gameCenterSwitcher(activeGameId) {
    const currentWeek=schedule.find(w=>w.games.some(g=>g.id===activeGameId)) || schedule.find(w=>w.week===8);
    return `<div class="game-center-switcher">
      ${currentWeek.games.map(g=>{
        const a=teamById(g.awayId),h=teamById(g.homeId);
        return `<button type="button" data-game-center-switch="${g.id}" class="${g.id===activeGameId?'is-active':''}">
          <span>${a.abbr} <b>at</b> ${h.abbr}</span>
          <small>${g.status==='final'?`${g.awayScore}-${g.homeScore}`:`${g.day} · ${g.time}`}</small>
        </button>`;
      }).join('')}
    </div>`;
  }

  function gameTeamStatRows(away, home, game) {
    const final=game.status==='final';
    const make=(label,awayValue,homeValue)=>({label,awayValue,homeValue});
    if(final){
      return [
        make('Total Offense',gameStatValue(away,game,'teamoff',265,515),gameStatValue(home,game,'teamoff',265,515)),
        make('Passing Yards',gameStatValue(away,game,'teampass',150,390),gameStatValue(home,game,'teampass',150,390)),
        make('Rushing Yards',gameStatValue(away,game,'teamrush',55,205),gameStatValue(home,game,'teamrush',55,205)),
        make('First Downs',gameStatValue(away,game,'firstdowns',14,29),gameStatValue(home,game,'firstdowns',14,29)),
        make('Turnovers',gameStatValue(away,game,'turnovers',0,4),gameStatValue(home,game,'turnovers',0,4)),
        make('3rd Down',`${gameStatValue(away,game,'thirdmade',2,9)}/${gameStatValue(away,game,'thirdatt',8,15)}`,`${gameStatValue(home,game,'thirdmade',2,9)}/${gameStatValue(home,game,'thirdatt',8,15)}`),
        make('Red Zone',`${gameStatValue(away,game,'rzmade',1,5)}/${gameStatValue(away,game,'rzatt',2,6)}`,`${gameStatValue(home,game,'rzmade',1,5)}/${gameStatValue(home,game,'rzatt',2,6)}`),
        make('Time of Possession',`${gameStatValue(away,game,'topmin',24,35)}:${String(gameStatValue(away,game,'topsec',0,59)).padStart(2,'0')}`,`${gameStatValue(home,game,'topmin',24,35)}:${String(gameStatValue(home,game,'topsec',0,59)).padStart(2,'0')}`)
      ];
    }
    return [
      make('Overall',away.ovr,home.ovr),
      make('Offense',away.off,home.off),
      make('Defense',away.def,home.def),
      make('Points / Game',(away.pf/7).toFixed(1),(home.pf/7).toFixed(1)),
      make('Points Allowed / Game',(away.pa/7).toFixed(1),(home.pa/7).toFixed(1)),
      make('Point Differential',away.pf-away.pa,home.pf-home.pa)
    ];
  }

  function renderTeamStatsTab(away,home,game){
    const rows=gameTeamStatRows(away,home,game);
    return `<section class="game-center-tab-panel">
      <div class="game-center-section-heading"><span class="eyebrow">${game.status==='final'?'Final comparison':'Pregame comparison'}</span><h3>Team Stats</h3></div>
      <div class="team-stat-board">
        <div class="team-stat-board-head">
          <span>${renderTeamMark(away,'team-logo')}<strong>${away.abbr}</strong></span>
          <span>Team Stats</span>
          <span><strong>${home.abbr}</strong>${renderTeamMark(home,'team-logo')}</span>
        </div>
        ${rows.map(row=>`<div class="team-stat-board-row"><strong>${row.awayValue}</strong><span>${row.label}</span><strong>${row.homeValue}</strong></div>`).join('')}
      </div>
    </section>`;
  }

  function renderPlayerStatsTab(away,home,game){
    if(game.status==='final'){
      return `<section class="game-center-tab-panel">
        <div class="game-center-section-heading"><span class="eyebrow">Final box score</span><h3>Player Stats</h3></div>
        ${renderCompletedGameStats(away,home,game)}
      </section>`;
    }
    return `<section class="game-center-tab-panel">
      <div class="game-center-section-heading"><span class="eyebrow">Pregame</span><h3>Full Rosters & Current-Year Stats</h3></div>
      <div class="game-center-rosters">${renderGameRoster(away)}${renderGameRoster(home)}</div>
    </section>`;
  }

  function topGamePerformers(team,game){
    const roster=players.filter(p=>p.teamId===team.id);
    const candidates=roster.map(p=>{
      let value=0;
      let line='';
      if(p.position==='QB'){
        const y=gameStatValue(p,game,'passyd',145,385),td=gameStatValue(p,game,'passtd',0,4);
        value=y+(td*60); line=`${y} PASS YDS · ${td} TD`;
      }else if(['RB','FB'].includes(p.position)){
        const y=gameStatValue(p,game,'rushyd',8,142),td=gameStatValue(p,game,'rushtd',0,2);
        value=y+(td*75); line=`${y} RUSH YDS · ${td} TD`;
      }else if(['WR','TE'].includes(p.position)){
        const y=gameStatValue(p,game,'recyd',8,138),td=gameStatValue(p,game,'rectd',0,2);
        value=y+(td*75); line=`${y} REC YDS · ${td} TD`;
      }else if(defensePositions.includes(p.position)){
        const t=gameStatValue(p,game,'tkl',1,12),s=gameStatValue(p,game,'sack',0,20)/10,i=gameStatValue(p,game,'defint',0,1);
        value=t*7+s*35+i*80; line=`${t} TKL · ${s.toFixed(1)} SCK · ${i} INT`;
      }else{
        const fg=gameStatValue(p,game,'fgm',0,4);
        value=fg*30; line=`${fg} FG MADE`;
      }
      return {player:p,value,line};
    });
    return candidates.sort((a,b)=>b.value-a.value).slice(0,3);
  }

  function recapStoryData(away,home,game){
    const awayTop=topGamePerformers(away,game);
    const homeTop=topGamePerformers(home,game);
    const allTop=[...awayTop,...homeTop].sort((a,b)=>b.value-a.value).slice(0,3);
    const isFinal=game.status==='final';
    const winner=isFinal?(game.awayScore>game.homeScore?away:home):null;
    const loser=isFinal?(winner.id===away.id?home:away):null;
    const winnerScore=isFinal?Math.max(game.awayScore,game.homeScore):null;
    const loserScore=isFinal?Math.min(game.awayScore,game.homeScore):null;
    const margin=isFinal?winnerScore-loserScore:0;
    const mvp=allTop[0];

    const closeGame=isFinal&&margin<=7;
    const decisive=isFinal&&margin>=17;
    const headline=isFinal
      ? closeGame
        ? `${winner.name} survive ${loser.name} in a Week ${game.week} thriller`
        : decisive
          ? `${winner.name} roll past ${loser.name}, ${winnerScore}-${loserScore}`
          : `${winner.name} defeat ${loser.name} in Week ${game.week}`
      : `${away.name} and ${home.name} meet in a Week ${game.week} showcase`;

    const story=isFinal
      ? `${winner.fullName} secured a ${winnerScore}-${loserScore} victory at ${game.stadium}. ${mvp.player.name} led the way with ${mvp.line.toLowerCase()}, while the ${winner.name} delivered the defining plays in a ${closeGame?'tightly contested finish':decisive?'commanding performance':'complete team win'}.`
      : `${away.fullName} and ${home.fullName} are scheduled for ${game.day} at ${game.time}. The matchup features two rosters looking to strengthen their position in the Season 4 standings.`;

    const social=isFinal
      ? `${winner.abbr} ${winnerScore}, ${loser.abbr} ${loserScore} | ${mvp.player.name}: ${mvp.line} | Season 4, Week ${game.week}`
      : `${away.abbr} vs ${home.abbr} | ${game.day}, ${game.time} | Season 4, Week ${game.week}`;

    return {awayTop,homeTop,allTop,isFinal,winner,loser,winnerScore,loserScore,margin,mvp,headline,story,social};
  }

  function recapFormatDetails(format){
    return {
      landscape:{label:'Broadcast',ratio:'16:9',width:1600,height:900},
      square:{label:'Social',ratio:'1:1',width:1200,height:1200},
      story:{label:'Story',ratio:'9:16',width:1080,height:1920}
    }[format] || {label:'Broadcast',ratio:'16:9',width:1600,height:900};
  }

  function renderRecapTab(away,home,game){
    const recap=recapStoryData(away,home,game);
    const formats=['landscape','square','story'];
    return `<section class="game-center-tab-panel recap-tab">
      <div class="recap-studio-toolbar">
        <div>
          <span class="eyebrow">TC-011.1 · Broadcast Recap Generator</span>
          <h3>Recap Studio</h3>
          <p>Automatically transforms the final score and box score into a broadcast-ready league graphic.</p>
        </div>
        <div class="recap-studio-actions">
          <button type="button" class="button button--ghost" data-copy-recap="${game.id}">Copy Story</button>
          <button type="button" class="button button--primary" data-export-recap="${game.id}" ${recap.isFinal?'':'disabled'}>Download PNG</button>
        </div>
      </div>

      <div class="recap-format-picker">
        <span>Output format</span>
        <div>${formats.map(format=>{
          const details=recapFormatDetails(format);
          return `<button type="button" data-recap-format="${format}" class="${state.recapFormat===format?'is-active':''}">
            <strong>${details.label}</strong><small>${details.ratio}</small>
          </button>`;
        }).join('')}</div>
      </div>

      ${!recap.isFinal?`<div class="recap-availability-note"><strong>Pregame preview active</strong><span>The final broadcast graphic and player rankings unlock after the game result is imported.</span></div>`:''}

      <div class="broadcast-recap broadcast-recap--${state.recapFormat}" data-recap-capture="${game.id}" style="--recap-away:${away.primary};--recap-home:${home.primary}">
        <div class="broadcast-recap-topline">
          <span>FRANCHISE HQ ${recap.isFinal?'GAME RECAP':'GAME PREVIEW'}</span>
          <span>SEASON 4 · WEEK ${game.week}</span>
        </div>
        <div class="broadcast-recap-score">
          <div>${renderTeamMark(away,'featured-team-logo')}<strong>${away.abbr}</strong><small>${away.fullName}</small></div>
          <span><b>${recap.isFinal?game.awayScore:'—'}</b><em>${recap.isFinal?'FINAL':'VS'}</em><b>${recap.isFinal?game.homeScore:'—'}</b></span>
          <div>${renderTeamMark(home,'featured-team-logo')}<strong>${home.abbr}</strong><small>${home.fullName}</small></div>
        </div>
        <div class="broadcast-recap-story">
          <span class="eyebrow">${game.day} · ${game.time} · ${game.stadium}</span>
          <h3>${recap.headline}</h3>
          <p>${recap.story}</p>
        </div>
        <div class="broadcast-stars">
          ${recap.allTop.map((entry,index)=>`
            <button type="button" data-open-player-card="${entry.player.id}" class="${index===0?'is-mvp':''}">
              <span class="broadcast-star-rank">${index===0?'MVP':`#${index+1}`}</span>
              <span><strong>${escapeHtml(entry.player.name)}</strong><small>${entry.player.position} · ${teamById(entry.player.teamId).abbr}</small></span>
              <em>${entry.line}</em>
            </button>`).join('')}
        </div>
        <div class="broadcast-recap-footer">
          <span>Generated from imported Franchise HQ game data</span>
          <span>FURIOUS GAMING COMMUNITY</span>
        </div>
      </div>

      <div class="recap-story-panel">
        <div><span class="eyebrow">Generated headline</span><h4>${recap.headline}</h4></div>
        <div><span class="eyebrow">Generated game story</span><p>${recap.story}</p></div>
        <div><span class="eyebrow">Social caption</span><p>${recap.social}</p></div>
      </div>
    </section>`;
  }

  function canvasRoundRect(ctx,x,y,w,h,r){
    const radius=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=String(text).split(/\s+/);
    const lines=[];
    let current='';
    words.forEach(word=>{
      const next=current?`${current} ${word}`:word;
      if(ctx.measureText(next).width>maxWidth&&current){
        lines.push(current);
        current=word;
      }else current=next;
    });
    if(current) lines.push(current);
    const shown=lines.slice(0,maxLines);
    shown.forEach((line,index)=>ctx.fillText(line,x,y+(index*lineHeight)));
    return shown.length*lineHeight;
  }

  function hexToRgb(hex){
    const clean=String(hex||'#263449').replace('#','');
    const value=parseInt(clean.length===3?clean.split('').map(x=>x+x).join(''):clean,16);
    return {r:(value>>16)&255,g:(value>>8)&255,b:value&255};
  }

  function mixColor(hex,amount=.35){
    const {r,g,b}=hexToRgb(hex);
    return `rgb(${Math.round(r*amount)},${Math.round(g*amount)},${Math.round(b*amount)})`;
  }

  function downloadRecapPng(gameId){
    const game=schedule.flatMap(week=>week.games).find(item=>item.id===gameId);
    if(!game||game.status!=='final'){
      showToast('Final result required','Import the completed game before exporting its broadcast recap.');
      return;
    }
    const away=teamById(game.awayId),home=teamById(game.homeId);
    const recap=recapStoryData(away,home,game);
    const format=recapFormatDetails(state.recapFormat);
    const canvas=document.createElement('canvas');
    canvas.width=format.width;
    canvas.height=format.height;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    const pad=Math.round(W*.055);
    const portrait=H>W;

    const bg=ctx.createLinearGradient(0,0,W,0);
    bg.addColorStop(0,mixColor(away.primary,.52));
    bg.addColorStop(.47,'#08101b');
    bg.addColorStop(.53,'#08101b');
    bg.addColorStop(1,mixColor(home.primary,.52));
    ctx.fillStyle=bg;
    ctx.fillRect(0,0,W,H);

    ctx.globalAlpha=.16;
    ctx.fillStyle='#ffffff';
    for(let i=-H;i<W+H;i+=90){
      ctx.save();
      ctx.translate(i,0);
      ctx.rotate(-.45);
      ctx.fillRect(0,0,3,H*1.5);
      ctx.restore();
    }
    ctx.globalAlpha=1;

    ctx.fillStyle='rgba(5,10,18,.78)';
    ctx.fillRect(0,0,W,Math.round(H*.09));
    ctx.fillRect(0,H-Math.round(H*.07),W,Math.round(H*.07));

    ctx.fillStyle='#ffffff';
    ctx.font=`900 ${Math.round(W*.018)}px Arial`;
    ctx.textAlign='left';
    ctx.fillText('FRANCHISE HQ GAME RECAP',pad,Math.round(H*.057));
    ctx.textAlign='right';
    ctx.fillText(`SEASON 4 · WEEK ${game.week}`,W-pad,Math.round(H*.057));

    const logoY=portrait?Math.round(H*.22):Math.round(H*.25);
    const logoSize=portrait?Math.round(W*.25):Math.round(W*.13);
    const leftX=portrait?Math.round(W*.26):Math.round(W*.22);
    const rightX=portrait?Math.round(W*.74):Math.round(W*.78);

    [[away,leftX],[home,rightX]].forEach(([team,x])=>{
      ctx.fillStyle='rgba(4,8,14,.62)';
      canvasRoundRect(ctx,x-logoSize/2,logoY-logoSize/2,logoSize,logoSize,logoSize*.22);
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.28)';
      ctx.lineWidth=Math.max(2,W*.002);
      ctx.stroke();
      ctx.fillStyle='#fff';
      ctx.font=`900 ${Math.round(logoSize*.25)}px Arial`;
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(team.abbr,x,logoY);
      ctx.textBaseline='alphabetic';
      ctx.font=`900 ${Math.round(W*.032)}px Arial`;
      ctx.fillText(team.abbr,x,logoY+logoSize*.76);
      ctx.font=`600 ${Math.round(W*.012)}px Arial`;
      ctx.fillStyle='rgba(255,255,255,.72)';
      ctx.fillText(team.fullName.toUpperCase(),x,logoY+logoSize*.94);
    });

    ctx.textAlign='center';
    ctx.fillStyle='#fff';
    ctx.font=`900 ${Math.round(portrait?W*.13:W*.072)}px Arial`;
    const scoreY=logoY+Math.round(logoSize*.05);
    ctx.fillText(`${game.awayScore}  –  ${game.homeScore}`,W/2,scoreY);
    ctx.font=`900 ${Math.round(W*.013)}px Arial`;
    ctx.fillStyle='#9aa8bb';
    ctx.fillText('FINAL',W/2,scoreY+Math.round(H*.055));

    const storyTop=portrait?Math.round(H*.42):Math.round(H*.48);
    ctx.fillStyle='rgba(4,8,14,.72)';
    canvasRoundRect(ctx,pad,storyTop,W-pad*2,portrait?Math.round(H*.22):Math.round(H*.20),Math.round(W*.016));
    ctx.fill();

    ctx.fillStyle='#53e6c1';
    ctx.font=`900 ${Math.round(W*.012)}px Arial`;
    ctx.textAlign='center';
    ctx.fillText(`${game.day.toUpperCase()} · ${game.time.toUpperCase()} · ${game.stadium.toUpperCase()}`,W/2,storyTop+Math.round(H*.038));

    ctx.fillStyle='#fff';
    ctx.font=`900 ${Math.round(portrait?W*.052:W*.035)}px Arial`;
    const headlineY=storyTop+Math.round(H*.09);
    drawWrappedText(ctx,recap.headline,W/2,headlineY,W-pad*3,Math.round(H*.045),2);

    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.font=`500 ${Math.round(W*.014)}px Arial`;
    const storyY=headlineY+Math.round(H*.1);
    drawWrappedText(ctx,recap.story,W/2,storyY,W-pad*3,Math.round(H*.028),portrait?5:3);

    const starsY=portrait?Math.round(H*.69):Math.round(H*.72);
    const starGap=Math.round(W*.018);
    const starW=portrait?W-pad*2:Math.round((W-pad*2-starGap*2)/3);
    const starH=portrait?Math.round(H*.075):Math.round(H*.14);

    recap.allTop.forEach((entry,index)=>{
      const x=portrait?pad:pad+index*(starW+starGap);
      const y=portrait?starsY+index*(starH+Math.round(H*.012)):starsY;
      ctx.fillStyle=index===0?'rgba(83,230,193,.16)':'rgba(4,8,14,.72)';
      canvasRoundRect(ctx,x,y,starW,starH,Math.round(W*.012));
      ctx.fill();
      ctx.strokeStyle=index===0?'rgba(83,230,193,.7)':'rgba(255,255,255,.14)';
      ctx.lineWidth=Math.max(2,W*.0015);
      ctx.stroke();

      ctx.textAlign='left';
      ctx.fillStyle=index===0?'#53e6c1':'#9aa8bb';
      ctx.font=`900 ${Math.round(W*.011)}px Arial`;
      ctx.fillText(index===0?'GAME MVP':`TOP PERFORMER #${index+1}`,x+Math.round(W*.014),y+Math.round(starH*.28));
      ctx.fillStyle='#fff';
      ctx.font=`900 ${Math.round(W*.018)}px Arial`;
      ctx.fillText(entry.player.name,x+Math.round(W*.014),y+Math.round(starH*.53));
      ctx.fillStyle='#53e6c1';
      ctx.font=`700 ${Math.round(W*.011)}px Arial`;
      ctx.fillText(entry.line,x+Math.round(W*.014),y+Math.round(starH*.78));
    });

    ctx.fillStyle='#fff';
    ctx.font=`800 ${Math.round(W*.012)}px Arial`;
    ctx.textAlign='left';
    ctx.fillText('FURIOUS GAMING COMMUNITY',pad,H-Math.round(H*.025));
    ctx.textAlign='right';
    ctx.fillStyle='#9aa8bb';
    ctx.fillText(`${format.label.toUpperCase()} · GENERATED BY FRANCHISE HQ`,W-pad,H-Math.round(H*.025));

    const link=document.createElement('a');
    link.download=`franchise-hq-week-${game.week}-${away.abbr}-${home.abbr}-${state.recapFormat}.png`;
    link.href=canvas.toDataURL('image/png',1);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Broadcast recap downloaded',`${format.label} PNG exported at ${format.width} × ${format.height}.`);
  }

  function renderGameCenterTabs(away,home,game){
    const tabs=[['team','Team'],['player','Player'],['recap','Recap']];
    return `<div class="game-center-tabs">
      ${tabs.map(([key,label])=>`<button type="button" data-game-center-tab="${key}" class="${state.gameCenterTab===key?'is-active':''}">${label}</button>`).join('')}
    </div>
    <div class="game-center-tab-content">
      ${state.gameCenterTab==='team'?renderTeamStatsTab(away,home,game):state.gameCenterTab==='player'?renderPlayerStatsTab(away,home,game):renderRecapTab(away,home,game)}
    </div>`;
  }

  function openGameDetail(gameId) {
    const game=schedule.flatMap(week=>week.games).find(item=>item.id===gameId);
    if (!game) return;
    const away=teamById(game.awayId),home=teamById(game.homeId);
    const isFinal=game.status==='final',isLive=game.status==='live';

    openDetail(`
      <div class="game-center-shell" style="--game-away:${away.primary};--game-home:${home.primary}">
        <header class="game-center-topbar">
          <div class="game-center-schedule-info">
            <span class="eyebrow">Season 4 · Week ${game.week}</span>
            <strong>${game.day} · ${game.time}</strong>
            <small>${game.network} · ${game.stadium}</small>
          </div>
          <div class="game-center-title"><span class="eyebrow">${isFinal?'Final':isLive?'Live':'Scheduled'}</span><h2>Game Center</h2></div>
          <button type="button" class="icon-button game-center-close" data-close-detail aria-label="Close Game Center"><svg><use href="#icon-close"></use></svg></button>
        </header>

        ${gameCenterSwitcher(game.id)}

        <div class="game-center-matchup">
          <div class="game-center-team game-center-team--away">
            ${renderTeamMark(away,'featured-team-logo')}
            <span>${away.city}</span><strong>${away.name}</strong><small>${away.record} · ${escapeHtml(away.owner)}</small>
          </div>
          <div class="game-center-score">
            <span>${isFinal?'Final':isLive?'Live':`${game.day} · ${game.time}`}</span>
            <strong>${isFinal||isLive?`${game.awayScore}<b>–</b>${game.homeScore}`:'VS'}</strong>
            <small>${game.network} · ${game.stadium}</small>
          </div>
          <div class="game-center-team game-center-team--home">
            ${renderTeamMark(home,'featured-team-logo')}
            <span>${home.city}</span><strong>${home.name}</strong><small>${home.record} · ${escapeHtml(home.owner)}</small>
          </div>
        </div>

        <div class="game-center-body">
          ${renderGameCenterTabs(away,home,game)}
        </div>
      </div>`);
  }

  function openNewsDetail(newsId) {
    const article=[...(window.FGC_TRADE?.getApprovedNews?.() || []), ...newsArticles].find(item=>item.id===newsId);
    if (!article) return;
    openDetail(`<div class="modal-hero"><div><span class="pill pill--accent">${escapeHtml(article.category)}</span><h2>${escapeHtml(article.title)}</h2><div class="news-meta"><span>${escapeHtml(article.author)}</span><span>•</span><span>${escapeHtml(article.time)}</span><span>•</span><span>${escapeHtml(article.read)}</span></div></div></div><div class="modal-body"><p><strong>${escapeHtml(article.excerpt)}</strong></p><p>This is a mock long-form news story showing how commissioner articles, automated recaps, trade announcements, weekly awards, and analysis can be presented inside the finished league site.</p><p>When the Madden export is connected, game results and statistical changes can provide structured facts for automatically generated stories. Commissioners will still control what becomes public and can edit the final wording before publication.</p><div class="modal-summary-grid"><div><span>Category</span><strong>${escapeHtml(article.category)}</strong></div><div><span>Visibility</span><strong>League Public</strong></div><div><span>Source</span><strong>Mock Data</strong></div></div><div class="heading-actions" style="justify-content:flex-start"><button class="button button--primary" data-close-detail>Back to news</button><button class="button button--ghost" data-demo-toast="Discord cross-posting will be connected when the Discord bot is built."><svg><use href="#icon-external"></use></svg>Preview Discord post</button></div></div>`);
  }

  function openDetail(html) {
    detailContent.innerHTML=html;
    detailModal.classList.add('is-open');
    detailModal.setAttribute('aria-hidden','false');
    body.style.overflow='hidden';
  }

  function closeDetail() {
    detailModal.classList.remove('is-open');
    detailModal.setAttribute('aria-hidden','true');
    detailContent.innerHTML='';
    unlockBody();
  }

  function setRoute(route, options={}) {
    const navigation=window.FranchiseHQ?.navigation;
    if (navigation?.go) return navigation.go(route,{source:options.source||'legacy-app',replace:options.replace===true});
    const normalized=String(route||'home').replace(/^#\/?/,'').replace(/^\//,'')||'home';
    const hash=`#${normalized}`;
    if (location.hash===hash) renderRoute(normalized);
    else location.hash=normalized;
    return normalized;
  }

  function commissionerAccessState() {
    const platform=window.FranchiseHQ;
    const auth=platform?.auth;
    const permissions=platform?.permissions;

    // On a hard refresh, app.js loads before auth-client.js and
    // platform/permissions.js. Treat that brief period as unresolved instead
    // of falling back to the simulated role and redirecting the real
    // commissioner away from Commissioner HQ.
    if (!auth?.getSnapshot || typeof permissions?.canOpenCommissionerHQ!=='function') {
      return null;
    }

    const snapshot=auth.getSnapshot();
    if (snapshot?.status==='loading') return null;

    return permissions.canOpenCommissionerHQ()===true;
  }

  function syncCommissionerAccess() {
    const access=commissionerAccessState();
    if (access===null) return;

    document.querySelectorAll('[data-role-link="commissioner"]').forEach(link=>{
      link.hidden=!access;
      link.setAttribute('aria-hidden',String(!access));
    });

    if (!access && routeBase(location.hash.slice(1))==='commissioner') {
      showToast('Commissioner access required','Your authenticated league membership does not include Commissioner capabilities.');
      setRoute('home');
    }
  }

  function leagueDataIsEmpty() {
    return window.FranchiseHQ?.leagueData?.status?.().isEmpty === true;
  }

  function renderGlobalLeagueDataBanner() {
    return window.FranchiseHQ?.leagueDataBanner?.renderGlobal?.({
      host: document.querySelector('[data-league-data-global-banner]'),
      canManage: commissionerAccessState() === true
    }) ?? false;
  }

  function renderLeagueDataEmpty(subject = 'league data') {
    const emptyState = window.FranchiseHQ?.leagueEmptyState;
    if (emptyState?.render?.(pageContent, subject, { showAction: commissionerAccessState() === true })) { if(!pageContent.querySelector('[data-use-development-device]')) pageContent.querySelector('[data-league-empty-state]')?.insertAdjacentHTML('beforeend','<button class="button button--primary mobile-source-recovery" data-use-development-device>Use Development Data on this device</button>'); return true; }

    const message = window.FranchiseHQ?.leagueData?.emptyMessage?.(subject) || `No ${subject} is available.`;
    pageContent.innerHTML = `<section class="empty-state league-data-empty-state"><strong>${escapeHtml(message)}</strong><p>Data-source choices are stored per browser until shared league settings move to the backend. You can load Development Data on this device.</p><button class="button button--primary" data-use-development-device>Use Development Data on this device</button></section>`;
    return false;
  }

  function renderRoute(routeInput=location.hash.slice(1)||'home') {
    const route=routeInput||'home';
    const [base,id]=route.split('/');
    closeSidebar();
    document.querySelectorAll('.nav-item[data-route]').forEach(item=>item.classList.toggle('is-active',item.dataset.route===base));
    pageContent.innerHTML='';
    renderGlobalLeagueDataBanner();
    const emptySubjects = {
      home: 'league data',
      'league-activity': 'league activity',
      teams: 'teams',
      'my-team': 'rosters',
      players: 'players',
      standings: 'standings',
      stats: 'statistics',
      schedule: 'schedule'
    };
    if (leagueDataIsEmpty() && Object.prototype.hasOwnProperty.call(emptySubjects, base)) {
      renderLeagueDataEmpty(emptySubjects[base]);
      mainContent.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'smooth'});
      return { base, id, route, empty: true };
    }
    switch(base) {
      case 'home': renderLeagueHome(); break;
      case 'league-activity': renderActivity(); break;
      case 'teams': id?renderTeamDetail(id):renderTeams(); break;
      case 'my-team': {
        const tradeService=window.FGC_TRADE;
        if (!tradeService?.getCurrentAccount) {
          pageContent.innerHTML='<section class="empty-state"><strong>Loading My Team…</strong><p>Franchise HQ is restoring your selected identity and assigned franchise.</p></section>';
          break;
        }
        const account=tradeService.getCurrentAccount();
        if(account?.teamId) renderTeamDetail(account.teamId);
        else { showToast('My Team unavailable','Switch to an owner or commissioner identity with an assigned franchise.'); setRoute('teams'); }
        break;
      }
      case 'players': id?renderPlayerProfile(id):renderPlayers(); break;
      case 'standings': renderStandings(); break;
      case 'stats': renderStats(); break;
      case 'schedule': renderSchedule(); break;
      case 'news': renderNews(); break;
      case 'trade-center': window.FranchiseHQ?.trade?.renderTradeCenter ? window.FranchiseHQ.trade.renderTradeCenter(id) : window.FGC_TRADE?.renderTradeCenter ? window.FGC_TRADE.renderTradeCenter(id) : renderRoadmap(base); break;
      case 'trade-block': window.FranchiseHQ?.trade?.renderTradeBlock ? window.FranchiseHQ.trade.renderTradeBlock() : window.FGC_TRADE?.renderTradeBlock ? window.FGC_TRADE.renderTradeBlock() : renderRoadmap(base); break;
      case 'design-system': renderDesignSystem(); break;
      case 'commissioner': {
        const access=commissionerAccessState();
        if (access===null) {
          pageContent.innerHTML='<section class="empty-state"><strong>Checking Commissioner access…</strong><p>Franchise HQ is validating your authenticated league membership.</p></section>';
          break;
        }
        if (!access) {
          showToast('Commissioner access required','Your authenticated league membership does not include Commissioner capabilities.');
          setRoute('home');
          return;
        }
        window.FranchiseHQ?.trade?.renderCommissioner ? window.FranchiseHQ.trade.renderCommissioner() : window.FGC_TRADE?.renderCommissioner ? window.FGC_TRADE.renderCommissioner() : renderRoadmap(base);
        break;
      }
      default: renderRoadmap(base);
    }
    mainContent.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'smooth'});
    return { base, id, route };
  }

  function resolveRouteTitle(routeInput) {
    const [base,id]=String(routeInput||'home').split('/');
    const pageTitle=base==='my-team'
      ? (teamById(window.FGC_TRADE?.getCurrentAccount?.()?.teamId)?.fullName||'My Team')
      : id
        ? (base==='teams'?teamById(id)?.fullName:playerById(id)?.name)
        : pageNames[base];
    return `${pageTitle||'Franchise HQ'} — Franchise HQ`;
  }

  function buildCommandResults(query='') {
    const term=query.trim().toLowerCase();
    const pageItems=Object.entries(pageNames).filter(([key])=>key!=='commissioner'||commissionerAccessState()===true).map(([route,label])=>({type:'Page',label,detail:'Open league page',route,icon:pageIcon(route)}));
    const teamItems=teams.map(team=>({type:'Team',label:team.fullName,detail:`${team.abbr} · ${team.record} · ${team.owner}`,route:`teams/${team.id}`,abbr:team.abbr,team}));
    const playerItems=players.filter(player=>player.overall>=82).map(player=>({type:'Player',label:player.name,detail:`${player.position} · ${player.teamAbbr} · ${player.overall} OVR`,route:`players/${player.id}`,player}));
    const newsItems=newsArticles.map(article=>({type:'News',label:article.title,detail:`${article.category} · ${article.time}`,newsId:article.id,icon:'icon-news'}));
    let items=[...pageItems,...teamItems,...playerItems,...newsItems];
    if (term) items=items.filter(item=>`${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(term));
    else items=[...pageItems.slice(0,7),...teamItems.filter(item=>['DAL','KC','PHI'].includes(item.abbr)),...playerItems.slice(0,3)];
    items=items.slice(0,18);
    commandResults.innerHTML=items.length?`<span class="command-group-label">${term?'Search results':'Quick navigation'}</span>${items.map(item=>{
      const icon=item.team?renderTeamMark(item.team):item.player?`<span class="player-avatar" style="${teamStyle(teamById(item.player.teamId))}">${item.player.initials}</span>`:`<span class="menu-icon"><svg><use href="#${item.icon||'icon-search'}"></use></svg></span>`;
      return `<button class="command-result" ${item.route?`data-command-route="${item.route}"`:`data-command-news="${item.newsId}"`}>${icon}<span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span><span class="pill pill--neutral">${item.type}</span></button>`;
    }).join('')}`:`<div class="command-empty"><strong>No results</strong><p>Try a player name, team, page, or news category.</p></div>`;
  }

  function pageIcon(route) {
    return {home:'icon-home',teams:'icon-shield',players:'icon-users',standings:'icon-table',stats:'icon-chart',schedule:'icon-calendar',news:'icon-news','trade-center':'icon-swap','trade-block':'icon-tag',commissioner:'icon-sliders','design-system':'icon-palette'}[route]||'icon-search';
  }

  function openCommand() {
    buildCommandResults('');
    commandModal.classList.add('is-open');
    commandModal.setAttribute('aria-hidden','false');
    body.style.overflow='hidden';
    setTimeout(()=>commandInput.focus(),30);
  }

  function closeCommand() {
    commandModal.classList.remove('is-open');
    commandModal.setAttribute('aria-hidden','true');
    commandInput.value='';
    unlockBody();
  }

  function openSidebar() {
    if (window.FranchiseHQ?.sidebar?.open) return window.FranchiseHQ.sidebar.open();
    if (!sidebar || !mobileOverlay) return false;
    document.body.classList.add('sidebar-open');
    sidebar.classList.add('is-open');
    mobileOverlay.hidden=false;
    mobileOverlay.classList.add('is-open');
    requestAnimationFrame(()=>mobileOverlay.classList.add('is-visible'));
    body.style.overflow='hidden';
    return true;
  }

  function closeSidebar() {
    if (window.FranchiseHQ?.sidebar?.close) return window.FranchiseHQ.sidebar.close();
    if (!sidebar || !mobileOverlay) return false;
    document.body.classList.remove('sidebar-open');
    sidebar.classList.remove('is-open');
    mobileOverlay.classList.remove('is-open','is-visible');
    mobileOverlay.hidden=true;
    unlockBody();
    return true;
  }
  function openStylePanel() { stylePanel.classList.add('is-open'); panelOverlay.classList.add('is-open'); body.style.overflow='hidden'; }
  function closeStylePanel() { stylePanel.classList.remove('is-open'); panelOverlay.classList.remove('is-open'); unlockBody(); }
  function unlockBody() { if (![commandModal,detailModal,stylePanel,sidebar].some(el=>el?.classList.contains('is-open'))) body.style.overflow=''; }
  function closeProfileMenu() { profileMenu.classList.remove('is-open'); profileButton.setAttribute('aria-expanded','false'); }

  function applyAccent(name,notify=false) {
    const accent=accents[name]||accents.blue; state.accent=name in accents?name:'blue';
    document.documentElement.style.setProperty('--accent',accent.hex); document.documentElement.style.setProperty('--accent-rgb',accent.rgb);
    document.querySelectorAll('[data-accent]').forEach(button=>button.classList.toggle('is-active',button.dataset.accent===state.accent));
    window.FranchiseHQ?.store?.setString?.('m1b-accent',state.accent,{source:'appearance'});
    if (notify) showToast(`${accent.label} applied`,'Your appearance preference is saved in this browser.');
  }

  function applyDensity(density) {
    state.density=density==='compact'?'compact':'comfortable'; body.dataset.density=state.density;
    document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('is-active',button.dataset.density===state.density));
    window.FranchiseHQ?.store?.setString?.('m1b-density',state.density,{source:'appearance'});
  }

  function applyRole(role,notify=false) {
    const labels={commissioner:'Commissioner',owner:'Team Owner',committee:'Trade Committee',guest:'Guest'};
    const simulation=window.FranchiseHQ?.simulation;
    const result=simulation?.setRole?.(role,{silent:true,source:'app-role-selector'});
    state.role=result?.role || (labels[role]?role:'commissioner');
    const currentRole=document.querySelector('[data-current-role]');
    if(currentRole) currentRole.textContent=labels[state.role]||labels.commissioner;
    document.querySelectorAll('[data-role]').forEach(button=>button.classList.toggle('is-selected',button.dataset.role===state.role));
    syncCommissionerAccess();
    closeProfileMenu();
    if (notify) {
      simulation?.setRole?.(state.role,{source:'app-role-selector'});
      showToast(`${labels[state.role]||labels.commissioner} preview active`,'Simulation changes the workflow perspective only. Authenticated permissions remain unchanged.');
    }
  }

  function showToast(title,copy) {
    const toast=document.createElement('div'); toast.className='toast'; toast.innerHTML=`<span><svg><use href="#icon-info"></use></svg></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>`;
    toastRegion.appendChild(toast); setTimeout(()=>toast.remove(),3800);
  }

  document.addEventListener('click', event => {
    const closeDetailTarget=event.target.closest('[data-close-detail]');
    if (closeDetailTarget) { event.preventDefault(); event.stopPropagation(); closeDetail(); return; }

    const gameCenterTab=event.target.closest('[data-game-center-tab]');
    if (gameCenterTab) {
      event.preventDefault();
      state.gameCenterTab=gameCenterTab.dataset.gameCenterTab;
      const shell=event.target.closest('.game-center-shell');
      const active=shell?.querySelector('.game-center-switcher .is-active');
      if(active) openGameDetail(active.dataset.gameCenterSwitch);
      return;
    }

    const recapFormat=event.target.closest('[data-recap-format]');
    if(recapFormat){
      event.preventDefault();
      state.recapFormat=recapFormat.dataset.recapFormat;
      const shell=event.target.closest('.game-center-shell');
      const active=shell?.querySelector('.game-center-switcher .is-active');
      if(active) openGameDetail(active.dataset.gameCenterSwitch);
      return;
    }

    const exportRecap=event.target.closest('[data-export-recap]');
    if(exportRecap){
      event.preventDefault();
      downloadRecapPng(exportRecap.dataset.exportRecap);
      return;
    }

    const copyRecap=event.target.closest('[data-copy-recap]');
    if(copyRecap){
      event.preventDefault();
      const game=schedule.flatMap(week=>week.games).find(item=>item.id===copyRecap.dataset.copyRecap);
      if(game){
        const away=teamById(game.awayId),home=teamById(game.homeId);
        const recap=recapStoryData(away,home,game);
        const text=`${recap.headline}\n\n${recap.story}\n\n${recap.social}`;
        navigator.clipboard?.writeText(text).then(()=>showToast('Recap copied','Headline, game story, and social caption copied to your clipboard.')).catch(()=>showToast('Copy unavailable','Your browser blocked clipboard access.'));
      }
      return;
    }

    const gameCenterSwitch=event.target.closest('[data-game-center-switch]');
    if (gameCenterSwitch) { event.preventDefault(); openGameDetail(gameCenterSwitch.dataset.gameCenterSwitch); return; }

    const openPlayerCard=event.target.closest('[data-open-player-card]');
    if (openPlayerCard) {
      event.preventDefault();
      window.FGC_TRADE?.openValueCard?.(openPlayerCard.dataset.openPlayerCard);
      return;
    }

    const rosterTradeTarget=event.target.closest('[data-add-player-trade]');
    if (rosterTradeTarget) return;

    const depthPlayerTarget=event.target.closest('[data-depth-player-id]');
    if (depthPlayerTarget) {
      event.preventDefault();
      const playerId=depthPlayerTarget.dataset.depthPlayerId;
      if (state.depthSelectedPlayer===playerId) openRosterPlayerDetail(playerId);
      else {
        const windowScroll=window.scrollY;
        const mainScroll=mainContent?.scrollTop || 0;
        state.depthSelectedPlayer=playerId;
        renderRoute(location.hash.slice(1));
        requestAnimationFrame(() => {
          window.scrollTo({top:windowScroll,left:0,behavior:'instant'});
          if (mainContent) mainContent.scrollTop=mainScroll;
        });
      }
      return;
    }

    const teamSchedulePhase=event.target.closest('[data-team-schedule-phase]');
    if (teamSchedulePhase) {
      event.preventDefault();
      const windowScroll=window.scrollY;
      const mainScroll=mainContent?.scrollTop || 0;
      state.teamSchedulePhase=teamSchedulePhase.dataset.teamSchedulePhase;
      renderRoute(location.hash.slice(1));
      requestAnimationFrame(() => {
        window.scrollTo({top:windowScroll,left:0,behavior:'instant'});
        if (mainContent) mainContent.scrollTop=mainScroll;
      });
      return;
    }

    const rosterPlayerTarget=event.target.closest('[data-roster-player-detail]');
    if (rosterPlayerTarget) {
      event.preventDefault();
      openRosterPlayerDetail(rosterPlayerTarget.dataset.rosterPlayerDetail);
      return;
    }

    const clearPlayerFilters=event.target.closest('[data-player-clear-filters]');
    if (clearPlayerFilters) {
      state.playerSearch=''; state.playerPosition='All'; state.playerTeam='All'; state.playerStatus='All'; state.playerDev='All';
      state.playerMinOvr=60; state.playerMaxOvr=99; state.playerMinAge=20; state.playerMaxAge=45; state.playerSort='overall-desc';
      renderPlayers();
      return;
    }

    const routeTarget=event.target.closest('[data-route]');
    if (routeTarget) { event.preventDefault(); setRoute(routeTarget.dataset.route); return; }

    const interactiveTarget=event.target.closest('button, a, input, select, textarea, label, [role="button"]');

    const teamTarget=event.target.closest('[data-team-id]');
    if (teamTarget && !interactiveTarget) { setRoute(`teams/${teamTarget.dataset.teamId}`); return; }

    const playerTarget=event.target.closest('[data-player-id]');
    if (playerTarget) {
      event.preventDefault();
      window.FGC_TRADE?.openValueCard?.(playerTarget.dataset.playerId);
      return;
    }

    const gameTarget=event.target.closest('[data-game-id]');
    if (gameTarget) { openGameDetail(gameTarget.dataset.gameId); return; }

    const newsTarget=event.target.closest('[data-news-id]');
    if (newsTarget) { openNewsDetail(newsTarget.dataset.newsId); return; }

    const commandRoute=event.target.closest('[data-command-route]');
    if (commandRoute) {
      const route=commandRoute.dataset.commandRoute;
      closeCommand();
      if (route.startsWith('players/')) {
        window.FGC_TRADE?.openValueCard?.(route.split('/')[1]);
      } else {
        setRoute(route);
      }
      return;
    }

    const commandNews=event.target.closest('[data-command-news]');
    if (commandNews) { const id=commandNews.dataset.commandNews; closeCommand(); openNewsDetail(id); return; }

    const modalTeam=event.target.closest('[data-modal-team]');
    if (modalTeam) { const id=modalTeam.dataset.modalTeam; closeDetail(); setRoute(`teams/${id}`); return; }

    const teamTab=event.target.closest('[data-team-tab]');
    if (teamTab) {
      event.preventDefault();
      state.teamTab=teamTab.dataset.teamTab;
      renderRoute(location.hash.slice(1));
      scrollTeamTabsToTop();
      return;
    }

    const featureGame=event.target.closest('[data-feature-game]');
    if (featureGame) { state.featuredGameId=featureGame.dataset.featureGame; renderLeagueHome(); return; }

    const homeLeaderToggle=event.target.closest('[data-home-leader-metric]');
    if (homeLeaderToggle) {
      state.homeLeaderMetrics[homeLeaderToggle.dataset.homeLeaderCategory]=homeLeaderToggle.dataset.homeLeaderMetric;
      renderLeagueHome();
      return;
    }

    const activityFilter=event.target.closest('[data-activity-filter]');
    if (activityFilter) { state.activityFilter=activityFilter.dataset.activityFilter; renderActivity(); return; }

    const standingsView=event.target.closest('[data-standings-view]');
    if (standingsView) { state.standingsView=standingsView.dataset.standingsView; renderStandings(); return; }
    const confidenceStandingsView=event.target.closest('[data-confidence-standings-view]');
    if(confidenceStandingsView){state.confidenceStandingsView=confidenceStandingsView.dataset.confidenceStandingsView;renderStandings();return;}
    const confidenceStandingsWeek=event.target.closest('[data-confidence-standings-week]');
    if(confidenceStandingsWeek){state.confidenceStandingsWeek=clamp(state.confidenceStandingsWeek+Number(confidenceStandingsWeek.dataset.confidenceStandingsWeek),1,Math.max(1,...schedule.map(w=>w.week)));renderStandings();return;}

    const statsCategory=event.target.closest('[data-stats-category]');
    if (statsCategory) { state.statsCategory=statsCategory.dataset.statsCategory; renderStats(); return; }
    const statsSort=event.target.closest('[data-stats-sort]');
    if(statsSort){const key=statsSort.dataset.statsSort;if(state.statsSortKey===key)state.statsSortDirection=state.statsSortDirection==='desc'?'asc':'desc';else{state.statsSortKey=key;state.statsSortDirection='desc';}renderStats();return;}

    const useDevelopmentDevice=event.target.closest('[data-use-development-device]');
    if(useDevelopmentDevice){const service=window.FranchiseHQ?.leagueData;if(service?.setMode){service.setMode('demo');if(service.status?.().isEmpty)service.seedDemoFromLegacy?.();showToast('Development Data enabled','This browser will now use Development Data.');renderRoute(location.hash.slice(1)||'home');}return;}

    const scheduleSection=event.target.closest('[data-schedule-section]');
    if(scheduleSection){state.scheduleSection=scheduleSection.dataset.scheduleSection;renderSchedule();return;}
    const confidenceWeekChange=event.target.closest('[data-confidence-week-change]');
    if(confidenceWeekChange){state.confidenceWeek=clamp(state.confidenceWeek+Number(confidenceWeekChange.dataset.confidenceWeekChange),1,schedule.length);renderSchedule();return;}
    const confidenceTeam=event.target.closest('[data-confidence-team]');
    if(confidenceTeam){const [gameId,teamId]=confidenceTeam.dataset.confidenceTeam.split(':');const result=scheduleService()?.confidence?.saveSelection(gameId,teamId);if(!result?.ok)showToast('Pick not saved',result?.error||'Unable to save pick.');renderSchedule();return;}
    const confidenceClearWeek=event.target.closest('[data-confidence-clear-week]');
    if(confidenceClearWeek){const week=Number(confidenceClearWeek.dataset.confidenceClearWeek);if(confirm(`Clear every winner and confidence value for Week ${week}? This cannot be undone.`)){const result=scheduleService()?.confidence?.clearWeek(week);showToast(result?.ok?'Week cleared':'Unable to clear week',result?.error||`Week ${week} selections were removed.`);renderSchedule();}return;}
    const confidenceClearSeason=event.target.closest('[data-confidence-clear-season]');
    if(confidenceClearSeason){const confirmation=prompt(`Type CLEAR to remove every Confidence Pool pick for Season ${scheduleService()?.confidence?.config?.()?.season||''}.`);if(confirmation==='CLEAR'){const result=scheduleService()?.confidence?.clearSeason();showToast(result?.ok?'Season entry cleared':'Unable to clear season',result?.error||'All season selections were removed.');renderSchedule();}else if(confirmation!==null){showToast('Season not cleared','The confirmation text did not match CLEAR.');}return;}
    const confidenceAuto=event.target.closest('[data-confidence-auto]');
    if(confidenceAuto){const result=scheduleService()?.confidence?.autoAssign(Number(confidenceAuto.dataset.confidenceAuto));showToast(result?.ok?'Week predicted and assigned':'Unable to assign',result?.error||`Week ${state.confidenceWeek} picks and confidence values were assigned from league history.`);renderSchedule();return;}
    const submitWeekButton=event.target.closest('[data-confidence-submit-week]');if(submitWeekButton){const week=Number(submitWeekButton.dataset.confidenceSubmitWeek);const result=scheduleService()?.confidence?.submitWeek(week);showToast(result?.ok?`Week ${week} submitted`:'Week incomplete',result?.error||`Week ${week} is locked and ready for scoring.`);renderSchedule();return;}

    const weekButton=event.target.closest('[data-week]');
    if (weekButton) { state.scheduleWeek=Number(weekButton.dataset.week); renderSchedule(); return; }

    const weekChange=event.target.closest('[data-week-change]');
    if (weekChange) { state.scheduleWeek=clamp(state.scheduleWeek+Number(weekChange.dataset.weekChange),1,9); renderSchedule(); return; }

    const newsCategory=event.target.closest('[data-news-category]');
    if (newsCategory) { state.newsCategory=newsCategory.dataset.newsCategory; renderNews(); return; }

    const accentButton=event.target.closest('[data-accent]');
    if (accentButton) { applyAccent(accentButton.dataset.accent,true); return; }

    const densityButton=event.target.closest('[data-density]');
    if (densityButton) { applyDensity(densityButton.dataset.density); return; }

    const roleButton=event.target.closest('[data-role]');
    if (roleButton) { applyRole(roleButton.dataset.role,true); return; }

    if (event.target.closest('[data-open-sidebar]')) { openSidebar(); return; }
    if (event.target.closest('[data-close-sidebar]')||event.target.closest('[data-mobile-overlay]')) { closeSidebar(); return; }
    if (event.target.closest('[data-open-command]')) { openCommand(); return; }
    if (event.target.closest('[data-close-command]')) { closeCommand(); return; }
    if (event.target.closest('[data-open-style-panel]')) { openStylePanel(); return; }
    if (event.target.closest('[data-close-style-panel]')||event.target.closest('[data-panel-overlay]')) { closeStylePanel(); return; }
    if (event.target.closest('[data-close-detail]')) { closeDetail(); return; }

    const demo=event.target.closest('[data-demo-toast]');
    if (demo) { showToast('Prototype preview',demo.dataset.demoToast); return; }

    if (event.target.closest('[data-profile-button]')) {
      const open=profileMenu.classList.toggle('is-open'); profileButton.setAttribute('aria-expanded',String(open)); return;
    }
    if (!profileMenu.contains(event.target)&&!profileButton.contains(event.target)) closeProfileMenu();
  });




  let mobileMenuToggleLock=false;
  document.addEventListener('click', event => {
    const openButton=event.target.closest('[data-open-sidebar]');
    if(openButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(mobileMenuToggleLock) return;
      mobileMenuToggleLock=true;
      openSidebar();
      setTimeout(()=>{mobileMenuToggleLock=false},240);
      return;
    }

    const closeButton=event.target.closest('[data-close-sidebar], [data-mobile-overlay]');
    if(closeButton && !event.target.closest('.sidebar')){
      event.preventDefault();
      closeSidebar();
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target.matches('[data-team-search]')) { state.teamSearch=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-player-search]')) { state.playerSearch=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-min-ovr]')) { state.playerMinOvr=Number(event.target.value)||0; refreshPlayerTable(); }
    if (event.target.matches('[data-player-max-ovr]')) { state.playerMaxOvr=Number(event.target.value)||99; refreshPlayerTable(); }
    if (event.target.matches('[data-player-min-age]')) { state.playerMinAge=Number(event.target.value)||18; refreshPlayerTable(); }
    if (event.target.matches('[data-player-max-age]')) { state.playerMaxAge=Number(event.target.value)||60; refreshPlayerTable(); }
    if (event.target.matches('[data-command-input]')) buildCommandResults(event.target.value);
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-team-conference]')) { state.teamConference=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-team-division]')) { state.teamDivision=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-roster-group]')) { state.rosterGroup=event.target.value; renderRoute(location.hash.slice(1)); }
    if (event.target.matches('[data-roster-position]')) { state.rosterPosition=event.target.value; renderRoute(location.hash.slice(1)); }
    if (event.target.matches('[data-roster-dev]')) { state.rosterDev=event.target.value; renderRoute(location.hash.slice(1)); }
    if (event.target.matches('[data-player-position]')) { state.playerPosition=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-team]')) { state.playerTeam=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-status]')) { state.playerStatus=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-dev]')) { state.playerDev=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-sort]')) { state.playerSort=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-schedule-team]')) { state.scheduleTeam=event.target.value; renderSchedule(); }
    if (event.target.matches('[data-confidence-value]')) { const gameId=event.target.dataset.confidenceValue; const result=scheduleService()?.confidence?.saveConfidence(gameId,event.target.value); if(!result?.ok) showToast('Confidence not saved',result?.error||'Choose another confidence value.'); renderSchedule(); }
    if (event.target.matches('[data-stats-scope]')) { state.statsScope=event.target.value; renderStats(); }
    if (event.target.matches('[data-stats-week]')) { state.statsWeek=Number(event.target.value)||1; renderStats(); }
    if (event.target.matches('[data-stats-team]')) { state.statsTeam=event.target.value; renderStats(); }
    if (event.target.matches('[data-stats-min-games]')) { state.statsMinimumGames=Number(event.target.value)||0; renderStats(); }
    if (event.target.matches('[data-stats-team-category]')) { state.statsTeamCategory=event.target.value; renderStats(); }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') { event.preventDefault(); openCommand(); }
    if (event.key==='Escape') { closeCommand(); closeDetail(); closeStylePanel(); closeSidebar(); closeProfileMenu(); }
  });


  // 4.21.2: guarantee the active route mounts after hard refresh / bfcache restore.
  window.addEventListener('pageshow', () => {
    const route=String(location.hash||'#home').replace(/^#\/?/,'')||'home';
    if (pageContent && !pageContent.children.length) renderRoute(route);
  });

  window.addEventListener('franchisehq:auth-changed', event=>{
    syncCommissionerAccess();
    if (event.detail?.status==='ready' && routeBase(location.hash.slice(1))==='commissioner') renderRoute('commissioner');
  });

  window.addEventListener('franchisehq:trade-ready', ()=>{
    if (routeBase(location.hash.slice(1))==='my-team') renderRoute('my-team');
  });

  window.addEventListener('franchisehq:gotw-changed', event=>{
    const currentWeek=currentHomeWeek();
    if(Number(event.detail?.week)===Number(currentWeek?.week)) state.featuredGameId=event.detail?.gameId||null;
    if(routeBase(location.hash.slice(1))==='home') renderLeagueHome();
  });

  window.FranchiseHQ?.sidebar?.init?.({ sidebar, overlay: mobileOverlay });

  window.FGC_APP = {
    teams, players, schedule, newsArticles, state, pageContent,
    teamById, playerById, teamStyle, renderTeamMark, renderPlayerIdentity,
    devClass, formatMoney, escapeHtml, setRoute, renderRoute, showToast,
    openDetail, closeDetail, applyRole, closeProfileMenu,
    commissionerAccessState, syncCommissionerAccess, renderGlobalLeagueDataBanner,
    rosterService, rosterPlayerView, renderRosterExperience, openRosterPlayerDetail,
    gotw: { getWeekModel:gotwWeekModel, getOfficialGameId:officialGotwId, saveOfficial:saveOfficialGotw, currentWeek:currentHomeWeek }
  };

  window.FranchiseHQ?.ui?.registerAdapter?.('legacy-app', {
    showToast,
    getTeam: teamById
  });

  window.FranchiseHQ?.appRouter?.configure?.({
    renderer: renderRoute,
    titleResolver: resolveRouteTitle,
    afterRender: () => window.FranchiseHQ?.sidebar?.restore?.()
  });

  window.FranchiseHQ?.navigation?.start?.({renderInitial:false});

  applyAccent(state.accent,false);
  applyDensity(state.density);
  window.addEventListener('franchisehq:simulation-changed',event=>{
    const nextRole=event.detail?.role;
    if(nextRole && nextRole!==state.role) applyRole(nextRole,false);
  });
  applyRole(window.FranchiseHQ?.simulation?.getRole?.() || state.role,false);
  window.FranchiseHQ?.appRouter?.render?.(location.hash.slice(1)||'home',{source:'startup'}) || renderRoute();
})();

  window.addEventListener('franchisehq:league-data-state-changed', () => {
    window.FGC_APP?.renderGlobalLeagueDataBanner?.();
  });

