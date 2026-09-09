const PREFIX = 'fhq:trade';
const TRADE_ID = /^trade_[0-9a-f-]{36}$/i;

export function tradeDecisionCustomId(action, tradeId, revision) {
  const normalizedAction = String(action || '').toLowerCase();
  const normalizedTradeId = String(tradeId || '').trim();
  const normalizedRevision = Number(revision);
  if (!['accept','reject'].includes(normalizedAction)
    || !TRADE_ID.test(normalizedTradeId)
    || !Number.isInteger(normalizedRevision)
    || normalizedRevision < 1) return null;
  return `${PREFIX}:${normalizedAction}:${normalizedRevision}:${normalizedTradeId}`;
}

export function parseTradeDecisionCustomId(value) {
  const match = String(value || '').match(/^fhq:trade:(accept|reject):(\d+):(trade_[0-9a-f-]{36})$/i);
  if (!match) return null;
  const revision = Number(match[2]);
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  return {action:match[1].toLowerCase(), revision, tradeId:match[3]};
}

export function tradeDecisionComponents(tradeId, revision, {disabled = false} = {}) {
  const acceptId = tradeDecisionCustomId('accept',tradeId,revision);
  const rejectId = tradeDecisionCustomId('reject',tradeId,revision);
  if (!acceptId || !rejectId) return [];
  return [{
    type:1,
    components:[
      {type:2,style:3,label:'Accept Trade',custom_id:acceptId,disabled:Boolean(disabled)},
      {type:2,style:4,label:'Reject Trade',custom_id:rejectId,disabled:Boolean(disabled)}
    ]
  }];
}
