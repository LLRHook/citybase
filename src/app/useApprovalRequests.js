// useApprovalRequests — renderer-side queue of pending approvals raised by
// agentManager.requestApproval. Subscribes to citybaseApi.agents.onEvent
// and flips into the approval-pending state when an event payload carries
// { needsApproval: true, summary }.
//
// Hook returns:
//   { pending, approve, reject }
//
// `pending` is the head of the queue (or null when empty). The approval
// modal renders for `pending`; once the user clicks Approve / Reject the
// hook calls citybaseApi.agents.{approve,reject} and shifts to the next
// pending request.
import { useCallback, useEffect, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

export function useApprovalRequests({ api } = {}) {
  const bridge = api ?? citybaseApi;
  const [queue, setQueue] = useState([]);

  // Subscribe to the agent event channel. When an event carries
  // needsApproval, append it to the queue (deduped by runId).
  useEffect(() => {
    if (!bridge?.agents?.onEvent) return undefined;
    const off = bridge.agents.onEvent((payload) => {
      if (!payload || !payload.event) return;
      const ev = payload.event;
      if (!ev.payload || !ev.payload.needsApproval) return;
      setQueue((prev) => {
        if (prev.some((p) => p.runId === payload.runId)) return prev;
        return [...prev, { runId: payload.runId, summary: ev.payload }];
      });
    });
    return typeof off === 'function' ? off : undefined;
  }, [bridge]);

  // Sync the initial queue from the manager so a renderer that mounts
  // after an approval is pending still sees the request.
  useEffect(() => {
    if (!bridge?.agents?.listPendingApprovals) return undefined;
    let alive = true;
    bridge.agents.listPendingApprovals().then(
      (rows) => {
        if (!alive) return;
        if (!Array.isArray(rows) || rows.length === 0) return;
        setQueue((prev) => {
          const known = new Set(prev.map((p) => p.runId));
          const additions = rows.filter((r) => !known.has(r.runId));
          if (additions.length === 0) return prev;
          return [...prev, ...additions];
        });
      },
      () => {},
    );
    return () => { alive = false; };
  }, [bridge]);

  const removeFromQueue = useCallback((runId) => {
    setQueue((prev) => prev.filter((p) => p.runId !== runId));
  }, []);

  const approve = useCallback(async (runId) => {
    if (!bridge?.agents?.approve) return;
    try {
      await bridge.agents.approve(runId);
    } finally {
      removeFromQueue(runId);
    }
  }, [bridge, removeFromQueue]);

  const reject = useCallback(async (runId) => {
    if (!bridge?.agents?.reject) return;
    try {
      await bridge.agents.reject(runId);
    } finally {
      removeFromQueue(runId);
    }
  }, [bridge, removeFromQueue]);

  return {
    pending: queue[0] || null,
    queue,
    approve,
    reject,
  };
}
