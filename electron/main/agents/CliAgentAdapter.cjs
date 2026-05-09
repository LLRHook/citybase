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
//     that surfaces stdout chunks.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { AgentAdapter, validateStartTaskParams } = require('./AgentAdapter.cjs');
const { detectAgentBinaries } = require('./detect.cjs');
const { parseUnifiedDiff } = require('./parseUnifiedDiff.cjs');
const { runWorkspaceChecks } = require('../services/workspaceChecks.cjs');

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
    const args = this._buildArgv({ params, skill });
    if (!Array.isArray(args)) {
      throw new TypeError(`${this._binaryName}Adapter: buildArgv must return a string array`);
    }

    const runId = crypto.randomUUID();
    const cwd = params.repoUrl;
    const result = await this._processService.run(binary, args, { cwd });
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
    const result = await this._processService.run('git', ['diff', '--unified=3', '--no-color'], { cwd: entry.cwd });
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

  async openPR(runId, _params) {
    this._requireRun(runId);
    throw new Error(`openPR not yet supported by ${this._binaryName}Adapter; pending Phase 5 PR-creation surface`);
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

module.exports = { CliAgentAdapter, defaultBuildArgv };
