// workspaceChecks — runs the workspace's npm scripts that map to checks
// (lint / test / typecheck) and returns the CheckResult[] shape from
// docs/agent-runtime.md. Shared between:
//   - the standalone 'RUN CHECKS' action wired in slice 3 of Phase 5
//   - the AgentProvider.runChecks adapter method (CliAgentAdapter)
//
// Pure-ish: every system boundary (processService, fs.readFileSync, the
// path module) is injected so unit tests can stub. The fs default uses
// the real Node fs at runtime.
const path = require('node:path');
const fs = require('node:fs');

const WANTED_SCRIPTS = ['lint', 'test', 'typecheck'];

function defaultReadFileSync(p, enc) {
  return fs.readFileSync(p, enc);
}

/**
 * Build the argv for `npm run <script>`. The '--silent' flag keeps npm
 * itself quiet, and we forward '--' '--run' for the test script so a
 * Vitest project doesn't enter watch mode (the same fix that landed in
 * Phase 3 slice 2 for CodexAdapter).
 */
function buildNpmArgv(script) {
  const argv = ['run', script, '--silent'];
  if (script === 'test') argv.push('--', '--run');
  return argv;
}

function metaFor(result) {
  if (result.timedOut) return `timed out after ${result.durationMs}ms`;
  if (result.ok) return `clean in ${result.durationMs}ms`;
  return `exited ${result.code}`;
}

function stateFor(result) {
  if (result.timedOut) return 'fail';
  if (result.ok) return 'pass';
  return 'fail';
}

/**
 * @param {{ workspace: { rootPath: string }, processService: { run: Function }, readFileSync?: Function }} args
 * @returns {Promise<Array<{ name: string, state: 'pass'|'fail'|'warn', meta: string }>>}
 */
async function runWorkspaceChecks({
  workspace,
  processService,
  readFileSync = defaultReadFileSync,
} = {}) {
  if (!workspace || typeof workspace.rootPath !== 'string') return [];
  if (!processService || typeof processService.run !== 'function') {
    throw new TypeError('runWorkspaceChecks: processService.run is required');
  }
  const pkgPath = path.join(workspace.rootPath, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return [];
  }
  const scripts = (pkg && pkg.scripts) || {};
  const results = [];
  for (const script of WANTED_SCRIPTS) {
    if (typeof scripts[script] !== 'string') continue;
    const result = await processService.run('npm', buildNpmArgv(script), { cwd: workspace.rootPath });
    results.push({
      name: `${script} · npm run ${script}`,
      state: stateFor(result),
      meta: metaFor(result),
    });
  }
  return results;
}

module.exports = { runWorkspaceChecks, buildNpmArgv, WANTED_SCRIPTS };
