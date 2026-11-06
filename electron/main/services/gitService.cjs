// gitService.cjs — Git wrapper used by the renderer.
//
// Strategy from plan.md:
//   - shell out to the user's installed `git` (no Git library yet),
//   - parse `git status --porcelain=v2 --branch` for branch + dirty state,
//   - read recent commits via `git log` with %h/%cI/%s,
//   - read tracked tree via `git ls-files -z`.
//
// Phase 5 slice 4 introduces the FIRST mutating commands the renderer
// can drive: checkout(workspace, branchName) and commit(workspace, ...).
// Both are gated by argument validation (branch existence, message
// non-empty) and surface failures as { ok: false, error } so the UI
// can render a toast instead of crashing the main process.
//
// All commands go through processService.run, which pins cwd and uses
// argv arrays. Tests build an isolated service via createGitService({
// processService }) and inject a mock — vi.mock can't reliably intercept
// CJS require() chains in this test setup, so we lean on DI like the rest
// of the main-process modules already do.
const realProcessService = require('./processService.cjs');
const { processSnapshot } = require('./snapshotProcessor.cjs');

function notARepoSnapshot(workspace, topResult) {
  const stderr = (topResult.stderr || '').trim();
  const message = stderr.includes('not a git repository')
    ? 'not a Git repository'
    : stderr || 'git not available';
  return {
    workspaceId: workspace.id,
    rootPath: workspace.rootPath,
    branch: null,
    ahead: 0,
    behind: 0,
    isDirty: false,
    files: [],
    recentCommits: [],
    repoTree: [],
    error: { kind: 'no-git', message },
  };
}

// Pure parser for `git branch --format='%(refname:short)\t%(HEAD)\t%(upstream:short)' --no-color`.
// Each non-empty line is tab-separated: name<TAB>head-marker<TAB>upstream.
// %(HEAD) emits '*' for the current branch and ' ' (space) otherwise.
// %(upstream:short) is empty when no upstream is configured.
function parseBranchList(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return [];
  return stdout.split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map(line => {
      const parts = line.split('\t');
      const name = (parts[0] || '').trim();
      const head = (parts[1] || '').trim();
      const upstream = (parts[2] || '').trim();
      if (!name) return null;
      return {
        name,
        isCurrent: head === '*',
        upstream: upstream || null,
      };
    })
    .filter(Boolean);
}

// Pull a single hash out of `git rev-parse HEAD` stdout.
function parseHeadHash(stdout) {
  if (typeof stdout !== 'string') return null;
  const trimmed = stdout.trim();
  return /^[0-9a-f]{4,40}$/i.test(trimmed) ? trimmed : null;
}

function failure(message, extras = {}) {
  return { ok: false, error: { message, ...extras } };
}

function createGitService({ processService } = {}) {
  const ps = processService || realProcessService;
  const run = ps && ps.run;
  if (typeof run !== 'function') {
    throw new TypeError('createGitService: processService.run must be a function');
  }

  async function getSnapshot(workspace) {
    const cwd = workspace.rootPath;
    const [topResult, statusResult, logResult, treeResult, sizesResult] = await Promise.all([
      run('git', ['rev-parse', '--show-toplevel'], { cwd }),
      // quotePath=false: git's default C-quoting of non-ASCII paths would
      // feed the parser literal `"src/caf\303\251.js"` strings that never
      // match ls-files output or city buildings (BUG-009).
      run('git', ['-c', 'core.quotePath=false', 'status', '--porcelain=v2', '--branch'], { cwd }),
      // Tab-delimited so titles can contain anything, including the unit
      // separator we'd otherwise prefer. %h short hash, %cI ISO commit date,
      // %s subject. -z would be cleaner but git log doesn't honor it for
      // --pretty=format, so we split on newlines and trim CRs.
      run('git', ['log', `--pretty=format:%h%x09%cI%x09%s`, '-n', '30'], { cwd }),
      // ls-files lists tracked files only — fast, no untracked noise, gives the
      // city projector a stable folder/file tree even when the working copy is dirty.
      run('git', ['ls-files', '-z'], { cwd, maxBuffer: 16 * 1024 * 1024 }),
      // Blob sizes at HEAD (additive, best-effort): the 3D city weights
      // building height by file size (FEAT-024). Files staged-but-not-yet-
      // committed simply have no size entry and fall back to a default.
      run('git', ['-c', 'core.quotePath=false', 'ls-tree', '-r', '-l', '-z', 'HEAD'], { cwd, maxBuffer: 32 * 1024 * 1024 }),
    ]);

    if (!topResult.ok) {
      return notARepoSnapshot(workspace, topResult);
    }

    const projection = await processSnapshot({
      status: statusResult.stdout || '',
      log: logResult.ok ? logResult.stdout : '',
      tree: treeResult.ok ? treeResult.stdout : '',
      sizes: sizesResult && sizesResult.ok ? sizesResult.stdout : '',
    });
    return { workspaceId: workspace.id, rootPath: workspace.rootPath, ...projection, error: null };
  }

  async function getBranches(workspace) {
    if (!workspace || !workspace.rootPath) return [];
    const result = await run(
      'git',
      ['branch', '--format=%(refname:short)\t%(HEAD)\t%(upstream:short)', '--no-color'],
      { cwd: workspace.rootPath, maxBuffer: 4 * 1024 * 1024 },
    );
    if (!result.ok) return [];
    return parseBranchList(result.stdout || '');
  }

  /**
   * Switch the workspace's current branch. The branch MUST already exist;
   * we don't create new ones from this surface (Phase 5 keeps the surface
   * conservative — the user picks from the BranchSelector dropdown which
   * is fed by getBranches).
   */
  async function checkout(workspace, branchName) {
    if (!workspace || typeof workspace.rootPath !== 'string') {
      return failure('workspace.rootPath is required');
    }
    if (typeof branchName !== 'string' || branchName.length === 0) {
      return failure('branchName is required');
    }
    const cwd = workspace.rootPath;

    // Validate the branch is something we know about. Refusing unknown
    // names keeps `checkout` from accidentally creating a branch via
    // `git checkout -b` semantics (we never pass -b).
    const branches = await getBranches(workspace);
    if (!branches.some((b) => b.name === branchName)) {
      return failure(`branch not found: ${branchName}`);
    }

    const result = await run('git', ['checkout', branchName], { cwd });
    if (!result.ok) {
      return failure(`checkout failed: ${branchName}`, {
        code: result.code,
        stderr: (result.stderr || '').trim(),
      });
    }
    return { ok: true, branch: branchName };
  }

  /**
   * Record a commit with the given message. When addAll is true (default)
   * we run `git add -A` first so unstaged changes get caught.
   */
  async function commit(workspace, { message, addAll = true } = {}) {
    if (!workspace || typeof workspace.rootPath !== 'string') {
      return failure('workspace.rootPath is required');
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      return failure('commit message is required');
    }
    const cwd = workspace.rootPath;

    if (addAll) {
      const addResult = await run('git', ['add', '-A'], { cwd });
      if (!addResult.ok) {
        return failure('git add -A failed', {
          code: addResult.code,
          stderr: (addResult.stderr || '').trim(),
        });
      }
    }

    const commitResult = await run('git', ['commit', '-m', message], { cwd });
    if (!commitResult.ok) {
      return failure('git commit failed', {
        code: commitResult.code,
        stderr: (commitResult.stderr || '').trim(),
      });
    }

    // Best-effort: read back the new HEAD so the renderer can display it.
    // If this fails for any reason we still return ok=true since the
    // commit itself landed.
    const head = await run('git', ['rev-parse', 'HEAD'], { cwd });
    return {
      ok: true,
      commitHash: head.ok ? parseHeadHash(head.stdout) : null,
    };
  }

  return { getSnapshot, getBranches, checkout, commit };
}

const _default = createGitService();

module.exports = {
  ..._default,
  createGitService,
  parseBranchList,
  parseHeadHash,
};
