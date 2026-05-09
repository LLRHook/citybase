import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRunHistory } from '../app/useRunHistory.js';

function Probe({ api }) {
  const runs = useRunHistory({ api });
  return (
    <div>
      <span data-testid="count">{runs.length}</span>
      <ul>
        {runs.map((r) => <li key={r.runId} data-testid="row">{r.runId}:{r.status}</li>)}
      </ul>
    </div>
  );
}

function makeApi({ initial = [], onEvent } = {}) {
  return {
    isDesktop: true,
    agents: {
      listRuns: vi.fn(async () => initial),
      onEvent: onEvent || vi.fn(() => () => {}),
    },
  };
}

describe('useRunHistory', () => {
  it('starts empty and populates from listRuns on mount', async () => {
    const api = makeApi({
      initial: [
        { runId: 'r1', status: 'done', provider: 'claude', startedAt: 1 },
        { runId: 'r2', status: 'running', provider: 'claude', startedAt: 2 },
      ],
    });
    render(<Probe api={api} />);
    expect(screen.getByTestId('count').textContent).toBe('0');
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('2');
    });
    expect(screen.getAllByTestId('row').map((n) => n.textContent))
      .toEqual(['r1:done', 'r2:running']);
    expect(api.agents.listRuns).toHaveBeenCalledTimes(1);
  });

  it('treats a non-array result defensively', async () => {
    const api = {
      isDesktop: true,
      agents: { listRuns: vi.fn(async () => null), onEvent: vi.fn(() => () => {}) },
    };
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('0');
    });
  });

  it('falls back to [] when listRuns rejects', async () => {
    const api = {
      isDesktop: true,
      agents: { listRuns: vi.fn(async () => { throw new Error('boom'); }), onEvent: vi.fn(() => () => {}) },
    };
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('0');
    });
    expect(api.agents.listRuns).toHaveBeenCalled();
  });

  it('refreshes whenever an agent event arrives', async () => {
    let listenerCb = null;
    const onEvent = vi.fn((cb) => { listenerCb = cb; return () => {}; });
    const api = makeApi({ initial: [], onEvent });
    // After the first call returns [], swap in a non-empty result for the
    // refresh that fires on event.
    api.agents.listRuns
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ runId: 'rx', status: 'done', provider: 'claude' }]);
    render(<Probe api={api} />);
    await waitFor(() => expect(api.agents.listRuns).toHaveBeenCalledTimes(1));
    expect(typeof listenerCb).toBe('function');
    await act(async () => {
      listenerCb({ runId: 'rx', kind: 'edit', text: 'done', t: '12:00' });
      // Let microtasks flush.
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
    expect(api.agents.listRuns).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes from the event stream on unmount', async () => {
    const off = vi.fn();
    const onEvent = vi.fn(() => off);
    const api = makeApi({ initial: [], onEvent });
    const { unmount } = render(<Probe api={api} />);
    await waitFor(() => expect(api.agents.listRuns).toHaveBeenCalled());
    unmount();
    expect(off).toHaveBeenCalled();
  });

  it('still works when the bridge has no onEvent (browser stub fallback)', async () => {
    const api = {
      isDesktop: false,
      agents: { listRuns: vi.fn(async () => [{ runId: 'r1', status: 'done', provider: 'browser' }]) },
    };
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
  });
});
