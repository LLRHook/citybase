import '@testing-library/jest-dom';

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// citybaseApi.js throws on import if window.citybase is missing — by
// design now that the renderer is Electron-only. Tests that mount App
// or any hook that imports citybaseApi need a default bridge stub on
// window so the module evaluates. Per-test fixtures override the
// individual methods they care about (see AppAutoBoot.test.jsx).
if (typeof window !== 'undefined' && !window.citybase) {
  const noopUnsub = () => {};
  window.citybase = {
    app: {
      getVersion: async () => '0.0.0-test',
      getPlatform: async () => 'test',
      onBoot: () => noopUnsub,
      getBoot: () => null,
    },
    workspace: {
      pick: async () => null,
      getCurrent: async () => null,
      setCurrent: async () => null,
      listRecent: async () => [],
      forget: async () => undefined,
    },
    git: {
      getSnapshot: async () => null,
      refresh: async () => null,
      listBranches: async () => [],
      checkout: async () => ({ ok: false, error: { message: 'test stub' } }),
      commit: async () => ({ ok: false, error: { message: 'test stub' } }),
    },
    checks: {
      run: async () => [],
    },
    agents: {
      detect: async () => ({ codex: { found: false }, claude: { found: false } }),
      list: async () => [],
      startRun: async () => { throw new Error('test stub: agents.startRun'); },
      cancel: async () => undefined,
      getRun: async () => null,
      reportUsage: async () => ({ contextUsed: 0, maxContext: 0 }),
      produceDiff: async () => ({ files: [] }),
      runChecks: async () => [],
      openPR: async () => { throw new Error('test stub: agents.openPR'); },
      listRuns: async () => [],
      approve: async () => undefined,
      reject: async () => undefined,
      listPendingApprovals: async () => [],
      onEvent: () => noopUnsub,
    },
    menu: { onCommand: () => noopUnsub },
  };
}
