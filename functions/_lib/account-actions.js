import { createRandomToken,hashToken } from './auth.js';
import { createEmailCredential,normalizeEmail } from './email-auth.js';

const PURPOSES = new Set(['verify-email','reset-password','link-email']);

export async function reserveAccountEmail(db,email) {
  const addressHash = await hashToken(normalizeEmail(email));
  const window = Math.floor(Date.now()/3600000);
  const result = await db.prepare(`INSERT INTO account_email_throttles(address_hash,window_start,attempts)
    VALUES (?,?,1) ON CONFLICT(address_hash) DO UPDATE SET
    window_start=excluded.window_start,
    attempts=CASE WHEN account_email_throttles.window_start=excluded.window_start THEN account_email_throttles.attempts+1 ELSE 1 END
    WHERE account_email_throttles.window_start<>excluded.window_start OR account_email_throttles.attempts<5`)
    .bind(addressHash,window).run();
  return Number(result?.meta?.changes) === 1;
}

export async function sendAccountAction(context,{ userId,purpose,identity = null,email,payload = {} }) {
  if (!PURPOSES.has(purpose)) throw new TypeError('Unsupported account action.');
  const db = context.env.DB;
  if (!context.env.ACCOUNT_EMAIL?.fetch) return { sent:false,code:'EMAIL_UNAVAILABLE' };
  if (!await reserveAccountEmail(db,email)) return { sent:false,code:'EMAIL_LIMIT' };
  const token = createRandomToken(32);
  const id = `action_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now()+(purpose === 'reset-password' ? 30*60000 : 24*3600000)).toISOString();
  await db.prepare(`INSERT INTO account_action_tokens
    (id,user_id,purpose,token_hash,identity_id,credential_version,payload_json,expires_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(id,userId,purpose,await hashToken(token),identity?.id || null,
    identity?.credential_version || null,JSON.stringify(payload),expiresAt).run();
  let sent = false;
  try {
    const response = await context.env.ACCOUNT_EMAIL.fetch(new Request('https://account-email.internal/send',{
      method:'POST',headers:{ 'content-type':'application/json' },body:JSON.stringify({ email,purpose,token }),
      signal:AbortSignal.timeout(15000)
    }));
    sent = response.ok;
  } catch { /* Do not log recipient, credentials, or account-action links. */ }
  await db.prepare(`UPDATE account_action_tokens SET delivery_status=? WHERE id=?`)
    .bind(sent ? 'sent' : 'failed',id).run();
  return { sent,code:sent ? null : 'EMAIL_UNAVAILABLE' };
}

export async function consumeAccountAction(db,{ token,purpose,password,userId }) {
  if (!PURPOSES.has(purpose) || !/^[a-f0-9]{64}$/.test(String(token || ''))) return { ok:false };
  const tokenHash = await hashToken(token);
  const row = await db.prepare(`SELECT * FROM account_action_tokens
    WHERE token_hash=? AND purpose=? AND used_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP`)
    .bind(tokenHash,purpose).first();
  if (!row || (purpose === 'link-email' && row.user_id !== userId)) return { ok:false };
  let credential;
  if (purpose === 'reset-password') {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return { ok:false,error:'Password must contain 12 to 128 characters.' };
    }
    credential = await createEmailCredential(password);
  }
  const consumptionId = crypto.randomUUID();
  const claim = db.prepare(`UPDATE account_action_tokens SET used_at=CURRENT_TIMESTAMP,consumption_id=?
    WHERE id=? AND used_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP
      AND (purpose='link-email' OR EXISTS (SELECT 1 FROM user_auth_identities
        WHERE id=account_action_tokens.identity_id AND user_id=account_action_tokens.user_id
        AND credential_version=account_action_tokens.credential_version))`)
    .bind(consumptionId,row.id);
  const guard = `EXISTS (SELECT 1 FROM account_action_tokens WHERE id=? AND consumption_id=?)`;
  const statements = [claim];
  if (purpose === 'verify-email') {
    statements.push(db.prepare(`UPDATE user_auth_identities SET email_verified=1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND ${guard}`).bind(row.identity_id,row.id,consumptionId));
  } else if (purpose === 'reset-password') {
    statements.push(db.prepare(`UPDATE user_auth_identities SET password_hash=?,password_salt=?,password_iterations=?,
      credential_version=credential_version+1,email_verified=1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND ${guard}`).bind(credential.hash,credential.salt,credential.iterations,row.identity_id,row.id,consumptionId));
    statements.push(db.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP,revocation_reason='password-reset'
      WHERE user_id=? AND revoked_at IS NULL AND ${guard}`).bind(row.user_id,row.id,consumptionId));
  } else {
    const payload = JSON.parse(row.payload_json);
    statements.push(db.prepare(`INSERT INTO user_auth_identities
      (id,user_id,provider,provider_subject,normalized_email,email_verified,password_hash,password_salt,password_iterations)
      SELECT ?,?,'email',?,?,1,?,?,? WHERE ${guard}`).bind(`identity_${crypto.randomUUID()}`,row.user_id,
      payload.email,payload.email,payload.credential.hash,payload.credential.salt,payload.credential.iterations,row.id,consumptionId));
  }
  try {
    const results = await db.batch(statements);
    return { ok:Number(results[0]?.meta?.changes) === 1 };
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) return { ok:false,error:'That email is already linked to an account. Sign in to that account instead.' };
    throw error;
  }
}
