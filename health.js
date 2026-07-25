export async function onRequest() {
  return new Response(
    JSON.stringify({
      ok: true,
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
