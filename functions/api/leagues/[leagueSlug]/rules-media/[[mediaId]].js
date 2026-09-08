import { createId, jsonResponse } from '../../../../_lib/auth.js';
import { requireActiveMembership, requireCommissioner } from '../../../../_lib/permissions.js';
import {
  createTenantAuditContext,
  resolveRequestTenant,
  tenantAuditStatement
} from '../../../../_lib/tenant-context.js';

const RELEASE = '7.4.4.11';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SAFE_MEDIA_ID = /^rule_media_[A-Za-z0-9-]{1,96}$/;
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif']);

function mediaIdFromContext(context) {
  const value = Array.isArray(context.params?.mediaId)
    ? context.params.mediaId[0] : context.params?.mediaId;
  return String(value || '').trim();
}

async function accessContext(context, commissioner = false) {
  const access = commissioner
    ? await requireCommissioner(context)
    : await requireActiveMembership(context);
  if (!access.authorized) return {response:access.response};
  const league = await resolveRequestTenant(context);
  if (!league || access.session.membership?.leagueId !== league.id) {
    return {response:jsonResponse({ok:false,error:'Not found.'}, 404)};
  }
  return {db:context.env.DB,league,session:access.session,request:context.request};
}

function publicMedia(league, row) {
  return {
    id:row.id,
    contentType:row.content_type,
    byteLength:Number(row.byte_length || 0),
    altText:row.alt_text || '',
    createdAt:row.created_at,
    url:`/api/leagues/${encodeURIComponent(league.slug)}/rules-media/${encodeURIComponent(row.id)}`
  };
}

function documentReferencesMedia(value, mediaId) {
  if (!value) return false;
  try {
    const document = JSON.parse(value);
    return document?.categories?.some(category => category?.sections?.some(section =>
      section?.rules?.some(rule => rule?.media?.some(media => String(media?.id || media?.mediaId) === mediaId))
    )) === true;
  } catch {
    return false;
  }
}

async function isMediaReferenced(db, leagueId, mediaId) {
  const queries = [
    `SELECT rules_json AS documentJson FROM league_rules_documents WHERE league_id=?`,
    `SELECT rules_json AS documentJson FROM league_rule_publications WHERE league_id=?`,
    `SELECT draft_rules_json AS documentJson FROM league_rules_workspaces WHERE league_id=?`,
    `SELECT draft_rules_json AS documentJson FROM league_rule_workspace_revisions WHERE league_id=?`
  ];
  for (const sql of queries) {
    const result = await db.prepare(sql).bind(leagueId).all();
    if ((result?.results || []).some(row => documentReferencesMedia(row.documentJson, mediaId))) return true;
  }
  return false;
}

export async function onRequestGet(context) {
  try {
    const c = await accessContext(context, false);
    if (c.response) return c.response;
    const mediaId = mediaIdFromContext(context);
    if (!SAFE_MEDIA_ID.test(mediaId)) return jsonResponse({ok:false,error:'Not found.'}, 404);
    const row = await c.db.prepare(`SELECT id,object_key,content_type,byte_length,alt_text,created_at
      FROM league_rule_media WHERE id=? AND league_id=? AND deleted_at IS NULL LIMIT 1`)
      .bind(mediaId,c.league.id).first();
    if (!row) return jsonResponse({ok:false,error:'Not found.'}, 404);
    if (!context.env.COMPANION_EXPORTS?.get) {
      return jsonResponse({ok:false,release:RELEASE,error:'Private Rules image storage is unavailable.'}, 503);
    }
    const object = await context.env.COMPANION_EXPORTS.get(row.object_key);
    if (!object) return jsonResponse({ok:false,error:'Not found.'}, 404);
    const headers = new Headers({
      'content-type':row.content_type,
      'content-length':String(row.byte_length),
      'content-disposition':'inline',
      'cache-control':'private, max-age=300',
      'x-content-type-options':'nosniff'
    });
    if (object.httpEtag) headers.set('etag',object.httpEtag);
    return new Response(object.body,{status:200,headers});
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Rules image could not be loaded.'}, Number(error?.status) || 500);
  }
}

export async function onRequestPost(context) {
  let storedKey = null;
  try {
    const c = await accessContext(context, true);
    if (c.response) return c.response;
    if (mediaIdFromContext(context)) return jsonResponse({ok:false,error:'Upload images to the Rules media collection.'}, 400);
    if (!context.env.COMPANION_EXPORTS?.put) {
      return jsonResponse({ok:false,release:RELEASE,error:'Private Rules image storage is unavailable.'}, 503);
    }
    const declared = Number(context.request.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 32_768) {
      return jsonResponse({ok:false,error:'Rules images may be at most 5 MB.'}, 413);
    }
    const form = await context.request.formData();
    const file = form.get('image');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonResponse({ok:false,error:'Choose an image to upload.'}, 400);
    }
    const contentType = String(file.type || '').toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      return jsonResponse({ok:false,error:'Rules images must be JPEG, PNG, WebP, or GIF.'}, 415);
    }
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
      return jsonResponse({ok:false,error:'Rules images must be between 1 byte and 5 MB.'}, 413);
    }
    const mediaId = createId('rule_media');
    const extension = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[contentType];
    storedKey = `rules-media/${c.league.id}/${mediaId}.${extension}`;
    const altText = String(form.get('altText') || '').trim().slice(0,300);
    await context.env.COMPANION_EXPORTS.put(storedKey,bytes,{
      httpMetadata:{contentType},
      customMetadata:{leagueId:c.league.id,mediaId,uploadedBy:c.session.user.id}
    });
    const audit = createTenantAuditContext({request:c.request},c.league,c.session,'league_rule_media_uploaded');
    await c.db.batch([
      c.db.prepare(`INSERT INTO league_rule_media
        (id,league_id,object_key,content_type,byte_length,alt_text,uploaded_by_user_id,created_at)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .bind(mediaId,c.league.id,storedKey,contentType,bytes.byteLength,altText,c.session.user.id),
      tenantAuditStatement(c.db,audit,{resourceType:'league_rule_media',resourceId:mediaId,
        detail:{contentType,byteLength:bytes.byteLength}})
    ]);
    const row = {id:mediaId,content_type:contentType,byte_length:bytes.byteLength,alt_text:altText,created_at:new Date().toISOString()};
    return jsonResponse({ok:true,release:RELEASE,media:publicMedia(c.league,row),requestId:audit.requestId}, 201);
  } catch (error) {
    if (storedKey && context.env.COMPANION_EXPORTS?.delete) {
      try { await context.env.COMPANION_EXPORTS.delete(storedKey); } catch {}
    }
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Rules image could not be uploaded.'}, Number(error?.status) || 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const c = await accessContext(context, true);
    if (c.response) return c.response;
    const mediaId = mediaIdFromContext(context);
    if (!SAFE_MEDIA_ID.test(mediaId)) return jsonResponse({ok:false,error:'Not found.'}, 404);
    const row = await c.db.prepare(`SELECT object_key FROM league_rule_media
      WHERE id=? AND league_id=? AND deleted_at IS NULL LIMIT 1`).bind(mediaId,c.league.id).first();
    if (!row) return jsonResponse({ok:false,error:'Not found.'}, 404);
    if (await isMediaReferenced(c.db,c.league.id,mediaId)) {
      return jsonResponse({ok:false,release:RELEASE,
        error:'This image is retained by a Rules draft or publication. Remove it from the draft and publish before deleting it.'}, 409);
    }
    const audit = createTenantAuditContext({request:c.request},c.league,c.session,'league_rule_media_removed');
    await c.db.batch([
      c.db.prepare(`UPDATE league_rule_media SET deleted_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=? AND deleted_at IS NULL`).bind(mediaId,c.league.id),
      tenantAuditStatement(c.db,audit,{resourceType:'league_rule_media',resourceId:mediaId})
    ]);
    if (context.env.COMPANION_EXPORTS?.delete) await context.env.COMPANION_EXPORTS.delete(row.object_key);
    return jsonResponse({ok:true,release:RELEASE,removed:true,requestId:audit.requestId});
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Rules image could not be removed.'}, Number(error?.status) || 500);
  }
}
