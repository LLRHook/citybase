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
const { normalizeProgression } = require('../agents/progression.cjs');

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
    ? r.events
      .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
      .slice(-MAX_EVENTS_PER_RUN).map((e) => ({
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
  // Serialize writes: each run settling fires its own best-effort save() with
  // the FULL history, so two near-simultaneous settles would otherwise race on
  // the shared `${file}.tmp` and could interleave into corrupt JSON. Chain them
  // so only one write touches the temp file at a time. `queue` always resolves
  // (errors are swallowed for sequencing only) so a failed write never stalls
  // the chain; the caller still sees its own write's real outcome via `result`.
  let queue = Promise.resolve();

  function decodeState(parsed) {
    const source = Array.isArray(parsed) ? parsed : (parsed?.version === 2 ? parsed.runs : []);
    const unique = new Map();
    for (const r of Array.isArray(source) ? source : []) {
      const run = sanitizeRun(r);
      if (run) unique.set(run.runId, run);
    }
    const runs = [...unique.values()];
    // Legacy arrays establish only a recoverable baseline. Never guess XP for
    // runs already lost to pruning, or count a restored summary a second time.
    const progression = normalizeProgression(parsed?.version === 2 ? parsed.progression : null, runs);
    return { runs: runs.slice(-MAX_RUNS), progression };
  }

  async function loadState() {
    try {
      return decodeState(JSON.parse(await read(file, 'utf8')));
    } catch {
      return decodeState([]);
    }
  }

  async function load() {
    return (await loadState()).runs;
  }

  async function writeOnce(runs, progression) {
    const state = decodeState({ version: 2, runs, progression });
    await ensureDir(userDataDir, { recursive: true });
    // Temp-file + rename for an atomic write that can't truncate on crash.
    // (Node's fs.rename uses MoveFileEx/MOVEFILE_REPLACE_EXISTING on Windows,
    // so it overwrites the destination — no unlink dance needed.)
    const tmp = `${file}.tmp`;
    await write(tmp, JSON.stringify({ version: 2, ...state }, null, 2), 'utf8');
    await moveInto(tmp, file);
    return state.runs;
  }

  function save(runs, progression) {
    const snapshot = decodeState({ version: 2, runs, progression });
    const result = queue.then(() => writeOnce(snapshot.runs, snapshot.progression));
    // Keep the chain alive even if this write rejects, so the next save runs.
    queue = result.catch(() => {});
    return result;
  }

  // Synchronous load for the boot path (the manager wants seed runs at
  // construction, before the event loop is doing async work).
  function loadStateSync() {
    try {
      return decodeState(JSON.parse(fsSync.readFileSync(file, 'utf8')));
    } catch {
      return decodeState([]);
    }
  }

  function loadSync() {
    return loadStateSync().runs;
  }

  return { load, loadSync, loadState, loadStateSync, save, file };
}

module.exports = { createRunStore, sanitizeRun, isTerminal, MAX_RUNS, MAX_EVENTS_PER_RUN };
