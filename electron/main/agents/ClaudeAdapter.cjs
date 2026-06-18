// ClaudeAdapter — wraps the Anthropic Claude Code CLI behind the
// AgentProvider contract.
//
// v3.0: the adapter invokes claude with `--print --output-format stream-json
// --verbose` and parses the NDJSON stream incrementally, pushing a real
// AgentEvent for each assistant text block and tool use as it arrives. This
// makes the run detail stream token-by-token and — because Edit/Write tool
// uses carry a `file_path` — lets the city light the exact buildings claude
// touches the instant it touches them. The final `result` line drives the run
// outcome. streamEvents drains the live queue (base `_drainEvents`); the
// synthetic plan/edit/test/pr trail is gone — only real Claude output shows.
//
// Per docs/agent-runtime.md, Claude Sonnet 4.6 is the default model; callers
// can override via params.model.
const { CliAgentAdapter } = require('./CliAgentAdapter.cjs');

const NOT_FOUND_MESSAGE = 'claude CLI not found on PATH';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
// Cap the partial-line buffer. stream-json is newline-delimited, and
// spawnStream forwards every chunk to _onStdout uncapped (its 16MB cap only
// bounds the buffered stdout it accumulates for result parsing). A single line
// that grows past this without a newline is pathological — drop it rather than
// let the buffer grow without bound. 32MB is far beyond any real Claude line.
const MAX_LINE_BUF = 32 * 1024 * 1024;

function buildClaudeArgv({ params }) {
  return [
    '--print',
    // stream-json emits one JSON object per line (NDJSON) as the run
    // progresses; --verbose is required to enable it under --print.
    '--output-format', 'stream-json',
    '--verbose',
    '--model', params.model || DEFAULT_MODEL,
    // bypassPermissions: the run is non-interactive, so there's nowhere to
    // surface a CLI permission prompt. Citybase gates write runs with its own
    // approval modal (BUG-004) before the process ever spawns.
    '--permission-mode', 'bypassPermissions',
    params.promptContext,
  ];
}

// Parse claude's terminal `--output-format json` envelope (also the shape of
// the `result` line under stream-json):
//   { type:'result', subtype, is_error, result:'<text>', usage, ... }
// Defensive: non-JSON stdout is treated as plain text.
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
      binaryPath: opts.claudePath ?? opts.binaryPath,
    });
  }

  _ev(entry, kind, text, payload) {
    const e = { runId: entry.run.runId, t: formatHHMM(this._now()), kind, text };
    if (payload) e.payload = payload;
    this._pushEvent(entry, e);
  }

  // Buffer stdout into complete NDJSON lines and handle each as it arrives.
  _onStdout(entry, chunk) {
    entry.lineBuf += chunk;
    let idx;
    while ((idx = entry.lineBuf.indexOf('\n')) >= 0) {
      const line = entry.lineBuf.slice(0, idx);
      entry.lineBuf = entry.lineBuf.slice(idx + 1);
      this._handleLine(entry, line);
    }
    // Guard against an unbounded partial line (no newline in tens of MB).
    if (entry.lineBuf.length > MAX_LINE_BUF) {
      this._ev(entry, 'error', 'claude: output line exceeded buffer; truncated');
      entry.lineBuf = '';
    }
  }

  _handleLine(entry, line) {
    const s = line.trim();
    if (!s) return;
    let obj;
    try { obj = JSON.parse(s); } catch { return; } // ignore non-JSON noise
    if (!obj || typeof obj !== 'object') return;

    if (obj.type === 'system' && obj.subtype === 'init') {
      this._ev(entry, 'plan', `claude: session started (${obj.model || 'default'})`);
      return;
    }
    if (obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          this._ev(entry, 'edit', `claude: ${block.text.trim()}`);
        } else if (block.type === 'tool_use') {
          const input = block.input || {};
          const path = input.file_path || input.path || input.notebook_path;
          this._ev(
            entry,
            'edit',
            `claude: ${block.name}${path ? ` ${path}` : ''}`,
            path ? { path, tool: block.name } : { tool: block.name },
          );
        }
        // thinking blocks are intentionally not surfaced (verbose internal text).
      }
      return;
    }
    if (obj.type === 'result') {
      entry.claudeResult = obj;
      if (obj.is_error) {
        this._ev(entry, 'error', `claude: ${obj.result || obj.subtype || 'error'}`);
      }
    }
  }

  // Flush any trailing partial line, factor claude's is_error into the run
  // status, and guarantee the panel never sits empty.
  _finalize(entry) {
    if (entry.lineBuf && entry.lineBuf.trim()) {
      this._handleLine(entry, entry.lineBuf);
      entry.lineBuf = '';
    }
    if (entry.claudeResult && entry.claudeResult.is_error && entry.run.status === 'done') {
      entry.run.status = 'failed';
      entry.exitState = 'fail';
    }
    if (entry.events.length === 0) {
      if (entry.cancelled) this._ev(entry, 'error', 'claude: run cancelled');
      else if (entry.exitState === 'timeout') this._ev(entry, 'error', 'claude: timed out before completing');
      else if (entry.exitState !== 'pass') {
        const reason = (entry.stderr || '').trim() || 'claude exited with a non-zero status';
        this._ev(entry, 'error', `claude: ${reason}`);
      } else {
        // A run can pass with no streamed events (claude emits only a `result`
        // line, which we record but don't surface as its own event). Prefer
        // that parsed result over re-parsing the full NDJSON stdout —
        // JSON.parse on the whole multi-line stream fails and would otherwise
        // dump the raw NDJSON as the "output" text.
        const text = (entry.claudeResult && typeof entry.claudeResult.result === 'string')
          ? entry.claudeResult.result
          : parseClaudeJsonResult(entry.stdout).text;
        this._ev(entry, 'edit', `claude: ${text || '(no output)'}`);
      }
    } else if (entry.exitState !== 'pass' && !entry.cancelled
      && !entry.events.some((e) => e.kind === 'error')) {
      // Events streamed, but the run ended non-pass with no explicit error
      // event. Prefer the timeout-specific message so a killed-on-timeout run
      // isn't mislabelled as a generic non-zero exit.
      const reason = entry.exitState === 'timeout'
        ? 'timed out before completing'
        : (entry.stderr || '').trim() || 'claude exited with a non-zero status';
      this._ev(entry, 'error', `claude: ${reason}`);
    }
  }

  // Stream the real, live event queue (token-by-token as claude emits NDJSON).
  // _drainEvents calls _requireRun internally, so an unknown id throws on first
  // iteration — matching the async-generator contract the manager relies on.
  streamEvents(runId) {
    return this._drainEvents(runId);
  }
}

module.exports = {
  ClaudeAdapter,
  NOT_FOUND_MESSAGE,
  DEFAULT_MODEL,
  buildClaudeArgv,
  parseClaudeJsonResult,
};
