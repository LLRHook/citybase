import React from 'react';
import { citybaseApi } from './app/citybaseApi.js';
import { useWorkspace } from './app/useWorkspace.js';
import { useAgentDetect } from './app/useAgentDetect.js';
import { useApprovalRequests } from './app/useApprovalRequests.js';
import { useRunHistory } from './app/useRunHistory.js';
import { ApprovalModal, Toasts } from './game/modals.jsx';
import { TopBar } from './views/TopBar.jsx';
import { RunHistorySidebar } from './views/RunHistorySidebar.jsx';
import { EmptyHome } from './views/EmptyHome.jsx';
import { NewRunForm } from './views/NewRunForm.jsx';
import { RunDetail } from './views/RunDetail.jsx';
import { NEON } from './game/palette.js';

// App — the top-level Electron renderer shell. Three regions:
//   * TopBar: workspace + branch + open/refresh + agent install state
//   * RunHistorySidebar: real run records from agentManager.listRuns
//   * Main area: EmptyHome | NewRunForm | RunDetail
//
// The renderer assumes window.citybase is attached by the preload
// (citybaseApi.js throws on import otherwise). Every action is real:
// pickWorkspace -> Electron folder dialog, run -> spawn the real
// claude CLI, openPR -> shell out to gh.

class ErrBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('citybase render error', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{
          padding: 24, fontFamily: 'JetBrains Mono, monospace',
          color: NEON.red, background: NEON.bg0, minHeight: '100vh',
        }}>
          <h1>Renderer crashed</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.err.stack || this.state.err)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function CitybaseApp() {
  // Boot payload: main process pushes detect + workspace once on
  // did-finish-load. We seed local state from the cache then subscribe.
  const [bootDetect, setBootDetect] = React.useState(
    () => citybaseApi.app?.getBoot?.()?.detect || null,
  );
  React.useEffect(() => {
    if (typeof citybaseApi.app?.onBoot !== 'function') return undefined;
    return citybaseApi.app.onBoot((payload) => {
      if (payload && payload.detect) setBootDetect(payload.detect);
    });
  }, []);

  const workspace = useWorkspace();
  const agentDetect = useAgentDetect({ initial: bootDetect });
  const approval = useApprovalRequests();
  const runHistory = useRunHistory();

  const [selectedRunId, setSelectedRunId] = React.useState(null);
  const [selectedBranch, setSelectedBranch] = React.useState(null);
  const [toasts, setToasts] = React.useState([]);
  const toastIdRef = React.useRef(0);

  const pushToast = React.useCallback((toast) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const selectedRun = React.useMemo(() => {
    if (!selectedRunId) return null;
    return runHistory.find((r) => r.runId === selectedRunId) || null;
  }, [runHistory, selectedRunId]);

  // ── Action handlers ──

  const onRun = React.useCallback(async ({ provider, model, promptContext }) => {
    if (!workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return null;
    }
    try {
      const run = await citybaseApi.agents.startRun({
        provider,
        questId: `run-${Date.now()}`,
        adventurerId: 'local',
        skill: 'refactor',
        repoUrl: workspace.workspace.rootPath,
        branch: workspace.snapshot?.branch || 'main',
        promptContext,
        ...(model ? { model } : {}),
      });
      if (run?.runId) {
        setSelectedRunId(run.runId);
        pushToast({ text: `Run dispatched · ${run.runId.slice(0, 8)}`, color: 'green', icon: '★' });
      }
      return run;
    } catch (err) {
      pushToast({ text: err?.message || 'dispatch failed', color: 'red', icon: '✕' });
      throw err;
    }
  }, [workspace.workspace, workspace.snapshot, pushToast]);

  const onCancelRun = React.useCallback(async (runId) => {
    try {
      await citybaseApi.agents.cancel(runId);
      pushToast({ text: 'Run cancelled', color: 'amber', icon: '✕' });
    } catch (err) {
      pushToast({ text: err?.message || 'cancel failed', color: 'red', icon: '✕' });
    }
  }, [pushToast]);

  const onCheckoutBranch = React.useCallback(async (branchName) => {
    if (!workspace.workspace || !branchName) return;
    try {
      const result = await citybaseApi.git.checkout(workspace.workspace.id, branchName);
      if (!result?.ok) {
        pushToast({ text: result?.error?.message || 'checkout failed', color: 'red', icon: '✕' });
        return;
      }
      setSelectedBranch(null);
      pushToast({ text: `Checked out ${branchName}`, color: 'green', icon: '✓' });
      await workspace.refresh();
    } catch (err) {
      pushToast({ text: err?.message || 'checkout failed', color: 'red', icon: '✕' });
    }
  }, [workspace, pushToast]);

  const onCommit = React.useCallback(async (message) => {
    if (!workspace.workspace) {
      pushToast({ text: 'Open a workspace first', color: 'amber', icon: '⚠' });
      return { ok: false };
    }
    try {
      const result = await citybaseApi.git.commit(workspace.workspace.id, { message, addAll: true });
      if (!result?.ok) {
        pushToast({ text: result?.error?.message || 'commit failed', color: 'red', icon: '✕' });
        return result;
      }
      pushToast({
        text: result.commitHash ? `Committed · ${String(result.commitHash).slice(0, 8)}` : 'Committed',
        color: 'green', icon: '✓',
      });
      await workspace.refresh();
      return result;
    } catch (err) {
      pushToast({ text: err?.message || 'commit failed', color: 'red', icon: '✕' });
      return { ok: false };
    }
  }, [workspace, pushToast]);

  // ── Render ──

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
      background: NEON.bg0,
      color: NEON.ink,
      fontFamily: '"Space Grotesk", system-ui, sans-serif',
    }}>
      <TopBar
        workspace={workspace.workspace}
        snapshot={workspace.snapshot}
        onPickWorkspace={workspace.pick}
        onRefreshWorkspace={workspace.refresh}
        onCloseWorkspace={workspace.close}
        selectedBranch={selectedBranch}
        onSelectBranch={setSelectedBranch}
        onCheckoutBranch={onCheckoutBranch}
        agentDetect={agentDetect}
        citybaseApi={citybaseApi}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <RunHistorySidebar
          runs={runHistory}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!workspace.workspace && (
            <EmptyHome onPickWorkspace={workspace.pick} agentDetect={agentDetect} />
          )}

          {workspace.workspace && selectedRun && (
            <RunDetail
              run={selectedRun}
              citybaseApi={citybaseApi}
              workspaceBranch={workspace.snapshot?.branch}
              onCancelRun={onCancelRun}
              onCloseRun={() => setSelectedRunId(null)}
            />
          )}

          {workspace.workspace && !selectedRun && (
            <NewRunForm
              workspace={workspace.workspace}
              snapshot={workspace.snapshot}
              onRun={onRun}
              onCommit={onCommit}
              defaultProvider={agentDetect?.result?.claude?.found ? 'claude' : 'auto'}
            />
          )}
        </main>
      </div>

      <ApprovalModal
        pending={approval.pending}
        onApprove={() => approval.pending && approval.approve(approval.pending.runId)}
        onReject={() => approval.pending && approval.reject(approval.pending.runId)}
      />
      <Toasts toasts={toasts} />
    </div>
  );
}

export default function App() {
  return (
    <ErrBoundary>
      <CitybaseApp />
    </ErrBoundary>
  );
}
