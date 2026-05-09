// useAgentDetect — renderer-side hook that wraps citybaseApi.agents.detect()
// with React state so settings UI can render install status without each
// component running its own detection.
//
// State machine:
//   pending: not yet resolved
//   ready:   detection completed
//   error:   the bridge call rejected (rare; the desktop bridge resolves
//            cleanly even when nothing is installed)
//
// When `initial` is provided (the v1 auto-boot path injects the boot
// payload's detect result), we skip the IPC roundtrip entirely and start
// in `ready` against that value. The v1 ship gate ("workspace + detected
// agents already populated when App.jsx renders") rests on this.
import { useEffect, useState } from 'react';
import { citybaseApi } from './citybaseApi.js';

const EMPTY_RESULT = Object.freeze({
  codex: { found: false },
  claude: { found: false },
});

function isDetectShape(v) {
  return v && typeof v === 'object' && v.codex && v.claude;
}

export function useAgentDetect({ api, initial } = {}) {
  const bridge = api ?? citybaseApi;
  const [state, setState] = useState(() =>
    isDetectShape(initial)
      ? { status: 'ready', result: initial, error: null }
      : { status: 'pending', result: EMPTY_RESULT, error: null },
  );

  useEffect(() => {
    if (isDetectShape(initial)) return undefined;
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
  }, [bridge, initial]);

  return state;
}
