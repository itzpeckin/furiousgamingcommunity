const PREFIX = 'fhq:trade';
const TRADE_ID = /^trade_[0-9a-f-]{36}$/i;

export function tradeDecisionCustomId(action, tradeId, revision) {
  const normalizedAction = String(action || '').toLowerCase();
  const normalizedTradeId = String(tradeId || '').trim();
  const normalizedRevision = Number(revision);
  if (!['accept','reject','review-approve','review-deny'].includes(normalizedAction)
    || !TRADE_ID.test(normalizedTradeId)
    || !Number.isInteger(normalizedRevision)
    || normalizedRevision < 1) return null;
  return `${PREFIX}:${normalizedAction}:${normalizedRevision}:${normalizedTradeId}`;
}

export function parseTradeDecisionCustomId(value) {
  const match = String(value || '').match(/^fhq:trade:(accept|reject|review-approve|review-deny):(\d+):(trade_[0-9a-f-]{36})$/i);
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

export function tradeReviewComponents(tradeId, revision, {disabled = false} = {}) {
  const approveId=tradeDecisionCustomId('review-approve',tradeId,revision);
  const denyId=tradeDecisionCustomId('review-deny',tradeId,revision);
  if(!approveId||!denyId)return[];
  return [{type:1,components:[
    {type:2,style:3,label:'Approve',custom_id:approveId,disabled:Boolean(disabled)},
    {type:2,style:4,label:'Deny',custom_id:denyId,disabled:Boolean(disabled)}
  ]}];
}

export function tradeLinkButton(leagueSlug,tradeId,{label='Counter Offer',disabled=false}={}){
  const slug=String(leagueSlug||'').trim(),id=String(tradeId||'').trim();
  if(!slug||!TRADE_ID.test(id)||disabled)return null;
  return {type:2,style:5,label,url:`https://franchisehq.app/leagues/${encodeURIComponent(slug)}#trade-center/${encodeURIComponent(id)}`};
}

export function tradeDenyModal(tradeId,revision){
  const customId=tradeDecisionCustomId('review-deny',tradeId,revision);
  if(!customId)return null;
  return {
    custom_id:customId,title:'Deny Trade',components:[{type:1,components:[{
      type:4,custom_id:'reason',style:2,label:'Reason (optional)',required:false,max_length:2000,
      placeholder:'Explain why changes are needed…'
    }]}]
  };
}
