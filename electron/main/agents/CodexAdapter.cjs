// CodexAdapter — wraps the OpenAI Codex CLI behind the AgentProvider
// contract from docs/agent-runtime.md.
//
// Slice 2 scope (this file):
//   - startTask runs the codex CLI via processService and resolves once
//     the buffered run completes. Stdout/stderr are kept on the run for
//     streamEvents to read.
//   - streamEvents synthesizes a small canned trail (plan -> edit ->
//     test -> pr) from the run's exit code so the renderer has a
//     reasoning thread to display today. Real token-by-token streaming
//     waits on a processService change that exposes the spawned child.
//   - reportUsage returns a placeholder context envelope until the codex
//     CLI exposes a real telemetry channel.
//   - produceDiff runs `git diff --unified=3 --no-color` inside the
//     run's cwd and parses the result with parseUnifiedDiff.
//   - runChecks runs the npm scripts named lint/test/typecheck if they
//     exist in package.json at the workspace root.
//   - openPR is deferred to Phase 5; throws a clear placeholder error.
//   - cancel: processService doesn't expose handle-cancel today, so this
//     marks the in-memory run as cancelled. The underlying child will
//     still run to completion / timeout (documented gap).
//
// Constructor takes { processService, fsExists?, codexPath?, now? } so
// tests can stub every system boundary.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { AgentAdapter, validateStartTaskParams } = require('./AgentAdapter.cjs');
const { detectAgentBinaries } = require('./detect.cjs');
const { parseUnifiedDiff } = require('./parseUnifiedDiff.cjs');

const NOT_FOUND_MESSAGE = 'codex CLI not found on PATH';

const SKILL_FLAG = {
  bugfix: ['--mode', 'edit'],
  refactor: ['--mode', 'edit'],
  tests: ['--mode', 'edit'],
  review: ['--mode', 'review'],
  lint: ['--mode', 'edit'],
  docs: ['--mode', 'edit'],
};

// Translate exit information into the canned reasoning trail. A real
// streaming integration replaces this in a later slice.
function synthesizeTrail({ runId, now, skill, exitState }) {
  const t = (offsetMs) => {
    const d = new Date((now || Date.now()) + offsetMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const trail = [
    { runId, t: t(0),     kind: 'plan', text: `codex: planning a ${skill} run` },
    { runId, t: t(60_000), kind: 'edit', text: 'codex: edits applied (buffered output, see analysis)' },
  ];
  if (exitState === 'pass') {
    trail.push({ runId, t: t(120_000), kind: 'test', text: 'codex: completed without raising errors' });
    trail.push({ runId, t: t(180_000), kind: 'pr',   text: 'codex: ready for review' });
  } else if (exitState === 'timeout') {
    trail.push({ runId, t: t(120_000), kind: 'error', text: 'codex: timed out before completing' });
  } else {
    trail.push({ runId, t: t(120_000), kind: 'error', text: `codex: exited with non-zero status` });
  }
  return trail;
}

class CodexAdapter extends AgentAdapter {
  constructor({ processService, fsExists, readFileSync, codexPath, now } = {}) {
    super();
    if (!processService || typeof processService.run !== 'function') {
      throw new TypeError('CodexAdapter: processService.run is required');
    }
    this._processService = processService;
    this._fsExists = fsExists || ((p) => { try { return fs.existsSync(p); } catch { return false; } });
    this._readFileSync = readFileSync || ((p, enc) => fs.readFileSync(p, enc));
    this._codexPathOverride = typeof codexPath === 'string' && codexPath.length > 0 ? codexPath : null;
    this._now = typeof now === 'function' ? now : () => Date.now();
    // runId -> { run, cwd, skill, stdout, stderr, exitState, cancelled }
    this._runs = new Map();
  }

  get name() { return 'codex'; }

  _resolveCodex() {
    if (this._codexPathOverride) return this._codexPathOverride;
    const detected = detectAgentBinaries({ fsExists: this._fsExists });
    if (!detected.codex.found) {
      throw new Error(NOT_FOUND_MESSAGE);
    }
    return detected.codex.path;
  }

  async startTask(params) {
    validateStartTaskParams(params);
    const codex = this._resolveCodex();
    const skill = params.skill;
    const args = [
      '--quiet',
      ...(SKILL_FLAG[skill] || []),
      '--prompt', params.promptContext,
    ];
    if (params.model) args.push('--model', params.model);

    const runId = crypto.randomUUID();
    const cwd = params.repoUrl;
    const result = await this._processService.run(codex, args, { cwd });
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
      // git refused to run at all — surface as empty so the analysis view
      // doesn't crash on a missing repo.
      return { files: [] };
    }
    return parseUnifiedDiff(result.stdout || '');
  }

  async runChecks(runId) {
    const entry = this._requireRun(runId);
    const pkgPath = path.join(entry.cwd, 'package.json');
    let pkg = null;
    try {
      const raw = this._readFileSync(pkgPath, 'utf8');
      pkg = JSON.parse(raw);
    } catch {
      return [];
    }
    const scripts = (pkg && pkg.scripts) || {};
    const wanted = ['lint', 'test', 'typecheck'];
    const results = [];
    for (const script of wanted) {
      if (typeof scripts[script] !== 'string') continue;
      const r = await this._processService.run('npm', ['run', script, '--silent'], { cwd: entry.cwd });
      const state = r.timedOut ? 'fail' : (r.ok ? 'pass' : 'fail');
      const meta = r.timedOut
        ? `timed out after ${r.durationMs}ms`
        : (r.ok ? `clean in ${r.durationMs}ms` : `exited ${r.code}`);
      results.push({ name: `${script} · npm run ${script}`, state, meta });
    }
    return results;
  }

  async openPR(runId, _params) {
    this._requireRun(runId);
    throw new Error('openPR not yet supported by CodexAdapter; pending Phase 5 PR-creation surface');
  }

  async cancel(runId) {
    const entry = this._requireRun(runId);
    // processService doesn't expose handle-cancel today. Mark the run as
    // cancelled so subsequent streamEvents reflect that, and update the
    // run handle's status field. The underlying child (if any) will run
    // to completion or timeout — documented gap.
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

module.exports = { CodexAdapter, NOT_FOUND_MESSAGE };
