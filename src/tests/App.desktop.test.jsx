import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('App desktop workspace dispatch', () => {
  afterEach(() => {
    delete window.citybase;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('hydrates the saved workspace and dispatches a Codex-capable adventurer', async () => {
    let emitAgentEvent = null;
    const startRun = vi.fn(async (params) => ({
      runId: 'run-1',
      status: 'done',
      contextUsed: 0,
      maxContext: 200000,
      ...params,
    }));

    window.citybase = {
      app: {
        getVersion: async () => '0.1.0-test',
        getPlatform: async () => 'win32',
      },
      workspace: {
        pick: async () => null,
        getCurrent: async () => ({
          id: 'ws-1',
          name: 'citybase',
          rootPath: 'C:\\repo\\citybase',
        }),
        setCurrent: async () => null,
        listRecent: async () => [],
        forget: async () => undefined,
      },
      git: {
        getSnapshot: async () => ({
          workspaceId: 'ws-1',
          rootPath: 'C:\\repo\\citybase',
          branch: 'main',
          ahead: 0,
          behind: 0,
          isDirty: false,
          files: [],
          recentCommits: [],
          repoTree: ['src/App.jsx'],
          error: null,
        }),
        refresh: async () => null,
      },
      agents: {
        detect: async () => ({ codex: { found: true, path: 'C:\\bin\\codex.cmd' }, claude: { found: false } }),
        list: async () => ['codex'],
        startRun,
        cancel: async () => undefined,
        getRun: async () => null,
        reportUsage: async () => ({ contextUsed: 0, maxContext: 0 }),
        produceDiff: async () => ({ files: [] }),
        runChecks: async () => [],
        openPR: async () => { throw new Error('not implemented'); },
        approve: async () => undefined,
        reject: async () => undefined,
        listPendingApprovals: async () => [],
        onEvent: (cb) => {
          emitAgentEvent = cb;
          return () => {};
        },
      },
      menu: {
        onCommand: () => () => {},
      },
    };

    vi.resetModules();
    const { default: App } = await import('../App.jsx');
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText(/WORKSPACE/i);
    expect(await screen.findAllByText('Alpha-7')).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /DISPATCH/i }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'auto',
        adventurerId: 'alpha-7',
        skill: 'refactor',
        repoUrl: 'C:\\repo\\citybase',
        branch: 'main',
        promptContext: 'checking',
      }));
    });

    act(() => {
      emitAgentEvent({
        runId: 'run-1',
        event: {
          runId: 'run-1',
          t: '12:34',
          kind: 'pr',
          text: 'codex: Here and ready. I received checking.',
        },
      });
    });

    expect(await screen.findByText(/I received checking/i)).toBeInTheDocument();
  });
});
