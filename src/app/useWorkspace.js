// useWorkspace.js — renderer state for current workspace + git snapshot.
//
// State machine:
//   idle      → no workspace yet, no fetch in flight
//   loading   → an action is in flight (pick/refresh)
//   ready     → workspace selected, snapshot loaded (snapshot.error may set)
//   error     → workspace operation itself failed (e.g. pick rejected)
//
// The renderer only runs inside Electron; citybaseApi throws on import
// if the bridge is missing, so this hook can call it unconditionally.
import { useCallback, useEffect, useRef, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

export function useWorkspace() {
  const [state, setState] = useState({
    status: 'idle',
    workspace: null,
    snapshot: null,
    error: null,
  });

  // Token bumped by close() (or any operation that supersedes an in-flight
  // load) so stale async results from hydrate/refresh/pick can no-op instead
  // of writing back into state after the user has moved on.
  const loadIdRef = useRef(0);

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
    const myLoad = ++loadIdRef.current;
    setState(s => ({ ...s, status: 'loading', error: null }));
    try {
      const ws = await citybaseApi.workspace.pick();
      if (myLoad !== loadIdRef.current) return;
      if (!ws) {
        setState(s => ({ ...s, status: s.workspace ? 'ready' : 'idle' }));
        return;
      }
      const snapshot = await loadSnapshot(ws);
      if (myLoad !== loadIdRef.current) return;
      setState({ status: 'ready', workspace: ws, snapshot, error: null });
    } catch (err) {
      if (myLoad !== loadIdRef.current) return;
      setState(s => ({ ...s, status: 'error', error: { message: err.message || String(err) } }));
    }
  }, [loadSnapshot]);

  const refresh = useCallback(async () => {
    const myLoad = ++loadIdRef.current;
    setState(s => {
      if (!s.workspace) return s;
      return { ...s, status: 'loading' };
    });
    // getSnapshot re-reads git state main-side on every call, so there is
    // no separate "refresh" step — loadSnapshot below is the refresh.
    try {
      const ws = await citybaseApi.workspace.getCurrent();
      if (myLoad !== loadIdRef.current) return;
      if (!ws) {
        setState({ status: 'idle', workspace: null, snapshot: null, error: null });
        return;
      }
      const snapshot = await loadSnapshot(ws);
      if (myLoad !== loadIdRef.current) return;
      setState({ status: 'ready', workspace: ws, snapshot, error: null });
    } catch (err) {
      if (myLoad !== loadIdRef.current) return;
      setState(s => ({ ...s, status: 'error', error: { message: err.message || String(err) } }));
    }
  }, [loadSnapshot]);

  const close = useCallback(async () => {
    // Invalidate any in-flight hydrate/refresh/pick so its terminal setState is dropped.
    loadIdRef.current += 1;
    try {
      const ws = await citybaseApi.workspace.getCurrent();
      if (ws) await citybaseApi.workspace.forget(ws.id);
      setState({ status: 'idle', workspace: null, snapshot: null, error: null });
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: { message: err.message || String(err) } }));
    }
  }, []);

  // Initial load: hydrate from any remembered workspace.
  useEffect(() => {
    const myLoad = ++loadIdRef.current;
    (async () => {
      try {
        const ws = await citybaseApi.workspace.getCurrent();
        if (myLoad !== loadIdRef.current) return;
        if (!ws) {
          setState({ status: 'idle', workspace: null, snapshot: null, error: null });
          return;
        }
        const snapshot = await loadSnapshot(ws);
        if (myLoad !== loadIdRef.current) return;
        setState({ status: 'ready', workspace: ws, snapshot, error: null });
      } catch (err) {
        if (myLoad !== loadIdRef.current) return;
        setState(s => ({ ...s, status: 'error', error: { message: err.message || String(err) } }));
      }
    })();
    return () => {
      // Mark this hydrate's writes as superseded.
      loadIdRef.current += 1;
    };
  }, [loadSnapshot]);

  // Wire menu commands (File → Open / Close Workspace).
  useEffect(() => {
    const off = citybaseApi.menu.onCommand((payload) => {
      if (payload?.action === 'openWorkspace') pick();
      if (payload?.action === 'closeWorkspace') close();
    });
    return off;
  }, [pick, close]);

  return { ...state, pick, refresh, close };
}
