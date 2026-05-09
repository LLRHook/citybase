// ClaudeAdapter — wraps the Anthropic Claude Code CLI behind the
// AgentProvider contract.
//
// Phase 6 / v1 ship gate: the adapter now invokes the REAL claude CLI
// flags (`--print --output-format json --permission-mode bypassPermissions`
// + the prompt as a positional arg). The previous slice carried placeholder
// flags (`--quiet --prompt`) that don't exist on the real binary; any
// dispatch would have errored out. This is the minimum change required
// for a click-to-run Claude session inside Citybase.
//
// streamEvents is overridden to parse the JSON envelope claude prints on
// stdout and yield one real AgentEvent (or an error event on failure)
// instead of the synthetic plan/edit/test/pr trail the base class
// fabricates from the exit state. The synthetic trail is mock UI activity
// — the user has been clear that the IDE must surface only real output.
//
// Per docs/agent-runtime.md, Claude Sonnet 4.6 is the default model;
// callers can override via params.model (e.g. to push to Opus 4.7 for
// high-complexity quests or Haiku 4.5 for cheap routine work).
//
// Real-time streaming (token-by-token) is still future work — it requires
// processService to surface stdout chunks on a child handle. For now we
// run claude to completion and yield the parsed result. That's still
// real Claude output, just buffered.
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'claude CLI not found on PATH';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

function buildClaudeArgv({ params }) {
  return [
    '--print',
    '--output-format', 'json',
    '--model', params.model || DEFAULT_MODEL,
    // bypassPermissions matches the behaviour the user gets by launching
    // claude themselves from a terminal: the run is non-interactive so
    // there is nowhere to surface a permission prompt yet. When approval
    // routing is wired into the renderer (later slice), switch to
    // 'auto' or 'default' and pump prompts through onApprovalRequest.
    '--permission-mode', 'bypassPermissions',
    params.promptContext,
  ];
}

// Parse the JSON envelope claude prints on stdout under
// `--print --output-format json`. Defensive: claude can also print
// human-readable text on failure, so when JSON parsing fails we treat
// the raw stdout as the message text.
function parseClaudeJsonResult(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) {
    return { ok: false, isError: true, text: '', raw: '' };
  }
  const trimmed = stdout.trim();
  let parsed = null;
  try { parsed = JSON.parse(trimmed); } catch { /* fall through */ }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: true, isError: false, text: trimmed, raw: trimmed };
  }
  // Claude's --output-format json envelope:
  //   { type: 'result', subtype: 'success'|..., is_error: boolean,
  //     result: '<assistant text>', session_id, duration_ms, usage, ... }
  const text = typeof parsed.result === 'string'
    ? parsed.result
    : typeof parsed.text === 'string' ? parsed.text : '';
  const isError = parsed.is_error === true || parsed.subtype === 'error';
  return { ok: !isError, isError, text, raw: trimmed };
}

function formatHHMM(epochMs) {
  const d = new Date(epochMs || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

class ClaudeAdapter extends CliAgentAdapter {
  constructor(opts = {}) {
    super({
      binaryName: 'claude',
      detectKey: 'claude',
      buildArgv: buildClaudeArgv,
      ...opts,
      // Map the friendlier `claudePath` option into the base's binaryPath.
      binaryPath: opts.claudePath ?? opts.binaryPath,
    });
  }

  async *streamEvents(runId) {
    const entry = this._requireRun(runId);
    const t = formatHHMM(this._now());

    if (entry.cancelled) {
      yield { runId, t, kind: 'error', text: 'claude: run cancelled' };
      return;
    }
    if (entry.exitState === 'timeout') {
      yield { runId, t, kind: 'error', text: 'claude: timed out before completing' };
      return;
    }

    const parsed = parseClaudeJsonResult(entry.stdout);

    if (entry.exitState !== 'pass' || parsed.isError) {
      const reason = parsed.text
        || (entry.stderr || '').trim()
        || 'claude exited with a non-zero status';
      yield { runId, t, kind: 'error', text: `claude: ${reason}` };
      return;
    }

    const text = parsed.text || '(claude returned an empty result)';
    yield { runId, t, kind: 'edit', text: `claude: ${text}` };
  }
}

module.exports = {
  ClaudeAdapter,
  NOT_FOUND_MESSAGE,
  DEFAULT_MODEL,
  buildClaudeArgv,
  parseClaudeJsonResult,
};
