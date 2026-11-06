import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAgentManager } from '../../electron/main/agents/agentManager.cjs';
import { createRunStore, MAX_RUNS } from '../../electron/main/services/runStore.cjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const terminal = (runId, status = 'done') => ({ runId, status, events: [] });

let nextRunId = 0;

function adapter() {
  const runs = new Map();
  return {
    startTask: vi.fn(async ({ status = 'done', runId = `fixture-${++nextRunId}` }) => {
      const run = terminal(runId, status);
      runs.set(runId, run);
      return run;
    }),
    streamEvents: () => (async function* () {})(),
    cancel: async (runId) => { runs.get(runId).status = 'cancelled'; },
    reportUsage: async () => ({}), produceDiff: async () => ({ files: [] }),
    runChecks: async () => [], openPR: async () => ({}),
  };
}

async function withProfile(fn) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'citybase-progression-'));
  try { await fn(userDataDir); } finally { await rm(userDataDir, { recursive: true, force: true }); }
}

function host(userDataDir, options = {}) {
  const store = createRunStore({ userDataDir });
  const state = store.loadStateSync();
  let saving = Promise.resolve();
  const mgr = createAgentManager({
    adapters: { fake: adapter() }, ...options,
    initialRuns: state.runs, initialProgression: state.progression,
    persist: (runs, progression) => { saving = store.save(runs, progression); },
  });
  return { store, mgr, flush: async () => { await tick(); await saving; } };
}

const level = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;

describe('recorded progression across pruning and restart (BUG-037)', () => {
  it('keeps all earned XP beyond both history limits and after restart', async () => withProfile(async (dir) => {
    let current = host(dir);
    for (let i = 0; i < MAX_RUNS + 25; i++) {
      await current.mgr.startRun({ provider: 'fake' });
      await current.flush();
    }
    const earned = (MAX_RUNS + 25) * 25;
    expect(current.mgr.listRuns()).toHaveLength(50);
    expect(current.store.loadSync()).toHaveLength(MAX_RUNS);
    expect(current.mgr.getProgression()).toEqual({ xp: earned });
    current = host(dir);
    expect(current.mgr.getProgression()).toEqual({ xp: earned });
    // New cancellations displace every success from both activity windows.
    for (let i = 0; i < MAX_RUNS + 1; i++) {
      await current.mgr.startRun({ provider: 'fake', status: 'cancelled' });
      await current.flush();
      expect(level(current.mgr.getProgression().xp)).toBeGreaterThanOrEqual(level(earned));
    }
    expect(current.store.loadSync().every((r) => r.status === 'cancelled')).toBe(true);
    expect(host(dir).mgr.getProgression()).toEqual({ xp: earned + (MAX_RUNS + 1) * 2 });
  }));

  it('does not invoke an adapter when cancelling at the approval gate', async () => withProfile(async (dir) => {
    const fake = adapter();
    fake.cancel = vi.fn();
    const current = host(dir, { adapters: { fake } });
    const starting = current.mgr.startRun({ provider: 'fake', approvalMode: 'ask' });
    const runId = current.mgr.listPendingApprovals()[0].runId;
    await current.mgr.cancel(runId);
    await expect(starting).rejects.toMatchObject({ code: 'REJECTED' });
    await current.flush();
    expect(fake.startTask).not.toHaveBeenCalled();
    expect(fake.cancel).not.toHaveBeenCalled();
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 2 });
  }));

  it('counts a live run that settles after its history entry was evicted', async () => {
    const fake = adapter();
    const endings = [];
    fake.streamEvents = () => (async function* () {
      await new Promise((resolve) => endings.push(resolve));
    })();
    const mgr = createAgentManager({ adapters: { fake }, historyLimit: 1 });
    await mgr.startRun({ provider: 'fake' });
    await mgr.startRun({ provider: 'fake' });
    endings.reverse().forEach((resolve) => resolve());
    await tick();
    expect(mgr.listRuns()).toHaveLength(1);
    expect(mgr.getProgression()).toEqual({ xp: 50 });
  });

  it('persists rejection without spawning and restores its recorded XP once', async () => withProfile(async (dir) => {
    const fake = adapter();
    const current = host(dir, { adapters: { fake } });
    const starting = current.mgr.startRun({ provider: 'fake', approvalMode: 'ask' });
    current.mgr.rejectRun(current.mgr.listPendingApprovals()[0].runId);
    await expect(starting).rejects.toMatchObject({ code: 'REJECTED' });
    await current.flush();
    expect(fake.startTask).not.toHaveBeenCalled();
    const restored = host(dir);
    expect(restored.mgr.listRuns()[0].status).toBe('cancelled');
    expect(restored.mgr.getProgression()).toEqual({ xp: 2 });
    await restored.store.save([], restored.mgr.getProgression());
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 2 });
  }));

  it('records cancellation once even when the event stream finishes later', async () => withProfile(async (dir) => {
    const fake = adapter();
    let finish;
    fake.streamEvents = () => (async function* () { await new Promise((resolve) => { finish = resolve; }); })();
    const current = host(dir, { adapters: { fake }, historyLimit: 0 });
    const run = await current.mgr.startRun({ provider: 'fake', status: 'running' });
    await current.mgr.cancel(run.runId);
    await current.flush();
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 2 });
    finish();
    await current.flush();
    expect(current.mgr.getProgression()).toEqual({ xp: 2 });
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 2 });
  }));

  it('does not invent completion or XP when an event stream ends while still running', async () => {
    const mgr = createAgentManager({ adapters: { fake: adapter() } });
    await mgr.startRun({ provider: 'fake', status: 'running' });
    await tick();
    expect(mgr.getProgression()).toEqual({ xp: 0 });
  });

  it('migrates only recoverable unique terminal history and never recounts it', async () => withProfile(async (dir) => {
    const legacy = [terminal('a'), terminal('b', 'failed'), terminal('c', 'cancelled'), terminal('a'), terminal('live', 'running'), null];
    const store = createRunStore({ userDataDir: dir });
    await writeFile(store.file, JSON.stringify(legacy));
    const current = host(dir);
    expect(current.mgr.getProgression()).toEqual({ xp: 32 });
    await current.mgr.startRun({ provider: 'fake' });
    await current.flush();
    const state = JSON.parse(await readFile(store.file, 'utf8'));
    expect(state).toMatchObject({ version: 2, progression: { xp: 57 } });
    expect(state.runs).toHaveLength(4);
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 57 });
    expect((await store.loadState()).progression).toEqual({ xp: 57 });
  }));

  it.each([-1, '9000', 1.5, null])('falls back to observed history for invalid aggregate %s', async (xp) => withProfile(async (dir) => {
    const store = createRunStore({ userDataDir: dir });
    await writeFile(store.file, JSON.stringify({ version: 2, progression: { xp }, runs: [terminal('a')] }));
    expect(store.loadStateSync().progression).toEqual({ xp: 25 });
    expect((await store.loadState()).progression).toEqual({ xp: 25 });
  }));

  it('atomically preserves both history and earned XP when replacement fails', async () => withProfile(async (dir) => {
    const current = host(dir);
    await current.mgr.startRun({ provider: 'fake' });
    await current.flush();
    const before = await readFile(current.store.file, 'utf8');
    const broken = createRunStore({ userDataDir: dir, rename: async () => { throw new Error('fixture rename failure'); } });
    await expect(broken.save([terminal('b')], { xp: 5000 })).rejects.toThrow('fixture rename failure');
    expect(await readFile(current.store.file, 'utf8')).toBe(before);
    expect(host(dir).mgr.getProgression()).toEqual({ xp: 25 });
  }));
});
