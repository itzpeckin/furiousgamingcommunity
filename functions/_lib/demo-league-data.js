// Fictional, deterministic data for the dedicated public tenant. No customer
// snapshot, account, Discord identity, or import is used to build this dataset.
export const DEMO_ID = 'league_fhq_public_demo';
export const DEMO_SLUG = 'demo';
export const DEMO_REVISION = 'demo-2027-week8-v1';
export const DEMO_DATE = '2026-10-23T12:00:00.000Z';
export const DEMO_LEAGUE = Object.freeze({id:DEMO_ID,slug:DEMO_SLUG,name:'FHQ Demo League',current_season:2027,current_week:8,timezone:'America/Chicago'});

const clubs = [
  ['BUF','Buffalo','Bills','AFC','East','#00338d','#c60c30'],['MIA','Miami','Dolphins','AFC','East','#008e97','#fc4c02'],
  ['NE','New England','Patriots','AFC','East','#002244','#c60c30'],['NYJ','New York','Jets','AFC','East','#125740','#ffffff'],
  ['BAL','Baltimore','Ravens','AFC','North','#241773','#9e7c0c'],['CIN','Cincinnati','Bengals','AFC','North','#fb4f14','#000000'],
  ['CLE','Cleveland','Browns','AFC','North','#311d00','#ff3c00'],['PIT','Pittsburgh','Steelers','AFC','North','#ffb612','#101820'],
  ['HOU','Houston','Texans','AFC','South','#03202f','#a71930'],['IND','Indianapolis','Colts','AFC','South','#002c5f','#a2aaad'],
  ['JAX','Jacksonville','Jaguars','AFC','South','#006778','#d7a22a'],['TEN','Tennessee','Titans','AFC','South','#0c2340','#4b92db'],
  ['DEN','Denver','Broncos','AFC','West','#fb4f14','#002244'],['KC','Kansas City','Chiefs','AFC','West','#e31837','#ffb81c'],
  ['LV','Las Vegas','Raiders','AFC','West','#000000','#a5acaf'],['LAC','Los Angeles','Chargers','AFC','West','#0080c6','#ffc20e'],
  ['DAL','Dallas','Cowboys','NFC','East','#003594','#869397'],['NYG','New York','Giants','NFC','East','#0b2265','#a71930'],
  ['PHI','Philadelphia','Eagles','NFC','East','#004c54','#a5acaf'],['WAS','Washington','Commanders','NFC','East','#5a1414','#ffb612'],
  ['CHI','Chicago','Bears','NFC','North','#0b162a','#c83803'],['DET','Detroit','Lions','NFC','North','#0076b6','#b0b7bc'],
  ['GB','Green Bay','Packers','NFC','North','#203731','#ffb612'],['MIN','Minnesota','Vikings','NFC','North','#4f2683','#ffc62f'],
  ['ATL','Atlanta','Falcons','NFC','South','#a71930','#000000'],['CAR','Carolina','Panthers','NFC','South','#0085ca','#101820'],
  ['NO','New Orleans','Saints','NFC','South','#d3bc8d','#101820'],['TB','Tampa Bay','Buccaneers','NFC','South','#d50a0a','#34302b'],
  ['ARI','Arizona','Cardinals','NFC','West','#97233f','#000000'],['LAR','Los Angeles','Rams','NFC','West','#003594','#ffa300'],
  ['SF','San Francisco','49ers','NFC','West','#aa0000','#b3995d'],['SEA','Seattle','Seahawks','NFC','West','#002244','#69be28']
];
const first = ['Adrian','Miles','Nolan','Darius','Evan','Malik','Rowan','Caleb','Isaiah','Julian','Cameron','Andre','Jordan','Micah','Theo','Damon','Ellis','Kieran','Marcus','Silas','Grant','Devin','Jalen','Wyatt','Quentin','Troy','Emmett','Ashton','Bryce','Luca','Noah','Reid'];
const last = ['Mercer','Holloway','Bennett','Vaughn','Callahan','Hayes','Sinclair','Porter','Westbrook','Hawthorne','Reed','Bowman','Sutton','Ellison','Caldwell','Pierce','Fletcher','Maddox','Wilder','Prescott','Langley','Bishop','Monroe','Archer','Sterling','Brooks','Dawson','Rowe','Kendall','Lockwood','Winslow','Barrett'];
const positions = [['QB',3],['HB',3],['FB',1],['WR',6],['TE',3],['LT',2],['LG',2],['C',2],['RG',2],['RT',2],['LEDGE',2],['REDGE',2],['DT',4],['SAM',2],['MIKE',3],['WILL',2],['CB',6],['FS',2],['SS',2],['K',1],['P',1]];
const number = (seed,min,max) => {let value=2166136261;for(const c of String(seed))value=Math.imul(value^c.charCodeAt(0),16777619);return min+((value>>>0)%(max-min+1));};

export function buildDemoLeagueData(){
  const teams=clubs.map(([abbr,city,nickname,conference,division,primary,secondary],index)=>({
    external_id:abbr.toLowerCase(),teamId:abbr.toLowerCase(),display_name:`${city} ${nickname}`,city_name:city,nickname,
    abbreviation:abbr,conference_name:conference,division_name:division,primary_color:primary,secondary_color:secondary,
    overall:number(abbr,79,90),wins:0,losses:0,ties:0,ptsFor:0,ptsAgainst:0,capAvailable:number(abbr+'cap',12,48)*1000000,
    coachName:`${first[index]} ${last[(index+9)%32]}`,stadiumName:`${city} Stadium`,demoOwner:`Coach ${first[index]}`
  }));
  const players=[];
  for(const [teamIndex,team] of teams.entries()){
    let slot=0;
    for(const [position,count] of positions)for(let depth=1;depth<=count;depth++){
      const serial=teamIndex*53+slot++,id=`demo-${String(serial+1).padStart(4,'0')}`;
      const overall=depth===1?number(id,78,97):number(id,62,82),age=number(id+'age',21,32);
      players.push({external_id:id,publicId:`plr_${(serial+1).toString(16).padStart(32,'0')}`,teamId:team.teamId,firstName:first[serial%32],lastName:last[Math.floor(serial/32)%32],
        position,overall,age,yearsPro:age-21,devTrait:overall>=94?'X-Factor':overall>=89?'Superstar':overall>=82?'Star':'Normal',
        jerseyNumber:number(id+'jersey',1,99),heightInches:number(id+'height',70,79),weightLbs:['LT','LG','C','RG','RT','DT'].includes(position)?number(id,285,325):number(id,190,250),
        college:['Oregon','Texas','Michigan','Georgia','LSU','Ohio State'][serial%6],depthOrder:depth,depthPosition:position,
        speedRating:number(id+'spd',position==='QB'?70:76,96),strengthRating:number(id+'str',65,92),agilityRating:number(id+'agi',70,95),
        accelerationRating:number(id+'acc',75,96),awarenessRating:number(id+'awr',65,95),throwPowerRating:position==='QB'?number(id+'thp',86,98):35,
        throwAccShortRating:number(id+'tas',75,95),throwAccMidRating:number(id+'tam',72,94),throwAccDeepRating:number(id+'tad',70,93),
        catchRating:number(id+'cth',65,96),tackleRating:number(id+'tak',65,94),injuryRating:94,staminaRating:92,
        contractLength:4,contractYearsLeft:number(id+'years',1,4),contractSalary:overall*220000,contractBonus:overall*30000,capHit:overall*90000,
        isInjured:0,rosterStatus:'active',archetype:position==='QB'?'Field General':position==='WR'?'Route Runner':'Balanced'});
    }
  }
  const games=[],rotation=teams.map(t=>t.teamId);
  for(let round=0;round<17;round++){
    for(let pair=0;pair<16;pair++){
      const week=round<8?round+1:round===8?(pair<8?9:10):round+2;
      const home=rotation[(round%2)?pair:31-pair],away=rotation[(round%2)?31-pair:pair],played=week<8;
      const id=`demo-game-${String(week).padStart(2,'0')}-${home}-${away}`;
      const homeScore=number(id+'h',1,5)*7+number(id+'hf',0,2)*3;
      let awayScore=number(id+'a',1,4)*7+number(id+'af',0,3)*3;
      if(homeScore===awayScore)awayScore+=3;
      games.push({external_id:id,seasonYear:2027,stage:'regular',weekIndex:week,homeTeamId:home,awayTeamId:away,homeScore:played?homeScore:null,awayScore:played?awayScore:null,status:played?'final':'scheduled',scheduledAt:new Date(Date.UTC(2027,8,5+(week-1)*7,17+pair%4)).toISOString()});
      if(played){for(const [key,score,against] of [[home,homeScore,awayScore],[away,awayScore,homeScore]]){const team=teams.find(t=>t.teamId===key);team.ptsFor+=score;team.ptsAgainst+=against;team[score>against?'wins':score<against?'losses':'ties']++;}}
    }
    rotation.splice(1,0,rotation.pop());
  }
  const statistics=[];
  for(const game of games.filter(g=>g.status==='final'))for(const teamId of [game.homeTeamId,game.awayTeamId]){
    const roster=players.filter(p=>p.teamId===teamId);
    const add=(p,category,metrics)=>statistics.push({external_key:`${game.external_id}-${p.external_id}-${category}`,category,playerId:p.external_id,teamId,seasonYear:2027,stage:'regular',weekIndex:game.weekIndex,gameId:game.external_id,metrics});
    const qb=roster.find(p=>p.position==='QB');
    add(qb,'passing',{passYds:number(game.external_id+teamId,170,385),passAtt:34,passComp:number(qb.external_id+game.weekIndex,19,29),passTDs:number(game.external_id+'td'+teamId,1,4),passInts:number(game.external_id+'int'+teamId,0,2),passLongest:48,passSacks:2});
    for(const p of roster.filter(p=>['HB','QB'].includes(p.position)&&p.depthOrder===1))add(p,'rushing',{rushYds:number(p.external_id+game.weekIndex,25,125),rushAtt:p.position==='QB'?5:18,rushTDs:number(p.external_id+'td'+game.weekIndex,0,2),rushLongest:27,rushFum:0});
    for(const p of roster.filter(p=>['WR','TE','HB'].includes(p.position)&&p.depthOrder<=2))add(p,'receiving',{recYds:number(p.external_id+game.weekIndex,18,105),recCatches:number(p.external_id+'rec'+game.weekIndex,2,8),recTDs:number(p.external_id+'td'+game.weekIndex,0,1),recLongest:33,recDrops:0});
    for(const p of roster.filter(p=>['LEDGE','REDGE','DT','SAM','MIKE','WILL','CB','FS','SS'].includes(p.position)&&p.depthOrder===1))add(p,'defense',{defTotalTackles:number(p.external_id+game.weekIndex,3,10),defSoloTackles:3,defAssistTackles:2,defSacks:['LEDGE','REDGE','DT'].includes(p.position)?number(p.external_id+'s'+game.weekIndex,0,2):0,defInts:number(p.external_id+'i'+game.weekIndex,0,7)===0?1:0,defDeflections:1,defFumRec:0,defForcedFum:0,defTDs:0});
    const kicker=roster.find(p=>p.position==='K');add(kicker,'kicking',{fgMade:2,fgAtt:2,xpMade:3,xpAtt:3,fgLong:48});
    const punter=roster.find(p=>p.position==='P');add(punter,'punting',{puntAtt:4,puntYds:188,puntLong:55,puntInside20:2,puntTBs:0});
  }
  const standings=[...teams].sort((a,b)=>b.wins-a.wins||b.ptsFor-b.ptsAgainst-(a.ptsFor-a.ptsAgainst)).map((team,index)=>({teamId:team.teamId,teamName:team.display_name,totalWins:team.wins,totalLosses:team.losses,totalTies:team.ties,winPct:(team.wins+team.ties/2)/7,conferenceName:team.conference_name,divisionName:team.division_name,rank:index+1,seed:index%16+1,ptsFor:team.ptsFor,ptsAgainst:team.ptsAgainst,netPts:team.ptsFor-team.ptsAgainst,seasonYear:2027,weekIndex:8}));
  return {teams,players,games,statistics,standings};
}
