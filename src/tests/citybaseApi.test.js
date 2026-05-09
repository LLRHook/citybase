// Tests the renderer-side facade. The real desktop branch is exercised
// only by the Electron shell; what we can cover under jsdom is the
// browser-stub shape, which has to match the desktop shape exactly so
// the renderer can run without a preload.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let citybaseApi;
let isDesktop;

async function importFreshApi() {
  // citybaseApi.js evaluates window.citybase at module load. Reset the
  // module registry so each test sees a fresh evaluation against whatever
  // window.citybase is set to before importing.
  await import('../app/citybaseApi.js?bust=' + Math.random());
  const mod = await import('../app/citybaseApi.js?bust=' + Math.random());
  citybaseApi = mod.citybaseApi;
  isDesktop = mod.isDesktop;
}

describe('citybaseApi — browser stub (no window.citybase)', () => {
  beforeEach(async () => {
    delete window.citybase;
    await importFreshApi();
  });

  it('reports isDesktop=false', () => {
    expect(isDesktop).toBe(false);
    expect(citybaseApi.isDesktop).toBe(false);
  });

  it('exposes the same namespaces as the desktop API', () => {
    expect(Object.keys(citybaseApi).sort()).toEqual([
      'agents', 'app', 'checks', 'git', 'isDesktop', 'menu', 'workspace',
    ]);
  });

  it('app.onBoot returns a no-op unsubscribe (browser has no main process)', () => {
    const off = citybaseApi.app.onBoot(() => {});
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('app.getBoot returns null in the browser stub', () => {
    expect(citybaseApi.app.getBoot()).toBeNull();
  });

  it('git.listBranches returns [] in the browser stub', async () => {
    await expect(citybaseApi.git.listBranches('any-id')).resolves.toEqual([]);
  });

  it('checks.run returns [] in the browser stub', async () => {
    await expect(citybaseApi.checks.run('any-id')).resolves.toEqual([]);
  });

  it('git.checkout / git.commit return a structured failure in the browser stub', async () => {
    const checkout = await citybaseApi.git.checkout('ws-1', 'main');
    expect(checkout.ok).toBe(false);
    expect(checkout.error.message).toMatch(/git not available in browser preview/);
    const c = await citybaseApi.git.commit('ws-1', { message: 'x' });
    expect(c.ok).toBe(false);
    expect(c.error.message).toMatch(/git not available in browser preview/);
  });

  describe('agents stub', () => {
    it('detect resolves to both not-found', async () => {
      await expect(citybaseApi.agents.detect()).resolves.toEqual({
        codex: { found: false }, claude: { found: false },
      });
    });

    it('list resolves to []', async () => {
      await expect(citybaseApi.agents.list()).resolves.toEqual([]);
    });

    it('startRun and openPR reject so callers see a clear failure', async () => {
      await expect(citybaseApi.agents.startRun({})).rejects.toThrow(/agents are unavailable in browser preview/);
      await expect(citybaseApi.agents.openPR('r', {})).rejects.toThrow(/agents are unavailable in browser preview/);
    });

    it('cancel / getRun / reportUsage / produceDiff / runChecks return shape-compatible noops', async () => {
      await expect(citybaseApi.agents.cancel('r')).resolves.toBeUndefined();
      await expect(citybaseApi.agents.getRun('r')).resolves.toBeNull();
      await expect(citybaseApi.agents.reportUsage('r')).resolves.toEqual({ contextUsed: 0, maxContext: 0 });
      await expect(citybaseApi.agents.produceDiff('r')).resolves.toEqual({ files: [] });
      await expect(citybaseApi.agents.runChecks('r')).resolves.toEqual([]);
    });

    it('approve / reject / listPendingApprovals are no-op stubs in browser mode', async () => {
      await expect(citybaseApi.agents.approve('r')).resolves.toBeUndefined();
      await expect(citybaseApi.agents.reject('r')).resolves.toBeUndefined();
      await expect(citybaseApi.agents.listPendingApprovals()).resolves.toEqual([]);
    });

    it('onEvent returns an unsubscribe function (no-op in browser)', () => {
      const off = citybaseApi.agents.onEvent(() => {});
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    });
  });
});

describe('citybaseApi — desktop bridge (window.citybase present)', () => {
  beforeEach(async () => {
    window.citybase = {
      app: {
        getVersion: async () => '1.0.0',
        getPlatform: async () => 'win32',
        onBoot: () => () => {},
        getBoot: () => null,
      },
      workspace: { pick: async () => null, getCurrent: async () => null, setCurrent: async () => null, listRecent: async () => [], forget: async () => undefined },
      git: {
        getSnapshot: async () => null, refresh: async () => null,
        listBranches: async () => [],
        checkout: async (_id, name) => ({ ok: true, branch: name }),
        commit: async () => ({ ok: true, commitHash: 'abc' }),
      },
      checks: { run: async () => [{ name: 'lint', state: 'pass', meta: 'clean in 5ms' }] },
      agents: {
        detect: async () => ({ codex: { found: true, path: '/x' }, claude: { found: false } }),
        list: async () => ['codex'],
        startRun: async (params) => ({ ...params, runId: 'run-real' }),
        cancel: async () => undefined,
        getRun: async (id) => ({ runId: id }),
        reportUsage: async () => ({ contextUsed: 1, maxContext: 2 }),
        produceDiff: async () => ({ files: [{ file: 'x.js' }] }),
        runChecks: async () => [{ name: 'lint', state: 'pass', meta: '' }],
        openPR: async () => ({ prNumber: 7, url: '' }),
        onEvent: () => () => {},
      },
      menu: { onCommand: () => () => {} },
    };
    await importFreshApi();
  });

  afterEach(() => {
    delete window.citybase;
  });

  it('reports isDesktop=true and forwards agents calls to the bridge', async () => {
    expect(isDesktop).toBe(true);
    await expect(citybaseApi.agents.detect()).resolves.toEqual({
      codex: { found: true, path: '/x' }, claude: { found: false },
    });
    await expect(citybaseApi.agents.list()).resolves.toEqual(['codex']);
    await expect(citybaseApi.agents.startRun({ provider: 'codex' }))
      .resolves.toEqual({ provider: 'codex', runId: 'run-real' });
    await expect(citybaseApi.agents.openPR('r', {}))
      .resolves.toEqual({ prNumber: 7, url: '' });
  });
});
