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
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024; // 4 MB
const STREAM_MAX_BUFFER = 16 * 1024 * 1024; // 16 MB accumulated cap for streamed runs

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

// spawnStream — non-blocking, streaming sibling of run(). Returns a handle
// immediately ({ pid, kill, done }) and forwards stdout/stderr chunks to the
// caller as they arrive, so agent runs can stream live events and be cancelled
// for real (run() is execFile-buffered and only resolves on exit — fine for
// git/checks, wrong for a minutes-long agent session). The full output is still
// accumulated (capped) for result parsing. done resolves to the same envelope
// shape as run(), plus { killed, truncated }.
function spawnStream(command, args, {
  cwd, env, timeoutMs, maxBuffer, onStdout, onStderr, stdin,
} = {}) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError('processService.spawnStream: command must be a non-empty string');
  }
  if (!Array.isArray(args)) {
    throw new TypeError('processService.spawnStream: args must be an array');
  }
  if (!cwd || typeof cwd !== 'string') {
    throw new TypeError('processService.spawnStream: cwd is required');
  }

  const effectiveEnv = env || augmentedEnv();
  const invocation = buildInvocation(command, args, effectiveEnv);
  const cap = Number.isFinite(maxBuffer) ? maxBuffer : STREAM_MAX_BUFFER;
  const start = Date.now();

  let stdout = '';
  let stderr = '';
  let truncated = false;
  let killed = false;
  let timedOut = false;
  let settled = false;
  let timer = null;
  let killTimer = null;

  if (process.env.CITYBASE_PROCESS_TRACE === '1') {
    console.log('[processService.spawnStream]', JSON.stringify({ command, args, cwd, timeoutMs }));
  }

  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env: effectiveEnv,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
  });

  // Close stdin unless the caller pipes something — otherwise some CLIs
  // (e.g. claude) block for seconds waiting on stdin that never comes.
  if (child.stdin) {
    try { child.stdin.end(stdin === undefined ? undefined : stdin); } catch { /* ignore */ }
  }

  const accumulate = (chunk, which) => {
    const cur = which === 'out' ? stdout.length : stderr.length;
    if (cur < cap) {
      const room = cap - cur;
      const slice = chunk.length > room ? chunk.slice(0, room) : chunk;
      if (which === 'out') stdout += slice; else stderr += slice;
      if (chunk.length > room) truncated = true;
    } else {
      truncated = true;
    }
  };
  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      accumulate(chunk, 'out');
      if (typeof onStdout === 'function') { try { onStdout(chunk); } catch { /* ignore */ } }
    });
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      accumulate(chunk, 'err');
      if (typeof onStderr === 'function') { try { onStderr(chunk); } catch { /* ignore */ } }
    });
  }

  function doKill(signal = 'SIGTERM') {
    killed = true;
    const pid = child.pid;
    if (process.platform === 'win32' && pid) {
      // Tree-kill the .cmd-wrapped / shimmed process group on Windows.
      try { execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {}); } catch { /* ignore */ }
    } else {
      try { child.kill(signal); } catch { /* ignore */ }
      // Escalate to SIGKILL if it doesn't exit promptly.
      if (!killTimer) {
        killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 2000);
      }
    }
  }

  const done = new Promise((resolve) => {
    const finish = (code, signal, err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (err) {
        console.log('[processService.spawnStream] error', JSON.stringify({
          command, code: err.code, errno: err.errno, syscall: err.syscall, message: err.message,
        }));
      }
      resolve({
        ok: !err && code === 0 && !killed && !timedOut,
        code: typeof code === 'number' ? code : null,
        signal: signal || null,
        stdout,
        stderr,
        timedOut,
        killed,
        truncated,
        durationMs: Date.now() - start,
        error: err ? { message: err.message, code: err.code } : null,
      });
    };
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (code, signal) => finish(code, signal, null));
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => { timedOut = true; doKill('SIGTERM'); }, timeoutMs);
    }
  });

  return { pid: child.pid, kill: doKill, done };
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

module.exports = { run, spawnStream, buildInvocation };
