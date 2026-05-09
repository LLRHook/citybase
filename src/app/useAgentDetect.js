// useAgentDetect — renderer-side hook that wraps citybaseApi.agents.detect()
// with React state so settings UI can render install status without each
// component running its own detection.
//
// State machine:
//   pending: not yet resolved
//   ready:   detection completed
//   error:   the bridge call rejected (rare; the desktop bridge resolves
//            cleanly even when nothing is installed)
import { useEffect, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

const EMPTY_RESULT = Object.freeze({
  codex: { found: false },
  claude: { found: false },
});

export function useAgentDetect({ api } = {}) {
  const bridge = api ?? citybaseApi;
  const [state, setState] = useState({
    status: 'pending',
    result: EMPTY_RESULT,
    error: null,
  });

  useEffect(() => {
    let alive = true;
    bridge.agents.detect().then(
      (result) => {
        if (!alive) return;
        setState({ status: 'ready', result: result || EMPTY_RESULT, error: null });
      },
      (err) => {
        if (!alive) return;
        setState({
          status: 'error',
          result: EMPTY_RESULT,
          error: { message: (err && err.message) || String(err) },
        });
      },
    );
    return () => { alive = false; };
  }, [bridge]);

  return state;
}
