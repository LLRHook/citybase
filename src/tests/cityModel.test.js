import { describe, it, expect } from 'vitest';
import { projectRepoTreeToCityModel, MAX_BUILDINGS } from '../app/cityModel.js';

const tree = [
  'package.json', 'README.md',
  'src/App.jsx', 'src/main.jsx', 'src/index.css',
  'src/app/cityModel.js', 'src/app/useWorkspace.js',
  'electron/main/main.cjs', 'electron/preload/preload.cjs',
  'docs/domain-model.md',
];

describe('projectRepoTreeToCityModel', () => {
  it('returns empty model for empty/invalid input', () => {
    expect(projectRepoTreeToCityModel([])).toEqual({ districts: [], buildings: [] });
    expect(projectRepoTreeToCityModel(null)).toEqual({ districts: [], buildings: [] });
  });

  it('places root files in a core district at the origin', () => {
    const { districts } = projectRepoTreeToCityModel(tree);
    const core = districts.find((d) => d.id === 'core');
    expect(core).toBeTruthy();
    expect(core.isCore).toBe(true);
    expect(core.q).toBe(0);
    expect(core.r).toBe(0);
    expect(core.files).toBe(2); // package.json + README.md
  });

  it('creates a district per top-level folder, ordered by file count desc', () => {
    const { districts } = projectRepoTreeToCityModel(tree);
    const ids = districts.map((d) => d.id);
    expect(ids).toContain('src');
    expect(ids).toContain('electron');
    expect(ids).toContain('docs');
    // core first, then busiest non-core (src=4) before electron(2)/docs(1)
    const nonCore = districts.filter((d) => !d.isCore).map((d) => d.id);
    expect(nonCore[0]).toBe('src');
  });

  it('assigns deterministic ring seats with no duplicate non-core positions', () => {
    const { districts } = projectRepoTreeToCityModel(tree);
    const seats = districts.filter((d) => !d.isCore).map((d) => `${d.q},${d.r}`);
    expect(new Set(seats).size).toBe(seats.length);
  });

  it('propagates dirty status to buildings and district counts', () => {
    const files = [
      { path: 'src/App.jsx', status: 'modified', staged: false, unstaged: true },
      { path: 'package.json', status: 'modified', staged: true, unstaged: false },
    ];
    const { districts, buildings } = projectRepoTreeToCityModel(tree, files);
    const appBuilding = buildings.find((b) => b.path === 'src/App.jsx');
    expect(appBuilding.dirty).toBe(true);
    expect(appBuilding.staged).toBe(false);
    const pkgBuilding = buildings.find((b) => b.path === 'package.json');
    expect(pkgBuilding.dirty).toBe(true);
    expect(pkgBuilding.staged).toBe(true);
    const src = districts.find((d) => d.id === 'src');
    expect(src.dirty).toBe(1);
    expect(src.health).toBeLessThan(100);
    const docs = districts.find((d) => d.id === 'docs');
    expect(docs.health).toBe(100);
  });

  it('flags tower files (package.json, README, index/app/main)', () => {
    const { buildings } = projectRepoTreeToCityModel(tree);
    expect(buildings.find((b) => b.path === 'package.json').type).toBe('tower');
    expect(buildings.find((b) => b.path === 'README.md').type).toBe('tower');
    expect(buildings.find((b) => b.path === 'src/App.jsx').type).toBe('tower');
    // index.css matches the `index` tower stem on purpose; a plain module is a house.
    expect(buildings.find((b) => b.path === 'src/app/useWorkspace.js').type).toBe('house');
  });

  it('caps buildings per district and lays them on a grid', () => {
    const many = Array.from({ length: 30 }, (_, i) => `big/file${i}.js`);
    const { districts, buildings } = projectRepoTreeToCityModel(many);
    const big = buildings.filter((b) => b.d === 'big');
    expect(big.length).toBe(MAX_BUILDINGS);
    // district still reports the true total
    expect(districts.find((d) => d.id === 'big').files).toBe(30);
    // grid coords stay within 4 columns
    expect(Math.max(...big.map((b) => b.col))).toBeLessThanOrEqual(3);
  });

  it('handles unicode / quoted-style paths without throwing (BUG-009 boundary)', () => {
    const unicode = ['src/café/résumé.js', 'src/naïve.txt'];
    const { buildings } = projectRepoTreeToCityModel(unicode, [
      { path: 'src/café/résumé.js', status: 'modified', unstaged: true },
    ]);
    const b = buildings.find((x) => x.path === 'src/café/résumé.js');
    expect(b).toBeTruthy();
    expect(b.dirty).toBe(true);
  });

  it('is deterministic across runs', () => {
    const a = projectRepoTreeToCityModel(tree);
    const b = projectRepoTreeToCityModel(tree);
    expect(a).toEqual(b);
  });
});
