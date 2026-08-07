import { json, platformReadiness } from '../../_lib/cloud-platform.js';

export async function onRequestGet(context) {
  const platform = await platformReadiness(context.env);
  return json({
    ok: true,
    platform,
    message: platform.ready
      ? 'Cloud Platform and Companion Storage Layer are ready.'
      : platform.configured
        ? 'Cloud bindings are configured, but migration 0002 is not yet applied.'
        : 'One or more Cloudflare bindings are not configured.'
  });
}
