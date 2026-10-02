export async function onRequest(context) {
  let accountEmail='unavailable';
  if (context?.env?.ACCOUNT_EMAIL?.fetch) {
    try {
      const response=await context.env.ACCOUNT_EMAIL.fetch(new Request('https://account-email.internal/health',{signal:AbortSignal.timeout(3000)}));
      if(response.ok && (await response.json()).ready === true) accountEmail='ready';
    } catch { /* Health checks never send email or include private account data. */ }
  }
  return new Response(
    JSON.stringify({
      ok: true,
      release: '8.2.2',
      accountEmail,
      service: "Franchise HQ",
      environment: "Cloudflare Pages Functions"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
