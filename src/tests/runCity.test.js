import { describe, it, expect } from 'vitest';
import { runPhase, activePathsForRun, activeRunFrom, touchedPathsFromEvents, toRepoRelative } from '../app/runCity.js';

describe('runPhase', () => {
  it('is idle with no run', () => {
    expect(runPhase(null).phase).toBe('idle');
  });

  it('maps terminal statuses directly', () => {
    expect(runPhase({ status: 'done' }).phase).toBe('done');
    expect(runPhase({ status: 'failed' }).phase).toBe('failed');
    expect(runPhase({ status: 'cancelled' }).phase).toBe('cancelled');
  });

  it('derives the phase from the latest event kind while running', () => {
    const run = { status: 'running' };
    expect(runPhase(run, [{ kind: 'plan' }]).phase).toBe('planning');
    expect(runPhase(run, [{ kind: 'plan' }, { kind: 'edit' }]).phase).toBe('editing');
    expect(runPhase(run, [{ kind: 'edit' }, { kind: 'test' }]).phase).toBe('testing');
  });

  it('flags an error event as failed phase even mid-run', () => {
    expect(runPhase({ status: 'running' }, [{ kind: 'edit' }, { kind: 'error' }]).phase).toBe('failed');
  });

  it('reports starting before any recognizable event', () => {
    expect(runPhase({ status: 'running' }, []).phase).toBe('starting');
  });
});

describe('activePathsForRun', () => {
  const snapshot = { files: [{ path: 'src/App.jsx' }, { path: 'README.md' }] };

  it('returns dirty paths while a run is running', () => {
    expect(activePathsForRun({ status: 'running' }, snapshot)).toEqual(['src/App.jsx', 'README.md']);
  });

  it('returns nothing when no run is active or the run is terminal', () => {
    expect(activePathsForRun(null, snapshot)).toEqual([]);
    expect(activePathsForRun({ status: 'done' }, snapshot)).toEqual([]);
  });

  it('is safe when the snapshot has no files', () => {
    expect(activePathsForRun({ status: 'running' }, null)).toEqual([]);
  });
});

describe('activeRunFrom', () => {
  it('finds the running run', () => {
    const runs = [{ runId: 'a', status: 'done' }, { runId: 'b', status: 'running' }];
    expect(activeRunFrom(runs).runId).toBe('b');
  });
  it('returns null when none are running', () => {
    expect(activeRunFrom([{ status: 'done' }])).toBeNull();
    expect(activeRunFrom(null)).toBeNull();
  });
});

describe('touchedPathsFromEvents', () => {
  it('extracts file paths from edit tool-use events', () => {
    const events = [
      { kind: 'plan', text: 'started' },
      { kind: 'edit', text: 'claude: thinking' },
      { kind: 'edit', text: 'claude: Edit src/a.js', payload: { path: 'src/a.js', tool: 'Edit' } },
      { kind: 'edit', text: 'claude: Write new.txt', payload: { path: 'new.txt', tool: 'Write' } },
    ];
    expect(touchedPathsFromEvents(events)).toEqual(['src/a.js', 'new.txt']);
  });

  it('skips read-only tools and events without a path', () => {
    const events = [
      { kind: 'edit', payload: { path: 'src/r.js', tool: 'Read' } },
      { kind: 'edit', payload: { tool: 'Edit' } },
      { kind: 'edit', text: 'no payload' },
    ];
    expect(touchedPathsFromEvents(events)).toEqual([]);
  });

  it('is safe on non-arrays', () => {
    expect(touchedPathsFromEvents(null)).toEqual([]);
  });
});

describe('toRepoRelative', () => {
  it('strips the workspace root and normalizes separators', () => {
    expect(toRepoRelative(String.raw`C:\repo\src\a.js`, String.raw`C:\repo`)).toBe('src/a.js');
    expect(toRepoRelative('/home/u/repo/src/a.js', '/home/u/repo')).toBe('src/a.js');
  });
  it('tolerates a trailing slash on the root', () => {
    expect(toRepoRelative('/repo/x.js', '/repo/')).toBe('x.js');
  });
  it('falls back to a normalized path when not under the root', () => {
    expect(toRepoRelative(String.raw`D:\other\x.js`, String.raw`C:\repo`)).toBe('D:/other/x.js');
  });
});
