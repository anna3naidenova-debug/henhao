// Loaded only by the isolated child server in the integration tests.
import { appendFile } from 'node:fs/promises';
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://api.telegram.org/bot')) throw new Error('Unexpected external request');
  await appendFile(process.env.MOCK_TELEGRAM_LOG, options.body + '\n');
  return Response.json({ ok: process.env.MOCK_TELEGRAM_FAIL !== '1' });
};
