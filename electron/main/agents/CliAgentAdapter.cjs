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
    const result = await this._processService.run(binary, args, {
      cwd,
      timeoutMs: this._taskTimeoutMs,
      maxBuffer: this._taskMaxBuffer,
      stdin,
    });
    let exitState = 'pass';
    if (result.timedOut) exitState = 'timeout';
    else if (!result.ok) exitState = 'fail';

    const status = exitState === 'pass' ? 'done' : 'failed';

    const run = {
      runId,
      questId: params.questId,
      adventurerId: params.adventurerId,
      status,
      contextUsed: 0,
      maxContext: 200_000,
      branch: params.branch,
    };
    this._runs.set(runId, {
      run,
      cwd,
      skill,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitState,
      cancelled: false,
    });
    return run;
  }

  async *streamEvents(runId) {
    const entry = this._requireRun(runId);
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
    const entry = this._requireRun(runId);
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
    const entry = this._requireRun(runId);
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
    entry.run = { ...entry.run, status: 'cancelled' };
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
