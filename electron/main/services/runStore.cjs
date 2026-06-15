// runStore.cjs — persists agent run history to userData/runs.json so the Run
// History panel survives app restarts (FEAT-008). Mirrors workspaceService's
// shape: pure-ish with injected fs so it unit-tests without Electron.
//
// Only terminal runs are persisted (a 'running' run from a crashed session
// would be misleading on restore). Each record is a flat, serializable
// snapshot — no adapter/closure references — capped so the file stays small.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const STATE_FILENAME = 'runs.json';
const MAX_RUNS = 100;
const MAX_EVENTS_PER_RUN = 60;

function isTerminal(status) {
  return status === 'done' || status === 'failed' || status === 'cancelled';
}

// Reduce a run record to the persistable, capped shape.
function sanitizeRun(r) {
  if (!r || typeof r !== 'object' || typeof r.runId !== 'string') return null;
  if (!isTerminal(r.status)) return null;
  const events = Array.isArray(r.events)
    ? r.events.slice(-MAX_EVENTS_PER_RUN).map((e) => ({
        runId: e.runId, t: e.t, kind: e.kind,
        text: typeof e.text === 'string' ? e.text.slice(0, 2000) : '',
      }))
    : [];
  return {
    runId: r.runId,
    questId: r.questId ?? null,
    adventurerId: r.adventurerId ?? null,
    status: r.status,
    provider: r.provider ?? null,
    branch: r.branch ?? null,
    startedAt: r.startedAt ?? null,
    events,
    historical: true,
  };
}

function createRunStore({ userDataDir, readFile, writeFile, mkdir, rename } = {}) {
  if (typeof userDataDir !== 'string' || userDataDir.length === 0) {
    throw new TypeError('createRunStore: userDataDir is required');
  }
  const file = path.join(userDataDir, STATE_FILENAME);
  const read = readFile || fs.readFile;
  const write = writeFile || fs.writeFile;
  const ensureDir = mkdir || fs.mkdir;
  const moveInto = rename || fs.rename;

  async function load() {
    try {
      const raw = await read(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeRun).filter(Boolean).slice(-MAX_RUNS);
    } catch (err) {
      if (err && err.code === 'ENOENT') return [];
      // Corrupt file: start empty rather than crash the boot path.
      return [];
    }
  }

  async function save(runs) {
    const records = (Array.isArray(runs) ? runs : [])
      .map(sanitizeRun)
      .filter(Boolean)
      .slice(-MAX_RUNS);
    await ensureDir(userDataDir, { recursive: true });
    // Temp-file + rename for an atomic write that can't truncate on crash.
    const tmp = `${file}.tmp`;
    await write(tmp, JSON.stringify(records, null, 2), 'utf8');
    await moveInto(tmp, file);
    return records;
  }

  // Synchronous load for the boot path (the manager wants seed runs at
  // construction, before the event loop is doing async work).
  function loadSync() {
    try {
      const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed.map(sanitizeRun).filter(Boolean).slice(-MAX_RUNS) : [];
    } catch {
      return [];
    }
  }

  return { load, loadSync, save, file };
}

module.exports = { createRunStore, sanitizeRun, isTerminal, MAX_RUNS, MAX_EVENTS_PER_RUN };
