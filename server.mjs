import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createLeadStore } from './lib/lead-store.mjs';

const siteRoot = await realpath(fileURLToPath(new URL('./site/', import.meta.url)));
const leadsFile = path.resolve(process.env.LEADS_FILE || '/data/leads.jsonl');
const leadStore = createLeadStore(leadsFile, siteRoot);
const legalManifest = JSON.parse(await readFile(path.join(siteRoot, 'legal-manifest.json'), 'utf8'));
const legal = legalManifest.consent;
const privacy = legalManifest.privacy;
for (const document of [legal, privacy]) {
  const pageHash = createHash('sha256').update(await readFile(path.join(siteRoot, document.url))).digest('hex');
  if (pageHash !== document.html_sha256) throw new Error('Legal page does not match legal manifest; rebuild legal documents');
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const port = Number(process.env.PORT ?? 80);
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf',
};
const limits = new Map();
const windowMs = 10 * 60 * 1000;
setInterval(() => {
  for (const [ip, entry] of limits) if (entry.until <= Date.now()) limits.delete(ip);
}, 60_000).unref();

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function clientIP(req) {
  // Enable only behind a trusted proxy that overwrites X-Real-IP / appends X-Forwarded-For.
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
    if (isIP(forwarded)) return forwarded.replace(/^::ffff:/, '');
  }
  return (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

async function telegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.error('Telegram: bot is not configured; lead saved');
    return;
  }
  const cnTime = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Shanghai', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(lead.sent_at)).replace(',', '');
  const utm = ['source', 'medium', 'campaign', 'content']
    .filter(k => lead['utm_' + k]).map(k => `${k}=${lead['utm_' + k]}`).join(' / ');
  const lines = [
    'Новая заявка: связаться с менеджером', `Имя: ${lead.name}`, `E-mail: ${lead.email}`,
    `Телефон: ${lead.phone}`, lead.telegram && `Telegram: ${lead.telegram}`,
    `Кнопка: ${lead.cta_source}`, utm && `UTM: ${utm}`, `Время заявки: ${cnTime} (Китай)`,
    'До оплаты направьте клиенту индивидуальные условия: название пакета, число и длительность занятий, полную стоимость, расписание с часовым поясом и состав услуг.',
    'Оферта (разделы 6–7: переносы, отмены и возвраты): https://henhaoschool.ru/offer.html',
    'Сведения об исполнителе: https://henhaoschool.ru/requisites.html',
  ].filter(Boolean);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: lines.join('\n'), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(`HTTP ${response.status}`);
      return;
    } catch {
      // Do not log fetch errors: their messages can contain the secret bot URL.
      console.error(`Telegram: attempt ${attempt}/3 failed; lead saved`);
    }
  }
}

async function lead(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false }, { Allow: 'POST' });
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json(res, 415, { ok: false, error: 'Expected application/json' });
  }
  if (Number(req.headers['content-length']) > 10 * 1024) {
    req.resume();
    return json(res, 413, { ok: false, error: 'Body too large' });
  }
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) {
    return json(res, 403, { ok: false, error: 'Invalid origin' });
  }
  const ip = clientIP(req);
  const now = Date.now();
  let entry = limits.get(ip);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + windowMs };
    limits.set(ip, entry);
  }
  if (entry.count >= 5) {
    return json(res, 429, { ok: false, error: 'Too many requests' }, { 'Retry-After': String(Math.ceil((entry.until - now) / 1000)) });
  }
  entry.count++;
  let d;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10 * 1024) {
        json(res, 413, { ok: false, error: 'Body too large' });
        return;
      }
      chunks.push(chunk);
    }
    d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Invalid object');
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON' });
  }
  if (d.consent !== true) return json(res, 400, { ok: false, error: 'Consent required' });
  if (d.consent_document_id !== legal.document_id || d.consent_version !== legal.version) {
    return json(res, 409, { ok: false, error: 'Consent document changed', code: 'CONSENT_VERSION_CHANGED' });
  }
  if (d.privacy_acknowledged !== true) return json(res, 400, { ok: false, error: 'Privacy acknowledgement required' });
  if (d.privacy_document_id !== privacy.document_id || d.privacy_version !== privacy.version) {
    return json(res, 409, { ok: false, error: 'Privacy document changed', code: 'PRIVACY_VERSION_CHANGED' });
  }
  if (typeof d.request_id !== 'string' || !uuid.test(d.request_id)) {
    return json(res, 400, { ok: false, error: 'Valid request ID required' });
  }
  const elapsed = Number(d.elapsed);
  if (d.website || !Number.isFinite(elapsed) || elapsed < 3) {
    return json(res, 422, { ok: false, error: 'Please retry after completing the form' });
  }
  if (!clean(d.name) || clean(d.phone).replace(/\D/g, '').length < 6 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(d.email, 120))) {
    return json(res, 400, { ok: false, error: 'Valid name, email and phone required' });
  }

  const fields = { name: 100, phone: 80, email: 120, telegram: 80, cta_source: 60, browser_tz: 60, page: 200,
    utm_source: 100, utm_medium: 100, utm_campaign: 100, utm_content: 100, utm_term: 100 };
  const saved = Object.fromEntries(Object.entries(fields).map(([key, max]) => [key, clean(d[key], max)]));
  saved.payload_sha256 = createHash('sha256').update(JSON.stringify({ ...saved,
    consent: true, document_id: legal.document_id, version: legal.version,
    privacy_acknowledged: true, privacy_document_id: privacy.document_id, privacy_version: privacy.version,
  })).digest('hex');
  saved.request_id = d.request_id;
  saved.lead_id = randomUUID();
  const sentAt = new Date(d.sent_at || now);
  saved.sent_at = Number.isNaN(sentAt.getTime()) ? new Date(now).toISOString() : sentAt.toISOString();
  saved.received_at = new Date().toISOString();
  saved.consent = {
    consent_id: randomUUID(), event_id: randomUUID(), lead_id: saved.lead_id,
    document_id: legal.document_id, document_url: legal.url, document_version: legal.version,
    document_sha256: legal.html_sha256, accepted: true, checkbox_checked: true,
    method: 'separate_checkbox', recorded_at: saved.received_at, timezone: 'UTC',
  };
  saved.privacy_acknowledgement = {
    event_id: randomUUID(), lead_id: saved.lead_id,
    document_id: privacy.document_id, document_url: privacy.url, document_version: privacy.version,
    document_sha256: privacy.html_sha256, acknowledged: true, checkbox_checked: true,
    method: 'separate_checkbox', recorded_at: saved.received_at, timezone: 'UTC',
  };
  try {
    const result = await leadStore.save(saved);
    if (result.conflict) return json(res, 409, { ok: false, error: 'Request ID already used for different data' });
    if (result.duplicate) return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Lead storage failed:', error.code || 'unknown');
    return json(res, 500, { ok: false, error: 'Could not save lead' });
  }
  try {
    await telegram(saved);
  } catch {
    console.error('Telegram: notification failed; lead saved');
  }
  json(res, 200, { ok: true });
}

async function staticFile(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { ok: false }, { Allow: 'GET, HEAD' });
  let filename;
  let status = 200;
  try {
    const segments = pathname.split('/');
    if (segments.some(segment => segment.startsWith('.')) || pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid path');
    filename = await realpath(path.join(siteRoot, pathname));
    if (filename !== siteRoot && !filename.startsWith(siteRoot + path.sep)) throw new Error('Outside site');
    if ((await stat(filename)).isDirectory()) filename = await realpath(path.join(filename, 'index.html'));
    if (!filename.startsWith(siteRoot + path.sep) || !(await stat(filename)).isFile()) throw new Error('Not a file');
  } catch {
    filename = path.join(siteRoot, '404.html');
    status = 404;
  }
  const info = await stat(filename);
  const immutable = status === 200 && /^\/assets\/(fonts|img)\//.test(pathname);
  res.writeHead(status, {
    'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(filename).on('error', () => res.destroy()).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return json(res, 400, { ok: false }); }
    if (pathname === '/api/lead') await lead(req, res);
    else await staticFile(req, res, pathname);
  } catch (error) {
    console.error('Request failed:', error.code || 'unknown');
    if (!res.headersSent) json(res, 500, { ok: false });
    else res.destroy();
  }
});
server.requestTimeout = 30_000;
server.listen(port, '0.0.0.0', () => console.log(`Listening on port ${server.address().port}`));
