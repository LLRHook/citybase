// dev-capture.mjs — reusable visual-verification harness (dev-only, not shipped).
// Boots the real Electron app via Playwright against the repo's own workspace,
// walks the views, and writes PNGs to .dev-screens/. Used to eyeball visual
// changes each iteration without depending on desktop app-name resolution.
//
// Usage: node scripts/dev-capture.mjs [outDir]
// Requires a fresh `npm run build` (loads dist/index.html from disk).
import { _electron as electron } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';

const repoRoot = realpathSync(process.cwd());
const outDir = path.resolve(repoRoot, process.argv[2] || '.dev-screens');
mkdirSync(outDir, { recursive: true });

// Point the app at the repo's own workspace so the city renders from real git
// state. Non-destructive: back up the user's workspaces.json and restore it.
const userData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Citybase');
const stateFile = path.join(userData, 'workspaces.json');
const backup = stateFile + '.devcapture.bak';
const repoId = createHash('sha1').update(repoRoot).digest('hex').slice(0, 16);

let hadState = false;
if (existsSync(stateFile)) { copyFileSync(stateFile, backup); hadState = true; }
mkdirSync(userData, { recursive: true });
writeFileSync(stateFile, JSON.stringify({
  currentId: repoId,
  workspaces: [{
    id: repoId, name: path.basename(repoRoot), rootPath: repoRoot,
    openedAt: new Date(0).toISOString(), lastOpenedAt: new Date(0).toISOString(),
  }],
}, null, 2));

function restore() {
  if (hadState && existsSync(backup)) { copyFileSync(backup, stateFile); }
}

const shots = [];
async function shot(win, name) {
  const p = path.join(outDir, name);
  await win.screenshot({ path: p });
  shots.push(p);
}

const app = await electron.launch({ args: ['.'], cwd: repoRoot });
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.setViewportSize({ width: 1480, height: 960 }).catch(() => {});
  await win.waitForTimeout(1500); // let boot payload + git snapshot settle
  await shot(win, '01-city.png');
  // Centered detail crop so fine building/lighting detail survives downscaling.
  await win.screenshot({ path: path.join(outDir, '01-detail.png'), clip: { x: 440, y: 150, width: 640, height: 480 } });
  shots.push(path.join(outDir, '01-detail.png'));

  // Walk the primary views by clicking nav controls if present. Tolerant:
  // each click is best-effort so the harness still produces the boot shot.
  const views = ['WORK', 'CITY'];
  let i = 2;
  for (const v of views) {
    const btn = win.getByRole('button', { name: new RegExp(v, 'i') }).first();
    if (await btn.count().then((c) => c > 0).catch(() => false)) {
      await btn.click().catch(() => {});
      await win.waitForTimeout(700);
      await shot(win, `${String(i).padStart(2, '0')}-${v.toLowerCase()}.png`);
      i += 1;
    }
  }
} finally {
  await app.close();
  restore();
}

console.log('captured:\n' + shots.join('\n'));
