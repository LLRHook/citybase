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
// `initial` (the v1 auto-boot path injects the boot payload's detect result)
// seeds the first paint so the UI renders populated with no blocking
// roundtrip — that's the v1 auto-boot gate. But we still confirm against a
// live probe in the background: the boot payload is built once at
// did-finish-load and was observed reporting "not installed" while runs
// succeeded, and trusting it blindly left the indicator wrong. A non-blocking
// confirm keeps the instant paint and self-heals a bad seed.
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
  const seeded = isDetectShape(initial);
  const [state, setState] = useState(() =>
    seeded
      ? { status: 'ready', result: initial, error: null }
      : { status: 'pending', result: EMPTY_RESULT, error: null },
  );

  useEffect(() => {
    if (typeof bridge.agents?.detect !== 'function') return undefined;
    let alive = true;
    bridge.agents.detect().then(
      (result) => {
        if (!alive) return;
        if (isDetectShape(result)) {
          setState({ status: 'ready', result, error: null });
        } else if (!seeded) {
          // No usable seed and a null/garbage probe → settle on empty-ready.
          setState({ status: 'ready', result: EMPTY_RESULT, error: null });
        }
        // null probe with a good seed → keep the seed (don't wipe it).
      },
      (err) => {
        if (!alive || seeded) return; // a probe failure must not clobber a good seed
        setState({
          status: 'error',
          result: EMPTY_RESULT,
          error: { message: (err && err.message) || String(err) },
        });
      },
    );
    return () => { alive = false; };
  }, [bridge, initial, seeded]);

  return state;
}
