// claude-e2e.mjs — MANUAL integration test of the real Claude path.
// Exercises the exact production modules the Electron main process uses
// (processService → ClaudeAdapter → agentManager) against the real `claude`
// CLI, in a throwaway git repo. NOT part of CI: it needs an authenticated
// claude on PATH and spends a few cents of tokens.
//
// Usage: node scripts/claude-e2e.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const processService = require(path.join(root, 'electron/main/services/processService.cjs'));
const { ClaudeAdapter } = require(path.join(root, 'electron/main/agents/ClaudeAdapter.cjs'));
const { createAgentManager } = require(path.join(root, 'electron/main/agents/agentManager.cjs'));
const { detectAgentBinaries } = require(path.join(root, 'electron/main/agents/detect.cjs'));

const log = (...a) => console.log(...a);
let pass = 0; let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; log(`  PASS  ${name}`); }
  else { fail += 1; log(`  FAIL  ${name} ${detail}`); }
};

const repo = mkdtempSync(path.join(tmpdir(), 'citybase-e2e-'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

try {
  // 1. Scratch git repo so the agent never touches a real project.
  git('init', '-q');
  git('config', 'user.email', 'e2e@example.com');
  git('config', 'user.name', 'e2e');
  writeFileSync(path.join(repo, 'README.md'), '# scratch\n');
  git('add', '-A'); git('commit', '-q', '-m', 'init');
  log(`\nScratch repo: ${repo}\n`);

  // 2. Detect — production zero-arg call shape.
  const detected = detectAgentBinaries();
  check('detect finds claude on PATH', !!detected.claude?.found, JSON.stringify(detected.claude));
  if (!detected.claude?.found) throw new Error('claude not detected — aborting');

  // 3. Build the real adapter + manager exactly like ipc.cjs does.
  const claude = new ClaudeAdapter({ processService });
  const manager = createAgentManager({ adapters: { claude }, detect: () => detectAgentBinaries() });

  // 4. Dispatch a real run that creates one file (verifies write + diff path).
  log('Dispatching real claude run (auto provider) — this calls the live API…');
  const run = await manager.startRun({
    provider: 'auto',
    questId: 'e2e-1',
    adventurerId: 'local',
    skill: 'docs',
    repoUrl: repo,
    branch: 'main',
    promptContext: 'Create a new file named CITYBASE_HELLO.txt whose only contents are the line: hello from citybase. Do not change any other files.',
  });
  check('startRun resolved with a runId', !!run?.runId, JSON.stringify(run));
  check('run status is terminal done', run?.status === 'done', `status=${run?.status}`);

  // 5. streamEvents → a real edit event (not an error), carrying claude text.
  const events = [];
  for await (const e of manager.streamEvents(run.runId)) events.push(e);
  check('streamEvents yielded ≥1 event', events.length >= 1, `n=${events.length}`);
  const hasError = events.some((e) => e.kind === 'error');
  check('no error event in the stream', !hasError, JSON.stringify(events));
  check('an edit event carries claude output', events.some((e) => e.kind === 'edit' && /claude:/.test(e.text)), JSON.stringify(events.map((e) => e.kind)));

  // 6. The file actually got created on disk.
  const created = path.join(repo, 'CITYBASE_HELLO.txt');
  check('agent created CITYBASE_HELLO.txt on disk', existsSync(created),
    existsSync(created) ? readFileSync(created, 'utf8').trim() : '(missing)');

  // 7. produceDiff surfaces the change (drives the RunDetail diff panel).
  const diff = await manager.produceDiff(run.runId);
  check('produceDiff returns the changed file', Array.isArray(diff?.files) && diff.files.some((f) => /CITYBASE_HELLO/.test(f.file)),
    JSON.stringify(diff?.files?.map((f) => f.file)));

  // 8. git status reflects dirty (drives the city's dirty-building glow).
  const status = git('status', '--porcelain');
  check('git status shows the new file (city would glow it)', /CITYBASE_HELLO/.test(status), JSON.stringify(status.trim()));

  // 9. runChecks tolerates a repo with no scripts (no throw).
  const checks = await manager.runChecks(run.runId);
  check('runChecks returns an array', Array.isArray(checks), JSON.stringify(checks));

  log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exitCode = fail === 0 ? 0 : 1;
} finally {
  try { rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
}
