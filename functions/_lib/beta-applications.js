import { loadOnboardingPlan } from './platform-onboarding.js';

// Durable notification state lives with the application; retries never create a league.
export async function notifyBetaApplication(db, env, planId) {
  const lease = crypto.randomUUID();
  const claimed = await db.prepare(`UPDATE platform_league_onboarding_plans SET
    configuration_json=json_set(configuration_json,'$.applicationAlert.state','sending',
      '$.applicationAlert.lease',?,'$.applicationAlert.startedAt',CURRENT_TIMESTAMP)
    WHERE id=? AND json_extract(configuration_json,'$.betaApplicationRequired')=1
      AND activated_at IS NULL AND status<>'cancelled'
      AND COALESCE(json_extract(configuration_json,'$.applicationAlert.state'),'pending')<>'sent'
      AND (COALESCE(json_extract(configuration_json,'$.applicationAlert.state'),'pending')<>'sending'
        OR datetime(json_extract(configuration_json,'$.applicationAlert.startedAt'))<datetime('now','-5 minutes'))`)
    .bind(lease,planId).run();
  if (Number(claimed?.meta?.changes || 0) !== 1) return;
  const plan = await loadOnboardingPlan(db,planId);
  let sent = false;
  try {
    if (env.ACCOUNT_EMAIL?.fetch) {
      const response = await env.ACCOUNT_EMAIL.fetch(new Request('https://account-email.internal/send', {
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({purpose:'beta-application',planId,name:plan.name,applicant:plan.initialCommissionerDisplayName}),
        signal:AbortSignal.timeout(15000)
      }));
      sent = response.ok;
    }
  } catch { /* Keep a retryable application when email delivery is unavailable. */ }
  await db.prepare(`UPDATE platform_league_onboarding_plans SET
    configuration_json=json_set(configuration_json,'$.applicationAlert.state',?,
      '$.applicationAlert.updatedAt',CURRENT_TIMESTAMP)
    WHERE id=? AND json_extract(configuration_json,'$.applicationAlert.lease')=?`)
    .bind(sent ? 'sent' : 'failed',planId,lease).run();
}
