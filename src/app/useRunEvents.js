// useRunEvents — accumulates the live AgentEvent stream for a single
// runId. The main process pumps streamEvents over AGENT_EVENT_CHANNEL;
// preload exposes a global onEvent subscription. We filter to the
// requested runId and append each event in arrival order.
//
// State is keyed by runId so switching the selected run displays its
// own history without a cross-run leak — and without the synchronous
// setState-on-runId-change that React 19's purity rule rejects.
import { useEffect, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

export function useRunEvents(runId, { api } = {}) {
  const bridge = api ?? citybaseApi;
  const [eventsByRun, setEventsByRun] = useState(() => new Map());

  useEffect(() => {
    if (!runId || typeof bridge.agents?.onEvent !== 'function') return undefined;
    const off = bridge.agents.onEvent((payload) => {
      // Main pumps `{ runId, event }` envelopes through pumpAgentEvents,
      // but adapters may also send raw AgentEvent objects directly. Tolerate
      // both shapes.
      const evt = payload && payload.event ? payload.event : payload;
      if (!evt || evt.runId !== runId) return;
      setEventsByRun((prev) => {
        const next = new Map(prev);
        const arr = next.get(runId) || [];
        next.set(runId, [...arr, evt]);
        return next;
      });
    });
    return off;
  }, [bridge, runId]);

  return runId ? (eventsByRun.get(runId) || []) : [];
}
