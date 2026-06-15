import { describe, it, expect, vi } from 'vitest';
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

  it('returns [] when the file is missing or corrupt', async () => {
    const { store, files } = memStore();
    expect(await store.load()).toEqual([]);
    files.set(store.file, 'not json{');
    expect(await store.load()).toEqual([]);
  });

  it('requires userDataDir', () => {
    expect(() => createRunStore({})).toThrow(/userDataDir/);
  });
});
