// detectAgentBinaries — pure PATH-based binary detection for the codex
// and claude CLIs. No shelling out yet (version detection is a follow-up
// slice; tools like `codex --version` need the processService and its
// macOS PATH augmentation).
//
// Tests inject a `fsExists` function that returns true for a fixture
// Set of paths. Production callers leave it unset and we fall back to
// `fs.existsSync`. Earlier the default was `() => false` and every
// production caller silently got "no agents installed" — the bug
// surfaced when a user clicked Run with provider='auto' and the
// resolver said no installed agent CLI was found.
const path = require('node:path');
const fs = require('node:fs');

function defaultFsExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

const DEFAULT_CANDIDATES = Object.freeze({
  codex: Object.freeze(['codex']),
  claude: Object.freeze(['claude']),
});

const POSIX_EXTENSIONS = Object.freeze(['']);
const WINDOWS_EXTENSIONS = Object.freeze(['.exe', '.cmd', '.bat', '.ps1', '']);

function pickExtensions(platform) {
  return platform === 'win32' ? WINDOWS_EXTENSIONS : POSIX_EXTENSIONS;
}

function pickPathDelimiter(platform) {
  return platform === 'win32' ? ';' : ':';
}

// Use path.posix / path.win32 explicitly so Linux- and Windows-style
// PATH directories produce the right separator regardless of which OS
// the renderer/test runner is running on.
function pickJoin(platform) {
  return platform === 'win32' ? path.win32.join : path.posix.join;
}

// PATH dirs Electron's main process often misses because it inherits a
// trimmed env (Finder on macOS, no .bashrc on Linux, taskbar launches
// on Windows that bypass user-profile env-var setup). Probing the
// common per-user install roots catches binaries that `which claude`
// in a terminal would find but a fresh-launched Electron process
// wouldn't.
function extraPathDirs({ env, platform }) {
  if (!env || typeof env !== 'object') return [];
  if (platform === 'win32') {
    return [
      env.USERPROFILE ? path.win32.join(env.USERPROFILE, '.local', 'bin') : null,
      env.APPDATA ? path.win32.join(env.APPDATA, 'npm') : null,
      env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links') : null,
    ].filter(Boolean);
  }
  if (platform === 'darwin') {
    return [
      env.HOME ? path.posix.join(env.HOME, '.local', 'bin') : null,
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ].filter(Boolean);
  }
  return [
    env.HOME ? path.posix.join(env.HOME, '.local', 'bin') : null,
  ].filter(Boolean);
}

// On Windows, npm installs of the codex CLI typically live at
// %APPDATA%\npm\codex.cmd (the stable, persistent shim). A user's
// %USERPROFILE%\.local\bin\codex.cmd may also exist as a per-checkout
// one-off and points at a transient location. Prefer the stable
// install when both exist so detection picks something reliable.
function preferStableWindowsCodex(codexPath, env, fsExists) {
  if (!codexPath) return codexPath;
  const normalized = codexPath.toLowerCase();
  if (!normalized.endsWith('\\.local\\bin\\codex.cmd')) return codexPath;

  const stableCandidates = [
    env.APPDATA ? path.win32.join(env.APPDATA, 'npm', 'codex.cmd') : null,
    env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'codex.exe') : null,
  ].filter(Boolean);
  return stableCandidates.find((p) => fsExists(p)) || codexPath;
}

/**
 * Probe each PATH directory for a candidate binary, return the first hit.
 * @param {{ candidates: readonly string[], pathDirs: string[], extensions: readonly string[], join: (a: string, b: string) => string, fsExists: (p: string) => boolean }} args
 * @returns {string | null} absolute candidate path or null
 */
function findBinary({ candidates, pathDirs, extensions, join, fsExists }) {
  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const name of candidates) {
      for (const ext of extensions) {
        const candidate = join(dir, `${name}${ext}`);
        if (fsExists(candidate)) return candidate;
      }
    }
  }
  return null;
}

/**
 * Detect codex / claude CLIs on the user's PATH.
 *
 * Returns the same shape regardless of platform so the renderer can rely
 * on `result.codex.found` / `result.claude.found` always being booleans.
 *
 * @param {{
 *   env?: { PATH?: string, Path?: string, [k: string]: string | undefined },
 *   platform?: NodeJS.Platform,
 *   fsExists?: (p: string) => boolean,
 *   candidates?: { codex?: readonly string[], claude?: readonly string[] },
 * }} [opts]
 */
function detectAgentBinaries({
  env = process.env,
  platform = process.platform,
  fsExists = defaultFsExists,
  candidates = DEFAULT_CANDIDATES,
} = {}) {
  // Windows surfaces both PATH and Path depending on shell; fall back to
  // either. POSIX always uses PATH.
  const rawPath = (env && (env.PATH || env.Path)) || '';
  const delimiter = pickPathDelimiter(platform);
  const pathDirs = [
    ...rawPath.split(delimiter).filter(Boolean),
    ...extraPathDirs({ env, platform }),
  ];
  const extensions = pickExtensions(platform);

  const codexNames = candidates.codex || DEFAULT_CANDIDATES.codex;
  const claudeNames = candidates.claude || DEFAULT_CANDIDATES.claude;

  const join = pickJoin(platform);
  const rawCodexPath = findBinary({ candidates: codexNames, pathDirs, extensions, join, fsExists });
  const codexPath = platform === 'win32'
    ? preferStableWindowsCodex(rawCodexPath, env || {}, fsExists)
    : rawCodexPath;
  const claudePath = findBinary({ candidates: claudeNames, pathDirs, extensions, join, fsExists });

  return {
    codex: codexPath ? { found: true, path: codexPath } : { found: false },
    claude: claudePath ? { found: true, path: claudePath } : { found: false },
  };
}

module.exports = { detectAgentBinaries, DEFAULT_CANDIDATES };
