import { describe, expect, it } from 'vitest';
import { projectSnapshotToActivity, formatCommitTime } from '../app/activity.js';

const NOW = new Date('2026-05-09T12:00:00Z').getTime();

describe('formatCommitTime', () => {
  it('returns "—" when the timestamp is missing or unparseable', () => {
    expect(formatCommitTime(null, NOW)).toBe('—');
    expect(formatCommitTime(undefined, NOW)).toBe('—');
    expect(formatCommitTime('not-a-date', NOW)).toBe('—');
  });

  it('renders sub-hour deltas as Xm', () => {
    const iso = new Date(NOW - 12 * 60_000).toISOString();
    expect(formatCommitTime(iso, NOW)).toBe('12m');
  });

  it('clamps negative deltas (clock skew) to 0m', () => {
    const iso = new Date(NOW + 60_000).toISOString();
    expect(formatCommitTime(iso, NOW)).toBe('0m');
  });

  it('renders sub-day deltas as Xh', () => {
    const iso = new Date(NOW - 5 * 60 * 60_000).toISOString();
    expect(formatCommitTime(iso, NOW)).toBe('5h');
  });

  it('renders older deltas as HH:MM in local time', () => {
    const iso = '2026-05-01T15:07:00Z';
    const out = formatCommitTime(iso, NOW);
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('projectSnapshotToActivity', () => {
  it('returns [] for missing or non-object snapshots', () => {
    expect(projectSnapshotToActivity(null)).toEqual([]);
    expect(projectSnapshotToActivity(undefined)).toEqual([]);
    expect(projectSnapshotToActivity(42)).toEqual([]);
  });

  it('emits one item per commit with the kind="quest" sigil', () => {
    const items = projectSnapshotToActivity({
      recentCommits: [
        { hash: 'abc1234', title: 'feat: city projector', committedAt: new Date(NOW - 10 * 60_000).toISOString() },
        { hash: 'def5678', title: 'chore: bump deps', committedAt: new Date(NOW - 30 * 60_000).toISOString() },
      ],
      files: [],
    }, { now: NOW });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ t: '10m', kind: 'quest', text: 'feat: city projector · abc1234' });
    expect(items[1]).toMatchObject({ t: '30m', kind: 'quest', text: 'chore: bump deps · def5678' });
  });

  it('places working-tree changes above commit history', () => {
    const items = projectSnapshotToActivity({
      recentCommits: [
        { hash: 'aaa', title: 'old commit', committedAt: new Date(NOW - 30 * 60_000).toISOString() },
      ],
      files: [{ path: 'src/App.jsx', status: 'modified' }],
    }, { now: NOW });
    expect(items[0].text).toContain('App.jsx');
    expect(items[0].t).toBe('now');
    expect(items[1].text).toContain('old commit');
  });

  it('maps file status to feed kind', () => {
    const items = projectSnapshotToActivity({
      recentCommits: [],
      files: [
        { path: 'a.js', status: 'added' },
        { path: 'b.js', status: 'deleted' },
        { path: 'c.js', status: 'modified' },
        { path: 'd.js', status: 'conflicted' },
        { path: 'e.js', status: 'untracked' },
      ],
    }, { now: NOW });
    expect(items.map(i => i.kind)).toEqual(['good', 'bad', 'quest', 'bad', 'good']);
  });

  it('truncates to the configured limit, dirty entries first', () => {
    const recentCommits = Array.from({ length: 20 }, (_, i) => ({
      hash: `c${i}`, title: `commit ${i}`,
      committedAt: new Date(NOW - i * 60_000).toISOString(),
    }));
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.js`, status: 'modified' }));
    const items = projectSnapshotToActivity({ recentCommits, files }, { now: NOW, limit: 6 });
    expect(items).toHaveLength(6);
    expect(items.slice(0, 5).every(i => i.t === 'now')).toBe(true);
    expect(items[5].text).toContain('commit 0');
  });

  it('survives commits with empty title or missing hash', () => {
    const items = projectSnapshotToActivity({
      recentCommits: [
        { hash: 'aaa', title: '', committedAt: null },
        { hash: '', title: 'orphan title', committedAt: null },
      ],
      files: [],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ t: '—', kind: 'quest' });
    expect(items[0].text).toMatch(/aaa/);
    expect(items[1].text).toBe('orphan title');
  });

  it('drops commits that are entirely empty (no title and no hash)', () => {
    const items = projectSnapshotToActivity({
      recentCommits: [
        { hash: '', title: '', committedAt: null },
        { hash: 'good', title: 'real one', committedAt: null },
      ],
      files: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].text).toContain('real one');
  });
});
