import { jsonResponse } from "../../../_lib/auth.js";
import {
  requireActiveMembership,
  requireCommissioner
} from "../../../_lib/permissions.js";
import {
  canonicalLeagueSlug,
  resolveLeague
} from "../../../_lib/cloud-platform.js";
import { createTenantAuditContext, tenantAuditStatement } from "../../../_lib/tenant-context.js";

const RELEASE = "7.4.4.6";
const EMPTY_RULES = Object.freeze({ categories: [] });
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_CATEGORIES = 50;
const MAX_SECTIONS_PER_CATEGORY = 50;
const MAX_RULES_PER_SECTION = 100;
const MAX_TEXT_LENGTH = 10_000;
const MAX_MEDIA_PER_RULE = 12;
const SAFE_MEDIA_ID = /^rule_media_[A-Za-z0-9-]{1,96}$/;

const ALLOWED_RICH_TAGS = new Set(['strong','b','em','i','u','ul','ol','li','p','br','span']);
const ALLOWED_FONTS = new Map([
  ['inter','Inter'],['arial','Arial'],['georgia','Georgia'],
  ['times new roman','Times New Roman'],['courier new','Courier New']
]);
const FONT_SIZE_MAP = new Map([
  ['1','12px'],['2','14px'],['3','16px'],['4','18px'],['5','24px'],['6','28px'],['7','32px']
]);

function safeColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(color) ? color : null;
}

function richSpanStyle(tag) {
  const styles = [];
  const style = String(tag.match(/\bstyle\s*=\s*(["'])(.*?)\1/i)?.[2] || '');
  const color = safeColor(style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]);
  const size = String(style.match(/(?:^|;)\s*font-size\s*:\s*([^;]+)/i)?.[1] || '').trim().toLowerCase();
  const family = String(style.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i)?.[1] || '')
    .replace(/["']/g,'').split(',')[0].trim().toLowerCase();
  if (color) styles.push(`color:${color}`);
  if (/^(?:12|14|16|18|20|24|28|32)px$/.test(size)) styles.push(`font-size:${size}`);
  if (ALLOWED_FONTS.has(family)) styles.push(`font-family:${ALLOWED_FONTS.get(family)}`);
  return styles.length ? ` style="${styles.join(';')}"` : '';
}

function richFontStyle(tag) {
  const styles = [];
  const color = safeColor(tag.match(/\bcolor\s*=\s*(["'])(.*?)\1/i)?.[2]);
  const face = String(tag.match(/\bface\s*=\s*(["'])(.*?)\1/i)?.[2] || '')
    .split(',')[0].trim().toLowerCase();
  const size = FONT_SIZE_MAP.get(String(tag.match(/\bsize\s*=\s*(["']?)([1-7])\1/i)?.[2] || ''));
  if (color) styles.push(`color:${color}`);
  if (size) styles.push(`font-size:${size}`);
  if (ALLOWED_FONTS.has(face)) styles.push(`font-family:${ALLOWED_FONTS.get(face)}`);
  return styles.length ? ` style="${styles.join(';')}"` : '';
}

export function sanitizeRichTextHtml(value) {
  const source = String(value || '').slice(0, MAX_TEXT_LENGTH * 3)
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  return source.replace(/<[^>]*>/g, rawTag => {
    const match = rawTag.match(/^<\s*(\/?)\s*([a-z0-9]+)\b/i);
    if (!match) return '';
    const closing = Boolean(match[1]);
    let name = match[2].toLowerCase();
    if (name === 'div') name = 'p';
    if (name === 'font') return closing ? '</span>' : `<span${richFontStyle(rawTag)}>`;
    if (!ALLOWED_RICH_TAGS.has(name)) return '';
    if (name === 'b') name = 'strong';
    if (name === 'i') name = 'em';
    if (name === 'br') return '<br>';
    if (closing) return `</${name}>`;
    return name === 'span' ? `<span${richSpanStyle(rawTag)}>` : `<${name}>`;
  }).trim();
}

function plainTextFromHtml(value) {
  return String(value || '').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n')
    .replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'").trim();
}

function notFound() {
  return jsonResponse({ ok: false, error: "Not found." }, 404);
}

function cleanText(value, field, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${field} is required.`);
  if (text.length > max) throw new Error(`${field} exceeds ${max} characters.`);
  return text;
}

function normalizeRulesDocument(body) {
  if (!Array.isArray(body?.categories)) throw new Error("categories is required.");
  if (body.categories.length > MAX_CATEGORIES) {
    throw new Error(`Rules may contain at most ${MAX_CATEGORIES} categories.`);
  }

  const categoryIds = new Set();
  const sectionIds = new Set();
  const ruleIds = new Set();
  const categories = body.categories.map((category, categoryIndex) => {
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw new Error(`Category ${categoryIndex + 1} must be an object.`);
    }
    const id = cleanText(category.id || `category-${categoryIndex + 1}`, "Category id", { required: true, max: 80 });
    if (categoryIds.has(id)) throw new Error(`Duplicate category id: ${id}.`);
    categoryIds.add(id);

    const sourceSections = Array.isArray(category.sections) ? category.sections : [];
    if (sourceSections.length > MAX_SECTIONS_PER_CATEGORY) {
      throw new Error(`Category ${id} may contain at most ${MAX_SECTIONS_PER_CATEGORY} sections.`);
    }
    const sections = sourceSections.map((section, sectionIndex) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        throw new Error(`Section ${sectionIndex + 1} in ${id} must be an object.`);
      }
      const sectionId = cleanText(section.id || `${id}-section-${sectionIndex + 1}`, "Section id", { required: true, max: 100 });
      if (sectionIds.has(sectionId)) throw new Error(`Duplicate section id: ${sectionId}.`);
      sectionIds.add(sectionId);
      const sourceRules = Array.isArray(section.rules) ? section.rules : [];
      if (sourceRules.length > MAX_RULES_PER_SECTION) {
        throw new Error(`Section ${sectionId} may contain at most ${MAX_RULES_PER_SECTION} rules.`);
      }
      const rules = sourceRules.map((rule, ruleIndex) => {
        if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
          throw new Error(`Rule ${ruleIndex + 1} in ${sectionId} must be an object.`);
        }
        const ruleId = cleanText(rule.id || `${sectionId}-rule-${ruleIndex + 1}`, "Rule id", { required: true, max: 100 });
        if (ruleIds.has(ruleId)) throw new Error(`Duplicate rule id: ${ruleId}.`);
        ruleIds.add(ruleId);
        const html = sanitizeRichTextHtml(rule.html || '');
        const media = (Array.isArray(rule.media) ? rule.media : []).slice(0, MAX_MEDIA_PER_RULE).map((item, mediaIndex) => {
          const mediaId = cleanText(item?.id || item?.mediaId, `Rule media ${mediaIndex + 1}`, {required:true,max:120});
          if (!SAFE_MEDIA_ID.test(mediaId)) throw new Error(`Rule media ${mediaIndex + 1} is invalid.`);
          return {id:mediaId,altText:cleanText(item?.altText, 'Image description', {max:300})};
        });
        const text = cleanText(rule.text ?? rule.description ?? plainTextFromHtml(html), "Rule text");
        if (!text && !html && !media.length) throw new Error('Rule text or an image is required.');
        return {
          id: ruleId,
          title: cleanText(rule.title, "Rule title", { max: 200 }),
          text,
          html,
          media
        };
      });
      return {
        id: sectionId,
        title: cleanText(section.title || section.name, "Section title", { required: true, max: 200 }),
        rules
      };
    });
    return {
      id,
      title: cleanText(category.title || category.name, "Category title", { required: true, max: 200 }),
      sections
    };
  });

  const document = { categories };
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Rules document exceeds the 256 KB limit.");
  }
  return document;
}

export { normalizeRulesDocument };

async function verifyRulesMedia(db, leagueId, rules) {
  const requested = [...new Set(rules.categories.flatMap(category => category.sections)
    .flatMap(section => section.rules).flatMap(rule => rule.media || []).map(item => item.id))];
  if (!requested.length) return;
  const placeholders = requested.map(() => '?').join(',');
  const result = await db.prepare(`SELECT id FROM league_rule_media
    WHERE league_id=? AND deleted_at IS NULL AND id IN (${placeholders})`)
    .bind(leagueId,...requested).all();
  const found = new Set((result?.results || []).map(row => row.id));
  if (requested.some(id => !found.has(id))) throw new Error('One or more Rules images are unavailable for this league.');
}

async function authorizedLeague(context, authorization) {
  const league = await resolveLeague(context.env, canonicalLeagueSlug(context.params?.leagueSlug));
  if (!league || authorization.session.membership?.leagueId !== league.id) return null;
  return { id: league.id, slug: league.slug, name: league.name };
}

export async function onRequestGet(context) {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return authorization.response;
  const league = await authorizedLeague(context, authorization);
  if (!league) return notFound();
  const row = await context.env.DB.prepare(`
    SELECT rules_json AS rulesJson, updated_at AS updatedAt
    FROM league_rules_documents
    WHERE league_id = ?
    LIMIT 1
  `).bind(league.id).first();
  let rules = EMPTY_RULES;
  try { if (row?.rulesJson) rules = JSON.parse(row.rulesJson); } catch {}
  const commissioner = authorization.session.membership?.role === 'commissioner';
  if (!commissioner) {
    return jsonResponse({ ok:true, release:RELEASE, league, rules, updatedAt:row?.updatedAt || null });
  }
  const [workspace, publication] = await Promise.all([
    context.env.DB.prepare(`SELECT revision,base_publication_revision AS basePublicationRevision,
        draft_rules_json AS draftRulesJson,updated_at AS updatedAt
      FROM league_rules_workspaces WHERE league_id=? LIMIT 1`).bind(league.id).first(),
    context.env.DB.prepare(`SELECT publication_revision AS publicationRevision,created_at AS publishedAt
      FROM league_rule_publications WHERE league_id=?
      ORDER BY publication_revision DESC LIMIT 1`).bind(league.id).first()
  ]);
  let draft = rules;
  try { if (workspace?.draftRulesJson) draft = JSON.parse(workspace.draftRulesJson); } catch {}
  return jsonResponse({
    ok:true,release:RELEASE,league,rules,updatedAt:row?.updatedAt || null,
    workspace:{
      draft,
      revision:Number(workspace?.revision || 0),
      basePublicationRevision:Number(workspace?.basePublicationRevision || 0),
      updatedAt:workspace?.updatedAt || null,
      dirty:JSON.stringify(draft) !== JSON.stringify(rules)
    },
    publication:{
      revision:Number(publication?.publicationRevision || 0),
      publishedAt:publication?.publishedAt || row?.updatedAt || null
    }
  });
}

export async function onRequestPut(context) {
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;
  const league = await authorizedLeague(context, authorization);
  if (!league) return notFound();
  const declaredLength = Number(context.request.headers.get("content-length") || 0);
  if (declaredLength > MAX_DOCUMENT_BYTES) {
    return jsonResponse({ ok: false, error: "Rules document exceeds the 256 KB limit." }, 413);
  }
  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ ok: false, error: "Request body must be valid JSON." }, 400); }
  let rules;
  try { rules = normalizeRulesDocument(body.rules || body); }
  catch (error) { return jsonResponse({ ok: false, error: error.message }, 400); }
  try { await verifyRulesMedia(context.env.DB, league.id, rules); }
  catch (error) { return jsonResponse({ok:false,error:error.message}, 400); }
  const workspace = await context.env.DB.prepare(`SELECT revision,
      base_publication_revision AS basePublicationRevision
    FROM league_rules_workspaces WHERE league_id=? LIMIT 1`).bind(league.id).first();
  const expectedRevision = Number(body.revision);
  const currentRevision = Number(workspace?.revision || 0);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== currentRevision) {
    return jsonResponse({
      ok:false,error:'The Rules draft changed in another session. Refresh before saving.',
      code:'RULES_REVISION_CONFLICT',currentRevision
    }, 409);
  }
  const action = body.action === 'publish' ? 'publish' : 'save-draft';
  const nextWorkspaceRevision = currentRevision + 1;
  if (action === 'save-draft') {
    const audit = createTenantAuditContext(context, league, authorization.session, 'league_rules_draft_saved');
    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO league_rule_workspace_revisions
        (id,league_id,revision,base_publication_revision,draft_rules_json,
         changed_by_user_id,change_type,created_at)
        VALUES (?,?,?,?,?,?,'draft',CURRENT_TIMESTAMP)`)
        .bind(`rule_workspace_revision_${crypto.randomUUID()}`,league.id,nextWorkspaceRevision,
          Number(workspace?.basePublicationRevision || 0),JSON.stringify(rules),authorization.session.user.id),
      context.env.DB.prepare(`INSERT INTO league_rules_workspaces
        (league_id,revision,base_publication_revision,draft_rules_json,updated_by_user_id,updated_at)
        VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(league_id) DO UPDATE SET revision=excluded.revision,
          draft_rules_json=excluded.draft_rules_json,updated_by_user_id=excluded.updated_by_user_id,
          updated_at=CURRENT_TIMESTAMP`)
        .bind(league.id,nextWorkspaceRevision,Number(workspace?.basePublicationRevision || 0),
          JSON.stringify(rules),authorization.session.user.id),
      tenantAuditStatement(context.env.DB, audit, {
        resourceType:'league_rules_draft',resourceId:league.id,
        detail:{workspaceRevision:nextWorkspaceRevision,categoryCount:rules.categories.length}
      })
    ]);
    return jsonResponse({
      ok:true,release:RELEASE,rules,
      workspace:{draft:rules,revision:nextWorkspaceRevision,
        basePublicationRevision:Number(workspace?.basePublicationRevision || 0),dirty:true},
      requestId:audit.requestId
    });
  }

  const publication = await context.env.DB.prepare(`SELECT MAX(publication_revision) AS revision
    FROM league_rule_publications WHERE league_id=?`).bind(league.id).first();
  const publicationRevision = Number(publication?.revision || 0) + 1;
  const audit = createTenantAuditContext(context, league, authorization.session, 'league_rules_published');
  await context.env.DB.batch([
    context.env.DB.prepare(`INSERT INTO league_rules_documents
      (league_id,rules_json,updated_by_user_id,updated_at)
      VALUES (?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id) DO UPDATE SET rules_json=excluded.rules_json,
        updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(league.id,JSON.stringify(rules),authorization.session.user.id),
    context.env.DB.prepare(`INSERT INTO league_rule_publications
      (id,league_id,publication_revision,rules_json,published_by_user_id,created_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(`rule_publication_${crypto.randomUUID()}`,league.id,publicationRevision,
        JSON.stringify(rules),authorization.session.user.id),
    context.env.DB.prepare(`INSERT INTO league_rule_workspace_revisions
      (id,league_id,revision,base_publication_revision,draft_rules_json,
       changed_by_user_id,change_type,created_at)
      VALUES (?,?,?,?,?,?,'publication',CURRENT_TIMESTAMP)`)
      .bind(`rule_workspace_revision_${crypto.randomUUID()}`,league.id,nextWorkspaceRevision,
        publicationRevision,JSON.stringify(rules),authorization.session.user.id),
    context.env.DB.prepare(`INSERT INTO league_rules_workspaces
      (league_id,revision,base_publication_revision,draft_rules_json,updated_by_user_id,updated_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id) DO UPDATE SET revision=excluded.revision,
        base_publication_revision=excluded.base_publication_revision,
        draft_rules_json=excluded.draft_rules_json,
        updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(league.id,nextWorkspaceRevision,publicationRevision,JSON.stringify(rules),
        authorization.session.user.id),
    tenantAuditStatement(context.env.DB, audit, {
      resourceType:'league_rules_publication',resourceId:league.id,
      detail:{workspaceRevision:nextWorkspaceRevision,publicationRevision,
        categoryCount:rules.categories.length}
    })
  ]);
  return jsonResponse({
    ok:true,release:RELEASE,rules,
    workspace:{draft:rules,revision:nextWorkspaceRevision,
      basePublicationRevision:publicationRevision,dirty:false},
    publication:{revision:publicationRevision,publishedAt:new Date().toISOString()},
    requestId:audit.requestId
  });
}
