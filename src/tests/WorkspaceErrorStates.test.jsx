// BUG-007 / ship gate FR-V9: broken workspace and git states must render as
// explicit error surfaces with retry/pick affordances — never as a healthy,
// empty city. Covers: non-repo folder, snapshot IPC failure, and a workspace
// operation failure on hydrate.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const desktopBridge = {
  app: {
    getVersion: vi.fn(async () => '1.0.0'),
    getPlatform: vi.fn(async () => 'darwin'),
    onBoot: vi.fn(() => () => {}),
    getBoot: vi.fn(() => null),
  },
  workspace: {
    pick: vi.fn(),
    getCurrent: vi.fn(async () => ({ id: 'ws-1', rootPath: '/Users/v/code/demo', name: 'demo' })),
    setCurrent: vi.fn(),
    listRecent: vi.fn(async () => []),
    forget: vi.fn(),
  },
  git: {
    getSnapshot: vi.fn(async () => ({
      workspaceId: 'ws-1', rootPath: '/Users/v/code/demo',
      branch: 'main', ahead: 0, behind: 0, isDirty: false,
      files: [], recentCommits: [], repoTree: [], error: null,
    })),
    refresh: vi.fn(),
    listBranches: vi.fn(async () => []),
  },
  checks: { run: vi.fn(async () => []) },
  agents: {
    detect: vi.fn(async () => ({ codex: { found: false }, claude: { found: true, path: '/usr/local/bin/claude' } })),
    list: vi.fn(async () => ['codex', 'claude']),
    startRun: vi.fn(),
    cancel: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(async () => []),
    reportUsage: vi.fn(),
    produceDiff: vi.fn(async () => ({ files: [] })),
    runChecks: vi.fn(async () => []),
    openPR: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    listPendingApprovals: vi.fn(async () => []),
    onEvent: vi.fn(() => () => {}),
  },
  menu: { onCommand: vi.fn(() => () => {}) },
};

vi.mock('../app/citybaseApi.js', () => ({
  citybaseApi: desktopBridge,
}));

const { default: App } = await import('../App.jsx');

function clearAllSpies(o) {
  for (const v of Object.values(o)) {
    if (typeof v === 'function' && typeof v.mockClear === 'function') v.mockClear();
    else if (v && typeof v === 'object') clearAllSpies(v);
  }
}

const noGitSnapshot = {
  workspaceId: 'ws-1', rootPath: '/Users/v/code/demo',
  branch: null, ahead: 0, behind: 0, isDirty: false,
  files: [], recentCommits: [], repoTree: [],
  error: { kind: 'no-git', message: 'not a Git repository' },
};

describe('workspace/git error states (BUG-007)', () => {
  beforeEach(() => {
    clearAllSpies(desktopBridge);
    desktopBridge.workspace.getCurrent.mockImplementation(
      async () => ({ id: 'ws-1', rootPath: '/Users/v/code/demo', name: 'demo' }),
    );
    desktopBridge.git.getSnapshot.mockImplementation(async () => ({
      workspaceId: 'ws-1', rootPath: '/Users/v/code/demo',
      branch: 'main', ahead: 0, behind: 0, isDirty: false,
      files: [], recentCommits: [], repoTree: [], error: null,
    }));
  });

  it('a non-repo folder renders the git-error panel, not a connected city', async () => {
    desktopBridge.git.getSnapshot.mockImplementation(async () => noGitSnapshot);
    render(<App />);
    const panel = await screen.findByTestId('workspace-status-panel');
    expect(panel).toHaveTextContent(/Not a Git repository/i);
    expect(panel).toHaveTextContent(/not a Git repository/);
    expect(screen.queryByTestId('city-view')).not.toBeInTheDocument();
  });

  it('the top-bar pill is not "linked" green when the snapshot is errored', async () => {
    desktopBridge.git.getSnapshot.mockImplementation(async () => noGitSnapshot);
    render(<App />);
    expect(await screen.findByText(/WORKSPACE · demo · git error/i)).toBeInTheDocument();
  });

  it('a snapshot IPC failure renders the git-error panel with the message', async () => {
    desktopBridge.git.getSnapshot.mockRejectedValue(new Error('ipc exploded'));
    render(<App />);
    const panel = await screen.findByTestId('workspace-status-panel');
    expect(panel).toHaveTextContent(/Could not read Git state/i);
    expect(panel).toHaveTextContent(/ipc exploded/);
  });

  it('a failed hydrate routes to the workspace-error panel instead of stranding "loading"', async () => {
    desktopBridge.workspace.getCurrent.mockRejectedValue(new Error('bridge down'));
    render(<App />);
    const panel = await screen.findByTestId('workspace-status-panel');
    expect(panel).toHaveTextContent(/Workspace unavailable/i);
    expect(panel).toHaveTextContent(/bridge down/);
  });

  it('the Retry affordance re-runs the workspace refresh', async () => {
    desktopBridge.git.getSnapshot.mockImplementation(async () => noGitSnapshot);
    render(<App />);
    await screen.findByTestId('workspace-status-panel');
    desktopBridge.workspace.getCurrent.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => {
      expect(desktopBridge.workspace.getCurrent).toHaveBeenCalled();
    });
  });

  it('recovering on retry replaces the panel with the healthy workspace UI', async () => {
    desktopBridge.git.getSnapshot.mockImplementationOnce(async () => noGitSnapshot);
    render(<App />);
    await screen.findByTestId('workspace-status-panel');
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('workspace-status-panel')).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/WORKSPACE · demo/i)).toBeInTheDocument();
  });
});
