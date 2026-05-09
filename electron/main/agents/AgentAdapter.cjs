// AgentAdapter — base class implementing the AgentProvider contract from
// docs/agent-runtime.md. Concrete adapters (CodexAdapter, ClaudeAdapter,
// AiderAdapter, OllamaAdapter) extend this and override the 7 methods.
//
// JSDoc shapes mirror the pseudocode in docs/agent-runtime.md exactly.
// If the doc shape changes, this file changes with it — they are one
// contract.

/**
 * @typedef {object} AgentRun
 * @property {string} runId
 * @property {string} questId
 * @property {string} adventurerId
 * @property {'running'|'done'|'failed'|'cancelled'} status
 * @property {number} contextUsed   tokens consumed so far
 * @property {number} maxContext
 * @property {string=} branch       feature branch the run is committing to
 */

/**
 * @typedef {object} AgentEvent
 * @property {string} runId
 * @property {string} t            HH:MM timestamp
 * @property {'plan'|'edit'|'test'|'lint'|'pr'|'error'} kind
 * @property {string} text
 * @property {*=} payload          diff hunks, check results, structured detail
 */

/**
 * @typedef {object} DiffHunk
 * @property {number} line
 * @property {'add'|'del'|'ctx'} type
 * @property {string} code
 */

/**
 * @typedef {object} DiffFile
 * @property {string} file
 * @property {'add'|'modify'|'delete'} kind
 * @property {number} additions
 * @property {number} deletions
 * @property {DiffHunk[]} hunks
 */

/**
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {'pass'|'fail'|'warn'} state
 * @property {string} meta
 */

/**
 * @typedef {object} PullRequest
 * @property {number} prNumber
 * @property {string} url
 */

/**
 * @typedef {object} StartTaskParams
 * @property {string} questId
 * @property {string} adventurerId
 * @property {'bugfix'|'refactor'|'tests'|'review'|'lint'|'docs'} skill
 * @property {string} repoUrl
 * @property {string} branch          base branch to fork from
 * @property {string} promptContext   quest description + errand list, pre-built
 * @property {string=} model          optional override (e.g. 'claude-opus-4-7')
 */

/**
 * @typedef {object} OpenPRParams
 * @property {string} title
 * @property {string} body
 * @property {string} sourceBranch
 * @property {string} targetBranch
 */

const SKILLS = Object.freeze(['bugfix', 'refactor', 'tests', 'review', 'lint', 'docs']);

function notImplemented(method) {
  return new Error(`AgentAdapter.${method} must be implemented by subclasses`);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validate a StartTaskParams payload at the contract boundary so adapters
 * can rely on field presence. Throws TypeError with a specific reason.
 * @param {StartTaskParams} params
 */
function validateStartTaskParams(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('startTask: params is required');
  }
  for (const field of ['questId', 'adventurerId', 'repoUrl', 'branch', 'promptContext']) {
    if (!isNonEmptyString(params[field])) {
      throw new TypeError(`startTask: ${field} must be a non-empty string`);
    }
  }
  if (!SKILLS.includes(params.skill)) {
    throw new TypeError(`startTask: skill must be one of ${SKILLS.join(', ')}`);
  }
  if (params.model !== undefined && !isNonEmptyString(params.model)) {
    throw new TypeError('startTask: model must be a non-empty string when provided');
  }
}

/**
 * Base class for AgentProvider implementations. Subclasses MUST override
 * every method below — the base throws so a half-implemented adapter
 * fails loud, not silently.
 */
class AgentAdapter {
  /** @returns {string} Stable provider name, e.g. 'codex', 'claude'. */
  get name() {
    throw notImplemented('name');
  }

  /**
   * Start a new agent run for a quest.
   * @param {StartTaskParams} params
   * @returns {Promise<AgentRun>}
   */
  async startTask(params) {
    throw notImplemented('startTask');
  }

  /**
   * Stream reasoning events for a run.
   * @param {string} runId
   * @returns {AsyncIterable<AgentEvent>}
   */
  streamEvents(runId) {
    throw notImplemented('streamEvents');
  }

  /**
   * Report current context usage for the HP bar. Polled, e.g. every 2s.
   * @param {string} runId
   * @returns {Promise<{ contextUsed: number, maxContext: number }>}
   */
  async reportUsage(runId) {
    throw notImplemented('reportUsage');
  }

  /**
   * Produce a structured diff for the Analysis view once the run completes.
   * @param {string} runId
   * @returns {Promise<{ files: DiffFile[] }>}
   */
  async produceDiff(runId) {
    throw notImplemented('produceDiff');
  }

  /**
   * Run checks (lint, tests, typecheck) inside the sandbox.
   * @param {string} runId
   * @returns {Promise<CheckResult[]>}
   */
  async runChecks(runId) {
    throw notImplemented('runChecks');
  }

  /**
   * Open a pull request on the remote.
   * @param {string} runId
   * @param {OpenPRParams} params
   * @returns {Promise<PullRequest>}
   */
  async openPR(runId, params) {
    throw notImplemented('openPR');
  }

  /**
   * Cancel a running task. Must terminate any underlying model call and
   * sandbox process within a few seconds (per docs/agent-runtime.md).
   * @param {string} runId
   * @returns {Promise<void>}
   */
  async cancel(runId) {
    throw notImplemented('cancel');
  }
}

const AGENT_EVENT_KINDS = Object.freeze(['plan', 'edit', 'test', 'lint', 'pr', 'error']);

/**
 * Validate that a value matches the AgentEvent shape. Used by adapters
 * (and tests) to reject malformed events at the contract boundary so the
 * renderer can rely on every event having the right keys.
 * @param {*} value
 * @returns {AgentEvent}
 */
function assertAgentEvent(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('AgentEvent: value must be an object');
  }
  if (!isNonEmptyString(value.runId)) throw new TypeError('AgentEvent: runId required');
  if (!isNonEmptyString(value.t)) throw new TypeError('AgentEvent: t (HH:MM) required');
  if (!AGENT_EVENT_KINDS.includes(value.kind)) {
    throw new TypeError(`AgentEvent: kind must be one of ${AGENT_EVENT_KINDS.join(', ')}`);
  }
  if (!isNonEmptyString(value.text)) throw new TypeError('AgentEvent: text required');
  return value;
}

module.exports = {
  AgentAdapter,
  validateStartTaskParams,
  assertAgentEvent,
  SKILLS,
  AGENT_EVENT_KINDS,
};
