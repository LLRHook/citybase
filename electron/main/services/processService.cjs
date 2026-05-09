// processService.cjs — guarded child-process runner.
//
// Hard rules (from plan.md → "Phase 3 / processService"):
//   - argv arrays only; no shell strings, no string concatenation.
//   - cwd is required and pinned to a workspace path.
//   - timeout, max output buffer, kill-on-timeout.
//   - stdout/stderr captured separately, with size caps to avoid OOM on noisy CLIs.
//
// This is the only place in the main process that should call execFile/spawn.
const { execFile } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024; // 4 MB

function run(command, args, { cwd, timeoutMs, maxBuffer, env } = {}) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError('processService.run: command must be a non-empty string');
  }
  if (!Array.isArray(args)) {
    throw new TypeError('processService.run: args must be an array');
  }
  if (!cwd || typeof cwd !== 'string') {
    throw new TypeError('processService.run: cwd is required');
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const child = execFile(command, args, {
      cwd,
      timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: maxBuffer ?? DEFAULT_MAX_BUFFER,
      env: env || augmentedEnv(),
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const durationMs = Date.now() - start;
      const code = err && typeof err.code === 'number' ? err.code
        : err && err.code === 'ETIMEDOUT' ? null
        : 0;
      resolve({
        ok: !err,
        code,
        signal: child.signalCode || null,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        timedOut: !!(err && err.killed && err.signal === 'SIGTERM'),
        durationMs,
        error: err ? { message: err.message, code: err.code } : null,
      });
    });
  });
}

// Apps launched from Finder on macOS inherit a thin PATH that omits
// /opt/homebrew/bin and /usr/local/bin. Augment for git/codex/claude lookups.
function augmentedEnv() {
  const env = { ...process.env };
  const extras = ['/opt/homebrew/bin', '/usr/local/bin'];
  const cur = (env.PATH || '').split(':').filter(Boolean);
  for (const p of extras) {
    if (!cur.includes(p)) cur.push(p);
  }
  env.PATH = cur.join(':');
  return env;
}

module.exports = { run };
