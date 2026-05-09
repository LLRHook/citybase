import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CityMap } from '../game/map.jsx';

const districts = [
  { id: 'core', name: '/', color: 'white', q: 0, r: 0, files: 1, health: 100, label: 'Codebase Core', sub: 'root' },
  { id: 'src', name: 'src', color: 'cyan', q: 1, r: 0, files: 3, health: 67, label: 'Src', sub: '3 files' },
];

const buildings = [
  { d: 'src', name: 'foo.js', path: 'src/foo.js', type: 'house' },
  { d: 'src', name: 'bar.js', path: 'src/bar.js', type: 'house' },
  { d: 'src', name: 'index.js', path: 'src/index.js', type: 'tower' },
  { d: 'core', name: 'package.json', path: 'package.json', type: 'tower' },
];

describe('CityMap dirty-building glyph', () => {
  it('renders no glyphs when dirtyByPath is empty', () => {
    render(
      <CityMap
        districts={districts}
        buildings={buildings}
        dirtyByPath={new Map()}
        connected
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    expect(screen.queryAllByTestId('dirty-glyph')).toHaveLength(0);
  });

  it('renders a staged-only glyph for a path with staged=true / unstaged=false', () => {
    const dirtyByPath = new Map([
      ['src/foo.js', { staged: true, unstaged: false }],
    ]);
    render(
      <CityMap
        districts={districts}
        buildings={buildings}
        dirtyByPath={dirtyByPath}
        connected
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    const glyphs = screen.getAllByTestId('dirty-glyph');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].getAttribute('data-staged')).toBe('1');
    expect(glyphs[0].getAttribute('data-unstaged')).toBe('0');
  });

  it('renders an unstaged-only glyph for unstaged=true / staged=false', () => {
    const dirtyByPath = new Map([
      ['src/bar.js', { staged: false, unstaged: true }],
    ]);
    render(
      <CityMap
        districts={districts}
        buildings={buildings}
        dirtyByPath={dirtyByPath}
        connected
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    const glyphs = screen.getAllByTestId('dirty-glyph');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].getAttribute('data-staged')).toBe('0');
    expect(glyphs[0].getAttribute('data-unstaged')).toBe('1');
  });

  it('renders a both-staged-and-unstaged glyph when both flags are set', () => {
    const dirtyByPath = new Map([
      ['src/index.js', { staged: true, unstaged: true }],
    ]);
    render(
      <CityMap
        districts={districts}
        buildings={buildings}
        dirtyByPath={dirtyByPath}
        connected
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    const glyphs = screen.getAllByTestId('dirty-glyph');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].getAttribute('data-staged')).toBe('1');
    expect(glyphs[0].getAttribute('data-unstaged')).toBe('1');
  });

  it('matches dirty entries by full path, not by basename', () => {
    // The repo has two files named "index.js" in different folders;
    // adding both buildings + a Map keyed on one path should glyph
    // ONLY the matching one.
    const richBuildings = [
      ...buildings,
      { d: 'core', name: 'index.js', path: 'index.js', type: 'tower' },
    ];
    const dirtyByPath = new Map([
      ['index.js', { staged: true, unstaged: false }],
    ]);
    render(
      <CityMap
        districts={districts}
        buildings={richBuildings}
        dirtyByPath={dirtyByPath}
        connected
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    const glyphs = screen.getAllByTestId('dirty-glyph');
    expect(glyphs).toHaveLength(1);
  });

  it('renders no glyphs when not connected (overlay path)', () => {
    const dirtyByPath = new Map([
      ['src/foo.js', { staged: true, unstaged: false }],
    ]);
    render(
      <CityMap
        districts={districts}
        buildings={buildings}
        dirtyByPath={dirtyByPath}
        connected={false}
        focusedDistrictId={null}
        onSelectDistrict={() => {}}
        pawns={[]}
      />,
    );
    expect(screen.queryAllByTestId('dirty-glyph')).toHaveLength(0);
  });
});
