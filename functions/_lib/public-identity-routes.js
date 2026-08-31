import { canonicalTeamKey } from './league-teams.js';

const PLAYER_ID_PATTERN = /^plr_[a-f0-9]{32}$/;

export function normalizePublicPlayerId(value) {
  const publicId = String(value || '').trim().toLowerCase();
  return PLAYER_ID_PATTERN.test(publicId) ? publicId : null;
}

export function normalizePublicTeamSlug(value) {
  const slug = canonicalTeamKey(value);
  return /^[a-z0-9][a-z0-9._-]{0,31}$/.test(slug) ? slug : null;
}

export function publicPlayerPath(leagueSlug, publicId) {
  const id = normalizePublicPlayerId(publicId);
  return id ? `/leagues/${encodeURIComponent(String(leagueSlug || ''))}/players/${encodeURIComponent(id)}` : null;
}

export function publicTeamPath(leagueSlug, teamSlug) {
  const slug = normalizePublicTeamSlug(teamSlug);
  return slug ? `/leagues/${encodeURIComponent(String(leagueSlug || ''))}/teams/${encodeURIComponent(slug)}` : null;
}
