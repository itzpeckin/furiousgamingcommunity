import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../_lib/permissions.js';
import { activeLeagueTeams, activeTeamAssignments, canonicalTeamKey, resolveTeam, publicLeagueTeams } from '../../../_lib/league-teams.js';
import { createTenantAuditContext, tenantAuditStatement } from '../../../_lib/tenant-context.js';
import {
  TRADE_CENTER_RELEASE,
  normalizeTradeCenterSettings,
  tradeCenterSettingsFromLeagueDocument,
  withTradeCenterSettings,
  normalizeTradeTransfers,
  workflowDecision
} from '../../../_lib/trade-center.js';
import { applyVersionedDraftPickBaseline, ensureDraftPickHorizon } from '../../../_lib/draft-pick-baselines.js';

const jsonParse = (value, fallback = null) => {
  try { return JSON.parse(value || 'null') ?? fallback; }
  catch { return fallback; }
};
const resultRows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
const cleanText = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const memberTeam = session => canonicalTeamKey(session?.membership?.teamKey || session?.membership?.teamId);
const isReviewer = session => ['commissioner','trade_committee'].includes(String(session?.membership?.role || ''));
const isCommissioner = session => String(session?.membership?.role || '') === 'commissioner';

async function requestContext(context) {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return {response:authorization.response};
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return {response:json({ok:false,error:'Invalid league slug.'},400)};
  const db = database(context.env);
  const league = await resolveLeague(context.env, slug);
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return {response:json({ok:false,error:'Not found.'},404)};
  }
  const teams = await activeLeagueTeams(db, league.id);
  const storedTeamId=authorization.session.membership?.teamId;
  const assignedTeam=storedTeamId ? resolveTeam(teams,storedTeamId) : null;
  const session={
    ...authorization.session,
    membership:{...authorization.session.membership,teamKey:assignedTeam?.teamKey||canonicalTeamKey(storedTeamId)}
  };
  return {db, league, teams, session};
}

async function currentSeason(db, leagueId) {
  const imported = await db.prepare(`SELECT destination.franchise_season_id AS id, season.season_year AS seasonYear,
      season.display_name AS displayName,season.game_release AS gameRelease
    FROM league_active_snapshots active
    JOIN companion_candidate_import_runs run
      ON run.league_id=active.league_id AND run.candidate_snapshot_id=active.snapshot_id
    JOIN companion_import_destinations destination
      ON destination.id=run.destination_id AND destination.league_id=run.league_id
    JOIN franchise_seasons season
      ON season.id=destination.franchise_season_id AND season.league_id=destination.league_id
    WHERE active.league_id=?
    ORDER BY run.completed_at DESC, run.created_at DESC LIMIT 1`).bind(leagueId).first();
  if (imported) return imported;
  return db.prepare(`SELECT id,season_year AS seasonYear,display_name AS displayName,game_release AS gameRelease
      FROM franchise_seasons WHERE league_id=? AND status='active'
      ORDER BY season_year DESC,created_at DESC LIMIT 1`).bind(leagueId).first();
}

async function activeSnapshotId(db, leagueId) {
  const row = await db.prepare(`SELECT snapshot_id AS snapshotId FROM league_active_snapshots WHERE league_id=?`).bind(leagueId).first();
  return row?.snapshotId || null;
}

async function leagueSettings(db, leagueId) {
  const row = await db.prepare(`SELECT revision,settings_json AS settingsJson,updated_at AS updatedAt
    FROM league_settings WHERE league_id=?`).bind(leagueId).first();
  const document = jsonParse(row?.settingsJson, {});
  return {
    revision:Number(row?.revision || 0),
    updatedAt:row?.updatedAt || null,
    document,
    tradeCenter:tradeCenterSettingsFromLeagueDocument(document)
  };
}

async function notificationStatements(db, leagueId, tradeId, users, type, title, message) {
  return [...new Set((users || []).filter(Boolean))].map(userId => db.prepare(`INSERT INTO league_notifications
    (id,league_id,user_id,trade_id,notification_type,title,message,created_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
      `notification_${crypto.randomUUID()}`,leagueId,userId,tradeId,type,title,message
    ));
}

async function participantUserIds(db, leagueId, teamKeys) {
  const wanted = new Set((teamKeys || []).map(canonicalTeamKey));
  const teams = await activeLeagueTeams(db, leagueId);
  const memberships = await resultRows(db, `SELECT user_id AS userId,team_id AS teamId
    FROM league_memberships WHERE league_id=? AND active=1 AND team_id IS NOT NULL`, leagueId);
  return memberships.filter(row => {
    const team = resolveTeam(teams, row.teamId);
    return team && wanted.has(team.teamKey);
  }).map(row => row.userId);
}

async function reviewerUserIds(db, leagueId, participantTeams = []) {
  const excluded = new Set(participantTeams.map(canonicalTeamKey));
  const teams = await activeLeagueTeams(db, leagueId);
  const rows = await resultRows(db, `SELECT user_id AS userId,team_id AS teamId
    FROM league_memberships WHERE league_id=? AND active=1 AND role IN ('commissioner','trade_committee')`, leagueId);
  return rows.filter(row => {
    if (!row.teamId) return true;
    const team = resolveTeam(teams, row.teamId);
    return !team || !excluded.has(team.teamKey);
  }).map(row => row.userId);
}

async function workflow(db, leagueId, tradeId) {
  return db.prepare(`SELECT * FROM trade_workflows WHERE league_id=? AND id=?`).bind(leagueId, tradeId).first();
}

async function workflowParticipants(db, leagueId, tradeId) {
  return resultRows(db, `SELECT * FROM trade_workflow_participants
    WHERE league_id=? AND trade_id=? ORDER BY team_key`, leagueId, tradeId);
}

function requireCurrentRevision(body, row) {
  const revision=Number(body?.revision);
  if(!Number.isInteger(revision))throw Object.assign(new Error('The trade revision is required. Refresh and try again.'),{status:400});
  if(revision!==Number(row.revision))throw Object.assign(new Error('This trade changed in another session. Refresh before taking action.'),{status:409});
}

function maySeeWorkflow(row, participants, session) {
  if (String(row.status)==='draft') return String(row.proposer_user_id)===String(session?.user?.id);
  if (String(row.status)==='approved' || isReviewer(session)) return true;
  const ownTeam = memberTeam(session);
  return Boolean(ownTeam && participants.some(item => canonicalTeamKey(item.team_key) === ownTeam));
}

async function publicWorkflow(db, leagueId, row, session) {
  const participants = await workflowParticipants(db, leagueId, row.id);
  if (!maySeeWorkflow(row, participants, session)) return null;
  const ownTeam=memberTeam(session);
  const participant=Boolean(ownTeam&&participants.some(item=>canonicalTeamKey(item.team_key)===ownTeam));
  const privateAccess=participant||isReviewer(session)||String(row.proposer_user_id)===String(session?.user?.id);
  const assets = await resultRows(db, `SELECT id,revision,asset_type AS assetType,source_player_id AS sourcePlayerId,
      player_identity_id AS playerIdentityId,draft_pick_id AS draftPickId,from_team_key AS fromTeamKey,
      to_team_key AS toTeamKey,ordinal
    FROM trade_workflow_assets WHERE league_id=? AND trade_id=? AND revision=? ORDER BY ordinal,id`,
    leagueId,row.id,row.revision);
  const messages = privateAccess ? await resultRows(db, `SELECT message.id,message.author_user_id AS authorUserId,
      user.display_name AS authorName,message.event_type AS eventType,message.message,message.created_at AS createdAt
    FROM trade_workflow_messages message LEFT JOIN users user ON user.id=message.author_user_id
    WHERE message.league_id=? AND message.trade_id=? ORDER BY message.created_at,message.id`,leagueId,row.id) : [];
  const reviews = privateAccess
    ? await resultRows(db, `SELECT review.reviewer_user_id AS reviewerUserId,user.display_name AS reviewerName,
        review.decision,review.reason,review.updated_at AS updatedAt
      FROM trade_workflow_reviews review JOIN users user ON user.id=review.reviewer_user_id
      WHERE review.league_id=? AND review.trade_id=? AND review.revision=? ORDER BY review.updated_at`,leagueId,row.id,row.revision)
    : [];
  return {
    id:row.id,status:row.status,revision:Number(row.revision),proposerTeamKey:row.proposer_team_key,
    note:privateAccess?(row.note || ''):'',freeTrade:Boolean(row.free_trade),reviewThreshold:Number(row.review_threshold),
    decisionReason:privateAccess?(row.decision_reason || null):null,approvedAt:row.approved_at || null,rejectedAt:privateAccess?(row.rejected_at || null):null,
    createdAt:row.created_at,updatedAt:row.updated_at,
    participants:participants.map(item => ({teamKey:item.team_key,acceptedRevision:item.accepted_revision,acceptedAt:item.accepted_at})),
    assets,messages,reviews,
    review:workflowDecision(reviews.map(review => ({reviewerUserId:review.reviewerUserId,decision:review.decision})),row.review_threshold)
  };
}

async function publicState(c) {
  const season = await currentSeason(c.db,c.league.id);
  const pickBaseline=season ? await ensureDraftPickHorizon(c.db,{leagueId:c.league.id,franchiseSeasonId:season.id,
    seasonYear:season.seasonYear,gameRelease:season.gameRelease,teams:c.teams}) : null;
  const settings = await leagueSettings(c.db,c.league.id);
  const assignments = await activeTeamAssignments(c.db,c.league.id,c.teams);
  const allRows = await resultRows(c.db, `SELECT * FROM trade_workflows WHERE league_id=?
    ORDER BY updated_at DESC LIMIT 250`,c.league.id);
  const workflows = [];
  for (const row of allRows) {
    const item = await publicWorkflow(c.db,c.league.id,row,c.session);
    if (item) workflows.push(item);
  }
  const picks = season ? await resultRows(c.db, `SELECT id,draft_class AS draftClass,round,
      original_team_key AS originalTeamKey,current_team_key AS currentTeamKey,source_authority AS sourceAuthority,
      revision,updated_at AS updatedAt FROM league_draft_picks
    WHERE league_id=? AND draft_class BETWEEN ? AND ? AND continuity_key IS NOT NULL
    ORDER BY draft_class,round,original_team_key`,c.league.id,Number(season.seasonYear)+1,Number(season.seasonYear)+3) : [];
  const listings = await resultRows(c.db, `SELECT listing.id,listing.team_key AS teamKey,listing.asset_type AS assetType,
      listing.player_identity_id AS playerIdentityId,identity.public_id AS playerPublicId,identity.display_name AS playerName,
      listing.draft_pick_id AS draftPickId,listing.requested_return AS requestedReturn,
      listing.needs_json AS needsJson,listing.updated_at AS updatedAt
    FROM trade_block_listings listing
    LEFT JOIN player_identities identity ON identity.id=listing.player_identity_id
    WHERE listing.league_id=? AND listing.active=1 ORDER BY listing.updated_at DESC`,c.league.id);
  const notifications = await resultRows(c.db, `SELECT id,trade_id AS tradeId,notification_type AS type,title,message,
      read_at AS readAt,created_at AS createdAt FROM league_notifications
    WHERE league_id=? AND user_id=? ORDER BY created_at DESC LIMIT 100`,c.league.id,c.session.user.id);
  return {
    ok:true,release:TRADE_CENTER_RELEASE,
    league:{id:c.league.id,slug:c.league.slug,name:c.league.name},
    session:{userId:c.session.user.id,role:c.session.membership.role,teamKey:memberTeam(c.session)},
    season:season || null,settings:{revision:settings.revision,updatedAt:settings.updatedAt,...settings.tradeCenter},
    teams:publicLeagueTeams(c.teams,assignments),picks,pickBaseline,workflows,
    listings:listings.map(item => ({...item,needs:jsonParse(item.needsJson,{})})),notifications
  };
}

async function playerAsset(c, assetId, fromTeamKey) {
  const identity = await c.db.prepare(`SELECT identity.id AS playerIdentityId,identity.public_id AS publicId,
      alias.source_player_id AS sourcePlayerId
    FROM player_identities identity JOIN player_source_aliases alias
      ON alias.player_identity_id=identity.id AND alias.league_id=identity.league_id
    WHERE identity.league_id=? AND (identity.id=? OR identity.public_id=? OR alias.source_player_id=?)
    ORDER BY alias.updated_at DESC LIMIT 1`).bind(c.league.id,assetId,assetId,assetId).first();
  if (!identity) throw Object.assign(new Error('Player identity was not found.'),{status:422});
  const active = await c.db.prepare(`SELECT record.data_json AS dataJson
    FROM league_active_snapshots snapshot JOIN league_snapshot_records record
      ON record.league_id=snapshot.league_id AND record.snapshot_id=snapshot.snapshot_id
    WHERE snapshot.league_id=? AND record.domain='players' AND record.external_id=? LIMIT 1`)
    .bind(c.league.id,identity.sourcePlayerId).first();
  if (!active) throw Object.assign(new Error('Player is not on the active Madden roster.'),{status:409});
  const record = jsonParse(active.dataJson,{});
  const externalTeam = record.team_external_id ?? record.teamId ?? record.team_id;
  const sourceTeam = resolveTeam(c.teams,externalTeam);
  const overlay = await c.db.prepare(`SELECT to_team_key AS toTeamKey FROM trade_roster_overlays
    WHERE league_id=? AND player_identity_id=? AND internal_status='active' LIMIT 1`).bind(c.league.id,identity.playerIdentityId).first();
  const effectiveTeam = overlay?.toTeamKey ? canonicalTeamKey(overlay.toTeamKey) : sourceTeam?.teamKey;
  if (!effectiveTeam || effectiveTeam !== fromTeamKey) throw Object.assign(new Error('Player ownership changed. Refresh the Trade Center and try again.'),{status:409});
  if (overlay) throw Object.assign(new Error('Player is already committed in an approved trade.'),{status:409});
  return identity;
}

async function validatedTransfers(c, bodyTransfers, settings) {
  const normalized = normalizeTradeTransfers(bodyTransfers,settings);
  const assets = [];
  for (const transfer of normalized.transfers) {
    if (transfer.assetType === 'player') {
      const identity = await playerAsset(c,transfer.assetId,transfer.fromTeamKey);
      assets.push({...transfer,...identity});
    } else {
      const pick = await c.db.prepare(`SELECT id,current_team_key AS currentTeamKey FROM league_draft_picks
        WHERE id=? AND league_id=?`).bind(transfer.assetId,c.league.id).first();
      if (!pick || canonicalTeamKey(pick.currentTeamKey) !== transfer.fromTeamKey) {
        throw Object.assign(new Error('Draft-pick ownership changed. Refresh the Trade Center and try again.'),{status:409});
      }
      assets.push({...transfer,draftPickId:pick.id});
    }
  }
  return {...normalized,assets};
}

async function ensureParticipantAction(c, row, participants) {
  const ownTeam = memberTeam(c.session);
  if (!ownTeam || !participants.some(item => canonicalTeamKey(item.team_key) === ownTeam)) {
    throw Object.assign(new Error('Only a participating team owner may perform this action.'),{status:403});
  }
  return ownTeam;
}

async function propose(c, body, draft = false) {
  const season = await currentSeason(c.db,c.league.id);
  if (!season) throw Object.assign(new Error('An active Franchise season is required.'),{status:409});
  const ownTeam = memberTeam(c.session);
  if (!ownTeam) throw Object.assign(new Error('An active team assignment is required.'),{status:403});
  const settings = (await leagueSettings(c.db,c.league.id)).tradeCenter;
  const prepared = await validatedTransfers(c,body.transfers,settings);
  if (!prepared.participants.includes(ownTeam)) throw Object.assign(new Error('Your assigned team must participate in the trade.'),{status:403});
  const tradeId=`trade_${crypto.randomUUID()}`;
  const mutationToken=`trade_mutation_${crypto.randomUUID()}`;
  const statements=[c.db.prepare(`INSERT INTO trade_workflows
    (id,league_id,franchise_season_id,status,revision,mutation_token,proposer_user_id,proposer_team_key,note,review_threshold,created_at,updated_at)
    VALUES (?,?,?,?,1,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
      tradeId,c.league.id,season.id,draft?'draft':'negotiating',mutationToken,c.session.user.id,ownTeam,cleanText(body.note),settings.reviewApprovalThreshold
    )];
  for (const teamKey of prepared.participants) statements.push(c.db.prepare(`INSERT INTO trade_workflow_participants
    (trade_id,league_id,team_key,accepted_revision,accepted_by_user_id,accepted_at)
    VALUES (?,?,?,CASE WHEN ?=0 AND ?=? THEN 1 ELSE NULL END,CASE WHEN ?=0 AND ?=? THEN ? ELSE NULL END,CASE WHEN ?=0 AND ?=? THEN CURRENT_TIMESTAMP ELSE NULL END)`)
    .bind(tradeId,c.league.id,teamKey,draft?1:0,teamKey,ownTeam,draft?1:0,teamKey,ownTeam,c.session.user.id,draft?1:0,teamKey,ownTeam));
  for (const asset of prepared.assets) statements.push(c.db.prepare(`INSERT INTO trade_workflow_assets
    (id,trade_id,league_id,revision,asset_type,player_identity_id,draft_pick_id,source_player_id,from_team_key,to_team_key,ordinal)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(`trade_asset_${crypto.randomUUID()}`,tradeId,c.league.id,1,asset.assetType,
      asset.playerIdentityId || null,asset.draftPickId || null,asset.sourcePlayerId || null,asset.fromTeamKey,asset.toTeamKey,asset.ordinal));
  statements.push(c.db.prepare(`INSERT INTO trade_workflow_messages
    (id,trade_id,league_id,author_user_id,event_type,message,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(`trade_message_${crypto.randomUUID()}`,tradeId,c.league.id,c.session.user.id,draft?'draft-saved':'proposed',cleanText(body.note) || (draft?'Trade draft saved.':'Trade proposed.')));
  if(!draft){
    const users=await participantUserIds(c.db,c.league.id,prepared.participants.filter(team=>team!==ownTeam));
    statements.push(...await notificationStatements(c.db,c.league.id,tradeId,users,'received','Trade offer received',`${ownTeam.toUpperCase()} sent your team a trade offer.`));
  }
  const audit=createTenantAuditContext({request:c.request},c.league,c.session,draft?'trade_draft_saved':'trade_proposed');
  statements.push(tenantAuditStatement(c.db,audit,{resourceType:'trade_workflow',resourceId:tradeId,detail:{draft,participants:prepared.participants,assetCount:prepared.assets.length}}));
  await c.db.batch(statements);
  return {tradeId};
}

async function counter(c, body, row, participants) {
  const ownTeam=await ensureParticipantAction(c,row,participants);
  if (!['negotiating','draft'].includes(row.status)) throw Object.assign(new Error('This trade cannot be revised.'),{status:409});
  const settings=(await leagueSettings(c.db,c.league.id)).tradeCenter;
  const prepared=await validatedTransfers(c,body.transfers,settings);
  if (!prepared.participants.includes(ownTeam)) throw Object.assign(new Error('Your team must remain in the trade.'),{status:403});
  const revision=Number(row.revision)+1;
  const mutationToken=`trade_mutation_${crypto.randomUUID()}`;
  const statements=[c.db.prepare(`UPDATE trade_workflows SET revision=?,mutation_token=?,status='negotiating',note=?,free_trade=0,
      decision_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND revision=? AND mutation_token=?`)
    .bind(revision,mutationToken,cleanText(body.note),row.id,c.league.id,row.revision,row.mutation_token),
    c.db.prepare(`DELETE FROM trade_workflow_participants WHERE trade_id=? AND league_id=?
      AND EXISTS (SELECT 1 FROM trade_workflows workflow WHERE workflow.id=? AND workflow.league_id=? AND workflow.mutation_token=?)`)
      .bind(row.id,c.league.id,row.id,c.league.id,mutationToken)];
  for (const teamKey of prepared.participants) statements.push(c.db.prepare(`INSERT INTO trade_workflow_participants
    (trade_id,league_id,team_key,accepted_revision,accepted_by_user_id,accepted_at)
    SELECT ?,?,?,CASE WHEN ?=? THEN ? ELSE NULL END,CASE WHEN ?=? THEN ? ELSE NULL END,CASE WHEN ?=? THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE EXISTS (SELECT 1 FROM trade_workflows workflow WHERE workflow.id=? AND workflow.league_id=? AND workflow.mutation_token=?)`)
    .bind(row.id,c.league.id,teamKey,teamKey,ownTeam,revision,teamKey,ownTeam,c.session.user.id,teamKey,ownTeam,row.id,c.league.id,mutationToken));
  for (const asset of prepared.assets) statements.push(c.db.prepare(`INSERT INTO trade_workflow_assets
    (id,trade_id,league_id,revision,asset_type,player_identity_id,draft_pick_id,source_player_id,from_team_key,to_team_key,ordinal)
    SELECT ?,?,?,?,?,?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM trade_workflows workflow WHERE workflow.id=? AND workflow.league_id=? AND workflow.mutation_token=?)`).bind(
      `trade_asset_${crypto.randomUUID()}`,row.id,c.league.id,revision,asset.assetType,
      asset.playerIdentityId || null,asset.draftPickId || null,asset.sourcePlayerId || null,asset.fromTeamKey,asset.toTeamKey,asset.ordinal,
      row.id,c.league.id,mutationToken));
  statements.push(c.db.prepare(`INSERT INTO trade_workflow_messages
    (id,trade_id,league_id,author_user_id,event_type,message,created_at)
    SELECT ?,?,?,?,'countered',?,CURRENT_TIMESTAMP
    WHERE EXISTS (SELECT 1 FROM trade_workflows workflow WHERE workflow.id=? AND workflow.league_id=? AND workflow.mutation_token=?)`)
    .bind(`trade_message_${crypto.randomUUID()}`,row.id,c.league.id,c.session.user.id,cleanText(body.note)||'Trade terms revised.',row.id,c.league.id,mutationToken));
  const results=await c.db.batch(statements);
  if(Number(results?.[0]?.meta?.changes||0)!==1)throw Object.assign(new Error('This trade changed in another session. Refresh before revising it.'),{status:409});
  const users=await participantUserIds(c.db,c.league.id,prepared.participants.filter(team=>team!==ownTeam));
  const notifications=await notificationStatements(c.db,c.league.id,row.id,users,'received','Revised trade offer',`${ownTeam.toUpperCase()} revised the trade offer.`);
  if(notifications.length)await c.db.batch(notifications);
}

async function accept(c, row, participants) {
  const ownTeam=await ensureParticipantAction(c,row,participants);
  if (row.status!=='negotiating') throw Object.assign(new Error('This trade is not open for acceptance.'),{status:409});
  const statements=[c.db.prepare(`UPDATE trade_workflow_participants SET accepted_revision=?,accepted_by_user_id=?,accepted_at=CURRENT_TIMESTAMP
    WHERE trade_id=? AND league_id=? AND team_key=?`).bind(row.revision,c.session.user.id,row.id,c.league.id,ownTeam)];
  const remaining=participants.filter(item=>item.team_key!==ownTeam&&Number(item.accepted_revision)!==Number(row.revision));
  let enteredReview=false;
  if (!remaining.length) {
    enteredReview=true;
    statements.push(c.db.prepare(`UPDATE trade_workflows SET status='committee',updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND status='negotiating'`).bind(row.id,c.league.id));
    const reviewers=await reviewerUserIds(c.db,c.league.id,participants.map(item=>item.team_key));
    statements.push(...await notificationStatements(c.db,c.league.id,row.id,reviewers,'review-required','Trade review required','An accepted trade requires your decision.'));
  }
  const participantUsers=await participantUserIds(c.db,c.league.id,participants.map(item=>item.team_key));
  statements.push(...await notificationStatements(c.db,c.league.id,row.id,participantUsers.filter(id=>id!==c.session.user.id),'accepted',enteredReview?'Trade accepted by all teams':'Trade participant accepted',enteredReview?'The trade is now with the review committee.':`${ownTeam.toUpperCase()} accepted the current trade.`));
  await c.db.batch(statements);
}

async function reject(c, row, participants, reason) {
  const ownTeam=await ensureParticipantAction(c,row,participants);
  if (!['negotiating','committee'].includes(row.status)) throw Object.assign(new Error('This trade is already closed.'),{status:409});
  const users=await participantUserIds(c.db,c.league.id,participants.map(item=>item.team_key));
  await c.db.batch([
    c.db.prepare(`UPDATE trade_workflows SET status='rejected',decision_reason=?,rejected_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=?`).bind(cleanText(reason)||null,row.id,c.league.id),
    ...await notificationStatements(c.db,c.league.id,row.id,users.filter(id=>id!==c.session.user.id),'rejected','Trade rejected',`${ownTeam.toUpperCase()} rejected the trade.`)
  ]);
}

async function review(c, row, participants, decision, reason, freeTrade) {
  if (!isReviewer(c.session)) throw Object.assign(new Error('Trade Committee access is required.'),{status:403});
  if (row.status!=='committee') throw Object.assign(new Error('This trade is not awaiting review.'),{status:409});
  const ownTeam=memberTeam(c.session);
  if (ownTeam&&participants.some(item=>canonicalTeamKey(item.team_key)===ownTeam)) throw Object.assign(new Error('Reviewers cannot vote on a trade involving their own team.'),{status:403});
  if (!['approve','reject','abstain'].includes(decision)) throw Object.assign(new Error('A valid review decision is required.'),{status:400});
  const settings=(await leagueSettings(c.db,c.league.id)).tradeCenter;
  const designateFree=settings.freeTradeDesignationEnabled&&(Boolean(row.free_trade)||Boolean(freeTrade));
  if(settings.freeTradeDesignationEnabled&&freeTrade){
    await c.db.prepare(`UPDATE trade_workflows SET free_trade=1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND status='committee'`).bind(row.id,c.league.id).run();
  }
  await c.db.prepare(`INSERT INTO trade_workflow_reviews
    (trade_id,league_id,revision,reviewer_user_id,decision,reason,created_at,updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(trade_id,revision,reviewer_user_id) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP`)
    .bind(row.id,c.league.id,row.revision,c.session.user.id,decision,cleanText(reason)||null).run();
  const reviews=await resultRows(c.db,`SELECT reviewer_user_id,decision FROM trade_workflow_reviews
    WHERE trade_id=? AND league_id=? AND revision=?`,row.id,c.league.id,row.revision);
  const result=workflowDecision(reviews,row.review_threshold);
  if (!result.result) return;
  const participantUsers=await participantUserIds(c.db,c.league.id,participants.map(item=>item.team_key));
  if (result.result==='rejected') {
    await c.db.batch([
      c.db.prepare(`UPDATE trade_workflows SET status='rejected',decision_reason=?,rejected_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=?`).bind(cleanText(reason)||null,row.id,c.league.id),
      ...await notificationStatements(c.db,c.league.id,row.id,participantUsers,'rejected','Trade rejected',cleanText(reason)||'The Trade Committee rejected the trade.')
    ]);
    return;
  }
  if (settings.seasonTradeLimitEnabled&&!designateFree) {
    for (const participant of participants) {
      const usage=await c.db.prepare(`SELECT COUNT(DISTINCT workflow.id) AS used
        FROM trade_workflows workflow JOIN trade_workflow_participants participant
          ON participant.trade_id=workflow.id AND participant.league_id=workflow.league_id
        WHERE workflow.league_id=? AND workflow.franchise_season_id=? AND workflow.status='approved'
          AND workflow.free_trade=0 AND workflow.slot_released_at IS NULL AND participant.team_key=?`).bind(c.league.id,row.franchise_season_id,participant.team_key).first();
      if(Number(usage?.used||0)>=settings.seasonTradeLimit){
        throw Object.assign(new Error(`${String(participant.team_key).toUpperCase()} has reached its Franchise season trade limit.`),{status:409});
      }
    }
  }
  const snapshotId=await activeSnapshotId(c.db,c.league.id);
  if (!snapshotId) throw Object.assign(new Error('An active Madden snapshot is required.'),{status:409});
  const assets=await resultRows(c.db,`SELECT * FROM trade_workflow_assets WHERE trade_id=? AND league_id=? AND revision=? ORDER BY ordinal`,row.id,c.league.id,row.revision);
  for (const asset of assets) {
    if (asset.asset_type==='player') await playerAsset(c,asset.source_player_id,canonicalTeamKey(asset.from_team_key));
    if (asset.asset_type==='draft-pick') {
      const pick=await c.db.prepare(`SELECT current_team_key AS currentTeamKey FROM league_draft_picks
        WHERE id=? AND league_id=?`).bind(asset.draft_pick_id,c.league.id).first();
      if (!pick || canonicalTeamKey(pick.currentTeamKey)!==canonicalTeamKey(asset.from_team_key)) {
        throw Object.assign(new Error('Draft-pick ownership changed before approval. Revise the trade with the current ledger.'),{status:409});
      }
    }
  }
  const statements=[c.db.prepare(`UPDATE trade_workflows SET status='approved',free_trade=?,approved_at=CURRENT_TIMESTAMP,
    decision_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND status='committee'`).bind(designateFree?1:0,row.id,c.league.id)];
  for (const asset of assets) {
    if (asset.asset_type==='player') {
      statements.push(c.db.prepare(`INSERT INTO trade_roster_overlays
        (trade_id,league_id,player_identity_id,source_player_id,from_team_key,to_team_key,source_snapshot_id,internal_status,created_at)
        VALUES (?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP)`).bind(row.id,c.league.id,asset.player_identity_id,asset.source_player_id,asset.from_team_key,asset.to_team_key,snapshotId));
      statements.push(c.db.prepare(`UPDATE trade_block_listings SET active=0,updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND player_identity_id=? AND active=1`).bind(c.league.id,asset.player_identity_id));
    }
    if (asset.asset_type==='draft-pick') {
      statements.push(c.db.prepare(`UPDATE league_draft_picks SET current_team_key=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=? AND current_team_key=?`).bind(asset.to_team_key,asset.draft_pick_id,c.league.id,asset.from_team_key));
      statements.push(c.db.prepare(`UPDATE trade_block_listings SET active=0,updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND draft_pick_id=? AND active=1`).bind(c.league.id,asset.draft_pick_id));
      statements.push(c.db.prepare(`INSERT INTO draft_pick_ledger_events
        (id,league_id,draft_pick_id,event_type,from_team_key,to_team_key,trade_id,detail_json,created_by_user_id,created_at)
        VALUES (?,?,?,'trade-approved',?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .bind(`draft_pick_event:${row.id}:${asset.draft_pick_id}`,c.league.id,asset.draft_pick_id,asset.from_team_key,asset.to_team_key,row.id,
          JSON.stringify({revision:Number(row.revision)}),c.session.user.id));
    }
  }
  const transactionId=`canonical_transaction_${crypto.randomUUID()}`;
  statements.push(c.db.prepare(`INSERT INTO canonical_transactions
    (id,league_id,event_type,status,authority,execution_status,team_ids_json,player_ids_json,workflow_trade_id,
     first_snapshot_id,last_snapshot_id,confidence,details_json,created_at,updated_at)
    VALUES (?,?,'trade','recorded','trade-center','pending-madden-execution',?,?,?,?,?,'confirmed',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING`).bind(transactionId,c.league.id,JSON.stringify(participants.map(item=>item.team_key)),
      JSON.stringify(assets.filter(item=>item.asset_type==='player').map(item=>item.source_player_id)),row.id,snapshotId,snapshotId,
      JSON.stringify({tradeId:row.id,revision:Number(row.revision),freeTrade:designateFree})));
  statements.push(c.db.prepare(`INSERT INTO canonical_transaction_evidence
    (id,league_id,transaction_id,source_type,source_key,snapshot_id,evidence_json,created_at)
    VALUES (?,? ,?,'trade-workflow',?,?,?,CURRENT_TIMESTAMP)`)
    .bind(`canonical_evidence_${crypto.randomUUID()}`,c.league.id,transactionId,`trade-workflow:${row.id}:revision:${row.revision}`,snapshotId,
      JSON.stringify({tradeId:row.id,revision:Number(row.revision),assetCount:assets.length})));
  statements.push(...await notificationStatements(c.db,c.league.id,row.id,participantUsers,'approved','Trade approved','The approved players and picks now appear with their receiving teams. Madden will remain authoritative on the next import.'));
  await c.db.batch(statements);
}

async function updateSettings(c, body) {
  if (!isCommissioner(c.session)) throw Object.assign(new Error('Commissioner access is required.'),{status:403});
  const current=await leagueSettings(c.db,c.league.id);
  if (Number(body.revision)!==current.revision) throw Object.assign(new Error('Trade settings changed in another session. Refresh before saving.'),{status:409});
  const settings=normalizeTradeCenterSettings(body.settings);
  const document=withTradeCenterSettings(current.document,settings);
  const revision=current.revision+1;
  const audit=createTenantAuditContext({request:c.request},c.league,c.session,'trade_settings_updated');
  await c.db.batch([
    c.db.prepare(`INSERT INTO league_settings (league_id,revision,settings_json,updated_by_user_id,updated_at)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(league_id) DO UPDATE SET revision=excluded.revision,
      settings_json=excluded.settings_json,updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(c.league.id,revision,JSON.stringify(document),c.session.user.id),
    c.db.prepare(`INSERT INTO league_setting_revisions
      (id,league_id,revision,settings_json,changed_by_user_id,change_reason,created_at)
      VALUES (?,?,?,?,?,'Trade Center settings updated',CURRENT_TIMESTAMP)`)
      .bind(`setting_revision_${crypto.randomUUID()}`,c.league.id,revision,JSON.stringify(document),c.session.user.id),
    tenantAuditStatement(c.db,audit,{resourceType:'league_settings',resourceId:c.league.id,detail:{revision,scope:'tradeCenter'}})
  ]);
}

async function seedPicks(c, body) {
  if (!isCommissioner(c.session)) throw Object.assign(new Error('Commissioner access is required.'),{status:403});
  const season=await currentSeason(c.db,c.league.id);
  if (!season) throw Object.assign(new Error('An active Franchise season is required.'),{status:409});
  return ensureDraftPickHorizon(c.db,{leagueId:c.league.id,franchiseSeasonId:season.id,seasonYear:season.seasonYear,
    gameRelease:season.gameRelease,teams:c.teams});
}

async function applyPickBaseline(c, body) {
  if (!isCommissioner(c.session)) throw Object.assign(new Error('Commissioner access is required.'),{status:403});
  const season=await currentSeason(c.db,c.league.id);
  if (!season) throw Object.assign(new Error('An active Franchise season is required.'),{status:409});
  const result=await applyVersionedDraftPickBaseline(c.db,{leagueId:c.league.id,franchiseSeasonId:season.id,
    seasonYear:season.seasonYear,gameRelease:season.gameRelease,teams:c.teams,baselineKey:cleanText(body.baselineKey,100),
    baselineVersion:Number(body.baselineVersion),sourceType:String(body.sourceType||'league-specific'),
    sourceReference:cleanText(body.sourceReference,500),entries:Array.isArray(body.entries)?body.entries:[]});
  const audit=createTenantAuditContext({request:c.request},c.league,c.session,'draft_pick_baseline_applied');
  await tenantAuditStatement(c.db,audit,{resourceType:'league_draft_pick_baseline',resourceId:result.baselineId,
    detail:{baselineKey:result.baselineKey,baselineVersion:result.baselineVersion,pickCount:result.expectedPickCount,preservedTradedOwnership:true}}).run();
  return result;
}

async function updateBlock(c, body) {
  const ownTeam=memberTeam(c.session);
  if (!ownTeam) throw Object.assign(new Error('An active team assignment is required.'),{status:403});
  const active=body.active!==false;
  const assetType=String(body.assetType||'player')==='draft-pick'?'draft-pick':'player';
  let playerIdentityId=null,draftPickId=null;
  if (assetType==='player') {
    const identity=await playerAsset(c,String(body.assetId||''),ownTeam);
    playerIdentityId=identity.playerIdentityId;
  } else {
    const pick=await c.db.prepare(`SELECT id,current_team_key AS currentTeamKey FROM league_draft_picks
      WHERE id=? AND league_id=?`).bind(String(body.assetId||''),c.league.id).first();
    if (!pick||canonicalTeamKey(pick.currentTeamKey)!==ownTeam) throw Object.assign(new Error('You may list only your team’s draft picks.'),{status:403});
    draftPickId=pick.id;
  }
  if (!active) {
    await c.db.prepare(`UPDATE trade_block_listings SET active=0,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND active=1 AND ((? IS NOT NULL AND player_identity_id=?) OR (? IS NOT NULL AND draft_pick_id=?))`)
      .bind(c.league.id,playerIdentityId,playerIdentityId,draftPickId,draftPickId).run();
    return;
  }
  const requestedReturn=cleanText(body.requestedReturn,1000);
  if(!requestedReturn)throw Object.assign(new Error('Describe what you want in return before listing this asset.'),{status:400});
  const existing=await c.db.prepare(`SELECT id FROM trade_block_listings WHERE league_id=? AND active=1
    AND ((? IS NOT NULL AND player_identity_id=?) OR (? IS NOT NULL AND draft_pick_id=?))`)
    .bind(c.league.id,playerIdentityId,playerIdentityId,draftPickId,draftPickId).first();
  if (existing) {
    await c.db.prepare(`UPDATE trade_block_listings SET requested_return=?,needs_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(requestedReturn,JSON.stringify(body.needs&&typeof body.needs==='object'?body.needs:{}),existing.id).run();
  } else {
    await c.db.prepare(`INSERT INTO trade_block_listings
      (id,league_id,team_key,asset_type,player_identity_id,draft_pick_id,requested_return,needs_json,active,listed_by_user_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(`trade_block_${crypto.randomUUID()}`,c.league.id,ownTeam,
        assetType,playerIdentityId,draftPickId,requestedReturn,
        JSON.stringify(body.needs&&typeof body.needs==='object'?body.needs:{}),c.session.user.id).run();
  }
}

export async function onRequestGet(context) {
  try {
    const c=await requestContext(context); if(c.response)return c.response;
    return json(await publicState(c));
  } catch (error) {
    return json({ok:false,release:TRADE_CENTER_RELEASE,error:error?.message||'Trade Center could not be loaded.'},Number(error?.status)||500);
  }
}

export async function onRequestPost(context) {
  try {
    const c=await requestContext(context); if(c.response)return c.response;
    let body={}; try{body=await context.request.json()}catch{throw Object.assign(new Error('Request body must be valid JSON.'),{status:400})}
    const action=cleanText(body.action,50);
    let tradeId=cleanText(body.tradeId,100);
    if(action==='propose')({tradeId}=await propose(c,body,false));
    else if(action==='save-draft')({tradeId}=await propose(c,body,true));
    else if(action==='settings')await updateSettings(c,body);
    else if(action==='seed-picks')await seedPicks(c,body);
    else if(action==='apply-pick-baseline')await applyPickBaseline(c,body);
    else if(action==='trade-block')await updateBlock(c,body);
    else if(action==='notifications-read')await c.db.prepare(`UPDATE league_notifications SET read_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND user_id=? AND read_at IS NULL`).bind(c.league.id,c.session.user.id).run();
    else {
      if(!tradeId)throw Object.assign(new Error('tradeId is required.'),{status:400});
      const row=await workflow(c.db,c.league.id,tradeId);
      if(!row)throw Object.assign(new Error('Trade not found.'),{status:404});
      const participants=await workflowParticipants(c.db,c.league.id,tradeId);
      if(['counter','accept','reject','review'].includes(action))requireCurrentRevision(body,row);
      if(action==='counter')await counter(c,body,row,participants);
      else if(action==='accept')await accept(c,row,participants);
      else if(action==='reject')await reject(c,row,participants,body.reason);
      else if(action==='review')await review(c,row,participants,String(body.decision||''),body.reason,body.freeTrade);
      else if(action==='message'){
        await ensureParticipantAction(c,row,participants);
        const message=cleanText(body.message,2000);if(!message)throw Object.assign(new Error('A message is required.'),{status:400});
        await c.db.prepare(`INSERT INTO trade_workflow_messages
          (id,trade_id,league_id,author_user_id,event_type,message,created_at) VALUES (?,?,?,?,'message',?,CURRENT_TIMESTAMP)`)
          .bind(`trade_message_${crypto.randomUUID()}`,tradeId,c.league.id,c.session.user.id,message).run();
      }else throw Object.assign(new Error('Unknown Trade Center action.'),{status:400});
    }
    return json({...await publicState(c),action,tradeId:tradeId||null});
  } catch (error) {
    return json({ok:false,release:TRADE_CENTER_RELEASE,error:error?.message||'Trade Center action failed.'},Number(error?.status)||500);
  }
}
