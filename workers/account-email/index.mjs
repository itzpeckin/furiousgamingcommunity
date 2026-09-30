// Private service binding only. No public route, workers.dev, or preview URL.
const SUBJECTS = Object.freeze({
  'verify-email':'Verify your FranchiseHQ email',
  'reset-password':'Reset your FranchiseHQ password',
  'link-email':'Add email sign-in to your FranchiseHQ account'
});

export default {
  async fetch(request,env) {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') return Response.json({ ready:typeof env.EMAIL?.send === 'function' });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') return new Response(null,{ status:404 });
    let body;
    try { body = await request.json(); } catch { return new Response(null,{ status:400 }); }
    if (!body || !Object.hasOwn(SUBJECTS,body.purpose) || !/^[a-f0-9]{64}$/.test(String(body.token || ''))
      || !/^[^\s@<>\r\n]{1,64}@[^\s@<>\r\n]{1,190}$/.test(String(body.email || ''))) return new Response(null,{ status:400 });
    const link = `https://franchisehq.app/account#action=${body.purpose}&token=${body.token}`;
    const expiry = body.purpose === 'reset-password' ? '30 minutes' : '24 hours';
    const text = `${SUBJECTS[body.purpose]}\n\nOpen this link to continue:\n${link}\n\nThis link expires in ${expiry} and works once. If you did not request this, you can ignore this email.\n\nFranchiseHQ`;
    try {
      await env.EMAIL.send({ from:'accounts@franchisehq.app',to:body.email,subject:SUBJECTS[body.purpose],text });
      return new Response(null,{ status:204 });
    } catch { return new Response(null,{ status:503 }); }
  }
};
