// bootPayload.cjs — pure factory for the one-shot payload the main
// process pushes to the renderer immediately after the window finishes
// loading.
//
// The v1 ship gate requires that App.jsx renders with workspace +
// detected agents already populated, no clicks needed. Without this
// payload, the renderer has to make at least two extra IPC roundtrips
// after mount (citybaseApi.workspace.getCurrent + citybaseApi.agents.detect)
// before the UI can settle. Pushing the data on did-finish-load makes the
// boot path feel instant instead of two-step.
//
// This module is deliberately pure: callers inject the detection function
// and the workspace getter. main.cjs wires it to the real services and
// sends the result over BOOT_PAYLOAD_CHANNEL.

const EMPTY_DETECT = Object.freeze({
  codex: { found: false },
  claude: { found: false },
});

async function buildBootPayload({ detect, getCurrentWorkspace }) {
  if (typeof detect !== 'function') {
    throw new TypeError('buildBootPayload: detect must be a function');
  }
  if (typeof getCurrentWorkspace !== 'function') {
    throw new TypeError('buildBootPayload: getCurrentWorkspace must be a function');
  }

  // Detection is sync (PATH probe) but we shield with a try so a probe
  // failure can't take the boot payload down — the renderer will just
  // see the empty fallback and can re-detect on demand.
  let detectResult = EMPTY_DETECT;
  try {
    const r = detect();
    detectResult = r && typeof r === 'object' ? r : EMPTY_DETECT;
  } catch {
    detectResult = EMPTY_DETECT;
  }

  let workspace = null;
  try {
    const ws = await getCurrentWorkspace();
    workspace = ws || null;
  } catch {
    workspace = null;
  }

  return {
    detect: detectResult,
    workspace,
    timestamp: Date.now(),
  };
}

module.exports = { buildBootPayload, EMPTY_DETECT };
