(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema) throw new Error('league-engine/schema.js must load before entities.js.');

  const clone = (value) => value == null ? value : structuredClone(value);
  const cleanId = (value, label = 'entity') => {
    const id = String(value ?? '').trim();
    if (!id) throw new TypeError(`${label} requires a stable id.`);
    return id;
  };

  function entity(type, raw = {}, source) {
    if (!HQ.leagueSchema.entityTypes.includes(type)) throw new TypeError(`Unsupported league entity type: ${type}`);
    const id = cleanId(raw.id ?? raw.sourceId ?? raw.maddenId, type);
    return {
      ...clone(raw),
      id,
      entityType: type,
      source: HQ.leagueSchema.sourceMeta({ ...(source || raw.source || {}), rawSourceId: raw.rawSourceId ?? raw.sourceId ?? raw.maddenId ?? id })
    };
  }

  const service = HQ.defineModuleService('league', 'leagueEntities', { entity, cleanId, clone });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-entities', service: 'leagueEntities', script: 'league-engine/entities.js', version: '1.0.0', dependencies: ['leagueSchema'], capabilities: ['stable-ids', 'entity-normalization'] });
})();
