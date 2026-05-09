import { describe, expect, it } from 'vitest';
import { projectRepoTreeToCityModel } from '../app/cityModel.js';

describe('projectRepoTreeToCityModel', () => {
  it('returns empty when given no files', () => {
    expect(projectRepoTreeToCityModel([])).toEqual({ districts: [], buildings: [] });
    expect(projectRepoTreeToCityModel(null)).toEqual({ districts: [], buildings: [] });
  });

  it('groups top-level folders into districts', () => {
    const { districts } = projectRepoTreeToCityModel([
      'src/App.jsx',
      'src/main.jsx',
      'src/data/seed.js',
      'docs/readme.md',
      'package.json',
    ]);
    const byId = Object.fromEntries(districts.map(d => [d.id, d]));
    expect(byId.src.files).toBe(3);
    expect(byId.docs.files).toBe(1);
    expect(byId.core.files).toBe(1);
  });

  it('places the core district at the origin and assigns it the white accent', () => {
    const { districts } = projectRepoTreeToCityModel([
      'package.json',
      'src/App.jsx',
    ]);
    const core = districts.find(d => d.id === 'core');
    expect(core).toBeDefined();
    expect(core.q).toBe(0);
    expect(core.r).toBe(0);
    expect(core.color).toBe('white');
  });

  it('orders non-core districts by file count desc and seats them on rising rings', () => {
    const tracked = [
      ...Array.from({ length: 10 }, (_, i) => `big/${i}.js`),
      ...Array.from({ length: 3 }, (_, i) => `small/${i}.js`),
      ...Array.from({ length: 5 }, (_, i) => `medium/${i}.js`),
    ];
    const { districts } = projectRepoTreeToCityModel(tracked);
    const nonCore = districts.filter(d => d.id !== 'core');
    expect(nonCore.map(d => d.id)).toEqual(['big', 'medium', 'small']);
    // Each occupies a distinct (q, r).
    const seats = new Set(nonCore.map(d => `${d.q},${d.r}`));
    expect(seats.size).toBe(nonCore.length);
  });

  it('emits buildings keyed to their district id with tower/house type', () => {
    const { districts, buildings } = projectRepoTreeToCityModel([
      'src/index.tsx',          // tower (entry-point name)
      'src/Button.tsx',         // house
      'src/Card.tsx',           // house
    ]);
    const src = districts.find(d => d.id === 'src');
    expect(src).toBeDefined();
    const inSrc = buildings.filter(b => b.d === 'src');
    expect(inSrc).toHaveLength(3);
    expect(inSrc.find(b => b.name === 'index.tsx').type).toBe('tower');
    expect(inSrc.find(b => b.name === 'Button.tsx').type).toBe('house');
  });

  it('treats well-known config filenames at the repo root as towers', () => {
    const { buildings } = projectRepoTreeToCityModel([
      'package.json',
      'README.md',
      '.gitignore',
    ]);
    const core = buildings.filter(b => b.d === 'core');
    expect(core.find(b => b.name === 'package.json').type).toBe('tower');
    expect(core.find(b => b.name === 'README.md').type).toBe('tower');
    expect(core.find(b => b.name === '.gitignore').type).toBe('house');
  });

  it('caps buildings per district at 12 with towers preserved over houses', () => {
    const tracked = [
      'huge/index.js', // tower
      ...Array.from({ length: 25 }, (_, i) => `huge/file${i}.js`),
    ];
    const { buildings } = projectRepoTreeToCityModel(tracked);
    const inHuge = buildings.filter(b => b.d === 'huge');
    expect(inHuge).toHaveLength(12);
    expect(inHuge.find(b => b.name === 'index.js')).toBeDefined();
  });

  it('computes district health from the share of dirty files', () => {
    const tracked = ['lib/a.js', 'lib/b.js', 'lib/c.js', 'lib/d.js'];
    const { districts } = projectRepoTreeToCityModel(tracked, ['lib/a.js']);
    const lib = districts.find(d => d.id === 'lib');
    expect(lib.health).toBe(75); // 3 of 4 clean
  });

  it('reports 100 health when there are no dirty files', () => {
    const { districts } = projectRepoTreeToCityModel(['lib/a.js'], []);
    expect(districts[0].health).toBe(100);
  });

  it('skips districts past the last ring instead of stacking them at origin', () => {
    // 36 non-core folders fills rings 1+2+3 exactly; a 37th has no seat.
    const tracked = Array.from({ length: 37 }, (_, i) => `dir${i}/file.js`);
    const { districts } = projectRepoTreeToCityModel(tracked);
    const nonCore = districts.filter(d => d.id !== 'core');
    expect(nonCore).toHaveLength(36);
    const seats = new Set(nonCore.map(d => `${d.q},${d.r}`));
    expect(seats.size).toBe(36);
    expect(seats.has('0,0')).toBe(false);
  });

  it('produces stable color rotation across the cycle', () => {
    const tracked = ['a/x.js', 'b/x.js', 'c/x.js', 'd/x.js', 'e/x.js'];
    const { districts } = projectRepoTreeToCityModel(tracked);
    const nonCore = districts.filter(d => d.id !== 'core');
    expect(nonCore[0].color).toBe('cyan');
    expect(nonCore[1].color).toBe('magenta');
    expect(nonCore[2].color).toBe('amber');
    expect(nonCore[3].color).toBe('green');
    expect(nonCore[4].color).toBe('cyan'); // wraps
  });
});
