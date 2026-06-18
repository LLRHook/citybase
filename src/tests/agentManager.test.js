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

  it('getEvents collects the adapter stream into an array (events backstop)', async () => {
    const trail = [
      { runId: 'x', t: '00:00', kind: 'plan', text: 'planning' },
      { runId: 'x', t: '00:01', kind: 'edit', text: 'claude: done' },
    ];
    const adapter = makeAdapter();
    adapter.streamEvents = vi.fn(() => (async function* () { yield* trail; })());
    const mgr = createAgentManager({ adapters: { fake: adapter } });
    const run = await mgr.startRun({ provider: 'fake', questId: 'q', adventurerId: 'a', skill: 'docs', repoUrl: '/r', branch: 'main', promptContext: 'p' });
    const events = await mgr.getEvents(run.runId);
    expect(events).toEqual(trail);
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

describe('createAgentManager — listRuns (Run History)', () => {
  function freshMgr({ now } = {}) {
    let counter = 0;
    return createAgentManager({
      adapters: { fake: makeAdapter() },
      generateRunId: () => `gen-${++counter}`,
      now,
    });
  }

  it('returns [] before any run has started', () => {
    expect(freshMgr().listRuns()).toEqual([]);
  });

  it('returns flat history entries with provider + startedAt', async () => {
    let t = 1_700_000_000_000;
    const mgr = freshMgr({ now: () => ++t });
    const r1 = await mgr.startRun(startParams);
    const r2 = await mgr.startRun({ ...startParams, questId: 'TASK-2' });
    const out = mgr.listRuns();
    // newest-first ordering
    expect(out.map((e) => e.runId)).toEqual([r2.runId, r1.runId]);
    expect(out[0]).toMatchObject({
      runId: r2.runId,
      questId: 'TASK-2',
      adventurerId: 'alpha-7',
      status: 'running',
      branch: undefined,
      contextUsed: 0,
      maxContext: 200_000,
      provider: 'fake',
    });
    expect(typeof out[0].startedAt).toBe('number');
    expect(out[0].startedAt).toBeGreaterThan(out[1].startedAt);
  });

  it('history survives cancel; the cancelled run remains visible with status=cancelled', async () => {
    const mgr = freshMgr();
    const run = await mgr.startRun(startParams);
    await mgr.cancel(run.runId);
    // in-flight registry forgot it, but history did not
    expect(mgr.getRun(run.runId)).toBeNull();
    const out = mgr.listRuns();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ runId: run.runId, status: 'cancelled' });
  });

  it('respects { limit } and trims to the most recent N', async () => {
    const mgr = freshMgr();
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await mgr.startRun({ ...startParams, questId: `TASK-${i}` });
      ids.push(r.runId);
    }
    const out = mgr.listRuns({ limit: 3 });
    expect(out).toHaveLength(3);
    // newest-first: last three runs in reverse
    expect(out.map((e) => e.runId)).toEqual([ids[4], ids[3], ids[2]]);
  });

  it('historyLimit caps total entries (oldest pruned FIFO)', async () => {
    const mgr = createAgentManager({
      adapters: { fake: makeAdapter() },
      generateRunId: (() => { let c = 0; return () => `gen-${++c}`; })(),
      historyLimit: 3,
    });
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await mgr.startRun({ ...startParams, questId: `TASK-${i}` });
      ids.push(r.runId);
    }
    const out = mgr.listRuns();
    // oldest 2 dropped; newest 3 retained, newest-first
    expect(out.map((e) => e.runId)).toEqual([ids[4], ids[3], ids[2]]);
  });

  it('clearInFlight wipes history too', async () => {
    const mgr = freshMgr();
    await mgr.startRun(startParams);
    mgr.clearInFlight();
    expect(mgr.listRuns()).toEqual([]);
  });
});

describe('createAgentManager — provider auto-resolution', () => {
  it("resolves 'auto' to claude when both are installed (v1 default preference)", async () => {
    const codex = makeAdapter();
    const claude = makeAdapter();
    const detect = vi.fn(async () => ({
      codex: { found: true, path: '/usr/local/bin/codex' },
      claude: { found: true, path: '/usr/local/bin/claude' },
    }));
    const mgr = createAgentManager({ adapters: { codex, claude }, detect });
    await mgr.startRun({ ...startParams, provider: 'auto' });
    expect(claude.startTask).toHaveBeenCalledTimes(1);
    expect(codex.startTask).not.toHaveBeenCalled();
  });

  it("resolves 'auto' to codex when claude is not installed", async () => {
    const codex = makeAdapter();
    const claude = makeAdapter();
    const detect = vi.fn(async () => ({
      codex: { found: true, path: '/c/codex' }, claude: { found: false },
    }));
    const mgr = createAgentManager({ adapters: { codex, claude }, detect });
    await mgr.startRun({ ...startParams, provider: 'auto' });
    expect(codex.startTask).toHaveBeenCalledTimes(1);
    expect(claude.startTask).not.toHaveBeenCalled();
  });

  it("rejects 'auto' when nothing is installed", async () => {
    const detect = vi.fn(async () => ({ codex: { found: false }, claude: { found: false } }));
    const mgr = createAgentManager({
      adapters: { codex: makeAdapter(), claude: makeAdapter() },
      detect,
    });
    await expect(mgr.startRun({ ...startParams, provider: 'auto' }))
      .rejects.toThrow(/no installed agent CLI found/);
  });

  it("rejects 'auto' when no detect function was provided to the manager", async () => {
    const mgr = createAgentManager({ adapters: { codex: makeAdapter() } });
    await expect(mgr.startRun({ ...startParams, provider: 'auto' }))
      .rejects.toThrow(/requires a detect function/);
  });

  it('explicit provider names skip the detect helper entirely', async () => {
    const codex = makeAdapter();
    const detect = vi.fn(async () => { throw new Error('detect should not run'); });
    const mgr = createAgentManager({ adapters: { codex }, detect });
    await mgr.startRun({ ...startParams, provider: 'codex' });
    expect(detect).not.toHaveBeenCalled();
  });
});

describe('createAgentManager — approval flow', () => {
  async function runWith(adapter, opts = {}) {
    let counter = 0;
    const mgr = createAgentManager({
      adapters: { fake: adapter },
      generateRunId: () => `gen-${++counter}`,
      ...opts,
    });
    const run = await mgr.startRun(startParams);
    return { mgr, run };
  }

  it('listPendingApprovals starts empty', async () => {
    const { mgr } = await runWith(makeAdapter());
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it("requestApproval pauses until approveRun resolves with 'approved'", async () => {
    const { mgr, run } = await runWith(makeAdapter());
    const pending = mgr.requestApproval(run.runId, { files: 2 });
    expect(mgr.listPendingApprovals()).toEqual([{ runId: run.runId, summary: { files: 2 } }]);
    mgr.approveRun(run.runId);
    await expect(pending).resolves.toBe('approved');
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it("rejectRun resolves a pending approval with 'rejected'", async () => {
    const { mgr, run } = await runWith(makeAdapter());
    const pending = mgr.requestApproval(run.runId);
    mgr.rejectRun(run.runId);
    await expect(pending).resolves.toBe('rejected');
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it('requestApproval throws on unknown runId', async () => {
    const { mgr } = await runWith(makeAdapter());
    expect(() => mgr.requestApproval('nope')).toThrow(/unknown runId: nope/);
  });

  it('requestApproval throws if a request is already pending for the same run', async () => {
    const { mgr, run } = await runWith(makeAdapter());
    mgr.requestApproval(run.runId);
    expect(() => mgr.requestApproval(run.runId)).toThrow(/already has a pending approval/);
  });

  it('approveRun / rejectRun throw when no approval is pending for the runId', async () => {
    const { mgr, run } = await runWith(makeAdapter());
    expect(() => mgr.approveRun(run.runId)).toThrow(/no pending approval/);
    expect(() => mgr.rejectRun(run.runId)).toThrow(/no pending approval/);
  });

  it("cancel auto-rejects a pending approval (so the adapter doesn't await forever)", async () => {
    const { mgr, run } = await runWith(makeAdapter());
    const pending = mgr.requestApproval(run.runId);
    await mgr.cancel(run.runId);
    await expect(pending).resolves.toBe('rejected');
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it('clearInFlight also forgets pending approvals', async () => {
    const { mgr, run } = await runWith(makeAdapter());
    mgr.requestApproval(run.runId);
    mgr.clearInFlight();
    expect(mgr.listPendingApprovals()).toEqual([]);
  });
});

describe('createAgentManager — pre-flight approval gate (BUG-004)', () => {
  // Adapter that echoes the manager-assigned runId, like the real CLI adapters.
  const echoAdapter = (over = {}) => makeAdapter({
    startTask: vi.fn(async (p) => ({
      runId: p.runId || 'gen', questId: p.questId, adventurerId: p.adventurerId,
      status: 'done', contextUsed: 0, maxContext: 200000, branch: p.branch,
    })),
    ...over,
  });

  it('emits needsApproval and does not spawn until approveRun', async () => {
    const emitEvent = vi.fn();
    const adapter = echoAdapter();
    const mgr = createAgentManager({ adapters: { fake: adapter }, emitEvent });
    const promise = mgr.startRun({ ...startParams, approvalMode: 'ask' });
    await Promise.resolve();
    // Gate is open: the CLI has NOT been spawned yet.
    expect(adapter.startTask).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledTimes(1);
    const evt = emitEvent.mock.calls[0][0];
    expect(evt.event.payload.needsApproval).toBe(true);
    expect(evt.event.payload.summary.text).toBe('do the thing');
    const pendId = evt.runId;
    expect(mgr.listPendingApprovals().map((x) => x.runId)).toContain(pendId);

    mgr.approveRun(pendId);
    const run = await promise;
    expect(adapter.startTask).toHaveBeenCalledTimes(1);
    expect(adapter.startTask.mock.calls[0][0].runId).toBe(pendId);
    expect(run.runId).toBe(pendId);
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it('rejecting the run prevents the CLI from ever spawning', async () => {
    const adapter = echoAdapter();
    const mgr = createAgentManager({ adapters: { fake: adapter }, emitEvent: vi.fn() });
    const promise = mgr.startRun({ ...startParams, approvalMode: 'ask' });
    await Promise.resolve();
    const pendId = mgr.listPendingApprovals()[0].runId;
    mgr.rejectRun(pendId);
    await expect(promise).rejects.toThrow(/rejected/i);
    expect(adapter.startTask).not.toHaveBeenCalled();
    expect(mgr.listPendingApprovals()).toEqual([]);
  });

  it('persists the rejected run so the cancelled record survives a restart (FEAT-008)', async () => {
    const persist = vi.fn();
    const adapter = echoAdapter();
    const mgr = createAgentManager({ adapters: { fake: adapter }, emitEvent: vi.fn(), persist });
    const promise = mgr.startRun({ ...startParams, approvalMode: 'ask' });
    await Promise.resolve();
    const pendId = mgr.listPendingApprovals()[0].runId;
    mgr.rejectRun(pendId);
    await expect(promise).rejects.toThrow(/rejected/i);
    expect(persist).toHaveBeenCalled();
    const persisted = persist.mock.calls.at(-1)[0];
    expect(persisted.find((r) => r.runId === pendId)).toMatchObject({ status: 'cancelled' });
  });

  it('does not gate when approvalMode is absent (back-compat)', async () => {
    const adapter = echoAdapter();
    const emitEvent = vi.fn();
    const mgr = createAgentManager({ adapters: { fake: adapter }, emitEvent });
    await mgr.startRun({ ...startParams });
    expect(adapter.startTask).toHaveBeenCalledTimes(1);
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('createAgentManager — run persistence (FEAT-008)', () => {
  const seed = [{
    runId: 'old-1', questId: 'q', adventurerId: 'a', status: 'done',
    provider: 'claude', branch: 'main', startedAt: 1,
    events: [{ runId: 'old-1', t: '00:00', kind: 'edit', text: 'claude: prior run' }],
  }];

  it('seeds history from initialRuns so past runs show in listRuns', () => {
    const mgr = createAgentManager({ adapters: { fake: makeAdapter() }, initialRuns: seed });
    const out = mgr.listRuns();
    expect(out.map((r) => r.runId)).toContain('old-1');
    expect(out.find((r) => r.runId === 'old-1')).toMatchObject({ status: 'done', provider: 'claude' });
  });

  it('replays a historical run\'s events and serves empty diff/checks (no live adapter)', async () => {
    const mgr = createAgentManager({ adapters: { fake: makeAdapter() }, initialRuns: seed });
    const events = await mgr.getEvents('old-1');
    expect(events).toEqual(seed[0].events);
    expect(await mgr.produceDiff('old-1')).toEqual({ files: [] });
    expect(await mgr.runChecks('old-1')).toEqual([]);
  });

  it('still throws for a truly unknown runId', async () => {
    const mgr = createAgentManager({ adapters: { fake: makeAdapter() }, initialRuns: seed });
    await expect(mgr.getEvents('ghost')).rejects.toThrow(/unknown runId/);
    expect(() => mgr.streamEvents('ghost')).toThrow(/unknown runId/);
  });

  it('persists run history after a run settles', async () => {
    const persist = vi.fn();
    const adapter = makeAdapter({
      startTask: vi.fn(async (p) => ({ runId: p.runId || 'gen', questId: p.questId, adventurerId: p.adventurerId, status: 'done', contextUsed: 0, maxContext: 1 })),
      streamEvents: vi.fn(() => (async function* () { yield { runId: 'x', t: '00:00', kind: 'edit', text: 'done' }; })()),
    });
    const mgr = createAgentManager({ adapters: { fake: adapter }, persist });
    await mgr.startRun({ ...startParams });
    // captureWhenDone fires getEvents then persist on the microtask queue.
    await new Promise((r) => setImmediate(r));
    expect(persist).toHaveBeenCalled();
    const lastArg = persist.mock.calls.at(-1)[0];
    expect(Array.isArray(lastArg)).toBe(true);
    expect(lastArg[0]).toHaveProperty('events');
  });
});
