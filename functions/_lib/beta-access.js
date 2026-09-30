import { createRandomToken, hashToken } from './auth.js';

export async function accountReadiness(db,userId) {
  const rows = await db.prepare(`SELECT provider,email_verified FROM user_auth_identities WHERE user_id=?`)
    .bind(userId).all();
  const identities = rows?.results || [];
  return {
    verified:identities.some(row => row.provider === 'discord' || Number(row.email_verified) === 1),
    emailVerified:identities.some(row => row.provider === 'email' && Number(row.email_verified) === 1),
    discordLinked:identities.some(row => row.provider === 'discord')
  };
}

export async function availableBetaInvitation(db,userId,planId = null) {
  return db.prepare(`SELECT id,plan_id FROM platform_beta_invitations
    WHERE claimed_by_user_id=? AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP
      AND (plan_id IS NULL OR plan_id=?) ORDER BY CASE WHEN plan_id=? THEN 0 ELSE 1 END,created_at LIMIT 1`)
    .bind(userId,planId,planId).first();
}

export async function createBetaInvitation(db,actorUserId,label) {
  const token = createRandomToken(32);
  const id = `beta_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now()+14*86400000).toISOString();
  await db.prepare(`INSERT INTO platform_beta_invitations
    (id,token_hash,label,created_by_user_id,expires_at) VALUES (?,?,?,?,?)`)
    .bind(id,await hashToken(token),String(label || '').trim().slice(0,100),actorUserId,expiresAt).run();
  return { id,expiresAt,invitePath:`/register-league#invite=${token}` };
}

export async function claimBetaInvitation(db,userId,token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  const tokenHash = await hashToken(token);
  await db.prepare(`UPDATE platform_beta_invitations SET claimed_by_user_id=?,claimed_at=CURRENT_TIMESTAMP
    WHERE token_hash=? AND claimed_by_user_id IS NULL AND revoked_at IS NULL
      AND datetime(expires_at)>CURRENT_TIMESTAMP`).bind(userId,tokenHash).run();
  return Boolean(await db.prepare(`SELECT id FROM platform_beta_invitations
    WHERE token_hash=? AND claimed_by_user_id=? AND revoked_at IS NULL
      AND datetime(expires_at)>CURRENT_TIMESTAMP`).bind(tokenHash,userId).first());
}
