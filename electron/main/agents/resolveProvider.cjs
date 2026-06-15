// resolveProvider — picks an installed adapter when the renderer asks
// for the symbolic 'auto' provider. Pure function: takes the detection
// result and the manager's registered provider list, returns the
// chosen provider name or throws if none are installed.
//
// Order of preference: claude first, then codex — Claude Code is the
// documented v1 default first-run provider (ROADMAP v1 ship gate,
// docs/agent-runtime.md). The order is fixed so the same workspace gives
// the same answer across launches; the user can override via the Provider
// selector.

const PREFERRED_ORDER = Object.freeze(['claude', 'codex']);

/**
 * @param {{ codex?: { found: boolean }, claude?: { found: boolean } }} detectResult
 * @param {string[]} registered  — agentManager.listProviders() output
 * @returns {string} the chosen provider name
 */
function resolveProvider(detectResult, registered) {
  const detect = detectResult || {};
  const known = new Set(Array.isArray(registered) ? registered : []);
  for (const name of PREFERRED_ORDER) {
    if (!known.has(name)) continue;
    const entry = detect[name];
    if (entry && entry.found) return name;
  }
  throw new Error('no installed agent CLI found (looked for claude, codex)');
}

module.exports = { resolveProvider, PREFERRED_ORDER };
