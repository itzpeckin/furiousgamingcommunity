import { onRequestGet as registration } from './register-league/index.js';

export async function onRequestGet(context) {
  const response = await registration(context);
  const html = (await response.text())
    .replace('<body>','<body data-beta-application>')
    .replaceAll('Invitation-only beta','Commissioner beta access')
    .replaceAll('Set up your league','Apply for your league')
    .replaceAll('Create league</button>','Submit for approval</button>')
    .replace('Connect your account, add your league, then bring in your Madden data.','Create an account, submit your league details, and receive access after owner approval.')
    .replace('After creating your league, follow its setup checklist to bring in your Madden data.',
      'Your league stays inactive until the FranchiseHQ owner approves your application. Return here to check its status.');
  return new Response(html,{headers:response.headers});
}
