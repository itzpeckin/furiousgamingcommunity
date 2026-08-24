const RELEASE = "6.1.0g";

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#05080d">
  <title>Franchise HQ | Build. Manage. Compete.</title>
  <meta name="description" content="Franchise HQ is a league management platform built for Madden online franchises.">
  <style>
    :root {
      color-scheme: dark;
      --bg:#05080d;
      --panel:rgba(13,19,29,.82);
      --line:rgba(116,155,214,.18);
      --text:#f7f9fc;
      --muted:#a8b3c5;
      --blue:#0878ff;
      --blue2:#00b7ff;
    }
    * { box-sizing:border-box; }
    html,body { margin:0; min-height:100%; background:var(--bg); color:var(--text); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    body {
      min-height:100vh;
      background:
        radial-gradient(circle at 50% 28%, rgba(0,119,255,.16), transparent 34rem),
        radial-gradient(circle at 15% 85%, rgba(0,183,255,.08), transparent 26rem),
        #05080d;
    }
    .shell { min-height:100vh; display:flex; flex-direction:column; }
    header {
      width:min(1180px,calc(100% - 40px));
      margin:0 auto;
      height:82px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      border-bottom:1px solid var(--line);
    }
    .brand { font-weight:900; letter-spacing:.04em; font-size:19px; }
    .brand span { color:#1698ff; }
    .top-login {
      color:#dbe8f8; text-decoration:none; font-weight:800; font-size:14px;
      padding:11px 16px; border:1px solid rgba(255,255,255,.14); border-radius:10px;
      background:rgba(255,255,255,.035);
    }
    main {
      flex:1;
      width:min(1180px,calc(100% - 40px));
      margin:0 auto;
      display:grid;
      grid-template-columns:minmax(0,1.06fr) minmax(360px,.94fr);
      gap:64px;
      align-items:center;
      padding:64px 0 78px;
    }
    .copy { max-width:660px; }
    .eyebrow {
      display:inline-flex; align-items:center; gap:9px;
      color:#77c8ff; font-weight:850; font-size:12px; letter-spacing:.14em;
      text-transform:uppercase; margin-bottom:20px;
    }
    .eyebrow::before { content:""; width:28px; height:2px; background:linear-gradient(90deg,var(--blue),var(--blue2)); }
    h1 { margin:0; font-size:clamp(44px,6vw,76px); line-height:.98; letter-spacing:-.045em; max-width:720px; }
    h1 span { background:linear-gradient(110deg,#fff 5%,#a8d7ff 48%,#118cff 78%); -webkit-background-clip:text; background-clip:text; color:transparent; }
    .lead { margin:24px 0 0; color:var(--muted); font-size:clamp(17px,2vw,20px); line-height:1.65; max-width:610px; }
    .actions { display:flex; flex-wrap:wrap; gap:13px; margin-top:34px; }
    .btn {
      min-height:50px; display:inline-flex; align-items:center; justify-content:center;
      padding:0 22px; border-radius:11px; text-decoration:none; font-weight:900; font-size:15px;
      transition:transform .15s ease,border-color .15s ease,background .15s ease;
    }
    .btn:hover { transform:translateY(-1px); }
    .primary { color:white; background:linear-gradient(135deg,#0878ff,#005ee8); box-shadow:0 12px 34px rgba(0,105,255,.24); }
    .secondary { color:#eef6ff; border:1px solid rgba(154,193,241,.24); background:rgba(255,255,255,.045); }
    .micro { margin-top:16px; color:#738198; font-size:12px; line-height:1.5; }
    .visual {
      position:relative; min-height:480px; display:flex; align-items:center; justify-content:center;
    }
    .visual::before {
      content:""; position:absolute; width:82%; aspect-ratio:1; border-radius:50%;
      background:radial-gradient(circle,rgba(0,127,255,.18),rgba(0,127,255,0) 68%);
      filter:blur(10px);
    }
    .logo-card {
      position:relative; width:100%; padding:26px;
      border:1px solid var(--line); border-radius:26px;
      background:linear-gradient(145deg,rgba(14,21,33,.82),rgba(5,9,15,.6));
      box-shadow:0 30px 90px rgba(0,0,0,.45);
      backdrop-filter:blur(12px);
    }
    .logo-card img { display:block; width:100%; height:auto; border-radius:16px; }
    .features {
      grid-column:1/-1; display:grid; grid-template-columns:repeat(3,1fr); gap:14px;
      margin-top:-6px;
    }
    .feature {
      padding:18px 20px; border:1px solid var(--line); border-radius:14px;
      background:rgba(11,17,26,.62);
    }
    .feature strong { display:block; font-size:14px; margin-bottom:6px; }
    .feature span { color:#8795aa; font-size:13px; line-height:1.45; }
    footer {
      width:min(1180px,calc(100% - 40px)); margin:0 auto; padding:22px 0 28px;
      border-top:1px solid var(--line); display:flex; justify-content:space-between; gap:16px;
      color:#657188; font-size:12px;
    }
    @media (max-width:860px) {
      header { height:70px; }
      main { grid-template-columns:1fr; gap:32px; padding:46px 0 58px; }
      .copy { text-align:center; margin:0 auto; }
      .eyebrow { justify-content:center; }
      .actions { justify-content:center; }
      .visual { min-height:0; width:min(620px,100%); margin:0 auto; }
      .features { grid-template-columns:1fr; margin-top:8px; }
    }
    @media (max-width:520px) {
      header,main,footer { width:min(100% - 28px,1180px); }
      .brand { font-size:16px; }
      .top-login { padding:9px 12px; font-size:13px; }
      main { padding-top:36px; }
      h1 { font-size:44px; }
      .lead { font-size:16px; }
      .actions { flex-direction:column; }
      .btn { width:100%; }
      .logo-card { padding:12px; border-radius:18px; }
      footer { flex-direction:column; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand">FRANCHISE<span>HQ</span></div>
      <a class="top-login" href="/api/auth/discord/login">Login with Discord</a>
    </header>
    <main>
      <section class="copy">
        <div class="eyebrow">Madden Franchise League Management</div>
        <h1>Build. Manage. <span>Compete.</span></h1>
        <p class="lead">Franchise HQ gives online franchise leagues one home for teams, players, standings, statistics, trades, schedules and league management.</p>
        <div class="actions">
          <a class="btn primary" href="/api/auth/discord/login">Login with Discord</a>
          <a class="btn secondary" href="/api/auth/discord/login?intent=create-league">Register Your League</a>
        </div>
        <div class="micro">League registration uses Discord identity first. League creation and ownership are completed in the next multi-league release.</div>
      </section>
      <section class="visual" aria-label="Franchise HQ">
        <div class="logo-card">
          <img src="/assets/franchisehq-public-logo.png" alt="Franchise HQ — Build, Manage, Compete">
        </div>
      </section>
      <section class="features" aria-label="Franchise HQ features">
        <div class="feature"><strong>League Management</strong><span>One dedicated home for every franchise league.</span></div>
        <div class="feature"><strong>Live League Data</strong><span>Built for rosters, schedules, standings, statistics and transactions.</span></div>
        <div class="feature"><strong>Competition Tools</strong><span>Trade workflows, player cards, team pages and commissioner tools.</span></div>
      </section>
    </main>
    <footer>
      <span>Franchise HQ</span>
      <span>Release ${RELEASE}</span>
    </footer>
  </div>
</body>
</html>`;
}

export async function onRequestGet() {
  return new Response(page(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-franchisehq-release": RELEASE,
      "x-franchisehq-surface": "public-landing"
    }
  });
}
