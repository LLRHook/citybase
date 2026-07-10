// Protocol conformance (FEAT-022): the WS facade serves whatever
// createIpcHandlers produces, so the real contract to guard is
// preload surface ⊆ handler map, and handler map ⊆ preload surface modulo
// an explicit whitelist. A renamed channel now fails here instead of
// surfacing as a dead method in one frontend.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createIpcHandlers } from '../../electron/main/ipcHandlers.cjs';

// Channels that exist for headless frontends only; the Electron renderer
// deliberately does not expose them (it has the native dialog instead).
const HEADLESS_ONLY = new Set([
  'citybase:workspace.registerPath',
  'citybase:quests.list',
]);

function handlerChannels() {
  const { handlers } = createIpcHandlers({
    app: { getVersion: () => '0' },
    workspaceService: {},
    gitService: {},
    agentManager: { startRun: () => {}, streamEvents: () => {} },
    detectAgentBinaries: () => ({}),
    sendAgentEvent: () => {},
    getMainWindow: () => null,
    runWorkspaceChecks: () => [],
  });
  vi.restoreAllMocks();
  return new Set(Object.keys(handlers));
}

function preloadChannels() {
  const src = readFileSync(resolve(__dirname, '../../electron/preload/preload.cjs'), 'utf8');
  return new Set(
    [...src.matchAll(/invoke\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  );
}

describe('core protocol conformance', () => {
  it('every channel the preload invokes has a handler', () => {
    const handlers = handlerChannels();
    for (const channel of preloadChannels()) {
      expect(handlers.has(channel), `preload invokes ${channel} but no handler exists`).toBe(true);
    }
  });

  it('every handler is reachable from the preload, or is whitelisted headless-only', () => {
    const preload = preloadChannels();
    for (const channel of handlerChannels()) {
      expect(
        preload.has(channel) || HEADLESS_ONLY.has(channel),
        `handler ${channel} is not exposed in preload and not whitelisted — dead surface or missing preload method`,
      ).toBe(true);
    }
  });
});
