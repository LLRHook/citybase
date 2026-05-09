// detectAgentBinaries — pure PATH-based binary detection for the codex
// and claude CLIs. No shelling out yet (version detection is a follow-up
// slice; tools like `codex --version` need the processService and its
// macOS PATH augmentation).
//
// Pure function — every input is injected. Tests stub fsExists with a Set
// of paths and assert the right combinations.
const path = require('node:path');

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
  fsExists = () => false,
  candidates = DEFAULT_CANDIDATES,
} = {}) {
  // Windows surfaces both PATH and Path depending on shell; fall back to
  // either. POSIX always uses PATH.
  const rawPath = (env && (env.PATH || env.Path)) || '';
  const delimiter = pickPathDelimiter(platform);
  const pathDirs = rawPath.split(delimiter).filter(Boolean);
  const extensions = pickExtensions(platform);

  const codexNames = candidates.codex || DEFAULT_CANDIDATES.codex;
  const claudeNames = candidates.claude || DEFAULT_CANDIDATES.claude;

  const join = pickJoin(platform);
  const codexPath = findBinary({ candidates: codexNames, pathDirs, extensions, join, fsExists });
  const claudePath = findBinary({ candidates: claudeNames, pathDirs, extensions, join, fsExists });

  return {
    codex: codexPath ? { found: true, path: codexPath } : { found: false },
    claude: claudePath ? { found: true, path: claudePath } : { found: false },
  };
}

module.exports = { detectAgentBinaries, DEFAULT_CANDIDATES };
