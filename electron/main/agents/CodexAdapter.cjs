// CodexAdapter — wraps the OpenAI Codex CLI behind the AgentProvider
// contract. Most behavior lives in CliAgentAdapter; this file supplies
// the binary name, detection key, and the codex-specific argv shape.
//
// JSONL supplies real messages, command results and changed paths as they
// arrive. Never manufacture edits, test passes or PRs from a process exit.
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'codex CLI not found on PATH';

// One-line skill prefixes prepended to the prompt body so codex has a
// little context about the kind of task even without a flag for it.
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
    '--sandbox', params.readOnly === true ? 'read-only' : 'workspace-write',
    '-c', 'approval_policy=never',
    '--color', 'never',
    '--json',
  ];
  if (params.model) args.push('--model', params.model);
  // Trailing `-` tells codex exec to read the prompt from stdin.
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

  _ev(entry, kind, text, payload) {
    const now = new Date(this._now());
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this._pushEvent(entry, { runId: entry.run.runId, t, kind, text, ...(payload ? { payload } : {}) });
  }

  _onStdout(entry, chunk) {
    entry.lineBuf += chunk;
    let newline;
    while ((newline = entry.lineBuf.indexOf('\n')) !== -1) {
      const line = entry.lineBuf.slice(0, newline);
      entry.lineBuf = entry.lineBuf.slice(newline + 1);
      this._handleLine(entry, line);
    }
    if (entry.lineBuf.length > 4 * 1024 * 1024) {
      entry.lineBuf = '';
      this._ev(entry, 'error', 'codex: output line exceeded the display limit');
    }
  }

  _handleLine(entry, line) {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (!event || typeof event !== 'object') return;
    if (event.type === 'thread.started') {
      this._ev(entry, 'plan', 'codex: session started');
    } else if (event.type === 'turn.completed') {
      const usage = event.usage || {};
      entry.run.contextUsed = (Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0);
      this._ev(entry, 'plan', 'codex: turn completed', { status: 'done' });
    } else if (event.type === 'turn.failed' || event.type === 'error') {
      if (event.type === 'turn.failed') entry.codexFailed = true;
      this._ev(entry, 'error', `codex: ${event.error?.message || event.message || 'run failed'}`);
    } else if (event.type === 'item.started' || event.type === 'item.completed') {
      const item = event.item;
      if (!item || typeof item !== 'object') return;
      const completed = event.type === 'item.completed';
      if (item.type === 'agent_message' && completed && typeof item.text === 'string' && item.text.trim()) {
        entry.hasAssistantOutput = true;
        this._ev(entry, 'edit', `codex: ${item.text}`);
      } else if (item.type === 'command_execution') {
        const state = completed ? `exited ${item.exit_code ?? item.status ?? 'unknown'}` : 'running';
        this._ev(entry, completed && item.exit_code !== 0 && item.exit_code != null ? 'error' : 'edit',
          `codex: ${item.command || 'command'} (${state})${completed && item.aggregated_output ? `\n${item.aggregated_output.slice(0, 6000)}` : ''}`,
          { tool: 'command', status: item.status });
      } else if (item.type === 'file_change' && completed) {
        for (const change of Array.isArray(item.changes) ? item.changes : []) {
          if (typeof change.path !== 'string') continue;
          const failed = item.status === 'failed';
          this._ev(entry, failed ? 'error' : 'edit', `codex: ${failed ? 'could not change' : 'changed'} ${change.path}`,
            failed ? { tool: 'file_change', status: item.status } : { path: change.path, tool: 'file_change', status: item.status });
        }
      } else if (item.type === 'mcp_tool_call') {
        this._ev(entry, item.status === 'failed' ? 'error' : 'edit',
          `codex: ${item.server || 'MCP'}/${item.tool || 'tool'} ${completed ? item.status || 'completed' : 'started'}`);
      }
      // Internal reasoning items intentionally stay out of the activity feed.
    }
  }

  _finalize(entry) {
    if (entry.lineBuf.trim()) this._handleLine(entry, entry.lineBuf);
    entry.lineBuf = '';
    if (entry.codexFailed && entry.run.status === 'done') {
      entry.run.status = 'failed';
      entry.exitState = 'fail';
    }
    if (entry.cancelled) {
      if (!entry.cancelEvent) this._ev(entry, 'error', 'codex: run cancelled');
    } else if (entry.exitState !== 'pass') {
      if (!entry.events.some((event) => event.kind === 'error')) {
        this._ev(entry, 'error', `codex: ${entry.exitState === 'timeout' ? 'run timed out' : entry.stderr.trim() || 'process exited with an error'}`);
      }
    } else if (!entry.events.length) {
      this._ev(entry, 'plan', 'codex: process exited without structured output');
    }
  }

  streamEvents(runId) { return this._drainEvents(runId); }

  async cancel(runId) {
    const entry = this._requireRun(runId);
    await super.cancel(runId);
    if (!entry.cancelEvent) {
      entry.cancelEvent = true;
      this._ev(entry, 'error', 'codex: run cancelled');
    }
  }
}

module.exports = { CodexAdapter, NOT_FOUND_MESSAGE, buildCodexArgv };
