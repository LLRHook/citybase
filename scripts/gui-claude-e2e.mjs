// gui-claude-e2e.mjs — MANUAL full-stack GUI test with the real Claude CLI.
// Drives the actual Electron app via Playwright through a real dispatch:
//   real preload bridge → real IPC → agentManager → ClaudeAdapter → claude CLI,
// then renders RunDetail and the city. Proves the whole chain in one session.
// NOT in CI (needs an authenticated claude + spends tokens). Modifies only a
// throwaway git repo. Usage: node scripts/gui-claude-e2e.mjs
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, existsSync, copyFileSync, writeFileSync, realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repoRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const outDir = path.join(repoRoot, '.dev-screens');
mkdirSync(outDir, { recursive: true });

// Throwaway workspace the agent will edit (never a real project).
const ws = realpathSync(mkdtempSync(path.join(tmpdir(), 'citybase-gui-')));
const git = (...a) => execFileSync('git', a, { cwd: ws, encoding: 'utf8' });
git('init', '-q'); git('config', 'user.email', 'e2e@x.com'); git('config', 'user.name', 'e2e');
mkdirSync(path.join(ws, 'src'), { recursive: true });
writeFileSync(path.join(ws, 'README.md'), '# scratch\n');
writeFileSync(path.join(ws, 'package.json'), '{"name":"scratch","private":true}\n');
writeFileSync(path.join(ws, 'src', 'a.js'), 'export const a = 1;\n');
writeFileSync(path.join(ws, 'src', 'b.js'), 'export const b = 2;\n');
git('add', '-A'); git('commit', '-q', '-m', 'init');

const userData = path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Citybase');
const stateFile = path.join(userData, 'workspaces.json');
const backup = stateFile + '.guie2e.bak';
let hadState = false;
if (existsSync(stateFile)) { copyFileSync(stateFile, backup); hadState = true; }
mkdirSync(userData, { recursive: true });
const wsId = createHash('sha1').update(ws).digest('hex').slice(0, 16);
writeFileSync(stateFile, JSON.stringify({
  currentId: wsId,
  workspaces: [{ id: wsId, name: path.basename(ws), rootPath: ws, openedAt: new Date(0).toISOString(), lastOpenedAt: new Date(0).toISOString() }],
}, null, 2));

let pass = 0; let fail = 0;
const check = (n, c, d = '') => { if (c) { pass += 1; console.log(`  PASS  ${n}`); } else { fail += 1; console.log(`  FAIL  ${n} ${d}`); } };

const app = await electron.launch({ args: ['.'], cwd: repoRoot });
const logs = [];
try {
  const win = await app.firstWindow();
  win.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  win.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);

  // Boot detection should show claude installed (real PATH).
  const detect = await win.evaluate(() => window.citybase.agents.detect());
  check('claude detected over real IPC', detect?.claude?.found === true, JSON.stringify(detect?.claude));

  // Go to Work and dispatch a real Claude run that edits a tracked file.
  await win.getByRole('button', { name: /WORK/ }).first().click();
  await win.getByLabel('Provider').selectOption('claude').catch(() => {});
  await win.getByLabel('Prompt').fill('Append a single line `// gui ok` to the end of src/a.js. Modify only that one file; do not create or touch any other file.');
  console.log('Dispatching real claude run through the GUI…');
  await win.getByRole('button', { name: /Run/ }).first().click();

  // Approval boundary (BUG-004): the run must wait for explicit approval
  // before the CLI spawns. Confirm the modal appears, then approve.
  const approveBtn = win.getByRole('button', { name: /Approve/i }).first();
  let sawApproval = true;
  try {
    await approveBtn.waitFor({ timeout: 15_000 });
    await win.screenshot({ path: path.join(outDir, 'gui-00-approval.png') });
  } catch { sawApproval = false; }
  check('approval modal gates the run before it spawns', sawApproval);
  if (sawApproval) await approveBtn.click();

  // Capture the live city mid-run: the run is non-blocking, so switch to CITY
  // while the agent works and grab the live agent presence (FEAT-019).
  await win.getByRole('button', { name: /CITY/ }).first().click().catch(() => {});
  await win.waitForTimeout(2500);
  await win.screenshot({ path: path.join(outDir, 'gui-03-live.png') });
  await win.getByRole('button', { name: /WORK/ }).first().click().catch(() => {});

  // RunDetail renders the parsed claude output as an "edit" event.
  let sawClaude = true;
  try {
    await win.getByText(/claude:/i).first().waitFor({ timeout: 150_000 });
  } catch {
    sawClaude = false;
    await win.screenshot({ path: path.join(outDir, 'gui-timeout.png') });
    const bodyText = await win.evaluate(() => document.body.innerText).catch(() => '(none)');
    const runs = await win.evaluate(() => window.citybase.agents.list?.().catch?.(() => null)).catch(() => null);
    console.log('--- TIMEOUT diagnostics ---');
    console.log('visible text:\n', (bodyText || '').slice(0, 800));
    console.log('providers:', JSON.stringify(runs));
    console.log('console logs:\n', logs.slice(-25).join('\n'));
  }
  check('RunDetail shows real claude output', sawClaude);
  await win.screenshot({ path: path.join(outDir, 'gui-01-rundetail.png') });

  // The diff panel should list the edited file (BUG-021 path: tracked-file edit).
  const sawDiffFile = await win.getByText('src/a.js').count().then((c) => c > 0).catch(() => false);
  check('diff/event references src/a.js', sawDiffFile);

  // The city should now show src/a.js dirty (amber glow) after the final refresh.
  await win.getByRole('button', { name: /CITY/ }).first().click();
  await win.waitForTimeout(1500);
  await win.screenshot({ path: path.join(outDir, 'gui-02-city.png') });

  const dirty = git('status', '--porcelain');
  check('agent modified src/a.js in the workspace', /src\/a\.js/.test(dirty), JSON.stringify(dirty.trim()));

  console.log(`\n==== GUI ${pass} passed, ${fail} failed ====`);
  console.log('screens: .dev-screens/gui-01-rundetail.png, .dev-screens/gui-02-city.png');
  process.exitCode = fail === 0 ? 0 : 1;
} finally {
  await app.close();
  if (hadState && existsSync(backup)) copyFileSync(backup, stateFile);
  try { rmSync(ws, { recursive: true, force: true }); } catch { /* ignore */ }
}
