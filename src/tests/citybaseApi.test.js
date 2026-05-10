// citybaseApi is a thin re-export of window.citybase. The browser-stub
// path was deleted on 2026-05-10 — the renderer always runs inside
// Electron now. These tests assert the new contract:
//   * citybaseApi === the window.citybase the preload attached
//   * import-time throw if window.citybase is missing, so a misconfigured
//     boot fails loud instead of silently degrading
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function importFreshApi() {
  // Bust the module cache so each test re-runs the top-level evaluation.
  const mod = await import('../app/citybaseApi.js?bust=' + Math.random());
  return mod;
}

describe('citybaseApi — desktop bridge re-export', () => {
  let savedBridge;

  beforeEach(() => { savedBridge = window.citybase; });
  afterEach(() => { window.citybase = savedBridge; });

  it('re-exports window.citybase as citybaseApi', async () => {
    const fakeBridge = {
      app: { getVersion: async () => '9.9.9' },
      workspace: {}, git: {}, checks: {}, agents: {}, menu: {},
    };
    window.citybase = fakeBridge;
    const { citybaseApi } = await importFreshApi();
    expect(citybaseApi).toBe(fakeBridge);
    await expect(citybaseApi.app.getVersion()).resolves.toBe('9.9.9');
  });

  it('throws at import time when window.citybase is missing', async () => {
    delete window.citybase;
    await expect(importFreshApi()).rejects.toThrow(/window\.citybase is not present/);
  });
});
