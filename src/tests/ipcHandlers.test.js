import { describe, expect, it, vi } from 'vitest';
import { createIpcHandlers, AGENT_EVENT_CHANNEL } from '../../electron/main/ipcHandlers.cjs';

function makeStubs(overrides = {}) {
  const app = { getVersion: () => '0.1.0', ...(overrides.app || {}) };
  const fakeWindow = overrides.fakeWindow ?? Symbol('main-window');
  const getMainWindow = overrides.getMainWindow ?? (() => fakeWindow);
  const workspaceService = {
    pickWorkspace: vi.fn(async () => ({ id: 'ws-1', rootPath: '/repo' })),
    getCurrentWorkspace: vi.fn(async () => ({ id: 'ws-1' })),
    setCurrentWorkspace: vi.fn(async (id) => ({ id })),
    listRecentWorkspaces: vi.fn(async () => [{ id: 'ws-1' }]),
    forgetWorkspace: vi.fn(async () => undefined),
    getWorkspaceById: vi.fn(async (id) => (id === 'ws-1' ? { id, rootPath: '/repo' } : null)),
    ...(overrides.workspaceService || {}),
  };
  const gitService = {
    getSnapshot: vi.fn(async (ws) => ({ workspaceId: ws.id, branch: 'main' })),
    getBranches: vi.fn(async () => [
      { name: 'main', isCurrent: true, upstream: 'origin/main' },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]),
    checkout: vi.fn(async (_ws, name) => ({ ok: true, branch: name })),
    commit: vi.fn(async () => ({ ok: true, commitHash: 'abc1234' })),
    ...(overrides.gitService || {}),
  };
  const agentManager = {
    listProviders: vi.fn(() => ['codex', 'claude']),
    startRun: vi.fn(async (params) => ({
      runId: 'run-1', questId: params?.questId || 'Q', adventurerId: 'A',
      status: 'running', contextUsed: 0, maxContext: 200_000,
    })),
    streamEvents: vi.fn(() => (async function* () {
      yield { runId: 'run-1', t: '12:00', kind: 'plan', text: 'planning' };
      yield { runId: 'run-1', t: '12:01', kind: 'edit', text: 'editing' };
    })()),
    cancel: vi.fn(async () => undefined),
    getRun: vi.fn((runId) => (runId === 'run-1' ? { runId, status: 'running' } : null)),
    listRuns: vi.fn(() => [
      { runId: 'run-1', questId: 'Q', adventurerId: 'A', status: 'running',
        branch: 'main', contextUsed: 0, maxContext: 200_000,
        provider: 'claude', startedAt: 1_700_000_000_000 },
    ]),
    reportUsage: vi.fn(async () => ({ contextUsed: 0, maxContext: 200_000 })),
    produceDiff: vi.fn(async () => ({ files: [] })),
    runChecks: vi.fn(async () => []),
    openPR: vi.fn(async () => ({ prNumber: 1, url: '' })),
    approveRun: vi.fn(),
    rejectRun: vi.fn(),
    listPendingApprovals: vi.fn(() => []),
    ...(overrides.agentManager || {}),
  };
  const detectAgentBinaries = overrides.detectAgentBinaries
    ?? vi.fn(() => ({ codex: { found: true, path: '/usr/bin/codex' }, claude: { found: false } }));
  const sendAgentEvent = overrides.sendAgentEvent ?? vi.fn();
  const runWorkspaceChecks = overrides.runWorkspaceChecks
    ?? vi.fn(async () => [{ name: 'lint · npm run lint', state: 'pass', meta: 'clean in 80ms' }]);
  return {
    app, workspaceService, gitService, agentManager,
    detectAgentBinaries, sendAgentEvent, runWorkspaceChecks, getMainWindow, fakeWindow,
  };
}

function build(stubs) {
  return createIpcHandlers(stubs);
}

describe('createIpcHandlers — required deps', () => {
  it('throws when each required dependency is missing', () => {
    expect(() => createIpcHandlers({})).toThrow(/app/);
    const partial = { app: { getVersion: () => '0' } };
    expect(() => createIpcHandlers(partial)).toThrow(/workspaceService/);
    expect(() => createIpcHandlers({ ...partial, workspaceService: {} })).toThrow(/gitService/);
    expect(() => createIpcHandlers({
      ...partial, workspaceService: {}, gitService: {},
    })).toThrow(/agentManager/);
    expect(() => createIpcHandlers({
      ...partial, workspaceService: {}, gitService: {},
      agentManager: { startRun: () => {} },
    })).toThrow(/detectAgentBinaries/);
    expect(() => createIpcHandlers({
      ...partial, workspaceService: {}, gitService: {},
      agentManager: { startRun: () => {} }, detectAgentBinaries: () => ({}),
    })).toThrow(/sendAgentEvent/);
    expect(() => createIpcHandlers({
      ...partial, workspaceService: {}, gitService: {},
      agentManager: { startRun: () => {} },
      detectAgentBinaries: () => ({}), sendAgentEvent: () => {},
    })).toThrow(/getMainWindow/);
    expect(() => createIpcHandlers({
      ...partial, workspaceService: {}, gitService: {},
      agentManager: { startRun: () => {} },
      detectAgentBinaries: () => ({}), sendAgentEvent: () => {},
      getMainWindow: () => ({}),
    })).toThrow(/runWorkspaceChecks/);
  });
});

describe('createIpcHandlers — channel set', () => {
  it('exposes the full citybase: channel surface', () => {
    const { handlers } = build(makeStubs());
    expect(Object.keys(handlers).sort()).toEqual([
      'citybase:agent.approve',
      'citybase:agent.cancel',
      'citybase:agent.getEvents',
      'citybase:agent.getRun',
      'citybase:agent.listPendingApprovals',
      'citybase:agent.listRuns',
      'citybase:agent.openPR',
      'citybase:agent.produceDiff',
      'citybase:agent.reject',
      'citybase:agent.reportUsage',
      'citybase:agent.runChecks',
      'citybase:agent.startRun',
      'citybase:agents.detect',
      'citybase:agents.list',
      'citybase:app.getPlatform',
      'citybase:app.getVersion',
      'citybase:checks.run',
      'citybase:git.checkout',
      'citybase:git.commit',
      'citybase:git.getSnapshot',
      'citybase:git.listBranches',
      'citybase:git.refresh',
      'citybase:workspace.forget',
      'citybase:workspace.getCurrent',
      'citybase:workspace.listRecent',
      'citybase:workspace.pick',
      'citybase:workspace.setCurrent',
    ]);
  });
});

describe('createIpcHandlers — app + workspace + git (regression)', () => {
  it('app.getVersion delegates', () => {
    const stubs = makeStubs({ app: { getVersion: () => '9.9.9' } });
    const { handlers } = build(stubs);
    expect(handlers['citybase:app.getVersion']()).toBe('9.9.9');
  });

  it('app.getPlatform returns process.platform', () => {
    const { handlers } = build(makeStubs());
    expect(handlers['citybase:app.getPlatform']()).toBe(process.platform);
  });

  it('workspace.pick threads the main window into pickWorkspace', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await handlers['citybase:workspace.pick']();
    expect(stubs.workspaceService.pickWorkspace).toHaveBeenCalledWith({ window: stubs.fakeWindow });
  });

  it('workspace.{setCurrent,forget} forward the id from the renderer tuple', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await handlers['citybase:workspace.setCurrent'](null, 'ws-42');
    await handlers['citybase:workspace.forget'](null, 'ws-42');
    expect(stubs.workspaceService.setCurrentWorkspace).toHaveBeenCalledWith('ws-42');
    expect(stubs.workspaceService.forgetWorkspace).toHaveBeenCalledWith('ws-42');
  });

  it('git.getSnapshot looks up workspace then asks gitService', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const out = await handlers['citybase:git.getSnapshot'](null, 'ws-1');
    expect(stubs.workspaceService.getWorkspaceById).toHaveBeenCalledWith('ws-1');
    expect(stubs.gitService.getSnapshot).toHaveBeenCalledWith({ id: 'ws-1', rootPath: '/repo' });
    expect(out).toEqual({ workspaceId: 'ws-1', branch: 'main' });
  });

  it('git.getSnapshot throws on unknown workspace id; gitService not called', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await expect(handlers['citybase:git.getSnapshot'](null, 'nope'))
      .rejects.toThrow(/unknown workspace id: nope/);
    expect(stubs.gitService.getSnapshot).not.toHaveBeenCalled();
  });

  it('git.refresh shares the handler reference with git.getSnapshot', () => {
    const { handlers } = build(makeStubs());
    expect(handlers['citybase:git.refresh']).toBe(handlers['citybase:git.getSnapshot']);
  });

  it('git.listBranches looks up the workspace then asks gitService.getBranches', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const out = await handlers['citybase:git.listBranches'](null, 'ws-1');
    expect(stubs.workspaceService.getWorkspaceById).toHaveBeenCalledWith('ws-1');
    expect(stubs.gitService.getBranches).toHaveBeenCalledWith({ id: 'ws-1', rootPath: '/repo' });
    expect(out).toEqual([
      { name: 'main', isCurrent: true, upstream: 'origin/main' },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
  });

  it('git.listBranches throws on unknown workspace id', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await expect(handlers['citybase:git.listBranches'](null, 'nope'))
      .rejects.toThrow(/unknown workspace id: nope/);
  });

  it('git.listBranches returns [] when gitService is missing the helper (older builds)', async () => {
    const stubs = makeStubs();
    delete stubs.gitService.getBranches;
    const { handlers } = build(stubs);
    expect(await handlers['citybase:git.listBranches'](null, 'ws-1')).toEqual([]);
  });

  it('checks.run looks up the workspace then asks runWorkspaceChecks', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const out = await handlers['citybase:checks.run'](null, 'ws-1');
    expect(stubs.workspaceService.getWorkspaceById).toHaveBeenCalledWith('ws-1');
    expect(stubs.runWorkspaceChecks).toHaveBeenCalledWith({
      workspace: { id: 'ws-1', rootPath: '/repo' },
    });
    expect(out).toEqual([
      { name: 'lint · npm run lint', state: 'pass', meta: 'clean in 80ms' },
    ]);
  });

  it('checks.run throws on unknown workspace id', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await expect(handlers['citybase:checks.run'](null, 'nope'))
      .rejects.toThrow(/unknown workspace id: nope/);
    expect(stubs.runWorkspaceChecks).not.toHaveBeenCalled();
  });

  it('git.checkout looks up the workspace then asks gitService.checkout', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const out = await handlers['citybase:git.checkout'](null, 'ws-1', 'feature/x');
    expect(stubs.workspaceService.getWorkspaceById).toHaveBeenCalledWith('ws-1');
    expect(stubs.gitService.checkout).toHaveBeenCalledWith(
      { id: 'ws-1', rootPath: '/repo' }, 'feature/x',
    );
    expect(out).toEqual({ ok: true, branch: 'feature/x' });
  });

  it('git.checkout throws on unknown workspace id', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await expect(handlers['citybase:git.checkout'](null, 'nope', 'main'))
      .rejects.toThrow(/unknown workspace id: nope/);
    expect(stubs.gitService.checkout).not.toHaveBeenCalled();
  });

  it('git.checkout returns a structured error when gitService is missing the helper', async () => {
    const stubs = makeStubs();
    delete stubs.gitService.checkout;
    const { handlers } = build(stubs);
    const out = await handlers['citybase:git.checkout'](null, 'ws-1', 'main');
    expect(out).toEqual({ ok: false, error: { message: 'checkout not available' } });
  });

  it('git.commit looks up the workspace then asks gitService.commit', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const params = { message: 'feat: thing', addAll: true };
    const out = await handlers['citybase:git.commit'](null, 'ws-1', params);
    expect(stubs.gitService.commit).toHaveBeenCalledWith(
      { id: 'ws-1', rootPath: '/repo' }, params,
    );
    expect(out).toEqual({ ok: true, commitHash: 'abc1234' });
  });

  it('git.commit throws on unknown workspace id', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await expect(handlers['citybase:git.commit'](null, 'nope', { message: 'x' }))
      .rejects.toThrow(/unknown workspace id: nope/);
  });

  it('git.commit returns a structured error when gitService is missing the helper', async () => {
    const stubs = makeStubs();
    delete stubs.gitService.commit;
    const { handlers } = build(stubs);
    const out = await handlers['citybase:git.commit'](null, 'ws-1', { message: 'x' });
    expect(out).toEqual({ ok: false, error: { message: 'commit not available' } });
  });
});

describe('createIpcHandlers — agents.detect + agents.list', () => {
  it('agents.detect calls the injected detector and returns the result', async () => {
    const detectAgentBinaries = vi.fn(() => ({
      codex: { found: true, path: '/usr/local/bin/codex' },
      claude: { found: false },
    }));
    const stubs = makeStubs({ detectAgentBinaries });
    const { handlers } = build(stubs);
    expect(handlers['citybase:agents.detect']()).toEqual({
      codex: { found: true, path: '/usr/local/bin/codex' },
      claude: { found: false },
    });
    expect(detectAgentBinaries).toHaveBeenCalledTimes(1);
  });

  it('agents.list forwards to agentManager.listProviders', () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    expect(handlers['citybase:agents.list']()).toEqual(['codex', 'claude']);
    expect(stubs.agentManager.listProviders).toHaveBeenCalledTimes(1);
  });
});

describe('createIpcHandlers — agent.startRun + event fan-out', () => {
  it('agent.startRun returns the AgentRun the manager produces', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const params = { provider: 'codex', questId: 'TASK-1' };
    const run = await handlers['citybase:agent.startRun'](null, params);
    expect(run).toMatchObject({ runId: 'run-1', status: 'running' });
    expect(stubs.agentManager.startRun).toHaveBeenCalledWith(params);
  });

  it('agent.startRun fires events through sendAgentEvent without awaiting', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await handlers['citybase:agent.startRun'](null, { provider: 'codex' });
    // Drain microtasks so the fire-and-forget pump finishes.
    await new Promise((resolve) => setImmediate(resolve));
    expect(stubs.sendAgentEvent).toHaveBeenCalledTimes(2);
    expect(stubs.sendAgentEvent).toHaveBeenNthCalledWith(1, {
      runId: 'run-1',
      event: { runId: 'run-1', t: '12:00', kind: 'plan', text: 'planning' },
    });
    expect(stubs.sendAgentEvent).toHaveBeenNthCalledWith(2, {
      runId: 'run-1',
      event: { runId: 'run-1', t: '12:01', kind: 'edit', text: 'editing' },
    });
  });

  it('an iterator that throws is surfaced as a final error AgentEvent', async () => {
    const agentManager = {
      listProviders: () => [],
      startRun: vi.fn(async () => ({ runId: 'run-1', status: 'running', contextUsed: 0, maxContext: 0, questId: 'q', adventurerId: 'a' })),
      streamEvents: vi.fn(() => (async function* () {
        yield { runId: 'run-1', t: '12:00', kind: 'plan', text: 'planning' };
        throw new Error('stream blew up');
      })()),
      cancel: vi.fn(), getRun: vi.fn(), reportUsage: vi.fn(),
      produceDiff: vi.fn(), runChecks: vi.fn(), openPR: vi.fn(),
    };
    const stubs = makeStubs({ agentManager });
    const { handlers } = build(stubs);
    await handlers['citybase:agent.startRun'](null, { provider: 'codex' });
    await new Promise((resolve) => setImmediate(resolve));
    const calls = stubs.sendAgentEvent.mock.calls.map(c => c[0].event);
    expect(calls.at(-1)).toMatchObject({ kind: 'error', text: 'stream blew up' });
  });

  it('AGENT_EVENT_CHANNEL constant is exported and matches the expected name', () => {
    expect(AGENT_EVENT_CHANNEL).toBe('citybase:agent.event');
  });
});

describe('createIpcHandlers — agent.{cancel,getRun,reportUsage,produceDiff,runChecks,openPR}', () => {
  it('cancel forwards the runId to the manager', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await handlers['citybase:agent.cancel'](null, 'run-1');
    expect(stubs.agentManager.cancel).toHaveBeenCalledWith('run-1');
  });

  it('getRun forwards the runId and returns the manager result', () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    expect(handlers['citybase:agent.getRun'](null, 'run-1')).toEqual({ runId: 'run-1', status: 'running' });
    expect(handlers['citybase:agent.getRun'](null, 'nope')).toBeNull();
  });

  it('listRuns forwards options and returns the manager result', () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    const out = handlers['citybase:agent.listRuns'](null, { limit: 10 });
    expect(stubs.agentManager.listRuns).toHaveBeenCalledWith({ limit: 10 });
    expect(out).toEqual([
      expect.objectContaining({ runId: 'run-1', provider: 'claude', status: 'running' }),
    ]);
  });

  it('listRuns coerces undefined options to an empty object', () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    handlers['citybase:agent.listRuns'](null);
    expect(stubs.agentManager.listRuns).toHaveBeenCalledWith({});
  });

  it('reportUsage / produceDiff / runChecks / openPR forward correctly', async () => {
    const stubs = makeStubs();
    const { handlers } = build(stubs);
    await handlers['citybase:agent.reportUsage'](null, 'run-1');
    await handlers['citybase:agent.produceDiff'](null, 'run-1');
    await handlers['citybase:agent.runChecks'](null, 'run-1');
    await handlers['citybase:agent.openPR'](null, 'run-1', { title: 't', body: 'b', sourceBranch: 's', targetBranch: 'main' });
    expect(stubs.agentManager.reportUsage).toHaveBeenCalledWith('run-1');
    expect(stubs.agentManager.produceDiff).toHaveBeenCalledWith('run-1');
    expect(stubs.agentManager.runChecks).toHaveBeenCalledWith('run-1');
    expect(stubs.agentManager.openPR).toHaveBeenCalledWith('run-1', expect.objectContaining({ title: 't' }));
  });

  it('approve / reject / listPendingApprovals forward to the manager', async () => {
    const stubs = makeStubs({
      agentManager: {
        listProviders: () => ['codex'],
        startRun: vi.fn(), streamEvents: vi.fn(), cancel: vi.fn(),
        getRun: vi.fn(), reportUsage: vi.fn(), produceDiff: vi.fn(),
        runChecks: vi.fn(), openPR: vi.fn(),
        approveRun: vi.fn(),
        rejectRun: vi.fn(),
        listPendingApprovals: vi.fn(() => [{ runId: 'run-1', summary: { files: 2 } }]),
      },
    });
    const { handlers } = build(stubs);
    await handlers['citybase:agent.approve'](null, 'run-1');
    await handlers['citybase:agent.reject'](null, 'run-2');
    const pending = await handlers['citybase:agent.listPendingApprovals'](null);
    expect(stubs.agentManager.approveRun).toHaveBeenCalledWith('run-1');
    expect(stubs.agentManager.rejectRun).toHaveBeenCalledWith('run-2');
    expect(pending).toEqual([{ runId: 'run-1', summary: { files: 2 } }]);
  });
});

describe('createIpcHandlers — pumpAgentEvents (testable directly)', () => {
  it('drains streamEvents and forwards each event', async () => {
    const stubs = makeStubs();
    const { pumpAgentEvents } = build(stubs);
    await pumpAgentEvents('run-1');
    expect(stubs.sendAgentEvent).toHaveBeenCalledTimes(2);
  });

  it('emits a synthetic error event when streamEvents itself throws', async () => {
    const agentManager = {
      listProviders: () => [], startRun: vi.fn(), cancel: vi.fn(), getRun: vi.fn(),
      reportUsage: vi.fn(), produceDiff: vi.fn(), runChecks: vi.fn(), openPR: vi.fn(),
      streamEvents: vi.fn(() => { throw new Error('cannot stream'); }),
    };
    const stubs = makeStubs({ agentManager });
    const { pumpAgentEvents } = build(stubs);
    await pumpAgentEvents('run-1');
    expect(stubs.sendAgentEvent).toHaveBeenCalledWith({
      runId: 'run-1',
      event: { runId: 'run-1', t: '00:00', kind: 'error', text: 'cannot stream' },
    });
  });
});
