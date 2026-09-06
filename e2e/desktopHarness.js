import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

export const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

// Every desktop test owns a separate profile. A test must never auto-restore,
// forget, or dispatch into the user's real saved Citybase workspace.
export async function createDesktopHarness({ fixtureAgent = false } = {}) {
  if (!existsSync(path.join(repoRoot, 'dist', 'index.html'))) {
    throw new Error('Run npm run build before the desktop tests');
  }
  const temporaryRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'citybase-desktop-e2e-')));
  const userData = path.join(temporaryRoot, 'profile');
  const captureFile = path.join(temporaryRoot, 'agent-invocations.jsonl');
  mkdirSync(userData);
  const launcher = path.join(temporaryRoot, 'launch.cjs');
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeFileSync(path.join(temporaryRoot, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, main: 'launch.cjs' }));
  const binary = path.join(temporaryRoot, 'fixture-codex');
  if (fixtureAgent) {
    // Explicit test-only CLI fixture. It exercises the real approval manager,
    // Codex adapter, child process, JSONL event stream, cancellation and store;
    // it never invokes a paid provider or edits the repository.
    writeFileSync(binary, `#!${process.execPath}
const fs = require('node:fs');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(captureFile)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), prompt, pid: process.pid }) + '\\n');
  const emit = event => process.stdout.write(JSON.stringify(event) + '\\n');
  emit({ type: 'thread.started', thread_id: 'explicit-e2e-fixture' });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'E2E fixture scout: I inspected the little city.' } });
  if (prompt.includes('WAIT_FOR_RECALL')) setInterval(() => {}, 1000);
  else setTimeout(() => emit({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }), 250);
});
`, { mode: 0o755 });
  }
  writeFileSync(launcher, `
const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(userData)});
${fixtureAgent ? `require(${JSON.stringify(path.join(repoRoot, 'electron/main/agents/detect.cjs'))}).detectAgentBinaries = () => ({ codex: { found: true, path: ${JSON.stringify(binary)} }, claude: { found: false } });` : ''}
require(${JSON.stringify(path.join(repoRoot, 'electron/main/main.cjs'))});
`);
  let app;
  let window;
  const errors = [];
  async function launch() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: require('electron'),
      args: [temporaryRoot, ...(process.env.CI ? ['--no-sandbox'] : [])],
      cwd: repoRoot,
      env,
      timeout: 20_000,
    });
    window = await app.firstWindow();
    window.setDefaultTimeout(30_000);
    window.on('pageerror', error => errors.push(error.message));
    window.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await window.waitForLoadState('domcontentloaded');
    return window;
  }
  try { await launch(); }
  catch (error) { if (app) await app.close(); rmSync(temporaryRoot, { recursive: true, force: true }); throw error; }
  return {
    get app() { return app; },
    get window() { return window; },
    temporaryRoot, userData, captureFile, errors,
    async chooseFolder(folder) {
      await app.evaluate(({ dialog }, selected) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
      }, folder);
    },
    async restart() { await app.close(); return launch(); },
    async close() {
      // Failed assertions must not leave the deliberately long-lived fixture
      // child behind. These runs belong exclusively to this isolated app.
      if (fixtureAgent && !window.isClosed()) {
        await window.evaluate(async () => {
          const runs = await window.citybase.agents.listRuns();
          await Promise.allSettled(runs.filter(run => ['running', 'awaiting-approval'].includes(run.status))
            .map(run => window.citybase.agents.cancel(run.runId)));
        }).catch(() => {});
      }
      try { await app.close(); }
      finally { rmSync(temporaryRoot, { recursive: true, force: true }); }
    },
  };
}
