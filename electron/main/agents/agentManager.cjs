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
function createAgentManager({
  adapters = {},
  generateRunId = defaultGenerateRunId,
  detect,
  now = defaultNow,
  historyLimit = 100,
} = {}) {
  const registry = new Map();
  // runId -> { provider, adapter, run }
  const inFlight = new Map();
  // runId -> { run, provider, startedAt }; survives cancel() so the
  // renderer's Run History panel can render every run from this session
  // regardless of how it ended.
  const history = new Map();
  // runId -> { resolve, summary }; resolve('approved' | 'rejected')
  const pendingApprovals = new Map();

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
  async function startRun(params) {
    if (!params || typeof params !== 'object') {
      throw new TypeError('agentManager.startRun: params is required');
    }
    const { provider: requestedProvider, ...rest } = params;
    const provider = requestedProvider === 'auto'
      ? await resolveAuto()
      : requestedProvider;
    const adapter = getProvider(provider);
    const adapterRun = await adapter.startTask(rest);
    const run = adapterRun && typeof adapterRun === 'object'
      ? { ...adapterRun, runId: adapterRun.runId || generateRunId() }
      : null;
    if (!run || !run.runId) {
      throw new Error(`agentManager.startRun: adapter '${provider}' did not return an AgentRun`);
    }
    if (inFlight.has(run.runId)) {
      throw new Error(`agentManager.startRun: runId collision: ${run.runId}`);
    }
    inFlight.set(run.runId, { provider, adapter, run });
    // Capture a snapshot in history so a later cancel() doesn't erase
    // the record. Trim to historyLimit (FIFO) to keep memory bounded
    // on long-lived sessions.
    history.set(run.runId, { run: { ...run }, provider, startedAt: now() });
    while (history.size > historyLimit) {
      const oldest = history.keys().next().value;
      if (oldest === undefined) break;
      history.delete(oldest);
    }
    return run;
  }

  function getRun(runId) {
    return inFlight.get(runId)?.run ?? null;
  }

  function adapterFor(runId) {
    const entry = inFlight.get(runId);
    if (!entry) throw new Error(`unknown runId: ${runId}`);
    return entry.adapter;
  }

  function streamEvents(runId) {
    return adapterFor(runId).streamEvents(runId);
  }

  // Collect a run's full event trail into an array. Runs complete
  // synchronously, so the live streamEvents fan-out can fire before the
  // renderer subscribes and there's no replay; the renderer calls this on
  // RunDetail mount to reliably show a finished run's events.
  async function getEvents(runId) {
    const out = [];
    for await (const event of adapterFor(runId).streamEvents(runId)) out.push(event);
    return out;
  }

  async function reportUsage(runId) {
    return adapterFor(runId).reportUsage(runId);
  }

  async function produceDiff(runId) {
    return adapterFor(runId).produceDiff(runId);
  }

  async function runChecks(runId) {
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
    inFlight.delete(runId);
    // History keeps the record but reflects the final state.
    const histEntry = history.get(runId);
    if (histEntry) {
      histEntry.run = { ...histEntry.run, status: 'cancelled' };
    }
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
