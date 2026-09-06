import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { test, expect } from '@playwright/test';
import { createDesktopHarness } from './desktopHarness.js';

// These journeys restart a native app and execute real Git processes. Bound
// individual actions in the harness while allowing a full journey on busy CI.
test.describe.configure({ timeout: 120_000 });

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function createRepository(root) {
  mkdirSync(root);
  for (const dir of ['src', 'docs', 'tests']) mkdirSync(path.join(root, dir));
  writeFileSync(path.join(root, 'README.md'), '# The little fixture city\n');
  writeFileSync(path.join(root, 'src', 'tower.js'), 'export const staged = "old staged";\nexport const unstaged = "old unstaged";\n');
  writeFileSync(path.join(root, 'docs', 'guide.md'), 'The original guide\n');
  writeFileSync(path.join(root, 'tests', 'scout.js'), 'A quiet testing neighborhood\n');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Victor Ivanov');
  git(root, 'config', 'user.email', 'vivanov@paradigmtesting.com');
  git(root, 'add', '.');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'test: create isolated city fixture');
  writeFileSync(path.join(root, 'src', 'tower.js'), 'export const staged = "staged lantern";\nexport const unstaged = "old unstaged";\n');
  git(root, 'add', 'src/tower.js');
  writeFileSync(path.join(root, 'src', 'tower.js'), 'export const staged = "staged lantern";\nexport const unstaged = "unstaged firefly";\n');
  writeFileSync(path.join(root, 'docs', 'newcomer.md'), 'A newly arrived building\n');
}

async function openCity(harness, root) {
  await harness.chooseFolder(root);
  await harness.window.getByRole('button', { name: 'Open your first city' }).click();
  await expect(harness.window.getByText('LIVE REPOSITORY', { exact: true })).toBeVisible();
  await expect(harness.window.locator('.world-loading')).toHaveCount(0);
  await expect(harness.window.locator('.footer-path')).toHaveText(root);
}

async function inspect(window, file) {
  await window.getByRole('button', { name: 'Open atlas', exact: true }).click();
  await window.getByRole('textbox', { name: 'Find a building' }).fill(file);
  await window.locator('.file-row').filter({ hasText: file }).click();
  await expect(window.getByRole('complementary', { name: 'Building inspector' })).toBeVisible();
}

test('a real Git city opens, explores, inspects both diff layers, refreshes and restores', async () => {
  const testInfo = test.info();
  const harness = await createDesktopHarness();
  const root = path.join(harness.temporaryRoot, 'little-city');
  createRepository(root);
  const indexBefore = git(root, 'diff', '--cached');
  try {
    const window = harness.window;
    await openCity(harness, root);
    const sandbox = await window.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
    expect(sandbox).toEqual({ require: 'undefined', process: 'undefined' });
    await expect(window.locator('.world-footer')).toContainText('2 changed files');
    await inspect(window, 'tower.js');
    await expect(window.getByLabel('File contents')).toContainText('staged lantern');
    await expect(window.getByLabel('File contents')).toContainText('unstaged firefly');
    await window.getByRole('button', { name: /^Changes/ }).click();
    const diff = window.getByLabel('File changes');
    await expect(diff).toContainText('-export const staged = "old staged"');
    await expect(diff).toContainText('+export const staged = "staged lantern"');
    await expect(diff).toContainText('+export const unstaged = "unstaged firefly"');
    await window.screenshot({ path: testInfo.outputPath('real-git-inspection.png') });
    expect(git(root, 'diff', '--cached')).toBe(indexBefore);

    await inspect(window, 'newcomer.md');
    await expect(window.getByLabel('File contents')).toContainText('A newly arrived building');
    await window.getByRole('button', { name: /^Changes/ }).click();
    await expect(window.getByLabel('File changes')).toContainText('+++ b/docs/newcomer.md');

    writeFileSync(path.join(root, 'docs', 'newcomer.md'), 'A newly arrived building\nA fresh roof\n');
    await window.getByRole('button', { name: 'Refresh city', exact: true }).click();
    await expect(window.getByLabel('File changes')).toContainText('+A fresh roof');
    writeFileSync(path.join(root, 'src', 'fresh.js'), 'The refresh sees this new building\n');
    await window.getByRole('button', { name: 'Refresh city', exact: true }).click();
    await expect(window.locator('.world-footer')).toContainText('3 changed files');
    await inspect(window, 'fresh.js');
    await expect(window.getByLabel('File contents')).toContainText('The refresh sees this new building');
    await inspect(window, 'guide.md');
    await expect(window.getByLabel('File contents')).toContainText('The original guide');
    writeFileSync(path.join(root, 'docs', 'guide.md'), 'A committed guide with a new chapter\n');
    git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '--only', 'docs/guide.md', '-m', 'test: revise the fixture guide');
    await window.getByRole('button', { name: 'Refresh city', exact: true }).click();
    await expect(window.getByLabel('File contents')).toContainText('A committed guide with a new chapter');
    await window.getByRole('button', { name: 'Close inspector' }).click();
    await window.getByRole('button', { name: 'Switch to daylight' }).click();
    await expect(window.getByRole('button', { name: 'Switch to night' })).toBeVisible();
    await window.getByRole('button', { name: 'Explore on foot' }).click();
    await expect(window.getByRole('button', { name: 'Explore on foot' })).toHaveAttribute('aria-pressed', 'true');
    await window.getByRole('button', { name: 'Orbit the city' }).click();
    await expect(window.getByRole('button', { name: 'Orbit the city' })).toHaveAttribute('aria-pressed', 'true');
    await expect(window.getByRole('button', { name: 'Explore on foot' })).toHaveAttribute('aria-pressed', 'false');
    await window.getByRole('button', { name: 'Return to city overview' }).click();

    const restored = await harness.restart();
    await expect(restored.locator('.footer-path')).toHaveText(root);
    await expect(restored.locator('.world-footer')).toContainText('3 changed files');
    expect(harness.errors).toEqual([]);
  } finally { await harness.close(); }
});

test('a non-Git folder shows an actionable error and can recover to a real city', async () => {
  const harness = await createDesktopHarness();
  const invalid = path.join(harness.temporaryRoot, 'not-a-repository');
  const valid = path.join(harness.temporaryRoot, 'recovered-city');
  mkdirSync(invalid);
  createRepository(valid);
  try {
    await harness.chooseFolder(invalid);
    await harness.window.getByRole('button', { name: 'Open your first city' }).click();
    await expect(harness.window.getByRole('alert')).toContainText('not a Git repository');
    await harness.chooseFolder(valid);
    await harness.window.getByRole('button', { name: 'Choose another folder' }).click();
    await expect(harness.window.locator('.footer-path')).toHaveText(valid);
    await expect(harness.window.getByRole('alert')).toHaveCount(0);
    expect(harness.errors).toEqual([]);
  } finally { await harness.close(); }
});

test('a scout uses real approval, read-only CLI arguments, streamed history and recall with an explicit test provider', async () => {
  const testInfo = test.info();
  const harness = await createDesktopHarness({ fixtureAgent: true });
  const root = path.join(harness.temporaryRoot, 'scout-city');
  createRepository(root);
  const statusBefore = git(root, 'status', '--porcelain=v1');
  try {
    const window = harness.window;
    await openCity(harness, root);
    await window.getByRole('button', { name: 'New quest' }).click();
    await window.locator('.crew-card').filter({ hasText: 'Mica' }).click();
    await window.getByLabel('THE QUEST', { exact: true }).fill('Explore this explicit E2E fixture without editing.');
    await window.getByRole('button', { name: 'Dispatch adventurer' }).click();
    await expect(window.getByRole('dialog', { name: 'Send an agent to scout this city' })).toBeVisible();
    await expect(window.getByText('Send an agent to scout this city', { exact: true })).toBeVisible();
    const approvalBody = window.getByRole('button', { name: /Approve$/i }).locator('../..');
    await expect(approvalBody).toContainText('Explore this explicit E2E fixture without editing.');
    await expect(approvalBody).toContainText(root);
    expect(existsSync(harness.captureFile), 'approval must precede child process execution').toBe(false);
    await window.getByRole('button', { name: /Approve$/i }).click();
    await expect(window.getByRole('heading', { name: 'Back at the shop.' })).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('.quest-stream')).toContainText('E2E fixture scout: I inspected the little city.');
    const invocation = JSON.parse(readFileSync(harness.captureFile, 'utf8').trim());
    expect(invocation.cwd).toBe(root);
    expect(invocation.args.slice(invocation.args.indexOf('--sandbox'), invocation.args.indexOf('--sandbox') + 2)).toEqual(['--sandbox', 'read-only']);
    expect(invocation.prompt).toContain('Explore this explicit E2E fixture without editing.');
    await window.getByRole('button', { name: 'Stamp complete · +40 Surveying XP' }).click();
    await expect(window.getByRole('button', { name: 'STAMPED & FILED' })).toBeDisabled();
    await window.screenshot({ path: testInfo.outputPath('fixture-scout-returned.png') });

    await window.getByRole('button', { name: 'Another adventure' }).click();
    await expect(window.locator('.crew-card').filter({ hasText: 'Mica' }).locator('[title="Surveying: 40 XP"]')).toBeVisible();
    await window.getByLabel('THE QUEST', { exact: true }).fill('Reject this explicit E2E fixture quest.');
    await window.getByRole('button', { name: 'Dispatch adventurer' }).click();
    await window.getByRole('button', { name: /Reject$/i }).click();
    await expect(window.locator('.live-quest')).toHaveCount(0);
    await expect(window.locator('.history-row').filter({ hasText: 'Reject this explicit E2E fixture quest.' })).toContainText('cancelled');
    expect(readFileSync(harness.captureFile, 'utf8').trim().split('\n')).toHaveLength(1);

    await window.getByLabel('THE QUEST', { exact: true }).fill('WAIT_FOR_RECALL: keep the explicit E2E fixture process alive.');
    await window.getByRole('button', { name: 'Dispatch adventurer' }).click();
    await window.getByRole('button', { name: /Approve$/i }).click();
    await expect(window.getByRole('heading', { name: 'On the job.' })).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('.quest-stream')).toContainText('E2E fixture scout: I inspected the little city.');
    await window.getByRole('button', { name: 'Recall adventurer' }).click();
    await expect(window.getByRole('heading', { name: 'Job called off.' })).toBeVisible();
    const recalled = JSON.parse(readFileSync(harness.captureFile, 'utf8').trim().split('\n').at(-1));
    await expect.poll(() => {
      try { process.kill(recalled.pid, 0); return true; }
      catch (error) { if (error.code === 'ESRCH') return false; throw error; }
    }, { message: 'Recall must terminate the fixture child process' }).toBe(false);
    expect(git(root, 'status', '--porcelain=v1')).toBe(statusBefore);

    const restored = await harness.restart();
    await expect(restored.locator('.footer-path')).toHaveText(root);
    await restored.getByRole('button', { name: /Quest log/ }).click();
    await expect(restored.locator('.history-row')).toHaveCount(3);
    await restored.locator('.history-row').filter({ hasText: 'Explore this explicit E2E fixture' }).click();
    await expect(restored.getByRole('heading', { name: 'Back at the shop.' })).toBeVisible();
    await expect(restored.locator('.quest-stream')).toContainText('E2E fixture scout: I inspected the little city.');
    await expect(restored.getByRole('button', { name: 'STAMPED & FILED' })).toBeDisabled();
    expect(harness.errors).toEqual([]);
  } catch (error) {
    writeFileSync(testInfo.outputPath('scout-diagnostics.json'), JSON.stringify({
      body: await harness.window.locator('body').innerText(),
      runs: await harness.window.evaluate(() => window.citybase.agents.listRuns()),
      errors: harness.errors,
      invocations: existsSync(harness.captureFile) ? readFileSync(harness.captureFile, 'utf8') : null,
    }, null, 2));
    throw error;
  } finally { await harness.close(); }
});
