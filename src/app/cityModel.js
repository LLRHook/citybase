// cityModel.js — pure projection from a Git repo tree to the city's
// district + building shape that map.jsx already consumes.
//
// Contract: takes a flat list of tracked file paths (POSIX, relative to repo
// root) and an optional list of dirty files, returns the same { districts,
// buildings } shape the seed used to provide. Components don't need to know
// whether the data came from a real workspace or a fixture.
//
// Layout:
//   - top-level folders → districts placed in concentric hex rings around core
//   - files at the repo root → buildings under the synthetic 'core' district
//   - districts ordered by file count desc so the busiest ones sit closest to
//     core and stay visible when the ring overflows.

// Hex ring positions in cube/axial coordinates (q, r). Ring N has 6N cells.
// Ring 1 first (closest to origin), then ring 2, then ring 3 — enough seats
// for ~36 districts before clipping. Real repos usually have <20 top dirs.
const RING_POSITIONS = [
  // Ring 1 — 6 seats
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
  // Ring 2 — 12 seats
  [2, 0], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1],
  [-2, 0], [-1, -1], [0, -2], [1, -2], [2, -2], [2, -1],
  // Ring 3 — 18 seats
  [3, 0], [2, 1], [1, 2], [0, 3], [-1, 3], [-2, 3],
  [-3, 3], [-3, 2], [-3, 1], [-3, 0], [-2, -1], [-1, -2],
  [0, -3], [1, -3], [2, -3], [3, -3], [3, -2], [3, -1],
];

// Cycle through these so adjacent districts rarely share a color.
// 'red' and 'white' are reserved (alerts and core).
const DISTRICT_COLOR_CYCLE = ['cyan', 'magenta', 'amber', 'green'];

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
  // 'components/ui' isn't possible at top level (we only group by first
  // segment), so a simple lowercase + filesystem-friendly slug is enough.
  return folderName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function titleCase(s) {
  return s.replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Project a list of tracked files (and optional dirty-file paths) into the
 * { districts, buildings } shape consumed by map.jsx and Minimap.
 *
 * @param {string[]} tracked    — POSIX paths relative to repo root
 * @param {string[]} [dirty]    — paths from `git status` (same root-relative form)
 * @returns {{ districts: object[], buildings: object[] }}
 */
export function projectRepoTreeToCityModel(tracked, dirty = []) {
  if (!Array.isArray(tracked) || tracked.length === 0) {
    return { districts: [], buildings: [] };
  }

  const dirtySet = new Set(dirty);

  // Bucket files by top-level segment. Root-level files go into 'core'.
  const byFolder = new Map();
  for (const p of tracked) {
    if (!p || typeof p !== 'string') continue;
    const top = topLevelOf(p);
    const key = top ?? '__root__';
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(p);
  }

  // Build district list, ordered by file count desc so the largest top-level
  // dirs get the inner ring seats and stay legible when ring 2/3 overflow.
  const folderEntries = [...byFolder.entries()].sort((a, b) => {
    if (a[0] === '__root__') return -1; // core always first
    if (b[0] === '__root__') return 1;
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const districts = [];
  const buildings = [];
  let nonCoreIndex = 0;

  for (const [folderKey, files] of folderEntries) {
    const isCore = folderKey === '__root__';
    const districtId = isCore ? 'core' : districtIdFor(folderKey);
    const dirtyInDistrict = files.filter(f => dirtySet.has(f)).length;
    const health = files.length === 0
      ? 100
      : Math.round(((files.length - dirtyInDistrict) / files.length) * 100);

    let q, r, color;
    if (isCore) {
      q = 0; r = 0;
      color = 'white';
    } else {
      const seat = RING_POSITIONS[nonCoreIndex];
      // Districts past the last ring are dropped from the visual; their
      // buildings are also skipped so we don't render orphans on (0, 0).
      if (!seat) {
        nonCoreIndex += 1;
        continue;
      }
      [q, r] = seat;
      color = DISTRICT_COLOR_CYCLE[nonCoreIndex % DISTRICT_COLOR_CYCLE.length];
      nonCoreIndex += 1;
    }

    districts.push({
      id: districtId,
      name: isCore ? '/' : folderKey,
      color,
      q,
      r,
      files: files.length,
      health,
      label: isCore ? 'Codebase Core' : titleCase(folderKey),
      sub: isCore ? 'root files' : `${files.length} file${files.length === 1 ? '' : 's'}`,
    });

    // Buildings — cap per district to avoid the hex tiles overflowing the
    // available offsets in map.jsx (which has 12 slots) and to keep the city
    // legible. Pick towers first so the visual centerpieces don't drop.
    const towers = files.filter(f => isTowerFile(basenameOf(f)));
    const houses = files.filter(f => !isTowerFile(basenameOf(f)));
    const ordered = [...towers, ...houses].slice(0, 12);
    for (const f of ordered) {
      const name = basenameOf(f);
      buildings.push({
        d: districtId,
        name,
        // Full repo-relative path — exact-match lookup for dirty-file
        // overlays in map.jsx (basenames collide across folders).
        path: f,
        type: isTowerFile(name) ? 'tower' : 'house',
      });
    }
  }

  return { districts, buildings };
}
