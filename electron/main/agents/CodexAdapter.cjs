// CodexAdapter — wraps the OpenAI Codex CLI behind the AgentProvider
// contract. Most behavior lives in CliAgentAdapter; this file just
// supplies the binary name, detection key, and the codex-specific
// argv shape per skill.
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'codex CLI not found on PATH';

const SKILL_PROMPT = {
  bugfix: 'Fix the bug described below.',
  refactor: 'Make the focused refactor described below.',
  tests: 'Add or improve tests for the task described below.',
  review: 'Review the repository changes described below.',
  lint: 'Run a focused lint cleanup for the task described below.',
  docs: 'Update documentation for the task described below.',
};

function buildCodexArgv({ params, skill }) {
  const prompt = [
    SKILL_PROMPT[skill] || 'Work on the task described below.',
    '',
    params.promptContext,
  ].join('\n');
  const args = [
    'exec',
    '--cd', params.repoUrl,
    '--sandbox', 'workspace-write',
    '-c', 'approval_policy=never',
    '--color', 'never',
  ];
  if (params.model) args.push('--model', params.model);
  args.push('-');
  return { args, stdin: prompt };
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
