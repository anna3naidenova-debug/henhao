// Historical Netlify endpoint. Production uses server.mjs on Amvera.
// Fail closed: this legacy deployment has no durable consent/application store.
export default async () => Response.json(
  { ok: false, error: 'This endpoint is disabled. Use the configured Amvera application.' },
  { status: 410, headers: { 'Cache-Control': 'no-store' } },
);
