// useRunHistory — renderer-side hook backing the Run History panel.
//
// Pulls real agent runs from agentManager via citybase:agent.listRuns
// on mount, and re-pulls whenever any AgentEvent arrives (so a fresh
// run shows up the moment it lands or transitions). No seed/mock data:
// when the user hasn't dispatched anything yet the hook returns [].
import { useEffect, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

export function useRunHistory({ api } = {}) {
  const bridge = api ?? citybaseApi;
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      bridge.agents.listRuns().then(
        (next) => { if (alive) setRuns(Array.isArray(next) ? next : []); },
        () => { if (alive) setRuns([]); },
      );
    };
    refresh();
    const off = typeof bridge.agents.onEvent === 'function'
      ? bridge.agents.onEvent(() => { refresh(); })
      : () => {};
    return () => { alive = false; off(); };
  }, [bridge]);

  return runs;
}
