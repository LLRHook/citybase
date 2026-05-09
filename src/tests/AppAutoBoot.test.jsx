// Asserts the v1 ship-gate item: 'App auto-boots on launch — most recent
// workspace restored, agent detection runs, no intermediate clicks.'
//
// The browser-stub path is already exercised by App.idle.test.jsx; here
// we verify the desktop-bridge path: when window.citybase is present,
// useWorkspace and useAgentDetect both fire on mount without user input.
import { render, waitFor, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Build a fresh desktop-bridge stub per test. vi.fn instances live on the
// module identity returned by the mock factory; resetting them between
// tests keeps assertions independent.
const desktopBridge = {
  isDesktop: true,
  app: {
    getVersion: vi.fn(async () => '1.0.0'),
    getPlatform: vi.fn(async () => 'darwin'),
  },
  workspace: {
    pick: vi.fn(),
    getCurrent: vi.fn(async () => ({
      id: 'ws-1',
      rootPath: '/Users/v/code/demo',
      name: 'demo',
    })),
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
    detect: vi.fn(async () => ({
      codex: { found: false },
      claude: { found: true, path: '/usr/local/bin/claude' },
    })),
    list: vi.fn(async () => ['codex', 'claude']),
    startRun: vi.fn(),
    cancel: vi.fn(),
    getRun: vi.fn(),
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
  isDesktop: true,
}));

// Now safe to import — the mock is hoisted by vitest.
const { default: App } = await import('../App.jsx');

function clearAllSpies(o) {
  for (const v of Object.values(o)) {
    if (typeof v === 'function' && typeof v.mockClear === 'function') v.mockClear();
    else if (v && typeof v === 'object') clearAllSpies(v);
  }
}

describe('App auto-boot (desktop bridge present)', () => {
  beforeEach(() => {
    clearAllSpies(desktopBridge);
  });

  afterEach(() => {
    // Reset the getCurrent default in case a test overrode it.
    desktopBridge.workspace.getCurrent.mockImplementation(async () => ({
      id: 'ws-1', rootPath: '/Users/v/code/demo', name: 'demo',
    }));
  });

  it('restores the most recent workspace on mount (workspace.getCurrent fires)', async () => {
    render(<App />);
    await waitFor(() => {
      expect(desktopBridge.workspace.getCurrent).toHaveBeenCalled();
    });
  });

  it('runs agent detection on mount (agents.detect fires)', async () => {
    render(<App />);
    await waitFor(() => {
      expect(desktopBridge.agents.detect).toHaveBeenCalled();
    });
  });

  it('subscribes to streamed agent events on mount (agents.onEvent fires)', async () => {
    render(<App />);
    await waitFor(() => {
      expect(desktopBridge.agents.onEvent).toHaveBeenCalled();
    });
  });

  it("renders the 'WORKSPACE · <name>' linked label when getCurrent resolves", async () => {
    render(<App />);
    expect(await screen.findByText(/WORKSPACE · demo/i)).toBeInTheDocument();
  });

  it('shows the codex-not-installed / claude-installed status rows after detect resolves', async () => {
    render(<App />);
    await waitFor(() => {
      const rows = screen.getAllByRole('status');
      expect(rows.some(r => r.getAttribute('data-state') === 'ok')).toBe(true);
      expect(rows.some(r => r.getAttribute('data-state') === 'bad')).toBe(true);
    });
  });

  it('falls back to NO WORKSPACE state when getCurrent resolves to null (first launch)', async () => {
    desktopBridge.workspace.getCurrent.mockImplementationOnce(async () => null);
    render(<App />);
    expect(await screen.findByText(/NO WORKSPACE · open one/i)).toBeInTheDocument();
  });

  it('still calls agents.detect even when no workspace is restored', async () => {
    desktopBridge.workspace.getCurrent.mockImplementationOnce(async () => null);
    render(<App />);
    await waitFor(() => {
      expect(desktopBridge.agents.detect).toHaveBeenCalled();
    });
  });
});
