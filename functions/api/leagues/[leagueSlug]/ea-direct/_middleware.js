const RELEASE = "7.0.1";

// EA-direct discovery was experimental and included credential-bearing probes.
// Keep every route fail-closed until a separately reviewed, per-league
// integration is designed and explicitly enabled in a later release.
export async function onRequest() {
  return new Response(JSON.stringify({
    ok: false,
    error: "Not found.",
    release: RELEASE
  }), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
