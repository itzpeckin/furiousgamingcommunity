import { accountReadiness } from './beta-access.js';

export async function leagueReadiness(db,league,userId) {
  const results = await db.batch([
    db.prepare(`SELECT s.id,s.team_count,s.player_count,s.season_year,s.week_index FROM league_active_snapshots a
      JOIN league_snapshots s ON s.id=a.snapshot_id AND s.league_id=a.league_id WHERE a.league_id=?`).bind(league.id),
    db.prepare(`SELECT COUNT(*) count FROM franchise_seasons WHERE league_id=? AND status IN ('preview','active')`).bind(league.id),
    db.prepare(`SELECT latest_session_id,last_received_at FROM companion_league_export_endpoints WHERE league_id=?`).bind(league.id),
    db.prepare(`SELECT COUNT(*) count,SUM(CASE WHEN team_id IS NOT NULL THEN 1 ELSE 0 END) assigned,
      SUM(CASE WHEN role='team_owner' AND team_id IS NULL THEN 1 ELSE 0 END) unassigned
      FROM league_memberships WHERE league_id=? AND active=1`).bind(league.id),
    db.prepare(`SELECT COUNT(*) count FROM discord_league_installations WHERE league_id=? AND status='active'`).bind(league.id)
  ]);
  const first = index => results[index]?.results?.[0] || {};
  const account = await accountReadiness(db,userId);
  const snapshot = first(0);
  const base = '/leagues/'+encodeURIComponent(league.slug);
  const rosterReady = Number(snapshot.team_count) === 32 && Number(snapshot.player_count)>0;
  const checks = [
    { id:'account',label:'Account verified',complete:account.verified,href:'/account',action:'Verify email' },
    { id:'access',label:'League access',complete:league.tenant_status === 'enabled',href:'/register-league',action:'Finish registration' },
    { id:'season',label:'Season prepared',complete:Number(first(1).count)>0,href:base+'#commissioner/overview',action:'Connect Madden',detail:'Your chosen Madden edition and franchise season.' },
    { id:'export',label:'Export received',complete:Boolean(first(2).latest_session_id),href:base+'#commissioner/overview',action:'Export Madden data',detail:'Use EA Direct or your permanent Companion export URL.' },
    { id:'roster',label:'First roster imported',complete:rosterReady,href:base+'#commissioner/overview',action:'Import latest export',detail:rosterReady ? '32 teams and '+snapshot.player_count+' players are live.' : 'Include rosters in your first export, then refresh and import.' },
    { id:'assignments',label:'Team assignments',complete:rosterReady && Number(first(3).assigned)>0 && Number(first(3).unassigned)===0,href:base+'#commissioner/teams',action:'Assign teams',detail:'Invite members and assign their teams in People & Teams.' },
    { id:'discord',label:'Discord (optional)',optional:true,complete:Number(first(4).count)>0,href:base+'#commissioner/controls',action:'Connect Discord',detail:'Add scheduling threads and league bot commands when you want them.' }
  ];
  return { checks,ready:checks.filter(check=>!check.optional).every(check=>check.complete),next:checks.find(check=>!check.optional && !check.complete)?.id || null,
    league:{ name:league.name,slug:league.slug },leagueUrl:base };
}
