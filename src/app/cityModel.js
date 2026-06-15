// cityModel.js — pure projection from a live Git snapshot to the city's
// { districts, buildings } shape. No React, no DOM: fully unit-testable.
//
// Inputs come straight from gitService.getSnapshot:
//   repoTree — tracked file paths (POSIX, repo-relative) from `git ls-files`
//   files    — dirty entries [{ path, status, staged, unstaged }] from status
//
// Layout:
//   top-level folders → districts on concentric hex rings (busiest innermost)
//   repo-root files   → a synthetic 'core' district at the origin
//   each district     → up to MAX_BUILDINGS buildings on a 4-wide grid
//
// Ported and reworked from the deleted prototype (git 1356437): the renderer
// (FEAT-014) owns spacing so footprints never overlap, and buildings now carry
// per-file dirty status so the city reflects real working-tree state.

// Axial (q, r) seats: ring 1 (6), ring 2 (12), ring 3 (18). Busiest districts
// take inner seats and stay legible if outer rings overflow.
const RING_POSITIONS = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
  [2, 0], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1],
  [-2, 0], [-1, -1], [0, -2], [1, -2], [2, -2], [2, -1],
  [3, 0], [2, 1], [1, 2], [0, 3], [-1, 3], [-2, 3],
  [-3, 3], [-3, 2], [-3, 1], [-3, 0], [-2, -1], [-1, -2],
  [0, -3], [1, -3], [2, -3], [3, -3], [3, -2], [3, -1],
];

const DISTRICT_COLOR_CYCLE = ['cyan', 'magenta', 'amber', 'green'];

const GRID_COLS = 4;
const MAX_BUILDINGS = 16; // 4×4 grid per district

const TOWER_NAME_PATTERN = /^(index|main|app|page|layout|server|client|root)\b/i;
const TOWER_FILENAMES = new Set([
  'package.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts',
  'eslint.config.js', '.eslintrc.cjs', 'webpack.config.js', 'rollup.config.js',
  'Dockerfile', 'dockerfile', 'README.md', 'readme.md',
]);

function isTowerFile(name) {
  if (TOWER_FILENAMES.has(name)) return true;
  const stem = name.split('.')[0] || '';
  return TOWER_NAME_PATTERN.test(stem);
}

function topLevelOf(p) {
  const i = p.indexOf('/');
  return i === -1 ? null : p.slice(0, i);
}

function basenameOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

function districtIdFor(folderName) {
  return folderName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function titleCase(s) {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// Small deterministic hash → stable per-path height jitter so the skyline has
// variety without flickering between renders.
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

function heightFor(name, path, isTower) {
  const base = isTower ? 2.0 : 1.1;
  return base + hashStr(path || name) * (isTower ? 0.9 : 0.7);
}

/**
 * Project a git snapshot into the city model.
 * @param {string[]} repoTree tracked file paths
 * @param {Array<{path:string,status?:string,staged?:boolean,unstaged?:boolean}>} [files] dirty entries
 * @returns {{ districts: object[], buildings: object[] }}
 */
export function projectRepoTreeToCityModel(repoTree, files = []) {
  if (!Array.isArray(repoTree) || repoTree.length === 0) {
    return { districts: [], buildings: [] };
  }

  const dirtyByPath = new Map();
  for (const f of Array.isArray(files) ? files : []) {
    if (f && typeof f.path === 'string') dirtyByPath.set(f.path, f);
  }

  // Bucket tracked files by top-level segment; root files → 'core'.
  const byFolder = new Map();
  for (const p of repoTree) {
    if (!p || typeof p !== 'string') continue;
    const key = topLevelOf(p) ?? '__root__';
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(p);
  }

  // Core first, then by file count desc, then alphabetical — deterministic.
  const folderEntries = [...byFolder.entries()].sort((a, b) => {
    if (a[0] === '__root__') return -1;
    if (b[0] === '__root__') return 1;
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const districts = [];
  const buildings = [];
  let nonCoreIndex = 0;

  for (const [folderKey, folderFiles] of folderEntries) {
    const isCore = folderKey === '__root__';
    const districtId = isCore ? 'core' : districtIdFor(folderKey);

    let q;
    let r;
    let color;
    if (isCore) {
      q = 0; r = 0; color = 'cyan';
    } else {
      const seat = RING_POSITIONS[nonCoreIndex];
      if (!seat) { nonCoreIndex += 1; continue; } // past ring 3 → drop
      [q, r] = seat;
      color = DISTRICT_COLOR_CYCLE[nonCoreIndex % DISTRICT_COLOR_CYCLE.length];
      nonCoreIndex += 1;
    }

    const dirtyInDistrict = folderFiles.filter((f) => dirtyByPath.has(f)).length;
    const health = folderFiles.length === 0
      ? 100
      : Math.round(((folderFiles.length - dirtyInDistrict) / folderFiles.length) * 100);

    districts.push({
      id: districtId,
      name: isCore ? '/' : folderKey,
      label: isCore ? 'core' : titleCase(folderKey),
      color,
      q,
      r,
      isCore,
      files: folderFiles.length,
      dirty: dirtyInDistrict,
      health,
    });

    // Towers first so signature files survive the cap; then a deterministic
    // alphabetical order for the rest.
    const sorted = [...folderFiles].sort((a, b) => {
      const ta = isTowerFile(basenameOf(a));
      const tb = isTowerFile(basenameOf(b));
      if (ta !== tb) return ta ? -1 : 1;
      return a.localeCompare(b);
    });
    const shown = sorted.slice(0, MAX_BUILDINGS);
    shown.forEach((f, i) => {
      const name = basenameOf(f);
      const tower = isTowerFile(name);
      const entry = dirtyByPath.get(f);
      buildings.push({
        d: districtId,
        name,
        path: f,
        type: tower ? 'tower' : 'house',
        dirty: !!entry,
        staged: !!(entry && entry.staged),
        status: entry ? entry.status || 'modified' : 'clean',
        col: i % GRID_COLS,
        row: Math.floor(i / GRID_COLS),
        h: heightFor(name, f, tower),
      });
    });
  }

  return { districts, buildings };
}

export { GRID_COLS, MAX_BUILDINGS };
