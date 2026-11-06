// Frozen pre-port parser oracle. Tests only; never imported by production.
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

// `git ls-files -z` separates entries with NUL, which is stable for paths
// that contain spaces, quotes, or other shell-hostile characters.
function parseLsFilesZ(stdout) {
  if (!stdout) return [];
  return stdout.split('\0').filter(Boolean);
}

// `git ls-tree -r -l -z HEAD` entries: "<mode> <type> <sha> <size>\t<path>".
// Size is '-' for non-blobs. Returns { [path]: bytes } for the city's
// building-height weighting; malformed entries are skipped, never thrown.
function parseLsTreeSizes(stdout) {
  const sizes = {};
  if (!stdout) return sizes;
  for (const entry of stdout.split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const meta = entry.slice(0, tab).trim().split(/\s+/);
    const size = Number(meta[3]);
    if (!Number.isFinite(size)) continue;
    sizes[entry.slice(tab + 1)] = size;
  }
  return sizes;
}

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

function statusForXyDigit(ch) {
  // '.' means clean for that side of XY in porcelain v2; everything else
  // collapses through PORCELAIN_STATUS_MAP. Unknown characters fall
  // through to 'modified' so we never lose a file.
  if (!ch) return 'unmodified';
  if (ch === '.') return 'unmodified';
  return PORCELAIN_STATUS_MAP[ch] || 'modified';
}

function parseFiles(stdout) {
  const files = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# ')) continue;
    if (line.startsWith('? ')) {
      // Untracked: not in the index, present in the worktree.
      files.push({
        path: line.slice(2),
        status: 'untracked',
        staged: false,
        unstaged: true,
        indexStatus: 'unmodified',
        workTreeStatus: 'untracked',
      });
      continue;
    }
    if (line.startsWith('1 ')) {
      // "1 XY sub mH mI mW hH hI path"
      const parts = line.split(' ');
      const xy = parts[1] || '..';
      const path = parts.slice(8).join(' ');
      files.push(buildFileEntry(path, xy, statusFromXy(xy)));
      continue;
    }
    if (line.startsWith('2 ')) {
      // "2 XY sub mH mI mW hH hI XscoreR path<TAB>orig"
      const parts = line.split(' ');
      const xy = parts[1] || '..';
      const tail = parts.slice(9).join(' ');
      const tabIdx = tail.indexOf('\t');
      const path = tabIdx >= 0 ? tail.slice(0, tabIdx) : tail;
      files.push(buildFileEntry(path, xy, statusFromXy(xy) || 'renamed'));
      continue;
    }
    if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const path = parts.slice(10).join(' ');
      // Unmerged entries are conflicted on both sides of XY by definition.
      files.push({
        path,
        status: 'conflicted',
        staged: true,
        unstaged: true,
        indexStatus: 'conflicted',
        workTreeStatus: 'conflicted',
      });
      continue;
    }
  }
  return files;
}

function buildFileEntry(path, xy, status) {
  const x = xy[0] || '.';
  const y = xy[1] || '.';
  return {
    path,
    status,
    staged: x !== '.',
    unstaged: y !== '.',
    indexStatus: statusForXyDigit(x),
    workTreeStatus: statusForXyDigit(y),
  };
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
    .map(line => line.replace(/\r$/, ''))
    .filter(Boolean)
    .map(line => {
      // Format: <hash>\t<isoCommitDate>\t<subject>
      const parts = line.split('\t');
      if (parts.length < 3) {
        // Older format or unexpected line — degrade gracefully.
        return { hash: parts[0] || '', committedAt: null, title: parts.slice(1).join(' ') };
      }
      return { hash: parts[0], committedAt: parts[1], title: parts.slice(2).join('\t') };
    });
}


function legacySnapshot({status = '', log = '', tree = '', sizes = ''} = {}) {
 const files = parseFiles(status);
 return { ...parseBranchHeader(status), isDirty: files.length > 0, files,
  recentCommits: parseLog(log), repoTree: parseLsFilesZ(tree), fileSizes: parseLsTreeSizes(sizes) };
}
module.exports = { legacySnapshot };
