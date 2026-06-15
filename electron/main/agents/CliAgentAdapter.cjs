// CliAgentAdapter — shared implementation of the AgentProvider contract
// for adapters that wrap a local CLI (codex, claude, aider, etc).
//
// Subclasses pass binaryName, detectKey, an argv builder, and an optional
// default model. Everything else — the in-flight registry, produceDiff
// via git diff, runChecks via npm, the canned reasoning trail, cancel
// semantics — is shared.
//
// Documented gaps (every CLI adapter inherits these until later slices):
//   - reportUsage returns a placeholder envelope; CLIs don't expose
//     real telemetry on stdout yet.
//   - cancel marks the run cancelled in-memory. processService doesn't
//     expose a child handle today, so the underlying child runs to
//     completion or timeout.
//   - streamEvents synthesizes a trail from the buffered exit state.
//     Real token-by-token streaming waits on a processService change
//     that surfaces stdout chunks. (ClaudeAdapter overrides this with
//     real-output parsing — synthesizeTrail is only the fallback now.)
//   - openPR shells out to `gh pr create` and assumes the head branch
//     has been pushed already. Auto-push is deferred to v1.1 per the
//     ROADMAP "Out of v1 scope" list — a push side-effect inside
//     openPR would surprise the user.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { AgentAdapter, validateStartTaskParams } = require('./AgentAdapter.cjs');
const { detectAgentBinaries } = require('./detect.cjs');
const { parseUnifiedDiff } = require('./parseUnifiedDiff.cjs');
const { runWorkspaceChecks } = require('../services/workspaceChecks.cjs');

// `gh pr create` prints a few lines of progress and ends with the new
// PR URL on its own line, e.g.
//   Creating pull request for feature/x into main in owner/repo
//   https://github.com/owner/repo/pull/123
// The URL line is what the caller actually wants. We accept any line
// that looks like a GitHub PR URL — defensive against future format
// drift like the "Visit ..." prefix some `gh` versions add.
function parseGhPrCreateUrl(stdout) {
  if (typeof stdout !== 'string') return null;
  // Walk whitespace-separated tokens and return the first one that
  // contains `/pull/<digits>`. Grabbing the whole token preserves any
  // query string or fragment, which a stricter regex would chop off.
  for (const token of stdout.split(/\s+/)) {
    if (/^https?:\/\/\S*\/pull\/\d+/.test(token)) return token;
  }
  return null;
}

function parsePrNumberFromUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/\/pull\/(\d+)(?:[/?#]|$)/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

const DEFAULT_TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_TASK_MAX_BUFFER = 16 * 1024 * 1024; // 16 MB

function defaultBuildArgv({ params }) {
  return [
    '--quiet',
    '--prompt', params.promptContext,
    ...(params.model ? ['--model', params.model] : []),
  ];
}

function synthesizeTrail({ binaryName, runId, now, skill, exitState }) {
  const t = (offsetMs) => {
    const d = new Date((now || Date.now()) + offsetMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const trail = [
    { runId, t: t(0),       kind: 'plan', text: `${binaryName}: planning a ${skill} run` },
    { runId, t: t(60_000),  kind: 'edit', text: `${binaryName}: edits applied (buffered output, see analysis)` },
  ];
  if (exitState === 'pass') {
    trail.push({ runId, t: t(120_000), kind: 'test', text: `${binaryName}: completed without raising errors` });
    trail.push({ runId, t: t(180_000), kind: 'pr',   text: `${binaryName}: ready for review` });
  } else if (exitState === 'timeout') {
    trail.push({ runId, t: t(120_000), kind: 'error', text: `${binaryName}: timed out before completing` });
  } else {
    trail.push({ runId, t: t(120_000), kind: 'error', text: `${binaryName}: exited with non-zero status` });
  }
  return trail;
}

class CliAgentAdapter extends AgentAdapter {
  constructor({
    binaryName,
    detectKey,
    buildArgv,
    processService,
    fsExists,
    readFileSync,
    binaryPath,
    taskTimeoutMs,
    taskMaxBuffer,
    now,
  } = {}) {
    super();
    if (!binaryName) throw new TypeError('CliAgentAdapter: binaryName is required');
    if (!detectKey) throw new TypeError('CliAgentAdapter: detectKey is required');
    if (!processService || typeof processService.run !== 'function') {
      throw new TypeError(`${binaryName}Adapter: processService.run is required`);
    }
    this._binaryName = binaryName;
    this._detectKey = detectKey;
    this._buildArgv = typeof buildArgv === 'function' ? buildArgv : defaultBuildArgv;
    this._processService = processService;
    this._fsExists = fsExists || ((p) => { try { return fs.existsSync(p); } catch { return false; } });
    this._readFileSync = readFileSync || ((p, enc) => fs.readFileSync(p, enc));
    this._binaryPathOverride = typeof binaryPath === 'string' && binaryPath.length > 0 ? binaryPath : null;
    // Real agent runs take minutes, not the 15s processService default.
    // Bump task timeout / output buffer so a long Claude / Codex run
    // doesn't get killed mid-flight or truncated by the 4MB default.
    this._taskTimeoutMs = Number.isFinite(taskTimeoutMs) ? taskTimeoutMs : DEFAULT_TASK_TIMEOUT_MS;
    this._taskMaxBuffer = Number.isFinite(taskMaxBuffer) ? taskMaxBuffer : DEFAULT_TASK_MAX_BUFFER;
    this._now = typeof now === 'function' ? now : () => Date.now();
    // runId -> { run, cwd, skill, stdout, stderr, exitState, cancelled }
    this._runs = new Map();
  }

  get name() { return this._binaryName; }

  _resolveBinary() {
    if (this._binaryPathOverride) return this._binaryPathOverride;
    const detected = detectAgentBinaries({ fsExists: this._fsExists });
    const entry = detected[this._detectKey];
    if (!entry || !entry.found) {
      throw new Error(`${this._binaryName} CLI not found on PATH`);
    }
    return entry.path;
  }

  async startTask(params) {
    validateStartTaskParams(params);
    const binary = this._resolveBinary();
    const skill = params.skill;
    // buildArgv may return either a flat argv array (the simple case)
    // or `{ args, stdin }` for adapters that pipe the prompt over
    // stdin instead of a flag (e.g. CodexAdapter uses `codex exec ... -`).
    const invocation = this._buildArgv({ params, skill });
    const args = Array.isArray(invocation) ? invocation : invocation?.args;
    const stdin = Array.isArray(invocation) ? undefined : invocation?.stdin;
    if (!Array.isArray(args)) {
      throw new TypeError(`${this._binaryName}Adapter: buildArgv must return a string array or { args, stdin }`);
    }

    // Honor a manager-assigned runId (the approval flow pre-allocates one so
    // the approve/stream/cancel channels key to the same id); otherwise mint one.
    const runId = (typeof params.runId === 'string' && params.runId.length > 0)
      ? params.runId
      : crypto.randomUUID();
    const cwd = params.repoUrl;

    // Non-blocking dispatch (v3): return a 'running' run immediately and let
    // the CLI run in the background via spawnStream. The renderer sees the run
    // as live, the UI stays responsive, the city animates while files change,
    // and cancel() can actually terminate the child. The run object is mutated
    // in place on completion so the manager's history reflects status live.
    const run = {
      runId,
      questId: params.questId,
      adventurerId: params.adventurerId,
      status: 'running',
      contextUsed: 0,
      maxContext: 200_000,
      branch: params.branch,
    };
    const entry = {
      run, cwd, skill, stdout: '', stderr: '', exitState: null, cancelled: false,
      handle: null, donePromise: null,
      // Live event queue: subclasses push parsed events as output streams in;
      // streamEvents drains it live. The base leaves it empty and synthesizes a
      // trail on completion instead (see streamEvents).
      events: [], eventWaiters: [], eventsEnded: false, lineBuf: '',
    };
    this._runs.set(runId, entry);

    const handle = this._processService.spawnStream(binary, args, {
      cwd,
      timeoutMs: this._taskTimeoutMs,
      maxBuffer: this._taskMaxBuffer,
      stdin,
      onStdout: (chunk) => { try { this._onStdout(entry, chunk); } catch { /* ignore */ } },
    });
    entry.handle = handle;
    entry.donePromise = Promise.resolve(handle.done).then(
      (result) => {
        entry.stdout = result.stdout || '';
        entry.stderr = result.stderr || '';
        // entry.cancelled means the *user* cancelled; a timeout also kills the
        // child (result.killed) but is a failure, not a user cancel — so check
        // cancelled first, then timeout, before the exit code.
        const exitState = entry.cancelled ? 'cancelled'
          : result.timedOut ? 'timeout'
          : result.ok ? 'pass' : 'fail';
        entry.exitState = exitState;
        entry.run.status = exitState === 'pass' ? 'done' : exitState === 'cancelled' ? 'cancelled' : 'failed';
        try { this._finalize(entry); } catch { /* ignore */ }
        this._endEvents(entry);
      },
      () => {
        entry.exitState = entry.cancelled ? 'cancelled' : 'fail';
        entry.run.status = entry.cancelled ? 'cancelled' : 'failed';
        try { this._finalize(entry); } catch { /* ignore */ }
        this._endEvents(entry);
      },
    );
    return run;
  }

  // Hook for subclasses that parse streamed chunks into live events
  // (ClaudeAdapter overrides this for stream-json). The base no-ops.
  _onStdout() {}

  // Hook called once the process settles, before the event queue is closed —
  // subclasses flush buffered lines / push a final event. The base no-ops.
  _finalize() {}

  // Live event-queue plumbing. _pushEvent appends and wakes any drain waiting
  // for more; _endEvents marks the stream complete and wakes all waiters.
  _pushEvent(entry, event) {
    entry.events.push(event);
    const waiters = entry.eventWaiters;
    entry.eventWaiters = [];
    for (const resolve of waiters) resolve();
  }

  _endEvents(entry) {
    entry.eventsEnded = true;
    const waiters = entry.eventWaiters;
    entry.eventWaiters = [];
    for (const resolve of waiters) resolve();
  }

  // Drain a run's live event queue, yielding events as they are pushed until
  // the stream ends. Subclasses that stream real output (ClaudeAdapter) use
  // this; the base streamEvents synthesizes a trail instead.
  async *_drainEvents(runId) {
    const entry = this._requireRun(runId);
    let i = 0;
    for (;;) {
      while (i < entry.events.length) { yield entry.events[i]; i += 1; }
      if (entry.eventsEnded) return;
      await new Promise((resolve) => { entry.eventWaiters.push(resolve); });
    }
  }

  // Resolve once the run's process has settled, so events / diff / checks
  // operate on the finished state. Used by everything that needs the result.
  async _settled(runId) {
    const entry = this._requireRun(runId);
    if (entry.donePromise) { try { await entry.donePromise; } catch { /* ignore */ } }
    return entry;
  }

  async *streamEvents(runId) {
    const entry = await this._settled(runId);
    const trail = synthesizeTrail({
      binaryName: this._binaryName,
      runId,
      now: this._now(),
      skill: entry.skill,
      exitState: entry.cancelled ? 'cancelled' : entry.exitState,
    });
    for (const event of trail) yield event;
  }

  async reportUsage(runId) {
    const entry = this._requireRun(runId);
    return { contextUsed: entry.run.contextUsed, maxContext: entry.run.maxContext };
  }

  async produceDiff(runId) {
    const entry = await this._settled(runId);
    const cwd = entry.cwd;
    // Newly created files are untracked, and plain `git diff` ignores them —
    // yet creating files is the most common agent output. Mark untracked
    // files intent-to-add so the diff includes them as new-file additions,
    // capture the diff, then undo the intent-to-add to leave the index
    // exactly as we found it (produceDiff must not mutate working state).
    const others = await this._processService.run(
      'git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd },
    );
    const newFiles = (others.ok ? (others.stdout || '') : '').split('\0').filter(Boolean);
    if (newFiles.length > 0) {
      await this._processService.run('git', ['add', '--intent-to-add', '--', ...newFiles], { cwd });
    }
    const result = await this._processService.run('git', ['diff', '--unified=3', '--no-color'], { cwd });
    if (newFiles.length > 0) {
      await this._processService.run('git', ['reset', '--quiet', '--', ...newFiles], { cwd });
    }
    if (!result.ok && !result.stdout) {
      return { files: [] };
    }
    return parseUnifiedDiff(result.stdout || '');
  }

  async runChecks(runId) {
    const entry = await this._settled(runId);
    return runWorkspaceChecks({
      workspace: { rootPath: entry.cwd },
      processService: this._processService,
      readFileSync: this._readFileSync,
    });
  }

  async openPR(runId, params) {
    const entry = this._requireRun(runId);
    if (!params || typeof params !== 'object') {
      throw new TypeError('openPR: params is required');
    }
    const { title, body = '', sourceBranch, targetBranch } = params;
    if (typeof title !== 'string' || title.length === 0) {
      throw new TypeError('openPR: title must be a non-empty string');
    }
    if (typeof sourceBranch !== 'string' || sourceBranch.length === 0) {
      throw new TypeError('openPR: sourceBranch must be a non-empty string');
    }
    if (typeof targetBranch !== 'string' || targetBranch.length === 0) {
      throw new TypeError('openPR: targetBranch must be a non-empty string');
    }

    // The branch MUST be pushed before this call; gh pr create will
    // refuse if the head branch has no upstream. We don't auto-push
    // here — push is deferred to v1.1 per ROADMAP, and a side-effect
    // mid-openPR would surprise the user.
    const result = await this._processService.run(
      'gh',
      ['pr', 'create',
        '--title', title,
        '--body', body,
        '--base', targetBranch,
        '--head', sourceBranch],
      { cwd: entry.cwd },
    );
    if (!result.ok) {
      const stderr = (result.stderr || '').trim();
      const message = stderr || `gh pr create exited with code ${result.code}`;
      const err = new Error(`gh pr create failed: ${message}`);
      err.code = result.code;
      err.stderr = stderr;
      throw err;
    }
    const url = parseGhPrCreateUrl(result.stdout || '');
    if (!url) {
      throw new Error(`gh pr create succeeded but emitted no PR URL: ${(result.stdout || '').trim()}`);
    }
    const prNumber = parsePrNumberFromUrl(url);
    if (prNumber == null) {
      throw new Error(`gh pr create returned an unparseable URL: ${url}`);
    }
    return { prNumber, url };
  }

  async cancel(runId) {
    const entry = this._requireRun(runId);
    entry.cancelled = true;
    // Really terminate the child (spawnStream handle); the done handler will
    // also see `killed` and settle the run as cancelled. Mutate (don't
    // reassign) run.status so the manager's shared reference reflects it.
    if (entry.handle && typeof entry.handle.kill === 'function') {
      try { entry.handle.kill(); } catch { /* ignore */ }
    }
    entry.run.status = 'cancelled';
    return undefined;
  }

  _requireRun(runId) {
    const entry = this._runs.get(runId);
    if (!entry) throw new Error(`unknown runId: ${runId}`);
    return entry;
  }
}

module.exports = {
  CliAgentAdapter,
  defaultBuildArgv,
  parseGhPrCreateUrl,
  parsePrNumberFromUrl,
};
