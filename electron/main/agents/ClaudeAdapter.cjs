// ClaudeAdapter — wraps the Anthropic Claude Code CLI behind the
// AgentProvider contract. Mirrors CodexAdapter via the shared
// CliAgentAdapter base; the only differences are the binary name, the
// detection key, the argv shape, and the default model.
//
// Per docs/agent-runtime.md, Claude Sonnet 4.6 is the default model;
// callers can override via params.model (e.g. to push to Opus 4.7 for
// high-complexity quests or Haiku 4.5 for cheap routine work).
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'claude CLI not found on PATH';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Slice 3 keeps the argv shape simple and aligned with CodexAdapter so
// the IPC wiring slice can talk to either provider through the same
// channel without flag-translation. The real claude CLI accepts
// `--print --output-format stream-json` for non-interactive runs;
// switching to that mode lives in slice 4 once we wire stdout streaming.
function buildClaudeArgv({ params }) {
  const args = [
    '--quiet',
    '--prompt', params.promptContext,
    '--model', params.model || DEFAULT_MODEL,
  ];
  return args;
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
}

module.exports = { ClaudeAdapter, NOT_FOUND_MESSAGE, DEFAULT_MODEL };
