// CodexAdapter — wraps the OpenAI Codex CLI behind the AgentProvider
// contract. Most behavior lives in CliAgentAdapter; this file just
// supplies the binary name, detection key, and the codex-specific
// argv shape per skill.
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'codex CLI not found on PATH';

const SKILL_FLAG = {
  bugfix: ['--mode', 'edit'],
  refactor: ['--mode', 'edit'],
  tests: ['--mode', 'edit'],
  review: ['--mode', 'review'],
  lint: ['--mode', 'edit'],
  docs: ['--mode', 'edit'],
};

function buildCodexArgv({ params, skill }) {
  const args = [
    '--quiet',
    ...(SKILL_FLAG[skill] || []),
    '--prompt', params.promptContext,
  ];
  if (params.model) args.push('--model', params.model);
  return args;
}

class CodexAdapter extends CliAgentAdapter {
  constructor(opts = {}) {
    super({
      binaryName: 'codex',
      detectKey: 'codex',
      buildArgv: buildCodexArgv,
      ...opts,
      // Map the legacy `codexPath` option into the base's binaryPath so
      // existing callers keep working.
      binaryPath: opts.codexPath ?? opts.binaryPath,
    });
  }
}

module.exports = { CodexAdapter, NOT_FOUND_MESSAGE };
