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
    role: localStorage.getItem('m1b-role') || 'commissioner',
    accent: localStorage.getItem('m1b-accent') || 'blue',
    density: localStorage.getItem('m1b-density') || 'comfortable',
    teamSearch: '',
    teamConference: 'All',
    teamDivision: 'All',
    playerSearch: '',
    playerPosition: 'All',
    playerTeam: 'All',
    playerMinOvr: 70,
    playerSort: 'overall-desc',
    standingsView: 'division',
    statsCategory: 'passing',
    scheduleWeek: 8,
    scheduleTeam: 'All',
    newsCategory: 'All',
    teamTab: 'roster'
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

  const owners = ['GridironGuru','FourthAndLong','NoFlyZone','JetFuel','PurpleReign','WhoDeyKing','DawgPound','SteelCurtain','H-TownHeat','BlueHorseshoe','DuvalDynasty','TitanUp','MileHighMike','ArrowheadAce','SilverBlack','BoltAction','Peckin','BigBlueCrew','BirdGangPhilly','HailVictory','MonstersMidway','MotorCityDan','CheeseHead','SkolCommander','DirtyBird','KeepPounding','WhoDat','CannonFire','RedSea','RamsHouse','GoldRush','12thMan'];
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
    home: 'League Home', teams: 'Teams', players: 'Players', standings: 'Standings', stats: 'Stats & Leaders',
    schedule: 'Schedule', news: 'League News', 'trade-center': 'Trade Center', 'trade-block': 'Trade Block',
    commissioner: 'Commissioner Dashboard', 'design-system': 'Design System'
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
      return { games, passingYards: 1250 + (s('py') % 1350), passingTD: 8 + (s('ptd') % 18), interceptions: 2 + (s('int') % 10), attempts, completions, compPct: completions/attempts*100, rushingYards: s('qry') % 420, rushingTD: s('qrtd') % 6, fantasy: 105 + (s('fp') % 900)/10 };
    }
    if (['RB','FB'].includes(player.position)) {
      return { games, carries: 45 + (s('car') % 115), rushingYards: 220 + (s('ry') % 770), rushingTD: 1 + (s('rtd') % 10), receptions: 8 + (s('rec') % 35), receivingYards: 55 + (s('rey') % 360), receivingTD: s('retd') % 5, fantasy: 55 + (s('fp') % 950)/10 };
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

  function renderHome() {
    const ranked = [...teams].sort(sortStandings);
    const topQb = [...players].filter(p => p.position === 'QB').sort((a,b) => b.stats.passingYards - a.stats.passingYards)[0];
    const topRush = [...players].filter(p => ['RB','FB'].includes(p.position)).sort((a,b) => b.stats.rushingYards - a.stats.rushingYards)[0];
    const topRec = [...players].filter(p => ['WR','TE'].includes(p.position)).sort((a,b) => b.stats.receivingYards - a.stats.receivingYards)[0];
    const featuredGame = schedule[7].games[0];
    const away = teamById(featuredGame.awayId);
    const home = teamById(featuredGame.homeId);
    const recentGames = schedule[7].games.filter(g => g.status === 'final').slice(0,4);

    pageContent.innerHTML = `
      <div class="page-heading">
        <div><span class="eyebrow">Season 4 · Week 8</span><h1>League Command Center</h1><p>Your complete view of the league—results, standings, player performance, news, and transactions.</p></div>
        <div class="heading-actions"><button class="button button--ghost" data-open-style-panel><svg><use href="#icon-palette"></use></svg>Customize preview</button><button class="button button--primary" data-route="trade-center"><svg><use href="#icon-swap"></use></svg>Start a trade</button></div>
      </div>

      <div class="hero-grid">
        <article class="hero-card">
          <div class="hero-card__content">
            <span class="pill pill--accent">Week 8 spotlight</span>
            <h2>${away.name} and ${home.name} meet with playoff positioning on the line.</h2>
            <p>This league-home experience is now powered by connected mock data. Open teams, players, standings, games, and news to explore the full Milestone 1B prototype.</p>
            <div class="matchup-row" data-game-id="${featuredGame.id}">
              <div class="team-lockup">${renderTeamMark(away,'team-badge')}<div><strong>${away.fullName}</strong><span>${away.record} · ${away.conference} ${away.division}</span></div></div>
              <div class="versus-lockup"><span>${featuredGame.day}</span><strong>${featuredGame.time}</strong></div>
              <div class="team-lockup team-lockup--reverse"><div><strong>${home.fullName}</strong><span>${home.record} · ${home.conference} ${home.division}</span></div>${renderTeamMark(home,'team-badge')}</div>
            </div>
          </div>
        </article>

        <article class="quick-actions-card card">
          <div class="card-header"><div><span class="eyebrow">Shortcuts</span><h3>Quick actions</h3></div><span class="pill pill--neutral">Interactive</span></div>
          <div class="quick-action-grid">
            <button data-route="players"><span><svg><use href="#icon-search"></use></svg></span><strong>Find a player</strong><small>Search ratings and profiles</small></button>
            <button data-route="teams"><span><svg><use href="#icon-shield"></use></svg></span><strong>Browse teams</strong><small>Rosters, cap, and results</small></button>
            <button data-route="standings"><span><svg><use href="#icon-table"></use></svg></span><strong>Playoff race</strong><small>Division and conference views</small></button>
            <button data-route="news"><span><svg><use href="#icon-news"></use></svg></span><strong>League news</strong><small>Stories and announcements</small></button>
          </div>
        </article>
      </div>

      <div class="metric-grid">
        <article class="metric-card card"><div class="metric-card__top"><span class="metric-icon"><svg><use href="#icon-shield"></use></svg></span><span class="trend trend--up">All assigned</span></div><span class="metric-label">Active teams</span><strong class="metric-value">32</strong><small>32 connected owners</small></article>
        <article class="metric-card card"><div class="metric-card__top"><span class="metric-icon"><svg><use href="#icon-users"></use></svg></span><span class="trend trend--up">Mock</span></div><span class="metric-label">Player database</span><strong class="metric-value">${players.length.toLocaleString()}</strong><small>Searchable roster records</small></article>
        <article class="metric-card card"><div class="metric-card__top"><span class="metric-icon"><svg><use href="#icon-swap"></use></svg></span><span class="trend trend--neutral">2 open</span></div><span class="metric-label">Season trades</span><strong class="metric-value">14</strong><small>Committee-approved deals</small></article>
        <article class="metric-card card"><div class="metric-card__top"><span class="metric-icon"><svg><use href="#icon-chart"></use></svg></span><span class="trend trend--up">Week 8</span></div><span class="metric-label">Games completed</span><strong class="metric-value">117</strong><small>Across the mock season</small></article>
      </div>

      <div class="content-grid">
        <article class="card">
          <div class="card-header"><div><span class="eyebrow">Playoff picture</span><h3>League leaders</h3></div><button class="text-button" data-route="standings">Full standings <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="table-wrap"><table><thead><tr><th>Seed</th><th>Team</th><th>Record</th><th>PF</th><th>Diff</th><th>Streak</th></tr></thead><tbody>
            ${ranked.slice(0,6).map((team,index) => `<tr class="clickable-row" data-team-id="${team.id}"><td><span class="seed">${index+1}</span></td><td><div class="table-team">${renderTeamMark(team)}<div><strong>${team.fullName}</strong><small>${team.conference} ${team.division}</small></div></div></td><td><strong>${team.record}</strong></td><td>${team.pf}</td><td class="${team.pf-team.pa >= 0 ? 'streak--win':'streak--loss'}">${team.pf-team.pa >= 0 ? '+' : ''}${team.pf-team.pa}</td><td><span class="streak ${team.streak.startsWith('W')?'streak--win':'streak--loss'}">${team.streak}</span></td></tr>`).join('')}
          </tbody></table></div>
        </article>

        <article class="card">
          <div class="card-header"><div><span class="eyebrow">Stat leaders</span><h3>Players setting the pace</h3></div><button class="text-button" data-route="stats">All leaders <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="activity-list">
            ${leaderActivity(topQb,'Passing yards',topQb.stats.passingYards.toLocaleString())}
            ${leaderActivity(topRush,'Rushing yards',topRush.stats.rushingYards.toLocaleString())}
            ${leaderActivity(topRec,'Receiving yards',topRec.stats.receivingYards.toLocaleString())}
          </div>
        </article>
      </div>

      <div class="content-grid content-grid--equal" style="margin-top:18px">
        <article class="card">
          <div class="card-header"><div><span class="eyebrow">Around the league</span><h3>Recent finals</h3></div><button class="text-button" data-route="schedule">Full schedule <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="activity-list">${recentGames.map(game => gameActivity(game)).join('')}</div>
        </article>
        <article class="card">
          <div class="card-header"><div><span class="eyebrow">Latest stories</span><h3>League news</h3></div><button class="text-button" data-route="news">News hub <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="activity-list">${newsArticles.slice(0,4).map(article => newsActivity(article)).join('')}</div>
        </article>
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

  function renderTeamDetail(teamId) {
    const team = teamById(teamId);
    if (!team) { setRoute('teams'); return; }
    const roster = players.filter(player => player.teamId === team.id).sort((a,b) => positionOrder(a.position) - positionOrder(b.position) || b.overall - a.overall);
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
        ${['roster','depth','schedule','stats','cap'].map(tab => `<button data-team-tab="${tab}" class="${state.teamTab===tab?'is-active':''}">${tab === 'depth' ? 'Depth Chart' : titleCase(tab)}</button>`).join('')}
      </div>
      <div data-team-tab-content>${renderTeamTab(team, roster, teamGames, leaders)}</div>`;
  }

  function summaryTile(label, value, detail) { return `<article class="summary-tile card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`; }
  function titleCase(value) { return value.replace(/\b\w/g, letter => letter.toUpperCase()); }
  function positionOrder(position) { return positionBlueprint.findIndex(([pos]) => pos === position); }

  function renderTeamTab(team, roster, teamGames, leaders) {
    if (state.teamTab === 'depth') return renderDepthChart(roster);
    if (state.teamTab === 'schedule') return renderTeamSchedule(team, teamGames);
    if (state.teamTab === 'stats') return renderTeamStats(team, leaders);
    if (state.teamTab === 'cap') return renderTeamCap(team, roster);
    return renderRosterTable(roster);
  }

  function renderRosterTable(roster) {
    const account = window.FGC_TRADE?.getCurrentAccount?.();
    const ownsRoster = account?.teamId && roster.some(player => player.teamId === account.teamId);
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">53-player mock roster</span><h3>Active roster</h3></div><span class="pill pill--neutral">${roster.length} records</span></div><div class="table-wrap"><table class="team-roster-table"><thead><tr><th class="quick-star-col"><span class="sr-only">Quick action</span></th><th>Player</th><th>OVR</th><th>Age</th><th>Development</th><th>Contract</th><th>Cap Hit</th><th>Status</th></tr></thead><tbody>${roster.map(player => { const ownPlayer = account?.teamId===player.teamId; const active = ownPlayer ? window.FGC_TRADE?.onBlock?.(player) : window.FGC_TRADE?.isWatched?.(player.id); return `<tr class="clickable-row" data-player-id="${player.id}"><td class="quick-star-col"><button class="roster-star ${active?'is-active':''}" ${ownPlayer?`data-toggle-player-block="${player.id}"`:`data-watch-player="${player.id}"`} aria-label="${ownPlayer?(active?'Remove from Trade Block':'Add to Trade Block'):(active?'Remove from Watch List':'Add to Watch List')}" title="${ownPlayer?(active?'Remove from Trade Block':'Add to Trade Block'):(active?'Remove from Watch List':'Add to Watch List')}"><svg><use href="#icon-star"></use></svg></button></td><td><div class="roster-player-cell">${renderPlayerIdentity(player,false)}<button class="roster-trade-button" data-add-player-trade="${player.id}">Trade</button></div></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span></td><td>${player.age}</td><td><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></td><td>${player.years} year${player.years===1?'':'s'}</td><td>${formatMoney(player.capHit)}</td><td><span class="pill ${player.injury==='Healthy'?'pill--success':'pill--warning'}">${player.injury}</span></td></tr>` }).join('')}</tbody></table></div></article>`;
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

  function renderTeamSchedule(team, teamGames) {
    return `<div class="schedule-grid">${teamGames.slice(0,9).map(game => renderGameCard(game,team.id)).join('')}</div>`;
  }

  function renderTeamStats(team, leaders) {
    return `<div class="content-grid"><article class="card"><div class="card-header"><div><span class="eyebrow">Team profile</span><h3>Season performance</h3></div></div><div class="card-body"><div class="stat-box-grid">${summaryStatBox('Points / Game',(team.pf/7).toFixed(1))}${summaryStatBox('Allowed / Game',(team.pa/7).toFixed(1))}${summaryStatBox('Point Diff',`${team.pf-team.pa>=0?'+':''}${team.pf-team.pa}`)}${summaryStatBox('Win Rate',percent(team.wins/(team.wins+team.losses)*100))}</div></div></article><article class="card"><div class="card-header"><div><span class="eyebrow">Top talent</span><h3>Roster leaders</h3></div></div><div class="activity-list">${leaders.map(player => leaderActivity(player,`${player.position} overall`,player.overall)).join('')}</div></article></div>`;
  }

  function summaryStatBox(label,value) { return `<div class="stat-box"><span>${label}</span><strong>${value}</strong></div>`; }

  function renderTeamCap(team, roster) {
    const sorted = [...roster].sort((a,b)=>b.capHit-a.capHit);
    const total = roster.reduce((sum,p)=>sum+p.capHit,0);
    return `<div class="content-grid"><article class="card"><div class="card-header"><div><span class="eyebrow">Financial overview</span><h3>Salary cap</h3></div></div><div class="card-body"><div class="stat-box-grid">${summaryStatBox('Cap Space',formatMoney(team.cap))}${summaryStatBox('Active Commitments',formatMoney(total))}${summaryStatBox('Largest Cap Hit',formatMoney(sorted[0].capHit))}${summaryStatBox('Expiring Deals',roster.filter(p=>p.years===1).length)}</div></div></article><article class="card"><div class="card-header"><div><span class="eyebrow">Largest contracts</span><h3>Top cap hits</h3></div></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Years</th><th>Salary</th><th>Cap Hit</th></tr></thead><tbody>${sorted.slice(0,8).map(player=>`<tr class="clickable-row" data-player-id="${player.id}"><td>${renderPlayerIdentity(player,false)}</td><td>${player.years}</td><td>${formatMoney(player.salary)}</td><td><strong>${formatMoney(player.capHit)}</strong></td></tr>`).join('')}</tbody></table></div></article></div>`;
  }

  function renderPlayers() {
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Mock Madden database</span><h1>Players</h1><p>Search the full mock league by player, team, position, rating, development trait, contract, and availability.</p></div><div class="heading-actions"><button class="button button--ghost" data-demo-toast="Saved player watchlists will be connected with user accounts later."><svg><use href="#icon-star"></use></svg>My watchlist</button></div></div>
      <div class="filter-bar">
        <label class="field field--grow"><span>Player search</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-player-search value="${escapeHtml(state.playerSearch)}" placeholder="Search name, team, or college..." /></div></label>
        <label class="field"><span>Position</span><select data-player-position>${['All',...positionBlueprint.map(([pos])=>pos)].map(pos=>`<option ${state.playerPosition===pos?'selected':''}>${pos}</option>`).join('')}</select></label>
        <label class="field"><span>Team</span><select data-player-team><option ${state.playerTeam==='All'?'selected':''}>All</option>${teams.map(team=>`<option value="${team.id}" ${state.playerTeam===team.id?'selected':''}>${team.abbr}</option>`).join('')}</select></label>
        <label class="field"><span>Min OVR</span><select data-player-ovr>${[60,70,75,80,85,90].map(ovr=>`<option value="${ovr}" ${state.playerMinOvr===ovr?'selected':''}>${ovr}+</option>`).join('')}</select></label>
        <label class="field"><span>Sort</span><select data-player-sort><option value="overall-desc" ${state.playerSort==='overall-desc'?'selected':''}>Overall: High to Low</option><option value="age-asc" ${state.playerSort==='age-asc'?'selected':''}>Age: Youngest</option><option value="salary-desc" ${state.playerSort==='salary-desc'?'selected':''}>Cap Hit: Highest</option><option value="name-asc" ${state.playerSort==='name-asc'?'selected':''}>Name: A–Z</option></select></label>
        <span class="result-count" data-player-count></span>
      </div>
      <article class="card"><div class="table-wrap"><table><thead><tr><th>Player</th><th>OVR</th><th>Age</th><th>Development</th><th>Team</th><th>Contract</th><th>Cap Hit</th><th>Trade</th></tr></thead><tbody data-player-table></tbody></table></div></article>`;
    refreshPlayerTable();
  }

  function refreshPlayerTable() {
    const tbody = document.querySelector('[data-player-table]');
    if (!tbody) return;
    const term = state.playerSearch.trim().toLowerCase();
    let filtered = players.filter(player => {
      const team = teamById(player.teamId);
      const matchTerm = !term || `${player.name} ${team.fullName} ${team.abbr} ${player.college}`.toLowerCase().includes(term);
      return matchTerm && (state.playerPosition==='All'||player.position===state.playerPosition) && (state.playerTeam==='All'||player.teamId===state.playerTeam) && player.overall>=state.playerMinOvr;
    });
    const sorters = {
      'overall-desc': (a,b)=>b.overall-a.overall||a.name.localeCompare(b.name),
      'age-asc': (a,b)=>a.age-b.age||b.overall-a.overall,
      'salary-desc': (a,b)=>b.capHit-a.capHit,
      'name-asc': (a,b)=>a.name.localeCompare(b.name)
    };
    filtered.sort(sorters[state.playerSort]);
    document.querySelector('[data-player-count]').textContent = `${filtered.length.toLocaleString()} players`;
    tbody.innerHTML = filtered.slice(0,180).map(player => {
      const team = teamById(player.teamId);
      return `<tr class="clickable-row" data-player-id="${player.id}"><td>${renderPlayerIdentity(player)}</td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span></td><td>${player.age}</td><td><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></td><td><div class="table-team">${renderTeamMark(team)}<div><strong>${team.abbr}</strong><small>${team.record}</small></div></div></td><td>${player.years} yr · ${formatMoney(player.salary)}</td><td>${formatMoney(player.capHit)}</td><td>${player.tradeBlock?'<span class="pill pill--warning">On block</span>':'<span class="pill pill--neutral">Unavailable</span>'}</td></tr>`;
    }).join('') || `<tr><td colspan="8"><div class="roadmap-state"><div class="roadmap-state__inner"><h2>No matching players</h2><p>Change the search or filters to see more results.</p></div></div></td></tr>`;
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

  function renderStandings() {
    const tabs = [['division','Division'],['conference','Conference'],['league','League'],['playoffs','Playoff Picture']];
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Season 4 · Through Week 7</span><h1>Standings</h1><p>Track every division race, conference seed, scoring margin, streak, and projected playoff position.</p></div><div class="heading-actions"><div class="segmented-tabs">${tabs.map(([key,label])=>`<button data-standings-view="${key}" class="${state.standingsView===key?'is-active':''}">${label}</button>`).join('')}</div></div></div>
      <div data-standings-content>${renderStandingsContent()}</div>`;
  }

  function renderStandingsContent() {
    if (state.standingsView==='league') return renderStandingsTable([...teams].sort(sortStandings),true);
    if (state.standingsView==='conference') return `<div class="content-grid content-grid--equal">${['AFC','NFC'].map(conf=>`<article class="card"><div class="card-header"><div><span class="eyebrow">Conference rankings</span><h3>${conf}</h3></div></div>${renderStandingsTable(teams.filter(t=>t.conference===conf).sort(sortStandings),false,true)}</article>`).join('')}</div>`;
    if (state.standingsView==='playoffs') return renderPlayoffPicture();
    const divisions = ['East','North','South','West'];
    return `<div class="division-grid">${['AFC','NFC'].flatMap(conf=>divisions.map(div=>{
      const group=teams.filter(t=>t.conference===conf&&t.division===div).sort(sortStandings);
      return `<article class="card division-card"><div class="card-header"><div><span class="eyebrow">${conf}</span><h3>${div}</h3></div><span class="pill pill--neutral">${group[0].record} leader</span></div>${renderStandingsTable(group,false,false)}</article>`;
    })).join('')}</div>`;
  }

  function renderStandingsTable(group, wrapped=true, seeded=false) {
    const table = `<div class="table-wrap"><table><thead><tr>${seeded?'<th>Seed</th>':''}<th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>Diff</th><th>Streak</th></tr></thead><tbody>${group.map((team,index)=>`<tr class="clickable-row" data-team-id="${team.id}">${seeded?`<td><span class="seed">${index+1}</span></td>`:''}<td><div class="table-team">${renderTeamMark(team)}<div><strong>${team.fullName}</strong><small>${team.conference} ${team.division}</small></div></div></td><td><strong>${team.wins}</strong></td><td>${team.losses}</td><td>${team.pf}</td><td>${team.pa}</td><td class="${team.pf-team.pa>=0?'streak--win':'streak--loss'}">${team.pf-team.pa>=0?'+':''}${team.pf-team.pa}</td><td><span class="streak ${team.streak.startsWith('W')?'streak--win':'streak--loss'}">${team.streak}</span></td></tr>`).join('')}</tbody></table></div>`;
    return wrapped?`<article class="card">${table}</article>`:table;
  }

  function renderPlayoffPicture() {
    return `<div class="playoff-grid">${['AFC','NFC'].map(conf=>{
      const ranked=teams.filter(t=>t.conference===conf).sort(sortStandings).slice(0,9);
      return `<article class="card"><div class="card-header"><div><span class="eyebrow">Projected postseason</span><h3>${conf} Playoff Picture</h3></div><span class="pill pill--accent">7 teams qualify</span></div><div class="playoff-bracket">${ranked.map((team,index)=>`<div class="playoff-seed ${index===7?'playoff-cutline':''}" data-team-id="${team.id}"><span class="seed">${index+1}</span>${renderTeamMark(team)}<div><strong>${team.fullName}</strong><small style="display:block;color:var(--muted);font-size:9px">${index<4?'Division leader':index<7?'Wild card':'In the hunt'}</small></div><strong>${team.record}</strong></div>`).join('')}</div></article>`;
    }).join('')}</div>`;
  }

  function renderStats() {
    const categories = [['passing','Passing'],['rushing','Rushing'],['receiving','Receiving'],['defense','Defense'],['team','Team Stats']];
    const data = statCategoryData(state.statsCategory);
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">League performance</span><h1>Stats & Leaders</h1><p>Compare individual and team production across every major statistical category.</p></div><div class="heading-actions"><div class="segmented-tabs">${categories.map(([key,label])=>`<button data-stats-category="${key}" class="${state.statsCategory===key?'is-active':''}">${label}</button>`).join('')}</div></div></div>
      <div class="leader-grid">${data.leaders.map((leader,index)=>renderLeaderCard(leader,index+1,data)).join('')}</div>
      <article class="card"><div class="card-header"><div><span class="eyebrow">Full leaderboard</span><h3>${data.title}</h3></div><span class="pill pill--neutral">Through Week 7</span></div><div class="table-wrap">${data.table}</div></article>`;
  }

  function statCategoryData(category) {
    if (category==='team') {
      const sorted=[...teams].sort((a,b)=>b.pf-a.pf);
      return { title:'Team scoring and efficiency', leaders:sorted.slice(0,3).map(team=>({team,value:team.pf,label:'Points scored'})), table:`<table><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>PPG</th><th>Allowed</th><th>Diff</th><th>OVR</th></tr></thead><tbody>${sorted.map((team,index)=>`<tr class="clickable-row" data-team-id="${team.id}"><td><span class="seed">${index+1}</span></td><td><div class="table-team">${renderTeamMark(team)}<div><strong>${team.fullName}</strong><small>${team.record}</small></div></div></td><td><strong>${team.pf}</strong></td><td>${(team.pf/7).toFixed(1)}</td><td>${team.pa}</td><td class="${team.pf-team.pa>=0?'streak--win':'streak--loss'}">${team.pf-team.pa>=0?'+':''}${team.pf-team.pa}</td><td>${team.ovr}</td></tr>`).join('')}</tbody></table>` };
    }
    const configurations = {
      passing:{positions:['QB'],sort:'passingYards',title:'Passing leaders',columns:[['passingYards','Yards'],['passingTD','TD'],['interceptions','INT'],['compPct','Comp %']]},
      rushing:{positions:['RB','FB','QB'],sort:'rushingYards',title:'Rushing leaders',columns:[['rushingYards','Yards'],['rushingTD','TD'],['carries','Carries'],['fantasy','Fantasy']]},
      receiving:{positions:['WR','TE','RB'],sort:'receivingYards',title:'Receiving leaders',columns:[['receptions','REC'],['receivingYards','Yards'],['receivingTD','TD'],['fantasy','Fantasy']]},
      defense:{positions:defensePositions,sort:'tackles',title:'Defensive leaders',columns:[['tackles','Tackles'],['sacks','Sacks'],['interceptions','INT'],['forcedFumbles','FF']]}
    };
    const cfg=configurations[category]||configurations.passing;
    const eligible=players.filter(p=>cfg.positions.includes(p.position)&&p.stats[cfg.sort]!==undefined).sort((a,b)=>Number(b.stats[cfg.sort]||0)-Number(a.stats[cfg.sort]||0));
    return { title:cfg.title, leaders:eligible.slice(0,3).map(player=>({player,value:formatStatValue(cfg.sort,player.stats[cfg.sort]),label:cfg.columns[0][1]})), table:`<table><thead><tr><th>Rank</th><th>Player</th>${cfg.columns.map(([,label])=>`<th>${label}</th>`).join('')}<th>OVR</th></tr></thead><tbody>${eligible.slice(0,100).map((player,index)=>`<tr class="clickable-row" data-player-id="${player.id}"><td><span class="seed">${index+1}</span></td><td>${renderPlayerIdentity(player)}</td>${cfg.columns.map(([key])=>`<td class="cell-number">${formatStatValue(key,player.stats[key])}</td>`).join('')}<td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span></td></tr>`).join('')}</tbody></table>` };
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

  function renderSchedule() {
    const week = schedule.find(item=>item.week===state.scheduleWeek) || schedule[7];
    const filtered = week.games.filter(game=>state.scheduleTeam==='All'||game.homeId===state.scheduleTeam||game.awayId===state.scheduleTeam);
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Season 4 calendar</span><h1>Schedule & Results</h1><p>Move between weeks, filter by team, and open any matchup for a detailed game summary.</p></div><div class="heading-actions"><button class="button button--ghost" data-demo-toast="Real advance dates will come from league settings when the backend is connected."><svg><use href="#icon-calendar"></use></svg>Advance calendar</button></div></div>
      <div class="week-control">
        <div class="week-nav"><button class="icon-button icon-button--small" data-week-change="-1" ${state.scheduleWeek===1?'disabled':''}><svg style="transform:rotate(90deg)"><use href="#icon-chevron"></use></svg></button><div class="week-label"><strong>Week ${state.scheduleWeek}</strong><span>${state.scheduleWeek<8?'Completed slate':state.scheduleWeek===8?'Current league week':'Upcoming slate'}</span></div><button class="icon-button icon-button--small" data-week-change="1" ${state.scheduleWeek===9?'disabled':''}><svg style="transform:rotate(-90deg)"><use href="#icon-chevron"></use></svg></button></div>
        <label class="field"><span>Filter team</span><select data-schedule-team><option value="All">All teams</option>${teams.map(team=>`<option value="${team.id}" ${state.scheduleTeam===team.id?'selected':''}>${team.abbr} · ${team.fullName}</option>`).join('')}</select></label>
        <div class="segmented-tabs">${[6,7,8,9].map(num=>`<button data-week="${num}" class="${state.scheduleWeek===num?'is-active':''}">Week ${num}</button>`).join('')}</div>
      </div>
      <div class="schedule-grid">${filtered.map(game=>renderGameCard(game)).join('')}</div>`;
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
      commissioner: { title:'Commissioner Dashboard', eyebrow:'Future operations milestone', icon:'icon-sliders', copy:'League member assignments, committee roles, Madden export health, calculator settings, news controls, and audit records will live here.', items:['Discord assignments','Export status','Trade rules','Committee settings','News editor','Audit log'] }
    }[route] || { title:'Coming Soon',eyebrow:'Project roadmap',icon:'icon-construction',copy:'This area is prepared for a later milestone.',items:[] };
    pageContent.innerHTML=`<div class="page-heading"><div><span class="eyebrow">${data.eyebrow}</span><h1>${data.title}</h1><p>${data.copy}</p></div></div><article class="roadmap-state card"><div class="roadmap-state__inner"><div class="roadmap-icon"><svg><use href="#${data.icon}"></use></svg></div><h2>${data.title} is next in the build plan</h2><p>${data.copy}</p><div class="roadmap-list">${data.items.map(item=>`<span><svg><use href="#icon-check"></use></svg>${item}</span>`).join('')}</div><div class="heading-actions" style="justify-content:center"><button class="button button--primary" data-route="home">Return home</button><button class="button button--ghost" data-route="design-system">View design system</button></div></div></article>`;
  }

  function openGameDetail(gameId) {
    const game=schedule.flatMap(week=>week.games).find(item=>item.id===gameId);
    if (!game) return;
    const away=teamById(game.awayId); const home=teamById(game.homeId);
    const isFinal=game.status==='final'; const isLive=game.status==='live';
    const awayTop=players.filter(p=>p.teamId===away.id).sort((a,b)=>b.overall-a.overall)[0];
    const homeTop=players.filter(p=>p.teamId===home.id).sort((a,b)=>b.overall-a.overall)[0];
    openDetail(`
      <div class="modal-hero"><div><span class="pill ${isLive?'pill--danger':isFinal?'pill--neutral':'pill--accent'}">${isLive?'Live':isFinal?'Final':`Week ${game.week}`}</span><h2>${away.fullName} at ${home.fullName}</h2><div class="news-meta"><span>${game.day} · ${game.time}</span><span>•</span><span>${game.network}</span><span>•</span><span>${game.stadium}</span></div></div></div>
      <div class="modal-body">
        <div class="game-card__body" style="padding:8px 0 22px">
          <div class="game-team">${renderTeamMark(away,'team-logo')}<div><strong>${away.fullName}</strong><span>${away.record}</span></div></div>
          ${isFinal||isLive?`<div class="game-score"><strong>${game.awayScore}</strong><span>–</span><strong>${game.homeScore}</strong></div>`:`<div class="game-time"><strong>${game.time}</strong><span>Kickoff</span></div>`}
          <div class="game-team game-team--away"><div><strong>${home.fullName}</strong><span>${home.record}</span></div>${renderTeamMark(home,'team-logo')}</div>
        </div>
        <p>${escapeHtml(game.headline)} ${isFinal?'The mock game summary shows how completed box scores will appear after Madden exports are connected.':'The matchup preview combines team ratings, records, leaders, and schedule context.'}</p>
        <div class="modal-summary-grid"><div><span>Team Rating</span><strong>${away.ovr} – ${home.ovr}</strong></div><div><span>Points / Game</span><strong>${(away.pf/7).toFixed(1)} – ${(home.pf/7).toFixed(1)}</strong></div><div><span>Point Differential</span><strong>${away.pf-away.pa>=0?'+':''}${away.pf-away.pa} / ${home.pf-home.pa>=0?'+':''}${home.pf-home.pa}</strong></div></div>
        <div class="content-grid content-grid--equal"><article class="card card--flat"><div class="card-header"><div><span class="eyebrow">${away.abbr} impact player</span><h3>${escapeHtml(awayTop.name)}</h3></div><span class="rating-chip rating-chip--elite">${awayTop.overall}</span></div><div class="card-body"><span class="dev-badge ${devClass(awayTop.dev)}">${awayTop.position} · ${awayTop.dev}</span></div></article><article class="card card--flat"><div class="card-header"><div><span class="eyebrow">${home.abbr} impact player</span><h3>${escapeHtml(homeTop.name)}</h3></div><span class="rating-chip rating-chip--elite">${homeTop.overall}</span></div><div class="card-body"><span class="dev-badge ${devClass(homeTop.dev)}">${homeTop.position} · ${homeTop.dev}</span></div></article></div>
        <div class="heading-actions" style="justify-content:flex-start;margin-top:20px"><button class="button button--ghost" data-modal-team="${away.id}">View ${away.abbr}</button><button class="button button--ghost" data-modal-team="${home.id}">View ${home.abbr}</button></div>
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

  function setRoute(route) {
    const hash=`#${route}`;
    if (location.hash===hash) renderRoute(route);
    else location.hash=route;
  }

  function renderRoute(routeInput=location.hash.slice(1)||'home') {
    const route=routeInput||'home';
    const [base,id]=route.split('/');
    closeSidebar();
    document.querySelectorAll('.nav-item[data-route]').forEach(item=>item.classList.toggle('is-active',item.dataset.route===base));
    pageContent.innerHTML='';
    switch(base) {
      case 'home': renderHome(); break;
      case 'teams': id?renderTeamDetail(id):renderTeams(); break;
      case 'my-team': {
        const account=window.FGC_TRADE?.getCurrentAccount?.();
        if(account?.teamId) renderTeamDetail(account.teamId);
        else { showToast('My Team unavailable','Switch to an owner or commissioner identity with an assigned franchise.'); setRoute('teams'); }
        break;
      }
      case 'players': id?renderPlayerProfile(id):renderPlayers(); break;
      case 'standings': renderStandings(); break;
      case 'stats': renderStats(); break;
      case 'schedule': renderSchedule(); break;
      case 'news': renderNews(); break;
      case 'trade-center': window.FGC_TRADE?.renderTradeCenter ? window.FGC_TRADE.renderTradeCenter(id) : renderRoadmap(base); break;
      case 'trade-block': window.FGC_TRADE?.renderTradeBlock ? window.FGC_TRADE.renderTradeBlock() : renderRoadmap(base); break;
      case 'design-system': renderDesignSystem(); break;
      case 'commissioner':
        if (state.role!=='commissioner') { showToast('Commissioner access required','Switch to the Commissioner mock account to preview this area.'); setRoute('home'); return; }
        window.FGC_TRADE?.renderCommissioner ? window.FGC_TRADE.renderCommissioner() : renderRoadmap(base); break;
      default: renderRoadmap(base);
    }
    const pageTitle=base==='my-team' ? (teamById(window.FGC_TRADE?.getCurrentAccount?.()?.teamId)?.fullName||'My Team') : id ? (base==='teams'?teamById(id)?.fullName:playerById(id)?.name) : pageNames[base];
    document.title=`${pageTitle||'Franchise HQ'} — Milestone 1 Complete`;
    mainContent.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function buildCommandResults(query='') {
    const term=query.trim().toLowerCase();
    const pageItems=Object.entries(pageNames).filter(([key])=>key!=='commissioner'||state.role==='commissioner').map(([route,label])=>({type:'Page',label,detail:'Open league page',route,icon:pageIcon(route)}));
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

  function openSidebar() { sidebar.classList.add('is-open'); mobileOverlay.classList.add('is-open'); body.style.overflow='hidden'; }
  function closeSidebar() { sidebar.classList.remove('is-open'); mobileOverlay.classList.remove('is-open'); unlockBody(); }
  function openStylePanel() { stylePanel.classList.add('is-open'); panelOverlay.classList.add('is-open'); body.style.overflow='hidden'; }
  function closeStylePanel() { stylePanel.classList.remove('is-open'); panelOverlay.classList.remove('is-open'); unlockBody(); }
  function unlockBody() { if (![commandModal,detailModal,stylePanel,sidebar].some(el=>el?.classList.contains('is-open'))) body.style.overflow=''; }
  function closeProfileMenu() { profileMenu.classList.remove('is-open'); profileButton.setAttribute('aria-expanded','false'); }

  function applyAccent(name,notify=false) {
    const accent=accents[name]||accents.blue; state.accent=name in accents?name:'blue';
    document.documentElement.style.setProperty('--accent',accent.hex); document.documentElement.style.setProperty('--accent-rgb',accent.rgb);
    document.querySelectorAll('[data-accent]').forEach(button=>button.classList.toggle('is-active',button.dataset.accent===state.accent));
    localStorage.setItem('m1b-accent',state.accent);
    if (notify) showToast(`${accent.label} applied`,'Your appearance preference is saved in this browser.');
  }

  function applyDensity(density) {
    state.density=density==='compact'?'compact':'comfortable'; body.dataset.density=state.density;
    document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('is-active',button.dataset.density===state.density));
    localStorage.setItem('m1b-density',state.density);
  }

  function applyRole(role,notify=false) {
    const labels={commissioner:'Commissioner',owner:'Team Owner',committee:'Trade Committee'};
    state.role=labels[role]?role:'commissioner';
    document.querySelector('[data-current-role]').textContent=labels[state.role];
    document.querySelectorAll('[data-role]').forEach(button=>button.classList.toggle('is-selected',button.dataset.role===state.role));
    document.querySelectorAll('[data-role-link="commissioner"]').forEach(link=>{link.hidden=state.role!=='commissioner';});
    localStorage.setItem('m1b-role',state.role);
    closeProfileMenu();
    if (notify) showToast(`${labels[state.role]} preview active`,state.role==='commissioner'?'All prototype navigation is visible.':'Commissioner-only navigation is hidden.');
    if (state.role!=='commissioner'&&routeBase(location.hash.slice(1))==='commissioner') setRoute('home');
  }

  function showToast(title,copy) {
    const toast=document.createElement('div'); toast.className='toast'; toast.innerHTML=`<span><svg><use href="#icon-info"></use></svg></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>`;
    toastRegion.appendChild(toast); setTimeout(()=>toast.remove(),3800);
  }

  document.addEventListener('click', event => {
    const routeTarget=event.target.closest('[data-route]');
    if (routeTarget) { event.preventDefault(); setRoute(routeTarget.dataset.route); return; }

    const interactiveTarget=event.target.closest('button, a, input, select, textarea, label, [role="button"]');

    const teamTarget=event.target.closest('[data-team-id]');
    if (teamTarget && !interactiveTarget) { setRoute(`teams/${teamTarget.dataset.teamId}`); return; }

    const playerTarget=event.target.closest('[data-player-id]');
    if (playerTarget && !interactiveTarget) { setRoute(`players/${playerTarget.dataset.playerId}`); return; }

    const gameTarget=event.target.closest('[data-game-id]');
    if (gameTarget) { openGameDetail(gameTarget.dataset.gameId); return; }

    const newsTarget=event.target.closest('[data-news-id]');
    if (newsTarget) { openNewsDetail(newsTarget.dataset.newsId); return; }

    const commandRoute=event.target.closest('[data-command-route]');
    if (commandRoute) { const route=commandRoute.dataset.commandRoute; closeCommand(); setRoute(route); return; }

    const commandNews=event.target.closest('[data-command-news]');
    if (commandNews) { const id=commandNews.dataset.commandNews; closeCommand(); openNewsDetail(id); return; }

    const modalTeam=event.target.closest('[data-modal-team]');
    if (modalTeam) { const id=modalTeam.dataset.modalTeam; closeDetail(); setRoute(`teams/${id}`); return; }

    const teamTab=event.target.closest('[data-team-tab]');
    if (teamTab) { state.teamTab=teamTab.dataset.teamTab; renderRoute(location.hash.slice(1)); return; }

    const standingsView=event.target.closest('[data-standings-view]');
    if (standingsView) { state.standingsView=standingsView.dataset.standingsView; renderStandings(); return; }

    const statsCategory=event.target.closest('[data-stats-category]');
    if (statsCategory) { state.statsCategory=statsCategory.dataset.statsCategory; renderStats(); return; }

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

  document.addEventListener('input', event => {
    if (event.target.matches('[data-team-search]')) { state.teamSearch=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-player-search]')) { state.playerSearch=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-command-input]')) buildCommandResults(event.target.value);
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-team-conference]')) { state.teamConference=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-team-division]')) { state.teamDivision=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-player-position]')) { state.playerPosition=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-team]')) { state.playerTeam=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-player-ovr]')) { state.playerMinOvr=Number(event.target.value); refreshPlayerTable(); }
    if (event.target.matches('[data-player-sort]')) { state.playerSort=event.target.value; refreshPlayerTable(); }
    if (event.target.matches('[data-schedule-team]')) { state.scheduleTeam=event.target.value; renderSchedule(); }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') { event.preventDefault(); openCommand(); }
    if (event.key==='Escape') { closeCommand(); closeDetail(); closeStylePanel(); closeSidebar(); closeProfileMenu(); }
  });

  window.addEventListener('hashchange',()=>renderRoute());

  window.FGC_APP = {
    teams, players, schedule, newsArticles, state, pageContent,
    teamById, playerById, teamStyle, renderTeamMark, renderPlayerIdentity,
    devClass, formatMoney, escapeHtml, setRoute, renderRoute, showToast,
    openDetail, closeDetail, applyRole, closeProfileMenu
  };

  applyAccent(state.accent,false);
  applyDensity(state.density);
  applyRole(state.role,false);
  renderRoute();
})();
