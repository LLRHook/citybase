import { describe, expect, it } from 'vitest';
import { createWorldModel } from '../city/worldModel.js';
import { reconcileWorldView } from '../city/worldView.js';

const view = { position: [10, 20, 30], target: [1, 2, 3], scoutPosition: [4, 0, 5], zoom: 2, frustumHeight: 40 };

describe('city layout and retained camera', () => {
  it('keeps root first and district identities in alphabetical order as file counts change', () => {
    const paths = ['README.md', 'alpha/a.js', 'beta/a.js'];
    const before = createWorldModel(paths);
    const after = createWorldModel([...paths, 'beta/b.js']);
    expect(before.districts.map(d => d.id)).toEqual(['/', 'alpha', 'beta']);
    expect(after.districts.map(d => d.id)).toEqual(['/', 'alpha', 'beta']);
    expect(after.districts.map(d => [d.id, d.color, d.x, d.z])).toEqual(before.districts.map(d => [d.id, d.color, d.x, d.z]));
  });

  it('moves camera, target and scout together when a selected building changes position', () => {
    const paths = ['src/z.js'];
    const before = createWorldModel(paths);
    const after = createWorldModel([...paths, 'src/a.js']);
    const oldBuilding = before.buildings.find(b => b.path === 'src/z.js');
    const newBuilding = after.buildings.find(b => b.path === 'src/z.js');
    const adjusted = reconcileWorldView(view, before, after, { selected: 'src/z.js' });
    expect(newBuilding.x).not.toBe(oldBuilding.x);
    expect(adjusted.target[0] - newBuilding.x).toBeCloseTo(view.target[0] - oldBuilding.x);
    expect(adjusted.target[2] - newBuilding.z).toBeCloseTo(view.target[2] - oldBuilding.z);
    expect(adjusted.position.map((v, i) => v - adjusted.target[i])).toEqual(view.position.map((v, i) => v - view.target[i]));
    expect(adjusted.scoutPosition[0] - view.scoutPosition[0]).toBeCloseTo(newBuilding.x - oldBuilding.x);
    expect(adjusted.zoom).toBe(view.zoom);
    expect(adjusted.frustumHeight).toBe(view.frustumHeight);
    expect(view.target).toEqual([1, 2, 3]);
  });

  it('anchors a focused district when a new district changes the city grid', () => {
    const before = createWorldModel(['src/a.js']);
    const after = createWorldModel(['src/a.js', 'docs/a.md']);
    const oldDistrict = before.districts.find(d => d.id === 'src');
    const newDistrict = after.districts.find(d => d.id === 'src');
    const adjusted = reconcileWorldView(view, before, after, { district: 'src' });
    expect(adjusted.target[0] - newDistrict.x).toBeCloseTo(view.target[0] - oldDistrict.x);
    expect(adjusted.target[2] - newDistrict.z).toBeCloseTo(view.target[2] - oldDistrict.z);
  });

  it('retains absolute view when freely exploring or when the focused place disappeared', () => {
    const before = createWorldModel(['src/a.js']);
    const after = createWorldModel(['docs/a.md']);
    expect(reconcileWorldView(view, before, after)).toBe(view);
    expect(reconcileWorldView(view, before, after, { selected: 'src/a.js', district: 'src' })).toBe(view);
    expect(reconcileWorldView(null, before, after)).toBeNull();
  });

  it('falls back to the focused district when a selected building was removed', () => {
    const before = createWorldModel(['src/a.js', 'src/b.js']);
    const after = createWorldModel(['src/b.js', 'docs/a.md']);
    const adjusted = reconcileWorldView(view, before, after, { selected: 'src/a.js', district: 'src' });
    expect(adjusted).toEqual(reconcileWorldView(view, before, after, { district: 'src' }));
  });
});
