// Capture or open the real desktop city in an isolated profile. No demo data.
import { _electron as electron } from '@playwright/test';
import electronBinary from 'electron';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workspacePath = process.env.CITYBASE_CAPTURE_WORKSPACE || root;
const profile = await mkdtemp(path.join(tmpdir(), 'citybase-showcase-'));
const id = createHash('sha1').update(workspacePath).digest('hex').slice(0, 16);
await writeFile(path.join(profile, 'workspaces.json'), JSON.stringify({ currentId: id, workspaces: [{ id, rootPath: workspacePath, name: path.basename(workspacePath), openedAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString() }] }));
const launcher = path.join(profile, 'launch.cjs');
await writeFile(launcher, `const {app} = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.join(root, 'electron/main/main.cjs'))});`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: electronBinary, args: [launcher, '--remote-debugging-port=9338'], cwd: root, env });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', err => errors.push(err.message));
await page.waitForSelector('.world-canvas canvas', { timeout: 30000 });
await page.waitForFunction(() => !document.querySelector('.world-loading'), { timeout: 30000 });
await page.waitForTimeout(1600);
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await page.screenshot({ path: path.join(root, 'artifacts/citybase-night.png') });
console.log(JSON.stringify({ workspace: workspacePath, profile, errors, screenshot: path.join(root, 'artifacts/citybase-night.png'), cdp: 9338 }));
if (process.argv.includes('--keep-open')) {
  console.log('Desktop preview remains open. Ctrl+C closes this isolated preview.');
  await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
}
await app.close();
