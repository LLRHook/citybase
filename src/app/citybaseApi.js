// citybaseApi.js — renderer-side facade for the desktop API.
//
// In Electron we use the `window.citybase` object exposed by preload.cjs.
// In browser dev mode (no preload) we return a stub with shape-compatible
// methods that resolve to "no workspace / no git / no agents" — this keeps
// the prototype runnable in `npm run dev` without a desktop shell.

const noopUnsubscribe = () => {};

function browserStub() {
  return {
    isDesktop: false,
    app: {
      getVersion: async () => '0.1.0-web',
      getPlatform: async () => 'browser',
      onBoot: () => noopUnsubscribe,
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
      checkout: async () => ({ ok: false, error: { message: 'git not available in browser preview' } }),
      commit: async () => ({ ok: false, error: { message: 'git not available in browser preview' } }),
    },
    checks: {
      run: async () => [],
    },
    agents: {
      detect: async () => ({ codex: { found: false }, claude: { found: false } }),
      list: async () => [],
      startRun: async () => { throw new Error('agents are unavailable in browser preview'); },
      cancel: async () => undefined,
      getRun: async () => null,
      reportUsage: async () => ({ contextUsed: 0, maxContext: 0 }),
      produceDiff: async () => ({ files: [] }),
      runChecks: async () => [],
      openPR: async () => { throw new Error('agents are unavailable in browser preview'); },
      approve: async () => undefined,
      reject: async () => undefined,
      listPendingApprovals: async () => [],
      onEvent: () => noopUnsubscribe,
    },
    menu: {
      onCommand: () => noopUnsubscribe,
    },
  };
}

function desktop(api) {
  return {
    isDesktop: true,
    app: api.app,
    workspace: api.workspace,
    git: api.git,
    checks: api.checks,
    agents: api.agents,
    menu: api.menu,
  };
}

export const citybaseApi = (typeof window !== 'undefined' && window.citybase)
  ? desktop(window.citybase)
  : browserStub();

export const isDesktop = citybaseApi.isDesktop;
