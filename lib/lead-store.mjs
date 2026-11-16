import { createReadStream } from 'node:fs';
import { appendFile, chmod, mkdir, open, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

// One JSONL record contains both the application and its consent evidence.
// The queue covers lookup + fsync + index update, including simultaneous retries.
// Only opaque request IDs, payload hashes and lead IDs are indexed in memory.
export function createLeadStore(filename, publicRoot) {
  const requests = new Map();
  let ready;
  let queue = Promise.resolve();

  async function initialize() {
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    const parent = await realpath(path.dirname(filename));
    let resolved;
    try { resolved = await realpath(filename); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const location of [parent, resolved].filter(Boolean)) {
      if (location === publicRoot || location.startsWith(publicRoot + path.sep)) {
        throw new Error('Lead storage must be outside the public directory');
      }
    }
    // Existing legacy entries are preserved and need no consent migration.
    if (!resolved) return;
    await chmod(filename, 0o600);
    const handle = await open(filename, 'r');
    try {
      const info = await handle.stat();
      if (info.size) {
        const tail = Buffer.alloc(1);
        await handle.read(tail, 0, 1, info.size - 1);
        if (tail[0] !== 10) throw new Error('Incomplete lead log; manual recovery required');
      }
    } finally { await handle.close(); }
    const input = createReadStream(filename, { encoding: 'utf8' });
    const lines = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        if (record.request_id && record.payload_sha256 && record.lead_id) {
          requests.set(record.request_id, { fingerprint: record.payload_sha256, leadId: record.lead_id });
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }

  return {
    save(record) {
      const operation = queue.then(async () => {
        ready ||= initialize();
        await ready;
        const previous = requests.get(record.request_id);
        if (previous) {
          if (previous.fingerprint !== record.payload_sha256) {
            return { conflict: true };
          }
          return { duplicate: true, leadId: previous.leadId };
        }
        // Flush before reporting success or sending a notification.
        try {
          await appendFile(filename, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600, flush: true });
        } catch (error) {
          // A failed write/fsync has uncertain outcome. Re-read durable state on
          // retry, instead of creating a duplicate or appending to a partial row.
          requests.clear();
          ready = undefined;
          throw error;
        }
        requests.set(record.request_id, { fingerprint: record.payload_sha256, leadId: record.lead_id });
        return { duplicate: false, leadId: record.lead_id };
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
