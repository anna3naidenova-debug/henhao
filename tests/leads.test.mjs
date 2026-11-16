import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'henhao-legal-tests-'));
const leads = path.join(temporary, 'leads.jsonl');
const notifications = path.join(temporary, 'notifications.jsonl');
const legacy = '{"name":"Legacy synthetic record","received_at":"2026-01-01T00:00:00Z"}\n';
await writeFile(leads, legacy);
let processInfo, ipCounter = 0;

async function start(extra = {}) {
  const child = spawn(process.execPath, ['--import', './tests/mock-telegram.mjs', 'server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0', LEADS_FILE: leads, TRUST_PROXY: '1',
      TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat',
      MOCK_TELEGRAM_LOG: notifications, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stderr.on('data', chunk => { log += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timed out: ' + log)), 5000);
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/Listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${log}`)); });
  });
  return { child, base: `http://127.0.0.1:${port}`, logs: () => log };
}

async function stop(info) {
  if (!info || info.child.exitCode !== null) return;
  const ended = once(info.child, 'exit');
  info.child.kill('SIGTERM');
  await ended;
}

function payload(overrides = {}) {
  return { name: 'Тест', email: 'test@example.test', phone: '+7 900 0000000', telegram: '@test',
    consent: true, consent_document_id: 'henhao-consent', consent_version: '2026-11-16',
    privacy_acknowledged: true, privacy_document_id: 'henhao-privacy', privacy_version: '2026-11-16',
    request_id: randomUUID(), elapsed: 10, sent_at: '1990-01-01T00:00:00Z',
    consent_recorded_at: '1990-01-01T00:00:00Z', page: 'https://henhaoschool.ru/',
    ...overrides };
}

async function post(data, info = processInfo, headers = {}) {
  return fetch(info.base + '/api/lead', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': `10.0.0.${++ipCounter}`, ...headers },
    body: JSON.stringify(data) });
}
async function rows(filename = leads) {
  return (await readFile(filename, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('applications, consent evidence, retries and notifications', async t => {
  processInfo = await start();
  t.after(async () => { await stop(processInfo); });

  await t.test('all four public HTML documents, footers and private path protection', async () => {
    for (const slug of ['privacy', 'consent', 'offer', 'requisites']) {
      const response = await fetch(processInfo.base + `/${slug}.html`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      const page = await response.text();
      for (const target of ['privacy', 'consent', 'offer', 'requisites']) assert.ok(page.includes(`href="/${target}.html"`));
    }
    assert.equal((await fetch(processInfo.base + '/leads.jsonl')).status, 404);
    assert.equal((await fetch(processInfo.base + '/lib/lead-store.mjs')).status, 404);
  });

  await t.test('server rejects missing, false and nonboolean consent, even bypassing the UI', async () => {
    for (const value of [undefined, false, 'true', 1, [], {}]) {
      const response = await post(payload({ consent: value }));
      assert.equal(response.status, 400);
    }
    assert.equal((await rows()).length, 1);
  });

  await t.test('privacy acknowledgement is required separately from consent', async () => {
    for (const value of [undefined, false, 'true', 1, [], {}]) {
      assert.equal((await post(payload({ privacy_acknowledged: value }))).status, 400);
    }
    for (const fields of [{ privacy_version: 'old' }, { privacy_document_id: 'other' }]) {
      const response = await post(payload(fields));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'PRIVACY_VERSION_CHANGED');
    }
    assert.equal((await rows()).length, 1);
  });

  await t.test('server validates document version, ID, request ID, fields and spam', async () => {
    for (const fields of [{ consent_version: 'old' }, { consent_document_id: 'other' }]) {
      const response = await post(payload(fields));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'CONSENT_VERSION_CHANGED');
    }
    for (const fields of [{ request_id: '' }, { email: '' }, { phone: '1' }, { name: '' }]) {
      assert.equal((await post(payload(fields))).status, 400);
    }
    for (const fields of [{ elapsed: 0 }, { elapsed: null }, { website: 'spam' }]) {
      assert.equal((await post(payload(fields))).status, 422);
    }
    assert.equal((await post(payload(), processInfo, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await rows()).length, 1);
  });

  const valid = payload();
  await t.test('one durable record includes server-owned consent evidence; Telegram excludes it', async () => {
    assert.equal((await post(valid)).status, 200);
    const record = (await rows()).at(-1);
    assert.equal(record.consent.lead_id, record.lead_id);
    assert.equal(record.consent.accepted, true);
    assert.equal(record.consent.checkbox_checked, true);
    assert.equal(record.consent.document_version, '2026-11-16');
    assert.match(record.consent.recorded_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.ok(Date.parse(record.consent.recorded_at) > Date.parse('2026-01-01T00:00:00Z'));
    assert.equal(record.consent.timezone, 'UTC');
    assert.notEqual(record.consent.consent_id, record.consent.event_id);
    assert.equal(record.consent.document_sha256.length, 64);
    assert.equal(record.privacy_acknowledgement.acknowledged, true);
    assert.equal(record.privacy_acknowledgement.checkbox_checked, true);
    assert.equal(record.privacy_acknowledgement.document_id, 'henhao-privacy');
    assert.equal(record.privacy_acknowledgement.document_version, '2026-11-16');
    assert.equal(record.privacy_acknowledgement.document_sha256.length, 64);
    assert.equal(record.privacy_acknowledgement.lead_id, record.lead_id);
    assert.equal(record.privacy_acknowledgement.recorded_at, record.received_at);
    assert.notEqual(record.privacy_acknowledgement.event_id, record.consent.event_id);
    assert.equal((await stat(leads)).mode & 0o077, 0); // legacy fixture also private
    const message = (await rows(notifications)).at(-1).text;
    assert.match(message, /Имя: Тест/);
    assert.match(message, /https:\/\/henhaoschool.ru\/offer.html/);
    assert.match(message, /До оплаты/);
    assert.ok(!message.includes(record.consent.event_id));
    assert.ok(!message.includes(record.consent.document_sha256));
    assert.ok(!message.includes(record.privacy_acknowledgement.event_id));
  });

  await t.test('lost-response retry and simultaneous retries create no duplicate notifications', async () => {
    assert.equal((await post(valid)).status, 200);
    const concurrent = payload();
    const responses = await Promise.all(Array.from({ length: 4 }, () => post(concurrent)));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal((await rows()).length, 3);
    assert.equal((await rows(notifications)).length, 2);
    assert.equal((await post({ ...valid, name: 'Changed' })).status, 409);
  });

  await t.test('idempotency survives server restart; legacy applications remain unchanged', async () => {
    await stop(processInfo);
    processInfo = await start();
    assert.equal((await post(valid)).status, 200);
    assert.equal((await rows()).length, 3);
    assert.equal((await rows(notifications)).length, 2);
    assert.ok((await readFile(leads, 'utf8')).startsWith(legacy));
    assert.doesNotMatch(processInfo.logs(), /Тест|test@example/);
  });

  await t.test('rate limiting still blocks abusive requests', async () => {
    for (let index = 0; index < 6; index++) {
      const response = await post(payload({ consent: false }), processInfo, { 'X-Real-IP': '192.0.2.20' });
      assert.equal(response.status, index < 5 ? 400 : 429);
    }
  });
});

test('storage failures fail closed; notification failures preserve applications', async () => {
  const blocked = path.join(temporary, 'blocked');
  await mkdir(blocked);
  for (const filename of [blocked, path.join(temporary, 'broken.jsonl')]) {
    if (filename.endsWith('.jsonl')) await writeFile(filename, '{"partial":');
    const info = await start({ LEADS_FILE: filename });
    try {
      const response = await post(payload(), info);
      assert.equal(response.status, 500);
      assert.equal((await response.json()).ok, false);
      assert.match(info.logs(), /Lead storage failed/);
    } finally { await stop(info); }
  }
  const filename = path.join(temporary, 'telegram-failure.jsonl');
  const info = await start({ LEADS_FILE: filename, MOCK_TELEGRAM_FAIL: '1' });
  try {
    assert.equal((await post(payload(), info)).status, 200);
    assert.equal((await rows(filename)).length, 1);
    assert.match(info.logs(), /attempt 3\/3 failed; lead saved/);
    assert.equal((await stat(filename)).mode & 0o077, 0);
  } finally { await stop(info); }
});
