// RunDetail review surface: the v1 ship gate requires the default review
// surface to show NO raw code (ROADMAP Phase 4) — Outcome + Changed
// Districts are primary, hunks live in a collapsed drawer. FEAT-020: while
// the run is live, events stream incrementally into the Live Activity panel.
import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunDetail } from '../views/RunDetail.jsx';

function makeApi(overrides = {}) {
  let emit = () => {};
  const api = {
    agents: {
      onEvent: vi.fn((cb) => { emit = cb; return () => {}; }),
      getEvents: vi.fn(async () => []),
      produceDiff: vi.fn(async () => ({
        files: [
          { file: 'src/game/hex.js', kind: 'modify', additions: 12, deletions: 3,
            hunks: [{ type: 'add', code: 'const SECRET_HUNK = 1;' }] },
          { file: 'README.md', kind: 'add', additions: 5, deletions: 0, hunks: [] },
        ],
      })),
      runChecks: vi.fn(async () => [{ name: 'lint · npm run lint', state: 'pass', meta: 'clean' }]),
      openPR: vi.fn(),
      ...(overrides.agents || {}),
    },
  };
  return { api, emitEvent: (evt) => emit(evt) };
}

const doneRun = {
  runId: 'run-abcdef123456', status: 'done', provider: 'claude',
  branch: 'main', startedAt: 1_700_000_000_000, questId: 'q-1',
};
const runningRun = { ...doneRun, status: 'running' };

describe('RunDetail — no-code review surface (Phase 4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a terminal run shows Outcome and Changed Districts, and no raw hunks by default', async () => {
    const { api } = makeApi();
    render(<RunDetail run={doneRun} citybaseApi={api} onCloseRun={() => {}} />);

    expect(await screen.findByText('Outcome')).toBeInTheDocument();
    expect(screen.getByText('Changed Districts')).toBeInTheDocument();

    // Districts speak city language: grouped areas, not code.
    await screen.findByText('◍ src');
    expect(screen.getByText('◍ core')).toBeInTheDocument();

    // The raw hunk content must not be visible until the drawer is opened.
    const drawer = screen.getByTestId('drawer-raw-diff');
    expect(drawer).not.toHaveAttribute('open');
    expect(drawer).toHaveTextContent('Raw diff (advanced)');
  });

  it('the outcome reports risk with reasons and churn totals', async () => {
    const { api } = makeApi();
    render(<RunDetail run={doneRun} citybaseApi={api} onCloseRun={() => {}} />);
    expect(await screen.findByText(/risk · low/i)).toBeInTheDocument();
    expect(screen.getByText(/2 files · \+17 \/ -3 · 2 districts/)).toBeInTheDocument();
  });

  it('failing checks escalate the displayed risk', async () => {
    const { api } = makeApi({
      agents: { runChecks: vi.fn(async () => [{ name: 'test', state: 'fail', meta: 'exit 1' }]) },
    });
    render(<RunDetail run={doneRun} citybaseApi={api} onCloseRun={() => {}} />);
    expect(await screen.findByText(/risk · high/i)).toBeInTheDocument();
  });

  it('the agent log is a collapsed drawer on terminal runs', async () => {
    const { api } = makeApi({
      agents: { getEvents: vi.fn(async () => [{ runId: doneRun.runId, t: '00:01', kind: 'plan', text: 'did the thing' }]) },
    });
    render(<RunDetail run={doneRun} citybaseApi={api} onCloseRun={() => {}} />);
    await screen.findByText('Outcome');
    const drawer = screen.getByTestId('drawer-agent-log');
    expect(drawer).not.toHaveAttribute('open');
  });
});

describe('RunDetail — streaming run detail (FEAT-020)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a running run shows Live Activity with the working indicator, not Outcome', () => {
    const { api } = makeApi();
    render(<RunDetail run={runningRun} citybaseApi={api} onCloseRun={() => {}} />);
    expect(screen.getByText('Live Activity')).toBeInTheDocument();
    expect(screen.getByText(/agent working — events stream in live/i)).toBeInTheDocument();
    expect(screen.queryByText('Outcome')).not.toBeInTheDocument();
    expect(api.agents.produceDiff).not.toHaveBeenCalled();
  });

  it('events append incrementally as they stream in', async () => {
    const { api, emitEvent } = makeApi();
    render(<RunDetail run={runningRun} citybaseApi={api} onCloseRun={() => {}} />);
    expect(screen.getByText(/waiting for first event…/i)).toBeInTheDocument();

    act(() => emitEvent({ runId: runningRun.runId, event: { runId: runningRun.runId, t: '00:01', kind: 'plan', text: 'reading files' } }));
    expect(await screen.findByText('reading files')).toBeInTheDocument();

    act(() => emitEvent({ runId: runningRun.runId, event: { runId: runningRun.runId, t: '00:02', kind: 'edit', text: 'editing hex.js' } }));
    expect(await screen.findByText('editing hex.js')).toBeInTheDocument();
    expect(screen.getByText('reading files')).toBeInTheDocument();
    expect(screen.queryByText(/waiting for first event…/i)).not.toBeInTheDocument();
  });

  it('terminal state loads diff and checks, with getEvents as the re-mount backstop', async () => {
    const { api } = makeApi({
      agents: { getEvents: vi.fn(async () => [{ runId: doneRun.runId, t: '00:03', kind: 'pr', text: 'final summary text' }]) },
    });
    render(<RunDetail run={doneRun} citybaseApi={api} onCloseRun={() => {}} />);
    await waitFor(() => {
      expect(api.agents.produceDiff).toHaveBeenCalledWith(doneRun.runId);
      expect(api.agents.runChecks).toHaveBeenCalledWith(doneRun.runId);
      expect(api.agents.getEvents).toHaveBeenCalledWith(doneRun.runId);
    });
    // The backstopped final event feeds the Outcome summary (it also
    // appears in the collapsed agent-log drawer, hence findAllByText).
    expect((await screen.findAllByText('final summary text')).length).toBeGreaterThan(0);
  });
});
