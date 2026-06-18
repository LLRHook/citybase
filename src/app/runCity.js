// runCity.js — pure mappings from an agent run + its event stream to the
// city's "living" overlay. No React. The real adapters emit coarse events
// ({ kind: 'plan'|'edit'|'test'|'pr'|'error', text }) with no per-file paths,
// so the truthful signal for *which* buildings are active is the working tree
// itself: while a run is in flight, its dirty files are the ones being worked.

const PHASE_BY_KIND = {
  plan: { phase: 'planning', label: 'planning' },
  edit: { phase: 'editing', label: 'editing files' },
  test: { phase: 'testing', label: 'running checks' },
  lint: { phase: 'testing', label: 'running checks' },
  pr: { phase: 'review', label: 'ready for review' },
};

const IDLE = { phase: 'idle', label: 'idle' };

/**
 * Current "phase" of a run for the city banner. Terminal status wins; otherwise
 * the most recent event kind drives the label so the banner tracks progress.
 * @param {{status?:string}|null} run
 * @param {Array<{kind?:string}>} [events]
 */
export function runPhase(run, events = []) {
  if (!run) return IDLE;
  if (run.status === 'failed') return { phase: 'failed', label: 'failed' };
  if (run.status === 'cancelled') return { phase: 'cancelled', label: 'cancelled' };
  if (run.status === 'done') return { phase: 'done', label: 'done' };
  // running (or unknown non-terminal) → derive from the latest known event
  const list = Array.isArray(events) ? events : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (e && e.kind === 'error') return { phase: 'failed', label: 'error' };
    const mapped = e && PHASE_BY_KIND[e.kind];
    if (mapped) return mapped;
  }
  return { phase: 'starting', label: 'starting' };
}

/**
 * The set of paths the active run is "working on": its workspace's dirty files
 * while it runs. Empty when no run is active so the city sits calm.
 * @param {{status?:string}|null} run
 * @param {{files?:Array<{path:string}>}|null} snapshot
 * @returns {string[]}
 */
export function activePathsForRun(run, snapshot) {
  if (!run || run.status !== 'running') return [];
  const files = snapshot && Array.isArray(snapshot.files) ? snapshot.files : [];
  return files.map((f) => f && f.path).filter(Boolean);
}

/**
 * Pick the run that should drive the live city overlay: the first running run,
 * else null. (v1 dispatches one at a time; this stays correct if that changes.)
 * @param {Array<{status?:string}>} runs
 */
export function activeRunFrom(runs) {
  if (!Array.isArray(runs)) return null;
  return runs.find((r) => r && r.status === 'running') || null;
}

// Claude tool uses that change files — their `file_path` is what the city
// should light the instant the agent touches it (read-only tools are skipped).
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Create']);

/**
 * Pull the file paths an agent has touched out of its live event stream
 * (`payload.path` from stream-json tool uses). These light the exact buildings
 * in real time, ahead of the 2.5s snapshot refresh. Raw paths (often absolute);
 * the caller relativizes against the workspace root.
 * @param {Array<{payload?:{path?:string,tool?:string}}>} events
 * @returns {string[]}
 */
export function touchedPathsFromEvents(events) {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    const pl = e && e.payload;
    if (pl && typeof pl.path === 'string' && pl.path && (!pl.tool || EDIT_TOOLS.has(pl.tool))) {
      out.push(pl.path);
    }
  }
  return out;
}

/**
 * Convert an agent's (often absolute) path to a repo-relative, POSIX-style path
 * matching the city's building paths. Falls back to a normalized input when it
 * isn't under the root (the dirty-file set still catches it within ~2.5s).
 */
export function toRepoRelative(p, rootPath) {
  if (typeof p !== 'string' || !p) return p;
  const norm = p.replace(/\\/g, '/');
  if (rootPath) {
    const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    // Match the root case-insensitively: on Windows the agent and git can
    // disagree on drive-letter case (C:\ vs c:\), which would otherwise leave
    // the path absolute and unmatched to the city's buildings. We slice the
    // ORIGINAL `norm` by the root's length so the suffix keeps its real case.
    const low = norm.toLowerCase();
    const lowRoot = root.toLowerCase();
    if (low === lowRoot) return '';
    if (low.startsWith(`${lowRoot}/`)) return norm.slice(root.length + 1);
  }
  return norm;
}
