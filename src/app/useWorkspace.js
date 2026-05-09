// useWorkspace.js — renderer state for current workspace + git snapshot.
//
// State machine:
//   idle      → no workspace yet, no fetch in flight
//   loading   → an action is in flight (pick/refresh)
//   ready     → workspace selected, snapshot loaded (snapshot.error may set)
//   error     → workspace operation itself failed (e.g. pick rejected)
//
// In browser mode (no Electron) this hook resolves to idle with no
// workspace, leaving the existing fixture-based UI as the visible state.
import { useCallback, useEffect, useState } from 'react';
import { citybaseApi, isDesktop } from './citybaseApi.js';

export function useWorkspace() {
  const [state, setState] = useState({
    status: 'idle',
    workspace: null,
    snapshot: null,
    error: null,
  });

  const loadSnapshot = useCallback(async (workspace) => {
    if (!workspace) return null;
    try {
      const snapshot = await citybaseApi.git.getSnapshot(workspace.id);
      return snapshot;
    } catch (err) {
      return { error: { kind: 'snapshot-failed', message: err.message || String(err) } };
    }
  }, []);

  const pick = useCallback(async () => {
    if (!isDesktop) return;
    setState(s => ({ ...s, status: 'loading', error: null }));
    try {
      const ws = await citybaseApi.workspace.pick();
      if (!ws) {
        setState(s => ({ ...s, status: s.workspace ? 'ready' : 'idle' }));
        return;
      }
      const snapshot = await loadSnapshot(ws);
      setState({ status: 'ready', workspace: ws, snapshot, error: null });
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: { message: err.message || String(err) } }));
    }
  }, [loadSnapshot]);

  const refresh = useCallback(async () => {
    if (!isDesktop) return;
    setState(s => {
      if (!s.workspace) return s;
      return { ...s, status: 'loading' };
    });
    const ws = await citybaseApi.workspace.getCurrent();
    if (!ws) {
      setState({ status: 'idle', workspace: null, snapshot: null, error: null });
      return;
    }
    const snapshot = await loadSnapshot(ws);
    setState({ status: 'ready', workspace: ws, snapshot, error: null });
  }, [loadSnapshot]);

  const close = useCallback(async () => {
    if (!isDesktop) return;
    const ws = await citybaseApi.workspace.getCurrent();
    if (ws) await citybaseApi.workspace.forget(ws.id);
    setState({ status: 'idle', workspace: null, snapshot: null, error: null });
  }, []);

  // Initial load: hydrate from any remembered workspace.
  useEffect(() => {
    let alive = true;
    if (!isDesktop) return;
    (async () => {
      const ws = await citybaseApi.workspace.getCurrent();
      if (!alive) return;
      if (!ws) {
        setState({ status: 'idle', workspace: null, snapshot: null, error: null });
        return;
      }
      const snapshot = await loadSnapshot(ws);
      if (!alive) return;
      setState({ status: 'ready', workspace: ws, snapshot, error: null });
    })();
    return () => { alive = false; };
  }, [loadSnapshot]);

  // Wire menu commands (File → Open / Close Workspace).
  useEffect(() => {
    if (!isDesktop) return;
    const off = citybaseApi.menu.onCommand((payload) => {
      if (payload?.action === 'openWorkspace') pick();
      if (payload?.action === 'closeWorkspace') close();
    });
    return off;
  }, [pick, close]);

  return { ...state, pick, refresh, close };
}
