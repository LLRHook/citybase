// agentManager — registry + dispatcher for AgentProvider adapters.
//
// The manager:
//   - holds adapters keyed by provider name (e.g. 'codex', 'claude')
//   - dispatches startRun({ provider, ...startTaskParams }) to the right one
//   - tracks in-flight runs by runId so cancel() can find them
//   - delegates streamEvents / reportUsage / produceDiff / runChecks / openPR
//     to the adapter that owns the runId
//
// It does NOT run any agent CLI itself — that is each adapter's job.
// Slice 1 ships the registry + dispatch only; concrete CodexAdapter and
// ClaudeAdapter ship in slice 2.
const crypto = require('node:crypto');

function defaultGenerateRunId() {
  return crypto.randomUUID();
}

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
 * }} [opts]
 */
function createAgentManager({ adapters = {}, generateRunId = defaultGenerateRunId } = {}) {
  const registry = new Map();
  // runId -> { provider, adapter, run }
  const inFlight = new Map();

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

  /**
   * Start a run for a quest via the named provider. Returns the AgentRun
   * handle the adapter produced. The manager assigns its own runId if the
   * adapter didn't (some adapters defer to the upstream service for IDs).
   * @param {{ provider: string } & object} params
   */
  async function startRun(params) {
    if (!params || typeof params !== 'object') {
      throw new TypeError('agentManager.startRun: params is required');
    }
    const { provider, ...rest } = params;
    const adapter = getProvider(provider);
    const adapterRun = await adapter.startTask(rest);
    const run = adapterRun && typeof adapterRun === 'object'
      ? { ...adapterRun, runId: adapterRun.runId || generateRunId() }
      : null;
    if (!run || !run.runId) {
      throw new Error(`agentManager.startRun: adapter '${provider}' did not return an AgentRun`);
    }
    if (inFlight.has(run.runId)) {
      // Avoid clobbering an existing run; surface the collision instead of
      // silently overwriting the registry entry.
      throw new Error(`agentManager.startRun: runId collision: ${run.runId}`);
    }
    inFlight.set(run.runId, { provider, adapter, run });
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
   * Cancel a run. Calls the adapter's cancel and removes the in-flight
   * entry on success. If the adapter throws, leaves the entry intact so
   * the caller can retry — the run is in an unknown terminal state.
   */
  async function cancel(runId) {
    const adapter = adapterFor(runId);
    await adapter.cancel(runId);
    inFlight.delete(runId);
  }

  /** Test-only / internal: forget all in-flight runs without calling adapters. */
  function clearInFlight() {
    inFlight.clear();
  }

  return {
    register,
    listProviders,
    getProvider,
    startRun,
    getRun,
    streamEvents,
    reportUsage,
    produceDiff,
    runChecks,
    openPR,
    cancel,
    clearInFlight,
  };
}

module.exports = { createAgentManager };
