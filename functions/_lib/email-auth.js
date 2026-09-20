import { createId, createRandomToken } from './auth.js';

export const EMAIL_AUTH_RELEASE = '8.0.1.1';
export const EMAIL_PASSWORD_ITERATIONS = 600000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

export function normalizeEmail(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

export function validateEmailRegistration(input = {}) {
  const email = normalizeEmail(input.email);
  const displayName = String(input.displayName || '').normalize('NFKC').trim();
  const password = String(input.password || '');
  const errors = [];
  if (!EMAIL.test(email) || email.length > 254) errors.push('Enter a valid email address.');
  if (displayName.length < 2 || displayName.length > 80) {
    errors.push('Display name must contain 2 to 80 characters.');
  }
  if (password.length < 12 || password.length > 128) {
    errors.push('Password must contain 12 to 128 characters.');
  }
  return Object.freeze({ ok:errors.length === 0,email,displayName,password,errors:Object.freeze(errors) });
}

function hexToBytes(value) {
  const text = String(value || '');
  if (!/^[a-f0-9]+$/i.test(text) || text.length % 2) return new Uint8Array();
  return Uint8Array.from(text.match(/.{2}/g) || [], part => Number.parseInt(part,16));
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',new TextEncoder().encode(password),{ name:'PBKDF2' },false,['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name:'PBKDF2',hash:'SHA-256',salt,iterations
  },key,256);
  return new Uint8Array(bits);
}

export async function createEmailCredential(password, options = {}) {
  const iterations = Number(options.iterations || EMAIL_PASSWORD_ITERATIONS);
  if (!Number.isInteger(iterations) || iterations < 100000) {
    throw new TypeError('A secure password-derivation work factor is required.');
  }
  const salt = options.salt ? hexToBytes(options.salt) : hexToBytes(createRandomToken(16));
  if (salt.byteLength < 16) throw new TypeError('A secure credential salt is required.');
  const hash = await derive(String(password || ''),salt,iterations);
  return Object.freeze({ hash:bytesToHex(hash),salt:bytesToHex(salt),iterations });
}

function constantTimeEqual(left, right) {
  const a = hexToBytes(left);
  const b = hexToBytes(right);
  if (a.byteLength !== b.byteLength || !a.byteLength) return false;
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(a,b);
  }
  let mismatch = 0;
  for (let index = 0; index < a.byteLength; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export async function verifyEmailCredential(password, credential) {
  const iterations = Number(credential?.password_iterations || credential?.iterations || 0);
  const salt = hexToBytes(credential?.password_salt || credential?.salt);
  if (!Number.isInteger(iterations) || iterations < 100000 || salt.byteLength < 16) return false;
  const candidate = await derive(String(password || ''),salt,iterations);
  return constantTimeEqual(bytesToHex(candidate),credential?.password_hash || credential?.hash);
}

export function emailUserStatements(db, { email,displayName,credential }) {
  const userId = createId('user');
  const identityId = createId('identity');
  const legacyIdentity = `local_${crypto.randomUUID()}`;
  return Object.freeze({
    userId,
    statements:Object.freeze([
      db.prepare(`INSERT INTO users
        (id,discord_user_id,discord_username,display_name,last_login_at)
        VALUES (?,?,?, ?,CURRENT_TIMESTAMP)`).bind(
        userId,legacyIdentity,'email-account',displayName
      ),
      db.prepare(`INSERT INTO user_auth_identities
        (id,user_id,provider,provider_subject,normalized_email,email_verified,
         password_hash,password_salt,password_iterations,last_authenticated_at)
        VALUES (?,?,'email',?,?,0,?,?,?,CURRENT_TIMESTAMP)`).bind(
        identityId,userId,email,email,credential.hash,credential.salt,credential.iterations
      )
    ])
  });
}
