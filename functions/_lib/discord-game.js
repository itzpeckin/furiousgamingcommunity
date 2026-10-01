import { discordLeagueReadModel } from './discord-read-model.js';
import { activeTeamAssignments, resolveTeam } from './league-teams.js';
import { snapshotCurrentPeriod } from './schedule-integrity.js';
import { summaryStage, summaryGameFinal, gameSummaryPerformers, gamePreviewPlayers } from '../../league-engine/game-summary.js';
import { discordGameCardData, signedDiscordGameCardUrl } from './discord-game-card.js';
import { normalizeStatisticCompact } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';

export async function gameSummaryDetails(c,model,game){
  if(!model.players){
    const details=await discordLeagueReadModel(c,{domains:['players','standings']});
    if(details.snapshot.id!==model.snapshot.id)throw Object.assign(new Error('The league was updated. Please choose the game again.'),{status:409});
    Object.assign(model,details);
  }
  // Read the selected week directly; season-wide pagination can truncate recent games.
  const key=`${game.week}:${summaryStage(game.stage)}`;
  if(model.statisticsPeriod!==key){
    const result=await c.db.prepare(`SELECT data_json FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='statistics'
      AND COALESCE(json_extract(data_json,'$.week_index'),json_extract(data_json,'$.weekIndex'),json_extract(data_json,'$.week'))=?
      LIMIT 10000`).bind(c.league.id,model.snapshot.id,Number(game.week)).all();
    model.statistics=(result.results||[]).map(row=>normalizeStatisticCompact(JSON.parse(row.data_json)));
    model.statisticsPeriod=key;
  }
  return model;
}

export function currentSummaryGames(model){
  const period=snapshotCurrentPeriod(model.snapshot);
  return period?model.games.filter(game=>Number(game.week)===Number(period.week)&&summaryStage(game.stage)===period.stage):[];
}
export async function gameAutocompleteChoices(c,query=''){
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  return currentSummaryGames(model).map(game=>{
    const away=resolveTeam(model.teams,game.awayTeamId),home=resolveTeam(model.teams,game.homeTeamId);
    return {name:`${away?.displayName||game.awayTeamId} at ${home?.displayName||game.homeTeamId} · ${summaryGameFinal(game)?'Final':'Preview'}`.slice(0,100),value:game.id};
  }).filter(item=>item.name.toLowerCase().includes(query.toLowerCase())).slice(0,25);
}
export async function gameCardMessage(c,model,game){
  const final=summaryGameFinal(game),performers=gameSummaryPerformers(game,model.statistics,model.players);
  const assignments=model.gameAssignments??=await activeTeamAssignments(c.db,c.league.id);
  const side=(id,score)=>{
    const team=resolveTeam(model.teams,id)||{},owner=assignments.get(team.teamKey);
    const standing=(model.standings||[]).find(row=>String(row.teamId)===String(id))||team.record||{};
    return {name:team.displayName||id,abbreviation:team.abbreviation,gm:owner?.displayName||'Unassigned',
      primary:team.primaryColor,secondary:team.secondaryColor,logo:team.logoUrl||team.logo,score,
      record:`${standing.wins||0}-${standing.losses||0}-${standing.ties||0}`,
      rows:final?performers[String(id)]:gamePreviewPlayers(id,model.players)};
  };
  const away=side(game.awayTeamId,game.awayScore),home=side(game.homeTeamId,game.homeScore);
  const card=discordGameCardData({league:c.league.name,season:model.snapshot.season_year,week:game.week,
    stage:summaryStage(game.stage)==='regular-season'?'Regular Season':summaryStage(game.stage)==='preseason'?'Preseason':'Playoffs',final,away,home});
  const embed={title:`${away.abbreviation||away.name} ${final?game.awayScore??'—':'at'} ${final?'– ':''}${home.abbreviation||home.name}${final?` ${game.homeScore??'—'} · Final`:''}`,
    description:`${c.league.name} · ${model.snapshot.season_year} · Week ${game.week}`,
    url:`https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#schedule`,color:0x4f8cff};
  if(c.env?.DISCORD_BOT_TOKEN)embed.image={url:await signedDiscordGameCardUrl(c.env,card)};
  else embed.fields=[away,home].map(team=>({name:team.name,value:team.rows.map(row=>`${row.label}: ${row.name} — ${row.detail}`).join('\n')}));
  return {content:'',embeds:[embed],allowed_mentions:{parse:[]}};
}
export async function gameCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  const game=currentSummaryGames(model).find(item=>item.id===String(values.matchup||''));
  if(!game)throw Object.assign(new Error('Choose a matchup from the current imported week. Refresh the game choices if the league has advanced.'),{status:404});
  return gameCardMessage(c,await gameSummaryDetails(c,model,game),game);
}
