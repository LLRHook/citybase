// Deterministic architecture derived entirely from repository paths.
// Every file stays searchable; big districts display a labeled selection of 64.
const PALETTE = ['#83c6b5', '#e9b878', '#cf9f91', '#90adbf', '#b6bc84', '#baa6c8'];
const NAMES = { '/': "Founder's Square", src: "Creator's Quarter", electron: 'Engine Works', docs: 'The Archives', public: 'The Gardens', e2e: 'Proving Grounds', tests: 'Proving Grounds', '.github': 'Skyport', scripts: 'The Workshop', hooks: 'Signal Station', '.claude': 'The Guildhall' };
export function hashPath(value) {
  let h = 2166136261;
  for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
export function repositoryPaths(snapshot) {
  return [...new Set([...(snapshot?.repoTree || []), ...(snapshot?.files || []).map(f => f.path)])].filter(p => typeof p === 'string' && p.length > 0).sort();
}
export function createWorldModel(paths, changes = []) {
  const buckets = new Map();
  const changed = new Map(changes.map(f => [f.path, f]));
  for (const path of [...new Set(paths)].sort()) {
    const name = path.includes('/') ? path.split('/')[0] : '/';
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(path);
  }
  // File additions must not exchange neighboring districts' identities or colors.
  const entries = [...buckets].sort((a, b) => a[0] === '/' ? -1 : b[0] === '/' ? 1 : a[0].localeCompare(b[0]));
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const seats = [];
  let rowZ = 0;
  for (let row = 0; row < entries.length; row += cols) {
    const sizes = entries.slice(row, row + cols).map(([, files]) => Math.max(7.6, Math.ceil(Math.sqrt(Math.min(files.length, 64))) * 1.85 + 3));
    const rowHeight = Math.max(...sizes);
    const rowWidth = sizes.reduce((sum, size) => sum + size, 0) + (sizes.length - 1) * 3;
    let nextX = -rowWidth / 2;
    for (const size of sizes) { seats.push({ x: nextX + size / 2, z: rowZ + rowHeight / 2 }); nextX += size + 3; }
    rowZ += rowHeight + 3;
  }
  seats.forEach(seat => { seat.z -= (rowZ - 3) / 2; });
  const districts = [];
  const buildings = [];
  for (const [i, [name, allFiles]] of entries.entries()) {
    const id = name; // Original path segment is a collision-free identity.
    const { x, z } = seats[i];
    const ranked = [...allFiles].sort((a, b) => Number(changed.has(b)) - Number(changed.has(a)) || Number(/(?:^|\/)(?:App|main|index|README|package)\./i.test(b)) - Number(/(?:^|\/)(?:App|main|index|README|package)\./i.test(a)) || a.localeCompare(b));
    const shown = ranked.slice(0, 64);
    const width = Math.max(1, Math.ceil(Math.sqrt(shown.length)));
    const depth = Math.ceil(shown.length / width);
    const size = Math.max(7.6, width * 1.85 + 3);
    const color = PALETTE[i % PALETTE.length];
    districts.push({ id, name, label: NAMES[name] || `${name.replace(/^[.]/, '').replace(/[-_]/g, ' ')} Quarter`, color, x, z, size, files: allFiles.length, dirty: allFiles.filter(p => changed.has(p)).length, paths: allFiles, shown: shown.length });
    for (const [j, path] of shown.entries()) {
      const h = hashPath(path);
      const important = /(?:^|\/)(?:App|main|index|README|package)\./i.test(path);
      const status = changed.get(path);
      buildings.push({ path, name: path.split('/').at(-1), districtId: id, x: x + ((j % width) - (width - 1) / 2) * 1.85, z: z + (Math.floor(j / width) - (depth - 1) / 2) * 1.85, width: 1.05 + h * .3, depth: 1.1 + (1 - h) * .2, height: important ? 2.8 + h * 2.4 : .8 + h * 2.4, kind: important ? 'tower' : h > .58 ? 'house' : 'block', dirty: !!status, staged: !!status?.staged, status: status?.status || 'clean' });
    }
  }
  return { districts, buildings, totalFiles: paths.length };
}
