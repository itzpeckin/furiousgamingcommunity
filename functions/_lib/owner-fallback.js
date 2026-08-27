export function ownerFallbackDiscordId(env = {}) {
  const value = String(env.OWNER_FALLBACK_DISCORD_ID || '').trim();
  return /^\d{5,30}$/.test(value) ? value : null;
}

export function isOwnerFallbackIdentity(env, userOrDiscordId) {
  const expected = ownerFallbackDiscordId(env);
  if (!expected) return false;
  const actual = typeof userOrDiscordId === 'object'
    ? userOrDiscordId?.discordUserId ?? userOrDiscordId?.discord_user_id
    : userOrDiscordId;
  return String(actual || '').trim() === expected;
}
