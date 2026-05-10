// processService.cjs — guarded child-process runner.
//
// Hard rules:
//   - argv arrays only; no shell strings, no string concatenation.
//   - cwd is required and pinned to a workspace path.
//   - timeout, max output buffer, kill-on-timeout.
//   - stdout/stderr captured separately, with size caps to avoid OOM on noisy CLIs.
//
// This is the only place in the main process that should call execFile/spawn.
//
// Windows shim handling: Node's execFile cannot spawn .cmd / .bat files
// directly — it returns spawn EINVAL. When the resolved binary has one
// of those extensions we wrap the call through `cmd.exe /d /s /c
// "<cmd> <args>"` with windowsVerbatimArguments so cmd.exe gets the
// command line we built and doesn't reparse our arg-quoting. This is
// what makes the codex.cmd shim that npm and WinGet ship work.
const { execFile } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024; // 4 MB

function run(command, args, { cwd, timeoutMs, maxBuffer, env, stdin } = {}) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError('processService.run: command must be a non-empty string');
  }
  if (!Array.isArray(args)) {
    throw new TypeError('processService.run: args must be an array');
  }
  if (!cwd || typeof cwd !== 'string') {
    throw new TypeError('processService.run: cwd is required');
  }

  // Diagnostic trace, env-gated so production stdout stays quiet. Set
  // CITYBASE_PROCESS_TRACE=1 to dump every spawn (no env: secrets stay
  // out of logs). The error-path log below is unconditional — a spawn
  // that fails with EINVAL/ENOENT/etc is rare enough that always
  // recording the syscall + code is the right tradeoff.
  if (process.env.CITYBASE_PROCESS_TRACE === '1') {
    console.log('[processService.run]', JSON.stringify({ command, args, cwd, timeoutMs }));
  }

  const effectiveEnv = env || augmentedEnv();
  const invocation = buildInvocation(command, args, effectiveEnv);

  return new Promise((resolve) => {
    const start = Date.now();
    let child = null;
    const finish = (err, stdout, stderr) => {
      const durationMs = Date.now() - start;
      const code = err && typeof err.code === 'number' ? err.code
        : err && err.code === 'ETIMEDOUT' ? null
        : err ? null
        : 0;
      if (err) {
        console.log('[processService.run] error', JSON.stringify({
          command, code: err.code, errno: err.errno, syscall: err.syscall, message: err.message,
        }));
      }
      resolve({
        ok: !err,
        code,
        signal: child?.signalCode || null,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        timedOut: !!(err && err.killed && err.signal === 'SIGTERM'),
        durationMs,
        error: err ? { message: err.message, code: err.code } : null,
      });
    };

    try {
      child = execFile(invocation.command, invocation.args, {
        cwd,
        timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: maxBuffer ?? DEFAULT_MAX_BUFFER,
        env: effectiveEnv,
        windowsHide: true,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
      }, finish);
      if (stdin !== undefined && child.stdin) {
        child.stdin.end(stdin);
      }
    } catch (err) {
      // execFile can throw synchronously when given an invalid command
      // shape (e.g. cmd contains a NUL). Funnel that through the same
      // resolve() path so callers always see a result envelope.
      finish(err, '', '');
    }
  });
}

// Build the argv we actually hand to execFile. On non-Windows or for
// real .exe binaries we pass through unchanged. For .cmd / .bat shims
// we wrap with cmd.exe /d /s /c "<command> <quoted args>" using
// windowsVerbatimArguments so cmd.exe interprets our own quoting and
// not Node's re-quoting on top.
function buildInvocation(command, args, env, platform = process.platform) {
  if (platform !== 'win32') return { command, args };
  const ext = path.extname(command).toLowerCase();
  if (ext !== '.cmd' && ext !== '.bat') return { command, args };
  const commandLine = [command, ...args].map(quoteCmdArg).join(' ');
  return {
    command: (env && env.ComSpec) || process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

function quoteCmdArg(value) {
  const s = String(value);
  if (s.length === 0) return '""';
  // Caret-escape the cmd metacharacters so a prompt with `&` / `|` / `<` / `>`
  // / `%` / `^` / `"` doesn't trigger cmd.exe expansion or redirection.
  return `"${s.replace(/(["^&|<>%])/g, '^$1')}"`;
}

// Apps launched from Finder on macOS inherit a thin PATH that omits
// /opt/homebrew/bin and /usr/local/bin. Augment for git/codex/claude lookups.
// On Windows and Linux these paths don't apply, so skip the augmentation.
function augmentedEnv() {
  const env = { ...process.env };
  if (process.platform !== 'darwin') return env;
  const extras = ['/opt/homebrew/bin', '/usr/local/bin'];
  const cur = (env.PATH || '').split(':').filter(Boolean);
  for (const p of extras) {
    if (!cur.includes(p)) cur.push(p);
  }
  env.PATH = cur.join(':');
  return env;
}

module.exports = { run, buildInvocation };
