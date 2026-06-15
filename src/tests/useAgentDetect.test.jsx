import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAgentDetect } from '../app/useAgentDetect.js';

function Probe({ api, initial }) {
  const state = useAgentDetect({ api, initial });
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="codex">{String(state.result.codex.found)}</span>
      <span data-testid="codex-path">{state.result.codex.path || ''}</span>
      <span data-testid="claude">{String(state.result.claude.found)}</span>
      <span data-testid="error">{state.error?.message || ''}</span>
    </div>
  );
}

function makeApi(impl) {
  return {
    agents: { detect: impl },
  };
}

describe('useAgentDetect', () => {
  it('starts in pending and transitions to ready with the detect result', async () => {
    const api = makeApi(vi.fn(async () => ({
      codex: { found: true, path: '/usr/local/bin/codex' },
      claude: { found: false },
    })));
    render(<Probe api={api} />);
    expect(screen.getByTestId('status').textContent).toBe('pending');
    expect(screen.getByTestId('codex').textContent).toBe('false');
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });
    expect(screen.getByTestId('codex').textContent).toBe('true');
    expect(screen.getByTestId('codex-path').textContent).toBe('/usr/local/bin/codex');
    expect(screen.getByTestId('claude').textContent).toBe('false');
    expect(api.agents.detect).toHaveBeenCalledTimes(1);
  });

  it('uses the empty result when both are missing', async () => {
    const api = makeApi(vi.fn(async () => ({
      codex: { found: false }, claude: { found: false },
    })));
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });
    expect(screen.getByTestId('codex').textContent).toBe('false');
    expect(screen.getByTestId('claude').textContent).toBe('false');
  });

  it('falls back to the empty result when the bridge resolves to null', async () => {
    const api = makeApi(vi.fn(async () => null));
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });
    expect(screen.getByTestId('codex').textContent).toBe('false');
    expect(screen.getByTestId('claude').textContent).toBe('false');
  });

  it('transitions to error when the bridge rejects', async () => {
    const api = makeApi(vi.fn(async () => { throw new Error('bridge offline'); }));
    render(<Probe api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error');
    });
    expect(screen.getByTestId('error').textContent).toBe('bridge offline');
    expect(screen.getByTestId('codex').textContent).toBe('false');
  });

  it('paints instantly from the initial seed, then confirms in the background', async () => {
    // Boot seed says both installed; the live probe later corrects codex away.
    const api = makeApi(vi.fn(async () => ({
      codex: { found: false },
      claude: { found: true, path: '/live/claude' },
    })));
    render(<Probe api={api} initial={{
      codex: { found: true, path: '/from/boot/codex' },
      claude: { found: true, path: '/from/boot/claude' },
    }} />);
    // Instant first paint from the seed — no awaiting.
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('codex').textContent).toBe('true');
    // Background confirm runs and self-heals the seed (the bug fix).
    await waitFor(() => {
      expect(screen.getByTestId('codex').textContent).toBe('false');
    });
    expect(screen.getByTestId('claude').textContent).toBe('true');
    expect(api.agents.detect).toHaveBeenCalledTimes(1);
  });

  it('keeps a good seed when the background probe returns null', async () => {
    const api = makeApi(vi.fn(async () => null));
    render(<Probe api={api} initial={{
      codex: { found: true, path: '/boot/codex' },
      claude: { found: true, path: '/boot/claude' },
    }} />);
    expect(screen.getByTestId('status').textContent).toBe('ready');
    await Promise.resolve();
    await waitFor(() => expect(api.agents.detect).toHaveBeenCalledTimes(1));
    // The transient null must not wipe the good seed.
    expect(screen.getByTestId('codex').textContent).toBe('true');
    expect(screen.getByTestId('claude').textContent).toBe('true');
  });

  it('falls back to the IPC roundtrip when initial is malformed', async () => {
    const api = makeApi(vi.fn(async () => ({
      codex: { found: false }, claude: { found: true, path: '/c' },
    })));
    render(<Probe api={api} initial={{ wrongShape: true }} />);
    expect(screen.getByTestId('status').textContent).toBe('pending');
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });
    expect(api.agents.detect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('claude').textContent).toBe('true');
  });

  it('does not write back state if the component unmounts before resolve', async () => {
    let resolveDetect;
    const detect = vi.fn(() => new Promise((r) => { resolveDetect = r; }));
    const api = makeApi(detect);
    const { unmount } = render(<Probe api={api} />);
    expect(screen.getByTestId('status').textContent).toBe('pending');
    unmount();
    resolveDetect({ codex: { found: true }, claude: { found: false } });
    // Give the promise a tick. The component is unmounted, so any
    // setState would be a no-op already; we're just confirming nothing
    // throws and the test runner doesn't see a 'setState on unmounted'
    // warning crash.
    await Promise.resolve();
  });
});
