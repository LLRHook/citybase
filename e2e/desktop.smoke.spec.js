// Desktop-mode smoke test (FEAT-001). Launches the real Electron app against
// the built renderer and proves the main → preload → renderer glue:
//   - the window opens with the product title,
//   - the typed bridge survives sandbox: true (BUG-001 guard),
//   - the renderer stays sandboxed (no Node globals),
//   - a real IPC round trip works (app.getVersion),
//   - agent detection answers over real IPC with a well-formed shape (BUG-002 seam).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { test, expect, _electron as electron } from '@playwright/test';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distIndex = path.join(repoRoot, 'dist', 'index.html');

test.beforeAll(() => {
  if (!existsSync(distIndex)) {
    throw new Error(
      'dist/index.html not found — run `npm run build` before `npm run test:e2e`',
    );
  }
});

test('desktop shell opens with a live bridge and a sandboxed renderer', async () => {
  // --no-sandbox only on CI: ubuntu-24.04 runners restrict unprivileged user
  // namespaces, which breaks Electron's OS-level sandbox helper. The renderer
  // sandbox under test (webPreferences sandbox: true) is unaffected.
  const launchArgs = process.env.CI ? ['.', '--no-sandbox'] : ['.'];
  const app = await electron.launch({ args: launchArgs, cwd: repoRoot });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window).toHaveTitle('Citybase');

    const probe = await window.evaluate(() => ({
      hasBridge: typeof window.citybase === 'object' && window.citybase !== null,
      requireType: typeof window.require,
      processType: typeof window.process,
      rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    }));
    expect(probe.hasBridge, 'window.citybase must be exposed by the preload bridge').toBe(true);
    expect(probe.requireType, 'renderer must not see require()').toBe('undefined');
    expect(probe.processType, 'renderer must not see process').toBe('undefined');
    expect(probe.rootChildren, 'city view must render into #root').toBeGreaterThan(0);

    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const version = await window.evaluate(() => window.citybase.app.getVersion());
    expect(version, 'app.getVersion must resolve over real IPC').toBe(pkg.version);

    const detect = await window.evaluate(() => window.citybase.agents.detect());
    expect(typeof detect.codex.found, 'detect must answer with boolean shape').toBe('boolean');
    expect(typeof detect.claude.found, 'detect must answer with boolean shape').toBe('boolean');
  } finally {
    await app.close();
  }
});
