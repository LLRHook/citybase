import { describe, expect, it, vi } from 'vitest';
import { createAgentManager } from '../../electron/main/agents/agentManager.cjs';

function makeAdapter(overrides = {}) {
  // A minimally compliant adapter that satisfies isAdapterShape and
  // returns canned values. Tests can override any method.
  const base = {
    startTask: vi.fn(async (params) => ({
      runId: '', // manager generates if blank
      questId: params?.questId || 'Q',
      adventurerId: params?.adventurerId || 'A',
      status: 'running',
      contextUsed: 0,
      maxContext: 200000,
    })),
    streamEvents: vi.fn(() => (async function* () {})()),
    reportUsage: vi.fn(async () => ({ contextUsed: 0, maxContext: 200000 })),
    produceDiff: vi.fn(async () => ({ files: [] })),
    runChecks: vi.fn(async () => []),
    openPR: vi.fn(async () => ({ prNumber: 1, url: '' })),
    cancel: vi.fn(async () => undefined),
  };
  return Object.assign(base, overrides);
}

const startParams = {
  provider: 'fake',
  questId: 'TASK-1',
  adventurerId: 'alpha-7',
  skill: 'refactor',
  repoUrl: '/abs/repo',
  branch: 'main',
  promptContext: 'do the thing',
};

describe('createAgentManager — registration', () => {
  it('lists no providers when constructed empty', () => {
    const mgr = createAgentManager();
    expect(mgr.listProviders()).toEqual([]);
  });

  it('accepts adapters at construction', () => {
    const mgr = createAgentManager({ adapters: { fake: makeAdapter(), other: makeAdapter() } });
    expect(mgr.listProviders().sort()).toEqual(['fake', 'other']);
  });

  it('accepts adapters via register()', () => {
    const mgr = createAgentManager();
    mgr.register('fake', makeAdapter());
    expect(mgr.listProviders()).toEqual(['fake']);
  });

  it('rejects a non-string or empty provider name', () => {
    const mgr = createAgentManager();
    expect(() => mgr.register('', makeAdapter())).toThrow(/non-empty string/);
    expect(() => mgr.register(42, makeAdapter())).toThrow(/non-empty string/);
  });

  it('rejects an adapter missing any of the 7 required methods', () => {
    const mgr = createAgentManager();
    const incomplete = makeAdapter();
    delete incomplete.cancel;
    expect(() => mgr.register('broken', incomplete)).toThrow(/missing required AgentProvider methods/);
  });

  it('getProvider throws on unknown name', () => {
    const mgr = createAgentManager();
    expect(() => mgr.getProvider('nope')).toThrow(/unknown agent provider: nope/);
  });
});

describe('createAgentManager — startRun + dispatch', () => {
  it('startRun calls the adapter named by provider with the rest of the params', async () => {
    const fake = makeAdapter();
    const mgr = createAgentManager({ adapters: { fake } });
    await mgr.startRun(startParams);
    expect(fake.startTask).toHaveBeenCalledWith(expect.objectContaining({
      questId: 'TASK-1',
      adventurerId: 'alpha-7',
      skill: 'refactor',
    }));
    expect(fake.startTask.mock.calls[0][0]).not.toHaveProperty('provider');
  });

  it('startRun assigns a runId when the adapter returned an empty one', async () => {
    let counter = 0;
    const mgr = createAgentManager({
      adapters: { fake: makeAdapter() },
      generateRunId: () => `gen-${++counter}`,
    });
    const r1 = await mgr.startRun(startParams);
    const r2 = await mgr.startRun(startParams);
    expect(r1.runId).toBe('gen-1');
    expect(r2.runId).toBe('gen-2');
  });

  it('startRun preserves the adapter-supplied runId when present', async () => {
    const fake = makeAdapter({
      startTask: vi.fn(async () => ({
        runId: 'adapter-issued',
        questId: 'q',
        adventurerId: 'a',
        status: 'running',
        contextUsed: 0,
        maxContext: 1,
      })),
    });
    const mgr = createAgentManager({ adapters: { fake } });
    const run = await mgr.startRun(startParams);
    expect(run.runId).toBe('adapter-issued');
  });

  it('startRun throws on unknown provider', async () => {
    const mgr = createAgentManager();
    await expect(mgr.startRun(startParams)).rejects.toThrow(/unknown agent provider: fake/);
  });

  it('startRun surfaces a runId collision instead of overwriting', async () => {
    const fake = makeAdapter({
      startTask: vi.fn(async () => ({
        runId: 'fixed',
        questId: 'q',
        adventurerId: 'a',
        status: 'running',
        contextUsed: 0,
        maxContext: 1,
      })),
    });
    const mgr = createAgentManager({ adapters: { fake } });
    await mgr.startRun(startParams);
    await expect(mgr.startRun(startParams)).rejects.toThrow(/runId collision: fixed/);
  });
});

describe('createAgentManager — delegation by runId', () => {
  async function withRun() {
    const fake = makeAdapter();
    let counter = 0;
    const mgr = createAgentManager({
      adapters: { fake },
      generateRunId: () => `gen-${++counter}`,
    });
    const run = await mgr.startRun(startParams);
    return { fake, mgr, run };
  }

  it('streamEvents / reportUsage / produceDiff / runChecks delegate to the right adapter', async () => {
    const { fake, mgr, run } = await withRun();
    mgr.streamEvents(run.runId);
    await mgr.reportUsage(run.runId);
    await mgr.produceDiff(run.runId);
    await mgr.runChecks(run.runId);
    await mgr.openPR(run.runId, { title: 't', body: 'b', sourceBranch: 'feat', targetBranch: 'main' });
    expect(fake.streamEvents).toHaveBeenCalledWith(run.runId);
    expect(fake.reportUsage).toHaveBeenCalledWith(run.runId);
    expect(fake.produceDiff).toHaveBeenCalledWith(run.runId);
    expect(fake.runChecks).toHaveBeenCalledWith(run.runId);
    expect(fake.openPR).toHaveBeenCalledWith(run.runId, expect.objectContaining({ title: 't' }));
  });

  it('every delegating method throws on unknown runId', async () => {
    const mgr = createAgentManager({ adapters: { fake: makeAdapter() } });
    expect(() => mgr.streamEvents('nope')).toThrow(/unknown runId: nope/);
    await expect(mgr.reportUsage('nope')).rejects.toThrow(/unknown runId: nope/);
    await expect(mgr.cancel('nope')).rejects.toThrow(/unknown runId: nope/);
  });

  it('cancel calls the adapter and forgets the run on success', async () => {
    const { fake, mgr, run } = await withRun();
    expect(mgr.getRun(run.runId)).toEqual(run);
    await mgr.cancel(run.runId);
    expect(fake.cancel).toHaveBeenCalledWith(run.runId);
    expect(mgr.getRun(run.runId)).toBeNull();
  });

  it('cancel keeps the run in-flight if the adapter throws (caller can retry)', async () => {
    const fake = makeAdapter({ cancel: vi.fn(async () => { throw new Error('busy'); }) });
    let counter = 0;
    const mgr = createAgentManager({
      adapters: { fake },
      generateRunId: () => `gen-${++counter}`,
    });
    const run = await mgr.startRun(startParams);
    await expect(mgr.cancel(run.runId)).rejects.toThrow(/busy/);
    expect(mgr.getRun(run.runId)).toEqual(run);
  });
});
