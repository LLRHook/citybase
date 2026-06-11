// Playwright config for the desktop (Electron) E2E layer only.
// Unit/component tests stay in Vitest (src/tests/); this runner owns e2e/.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  // Electron launches are stateful (one app per test); keep them serial.
  workers: 1,
});
