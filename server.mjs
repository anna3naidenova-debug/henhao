import http from 'node:http';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const siteRoot = await realpath(fileURLToPath(new URL('./site/', import.meta.url)));
const leadsFile = path.resolve(process.env.LEADS_FILE || '/data/leads.jsonl');
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
  const elapsed = Number(d.elapsed);
  if (d.website || !Number.isFinite(elapsed) || elapsed < 3) return json(res, 200, { ok: true });
  if (!clean(d.name) || !clean(d.phone)) return json(res, 400, { ok: false, error: 'Name and phone required' });

  const fields = { name: 100, phone: 80, email: 120, telegram: 80, cta_source: 60, browser_tz: 60, page: 200,
    utm_source: 100, utm_medium: 100, utm_campaign: 100, utm_content: 100, utm_term: 100 };
  const saved = Object.fromEntries(Object.entries(fields).map(([key, max]) => [key, clean(d[key], max)]));
  const sentAt = new Date(d.sent_at || now);
  saved.sent_at = Number.isNaN(sentAt.getTime()) ? new Date(now).toISOString() : sentAt.toISOString();
  saved.received_at = new Date(now).toISOString();
  try {
    await mkdir(path.dirname(leadsFile), { recursive: true });
    await appendFile(leadsFile, JSON.stringify(saved) + '\n', { encoding: 'utf8', mode: 0o600, flush: true });
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
