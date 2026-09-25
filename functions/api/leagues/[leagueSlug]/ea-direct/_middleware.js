const RELEASE = "7.0.1";

// EA-direct discovery was experimental and included credential-bearing probes.
// Keep every route fail-closed until a separately reviewed, per-league
// integration is designed and explicitly enabled in a later release.
export async function onRequest(context) {
  // Only the reviewed tenant-scoped connection and collector are exposed.
  // All legacy credential probes and arbitrary discovery URLs stay contained.
  const path=context?.request?new URL(context.request.url).pathname:'';
  if(/^\/api\/leagues\/[^/]+\/ea-direct\/(connection|sync|collect-step)$/.test(path))return context.next();
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
