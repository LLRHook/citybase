import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRunStore, sanitizeRun, MAX_EVENTS_PER_RUN } from '../../electron/main/services/runStore.cjs';

const terminal = (over = {}) => ({
  runId: 'r1', questId: 'q', adventurerId: 'a', status: 'done',
  provider: 'claude', branch: 'main', startedAt: 1, events: [{ runId: 'r1', t: '00:00', kind: 'edit', text: 'claude: done' }],
  ...over,
});

describe('sanitizeRun', () => {
  it('keeps terminal runs and a flat shape', () => {
    const out = sanitizeRun(terminal());
    expect(out).toMatchObject({ runId: 'r1', status: 'done', provider: 'claude', historical: true });
    expect(out.events).toHaveLength(1);
  });

  it('drops non-terminal (running) runs', () => {
    expect(sanitizeRun(terminal({ status: 'running' }))).toBeNull();
    expect(sanitizeRun({ runId: 'x' })).toBeNull();
    expect(sanitizeRun(null)).toBeNull();
  });

  it('caps the event trail', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ runId: 'r1', t: '00:00', kind: 'edit', text: `e${i}` }));
    expect(sanitizeRun(terminal({ events: many })).events.length).toBe(MAX_EVENTS_PER_RUN);
  });
});

function memStore() {
  const files = new Map();
  const readFile = vi.fn(async (p) => {
    if (!files.has(p)) { const e = new Error('no'); e.code = 'ENOENT'; throw e; }
    return files.get(p);
  });
  const writeFile = vi.fn(async (p, data) => { files.set(p, data); });
  const mkdir = vi.fn(async () => {});
  const rename = vi.fn(async (from, to) => { files.set(to, files.get(from)); files.delete(from); });
  const store = createRunStore({ userDataDir: '/ud', readFile, writeFile, mkdir, rename });
  return { store, files, readFile, writeFile, rename };
}

describe('createRunStore', () => {
  it('round-trips terminal runs through save + load', async () => {
    const { store } = memStore();
    await store.save([terminal({ runId: 'a' }), terminal({ runId: 'b', status: 'running' })]);
    const loaded = await store.load();
    // Only the terminal run persists.
    expect(loaded.map((r) => r.runId)).toEqual(['a']);
    expect(loaded[0].historical).toBe(true);
  });

  it('writes atomically via a temp file + rename', async () => {
    const { store, rename } = memStore();
    await store.save([terminal()]);
    const [from, to] = rename.mock.calls[0];
    expect(from.endsWith('runs.json.tmp')).toBe(true);
    expect(to.endsWith('runs.json')).toBe(true);
    expect(to.endsWith('.tmp')).toBe(false);
  });

  it('serializes concurrent saves so writes never interleave on the temp file', async () => {
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((r) => { releaseFirst = r; });
    let writes = 0;
    const writeFile = vi.fn(async () => {
      writes += 1;
      const n = writes;
      order.push(`start${n}`);
      if (n === 1) await firstGate; // park the first write mid-flight
      order.push(`end${n}`);
    });
    const store = createRunStore({
      userDataDir: '/ud', readFile: vi.fn(), writeFile, mkdir: vi.fn(async () => {}), rename: vi.fn(async () => {}),
    });
    const p1 = store.save([terminal({ runId: 'a' })]);
    const p2 = store.save([terminal({ runId: 'b' })]);
    // Flush microtasks: the first write should be in flight, the second queued.
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['start1']);
    releaseFirst();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('keeps the chain alive when a save rejects (next save still runs)', async () => {
    let writes = 0;
    const writeFile = vi.fn(async () => {
      writes += 1;
      if (writes === 1) throw new Error('disk full');
    });
    const store = createRunStore({
      userDataDir: '/ud', readFile: vi.fn(), writeFile, mkdir: vi.fn(async () => {}), rename: vi.fn(async () => {}),
    });
    await expect(store.save([terminal({ runId: 'a' })])).rejects.toThrow(/disk full/);
    await expect(store.save([terminal({ runId: 'b' })])).resolves.toBeTruthy();
    expect(writes).toBe(2);
  });

  it('returns [] when the file is missing or corrupt', async () => {
    const { store, files } = memStore();
    expect(await store.load()).toEqual([]);
    files.set(store.file, 'not json{');
    expect(await store.load()).toEqual([]);
  });

  it('restores valid runs and events when one saved trail contains malformed entries', async () => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'citybase-runs-'));
    try {
      const store = createRunStore({ userDataDir });
      const validEvent = terminal().events[0];
      await writeFile(store.file, JSON.stringify([
        terminal({ runId: 'before' }),
        terminal({ runId: 'damaged', events: [null, 42, 'noise', [], validEvent, false] }),
        terminal({ runId: 'after' }),
      ]));

      for (const restored of [await store.load(), store.loadSync()]) {
        expect(restored.map((r) => r.runId)).toEqual(['before', 'damaged', 'after']);
        expect(restored[1].events).toEqual([validEvent]);
      }
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  it('saves valid history despite malformed events and caps the valid trail', async () => {
    const { store, files } = memStore();
    const events = Array.from({ length: MAX_EVENTS_PER_RUN }, (_, i) => ({
      runId: 'r1', t: '00:00', kind: 'edit', text: `event ${i}`,
    }));
    await store.save([
      terminal({ runId: 'before' }),
      terminal({ events: [null, ...events, ...Array(100).fill(null)] }),
    ]);

    const saved = JSON.parse(files.get(store.file));
    expect(saved.map((r) => r.runId)).toEqual(['before', 'r1']);
    expect(saved[1].events).toEqual(events);
    expect(await store.load()).toEqual(saved);
  });

  it('preserves the last valid file when an atomic replacement fails', async () => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'citybase-runs-'));
    try {
      const store = createRunStore({ userDataDir });
      await store.save([terminal({ runId: 'saved' })]);
      const before = await readFile(store.file, 'utf8');
      const failing = createRunStore({
        userDataDir,
        rename: async () => { throw new Error('rename failed'); },
      });

      await expect(failing.save([terminal({ runId: 'new' })])).rejects.toThrow('rename failed');
      expect(await readFile(store.file, 'utf8')).toBe(before);
      expect(store.loadSync().map((r) => r.runId)).toEqual(['saved']);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  it('requires userDataDir', () => {
    expect(() => createRunStore({})).toThrow(/userDataDir/);
  });
});
