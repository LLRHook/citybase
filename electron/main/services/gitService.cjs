// gitService.cjs — read-only Git wrapper used by the renderer.
//
// Strategy from plan.md:
//   - shell out to the user's installed `git` (no Git library yet),
//   - parse `git status --porcelain=v2 --branch` for branch + dirty state,
//   - read recent commits via `git log --oneline -n 30`,
//   - never run mutating commands here in v0.1.
//
// All commands go through processService.run, which pins cwd and uses argv arrays.
const { run } = require('./processService.cjs');

const PORCELAIN_STATUS_MAP = {
  '.': 'unmodified',
  'M': 'modified',
  'A': 'added',
  'D': 'deleted',
  'R': 'renamed',
  'C': 'renamed', // copied — collapse for v0.1
  'U': 'conflicted',
  '?': 'untracked',
};

async function getSnapshot(workspace) {
  const cwd = workspace.rootPath;
  const [topResult, statusResult, logResult] = await Promise.all([
    run('git', ['rev-parse', '--show-toplevel'], { cwd }),
    run('git', ['status', '--porcelain=v2', '--branch'], { cwd }),
    run('git', ['log', '--oneline', '--decorate', '-n', '30'], { cwd }),
  ]);

  if (!topResult.ok) {
    return notARepoSnapshot(workspace, topResult);
  }

  const branchInfo = parseBranchHeader(statusResult.stdout);
  const files = parseFiles(statusResult.stdout);
  const recentCommits = parseLog(logResult.ok ? logResult.stdout : '');

  return {
    workspaceId: workspace.id,
    rootPath: workspace.rootPath,
    branch: branchInfo.branch,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    isDirty: files.length > 0,
    files,
    recentCommits,
    error: null,
  };
}

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
    error: { kind: 'no-git', message },
  };
}

// porcelain=v2 --branch lines:
//   "# branch.oid <oid>"
//   "# branch.head <name|(detached)>"
//   "# branch.upstream <upstream>"
//   "# branch.ab +<ahead> -<behind>"
//   "1 <XY> ... <path>"   — changed tracked file
//   "2 <XY> ... <orig> -> <path>" — renamed/copied
//   "u <XY> ... <path>"   — unmerged
//   "? <path>"            — untracked
function parseBranchHeader(stdout) {
  const out = { branch: null, ahead: 0, behind: 0 };
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('# branch.')) continue;
    const [, key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'branch.head') out.branch = value === '(detached)' ? null : value;
    if (key === 'branch.ab') {
      const m = value.match(/^\+(\d+)\s+-(\d+)$/);
      if (m) { out.ahead = Number(m[1]); out.behind = Number(m[2]); }
    }
  }
  return out;
}

function parseFiles(stdout) {
  const files = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# ')) continue;
    if (line.startsWith('? ')) {
      files.push({ path: line.slice(2), status: 'untracked' });
      continue;
    }
    if (line.startsWith('1 ')) {
      // "1 XY sub mH mI mW hH hI path"
      const parts = line.split(' ');
      const xy = parts[1] || '..';
      const path = parts.slice(8).join(' ');
      files.push({ path, status: statusFromXy(xy) });
      continue;
    }
    if (line.startsWith('2 ')) {
      // "2 XY sub mH mI mW hH hI XscoreR path<TAB>orig"
      const parts = line.split(' ');
      const xy = parts[1] || '..';
      const tail = parts.slice(9).join(' ');
      const tabIdx = tail.indexOf('\t');
      const path = tabIdx >= 0 ? tail.slice(0, tabIdx) : tail;
      files.push({ path, status: statusFromXy(xy) || 'renamed' });
      continue;
    }
    if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const path = parts.slice(10).join(' ');
      files.push({ path, status: 'conflicted' });
      continue;
    }
  }
  return files;
}

function statusFromXy(xy) {
  if (!xy || xy.length < 2) return 'modified';
  const x = xy[0], y = xy[1];
  if (x === 'U' || y === 'U') return 'conflicted';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'M' || y === 'M') return 'modified';
  return PORCELAIN_STATUS_MAP[x] || PORCELAIN_STATUS_MAP[y] || 'modified';
}

function parseLog(stdout) {
  return stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sp = line.indexOf(' ');
      if (sp < 0) return { hash: line, title: '' };
      return { hash: line.slice(0, sp), title: line.slice(sp + 1) };
    });
}

module.exports = { getSnapshot };
