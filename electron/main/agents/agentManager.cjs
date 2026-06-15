// agentManager — registry + dispatcher for AgentProvider adapters.
//
// The manager:
//   - holds adapters keyed by provider name (e.g. 'codex', 'claude')
//   - dispatches startRun({ provider, ...startTaskParams }) to the right one
//     (provider='auto' picks the first installed adapter)
//   - tracks in-flight runs by runId so cancel() can find them
//   - keeps a parallel history Map so the renderer can render a "Run
//     History" panel even after cancel() prunes the in-flight entry
//   - delegates streamEvents / reportUsage / produceDiff / runChecks / openPR
//     to the adapter that owns the runId
//   - holds pending approval requests so adapters can pause file-changing
//     work until the renderer calls approveRun / rejectRun
//
// It does NOT run any agent CLI itself — that is each adapter's job.
const crypto = require('node:crypto');
const { resolveProvider } = require('./resolveProvider.cjs');

function defaultGenerateRunId() {
  return crypto.randomUUID();
}

function defaultNow() { return Date.now(); }

function isAdapterShape(adapter) {
  if (!adapter || typeof adapter !== 'object') return false;
  for (const m of ['startTask', 'streamEvents', 'reportUsage', 'produceDiff', 'runChecks', 'openPR', 'cancel']) {
    if (typeof adapter[m] !== 'function') return false;
  }
  return true;
}

/**
 * Build a manager. Pass adapters at construction OR register them later.
 * @param {{
 *   adapters?: Record<string, object>,
 *   generateRunId?: () => string,
 *   detect?: () => Promise<object> | object,
 * }} [opts]
 */
function hhmm(epochMs) {
  const d = new Date(epochMs || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function createAgentManager({
  adapters = {},
  generateRunId = defaultGenerateRunId,
  detect,
  emitEvent,
  now = defaultNow,
  historyLimit = 100,
  initialRuns = [],
  persist,
} = {}) {
  const registry = new Map();
  // runId -> { provider, adapter, run }
  const inFlight = new Map();
  // runId -> { run, provider, startedAt, events?, historical? }; survives
  // cancel() so the Run History panel can render every run from this session,
  // and is seeded from persisted runs so it also shows past sessions (FEAT-008).
  const history = new Map();
  // runId -> { resolve, summary }; resolve('approved' | 'rejected')
  const pendingApprovals = new Map();

  // Seed history from persisted runs (oldest first, so live runs sort newest).
  for (const r of Array.isArray(initialRuns) ? initialRuns : []) {
    if (!r || typeof r.runId !== 'string') continue;
    history.set(r.runId, {
      run: {
        runId: r.runId, questId: r.questId, adventurerId: r.adventurerId,
        status: r.status, branch: r.branch, contextUsed: 0, maxContext: 0,
      },
      provider: r.provider,
      startedAt: r.startedAt,
      events: Array.isArray(r.events) ? r.events : [],
      historical: true,
    });
  }

  // Flat, serializable snapshot of all runs (incl. events) for the run store.
  function serializeRuns() {
    return [...history.values()].map((e) => ({
      runId: e.run.runId,
      questId: e.run.questId,
      adventurerId: e.run.adventurerId,
      status: e.run.status,
      provider: e.provider,
      branch: e.run.branch,
      startedAt: e.startedAt,
      events: Array.isArray(e.events) ? e.events : [],
    }));
  }

  function doPersist() {
    if (typeof persist === 'function') {
      try { persist(serializeRuns()); } catch { /* persistence is best-effort */ }
    }
  }

  function register(name, adapter) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError('agentManager.register: name must be a non-empty string');
    }
    if (!isAdapterShape(adapter)) {
      throw new TypeError(`agentManager.register: adapter for '${name}' is missing required AgentProvider methods`);
    }
    registry.set(name, adapter);
  }

  for (const [name, adapter] of Object.entries(adapters)) register(name, adapter);

  function listProviders() {
    return [...registry.keys()];
  }

  function getProvider(name) {
    const a = registry.get(name);
    if (!a) throw new Error(`unknown agent provider: ${name}`);
    return a;
  }

  async function resolveAuto() {
    if (typeof detect !== 'function') {
      throw new Error("provider='auto' requires a detect function on the manager");
    }
    const result = await detect();
    return resolveProvider(result, listProviders());
  }

  /**
   * Start a run for a quest via the named provider. Returns the AgentRun
   * handle the adapter produced. The manager assigns its own runId if the
   * adapter didn't (some adapters defer to the upstream service for IDs).
   * If params.provider === 'auto', the manager picks the first installed
   * adapter via resolveProvider + the injected detect function.
   * @param {{ provider: string } & object} params
   */
  function trimHistory() {
    while (history.size > historyLimit) {
      const oldest = history.keys().next().value;
      if (oldest === undefined) break;
      history.delete(oldest);
    }
  }

  async function startRun(params) {
    if (!params || typeof params !== 'object') {
      throw new TypeError('agentManager.startRun: params is required');
    }
    const { provider: requestedProvider, approvalMode, ...rest } = params;
    const provider = requestedProvider === 'auto'
      ? await resolveAuto()
      : requestedProvider;
    const adapter = getProvider(provider);

    // Approval boundary (BUG-004): for approvalMode 'ask' the run must be
    // explicitly approved before the adapter spawns a file-changing CLI. We
    // pre-assign the runId, register an awaiting-approval placeholder so the
    // renderer can re-sync via listPendingApprovals, emit a needsApproval
    // event, and block on requestApproval until the renderer answers. The
    // adapter is only invoked on approval, with the pre-assigned runId so the
    // approve/stream/cancel channels all key to the same id.
    let preRunId = null;
    if (approvalMode === 'ask') {
      preRunId = generateRunId();
      const placeholder = {
        runId: preRunId,
        questId: rest.questId,
        adventurerId: rest.adventurerId,
        status: 'awaiting-approval',
        contextUsed: 0,
        maxContext: 0,
        branch: rest.branch,
      };
      inFlight.set(preRunId, { provider, adapter, run: placeholder });
      history.set(preRunId, { run: { ...placeholder }, provider, startedAt: now() });
      trimHistory();
      const promptText = typeof rest.promptContext === 'string' ? rest.promptContext.slice(0, 240) : '';
      const summary = {
        skill: rest.skill,
        branch: rest.branch,
        // `text` is what ApprovalModal renders as the human-readable prompt.
        text: promptText,
      };
      if (typeof emitEvent === 'function') {
        emitEvent({
          runId: preRunId,
          event: { runId: preRunId, t: hhmm(now()), kind: 'plan', text: 'awaiting approval to run', payload: { needsApproval: true, summary } },
        });
      }
      const verdict = await requestApproval(preRunId, summary);
      if (verdict !== 'approved') {
        inFlight.delete(preRunId);
        const h = history.get(preRunId);
        if (h) h.run = { ...h.run, status: 'cancelled' };
        const err = new Error('run rejected by user');
        err.code = 'REJECTED';
        throw err;
      }
      // Drop the placeholder so the normal registration below (collision
      // check included) can re-add the real run under the same id.
      inFlight.delete(preRunId);
    }

    const adapterRun = await adapter.startTask(preRunId ? { ...rest, runId: preRunId } : rest);
    // Use the adapter's actual run object when it carries a runId, so the
    // adapter's in-place status mutations (running → done/failed/cancelled for
    // non-blocking runs) are visible through getRun/listRuns. Only spread to
    // inject a generated id when the adapter didn't provide one.
    const run = adapterRun && typeof adapterRun === 'object'
      ? (adapterRun.runId ? adapterRun : { ...adapterRun, runId: generateRunId() })
      : null;
    if (!run || !run.runId) {
      throw new Error(`agentManager.startRun: adapter '${provider}' did not return an AgentRun`);
    }
    if (inFlight.has(run.runId)) {
      throw new Error(`agentManager.startRun: runId collision: ${run.runId}`);
    }
    inFlight.set(run.runId, { provider, adapter, run });
    // Hold the LIVE run reference (not a copy) in history so listRuns reflects
    // status flips as the non-blocking run progresses (running → done/failed/
    // cancelled). The entry persists across cancel/eviction, so the record
    // isn't lost. Trim to historyLimit (FIFO) to bound memory.
    history.set(run.runId, { run, provider, startedAt: now() });
    trimHistory();
    // Snapshot the run's events once it settles, then persist (best-effort).
    captureWhenDone(run.runId);
    return run;
  }

  // When a non-blocking run settles, record its event trail on the history
  // entry and persist the run history so it survives a restart (FEAT-008).
  function captureWhenDone(runId) {
    getEvents(runId).then(
      (events) => { const h = history.get(runId); if (h) h.events = events; doPersist(); },
      () => { doPersist(); },
    );
  }

  function getRun(runId) {
    // In-flight only: null once a run is cancelled/forgotten. Historical runs
    // are surfaced through listRuns (with their recorded status), not here.
    return inFlight.get(runId)?.run ?? null;
  }

  function adapterFor(runId) {
    const entry = inFlight.get(runId);
    if (!entry) throw new Error(`unknown runId: ${runId}`);
    return entry.adapter;
  }

  // Historical (persisted / non-in-flight) runs have no live adapter — their
  // recorded events replay from history; live diff/checks aren't available.
  function streamEvents(runId) {
    if (inFlight.has(runId)) return adapterFor(runId).streamEvents(runId);
    const h = history.get(runId);
    if (h) {
      const events = Array.isArray(h.events) ? h.events : [];
      return (async function* replay() { for (const e of events) yield e; })();
    }
    throw new Error(`unknown runId: ${runId}`);
  }

  // Collect a run's full event trail. For a live run this drains the adapter
  // stream (and waits for it to settle); for a historical run it returns the
  // recorded trail. The renderer calls this on RunDetail mount.
  async function getEvents(runId) {
    if (!inFlight.has(runId)) {
      const h = history.get(runId);
      if (h) return Array.isArray(h.events) ? h.events : [];
      throw new Error(`unknown runId: ${runId}`);
    }
    const out = [];
    for await (const event of adapterFor(runId).streamEvents(runId)) out.push(event);
    return out;
  }

  async function reportUsage(runId) {
    if (!inFlight.has(runId)) {
      if (history.has(runId)) return { contextUsed: 0, maxContext: 0 };
      throw new Error(`unknown runId: ${runId}`);
    }
    return adapterFor(runId).reportUsage(runId);
  }

  async function produceDiff(runId) {
    if (!inFlight.has(runId)) {
      if (history.has(runId)) return { files: [] }; // past run: working tree has moved on
      throw new Error(`unknown runId: ${runId}`);
    }
    return adapterFor(runId).produceDiff(runId);
  }

  async function runChecks(runId) {
    if (!inFlight.has(runId)) {
      if (history.has(runId)) return [];
      throw new Error(`unknown runId: ${runId}`);
    }
    return adapterFor(runId).runChecks(runId);
  }

  async function openPR(runId, prParams) {
    return adapterFor(runId).openPR(runId, prParams);
  }

  /**
   * Adapter-side hook. The adapter calls this when it's about to apply
   * file changes; the returned promise resolves to 'approved' or
   * 'rejected' depending on which renderer-side method the user picks.
   * Throws if the runId isn't in-flight or already has a pending request.
   */
  function requestApproval(runId, summary) {
    if (!inFlight.has(runId)) {
      throw new Error(`agentManager.requestApproval: unknown runId: ${runId}`);
    }
    if (pendingApprovals.has(runId)) {
      throw new Error(`agentManager.requestApproval: ${runId} already has a pending approval`);
    }
    return new Promise((resolve) => {
      pendingApprovals.set(runId, { resolve, summary: summary || null });
    });
  }

  function listPendingApprovals() {
    return [...pendingApprovals.entries()].map(([runId, entry]) => ({
      runId, summary: entry.summary,
    }));
  }

  function approveRun(runId) {
    const entry = pendingApprovals.get(runId);
    if (!entry) {
      throw new Error(`agentManager.approveRun: no pending approval for ${runId}`);
    }
    pendingApprovals.delete(runId);
    entry.resolve('approved');
  }

  function rejectRun(runId) {
    const entry = pendingApprovals.get(runId);
    if (!entry) {
      throw new Error(`agentManager.rejectRun: no pending approval for ${runId}`);
    }
    pendingApprovals.delete(runId);
    entry.resolve('rejected');
  }

  /**
   * Cancel a run. Calls the adapter's cancel and removes the in-flight
   * entry on success. If the adapter throws, leaves the entry intact so
   * the caller can retry — the run is in an unknown terminal state.
   * Pending approvals on the run are auto-rejected so the adapter
   * doesn't await a request that the user has implicitly answered.
   */
  async function cancel(runId) {
    const adapter = adapterFor(runId);
    if (pendingApprovals.has(runId)) {
      const entry = pendingApprovals.get(runId);
      pendingApprovals.delete(runId);
      entry.resolve('rejected');
    }
    await adapter.cancel(runId);
    // Guarantee the cancelled status on the shared run reference (the real
    // adapter also does this; this makes the manager correct regardless).
    const histEntry = history.get(runId);
    if (histEntry && histEntry.run) histEntry.run.status = 'cancelled';
    inFlight.delete(runId);
  }

  /**
   * Recent runs for the Run History panel. Newest-first. Each entry is
   * a flat shape suitable for IPC — no adapter / closure references.
   */
  function listRuns({ limit = 50 } = {}) {
    const entries = [...history.values()];
    // history Map insertion order is oldest-first; reverse to render
    // most recent runs at the top of the panel.
    entries.reverse();
    return entries.slice(0, limit).map((entry) => ({
      runId: entry.run.runId,
      questId: entry.run.questId,
      adventurerId: entry.run.adventurerId,
      status: entry.run.status,
      branch: entry.run.branch,
      contextUsed: entry.run.contextUsed,
      maxContext: entry.run.maxContext,
      provider: entry.provider,
      startedAt: entry.startedAt,
    }));
  }

  /** Test-only / internal: forget all in-flight runs, history, and pending approvals. */
  function clearInFlight() {
    inFlight.clear();
    history.clear();
    pendingApprovals.clear();
  }

  return {
    register,
    listProviders,
    getProvider,
    startRun,
    getRun,
    listRuns,
    streamEvents,
    getEvents,
    reportUsage,
    produceDiff,
    runChecks,
    openPR,
    cancel,
    requestApproval,
    listPendingApprovals,
    approveRun,
    rejectRun,
    clearInFlight,
  };
}

module.exports = { createAgentManager };
