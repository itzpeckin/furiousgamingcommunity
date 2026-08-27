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

const RELEASE = "7.2.0";
const EMPTY_RULES = Object.freeze({ categories: [] });
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_CATEGORIES = 50;
const MAX_SECTIONS_PER_CATEGORY = 50;
const MAX_RULES_PER_SECTION = 100;
const MAX_TEXT_LENGTH = 10_000;

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
        return {
          id: ruleId,
          title: cleanText(rule.title, "Rule title", { max: 200 }),
          text: cleanText(rule.text ?? rule.description, "Rule text", { required: true })
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
  return jsonResponse({ ok: true, release: RELEASE, league, rules, updatedAt: row?.updatedAt || null });
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
  try { rules = normalizeRulesDocument(body); }
  catch (error) { return jsonResponse({ ok: false, error: error.message }, 400); }
  const audit = createTenantAuditContext(context, league, authorization.session, 'league_rules_update');
  await context.env.DB.batch([context.env.DB.prepare(`
    INSERT INTO league_rules_documents (league_id, rules_json, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(league_id) DO UPDATE SET
      rules_json = excluded.rules_json,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = CURRENT_TIMESTAMP
  `).bind(league.id, JSON.stringify(rules), authorization.session.user.id), tenantAuditStatement(context.env.DB, audit, {
    resourceType:'league_rules', resourceId:league.id,
    detail:{categoryCount:rules.categories.length}
  })]);
  return jsonResponse({ ok: true, release: RELEASE, rules, requestId:audit.requestId });
}
