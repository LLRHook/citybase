import { describe, it, expect } from 'vitest';
import { project, block, tilePoints, depthKey, UNIT } from '../game/iso.js';
import { axialToWorld, worldDistance } from '../game/hex.js';

describe('iso projection', () => {
  it('projects the origin to the origin', () => {
    expect(project(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves +x down-right and +y down-left', () => {
    expect(project(1, 0)).toEqual({ x: UNIT, y: UNIT / 2 });
    expect(project(0, 1)).toEqual({ x: -UNIT, y: UNIT / 2 });
  });

  it('raises height toward the camera (smaller screen y)', () => {
    expect(project(0, 0, 2).y).toBeLessThan(project(0, 0, 0).y);
  });

  it('block returns three 4-point faces and a roof anchor', () => {
    const g = block(0, 0, 1, 2);
    for (const face of [g.roof, g.left, g.right]) {
      expect(face.trim().split(/\s+/).length).toBe(4);
    }
    expect(g.roofFront).toHaveProperty('x');
    expect(g.roofFront).toHaveProperty('y');
  });

  it('tilePoints returns a 4-corner diamond', () => {
    expect(tilePoints(0, 0, 2).trim().split(/\s+/).length).toBe(4);
  });

  it('depthKey increases toward the front of the scene', () => {
    expect(depthKey(2, 2)).toBeGreaterThan(depthKey(0, 0));
  });
});

describe('hex district seating (BUG-008 separation guard)', () => {
  it('adjacent ring-1 seats are spaced beyond a district footprint', () => {
    // CityView uses DISTRICT_SPACING 6.2 and platforms up to ~5 world units.
    const SPACING = 6.2;
    const d = worldDistance({ q: 1, r: 0 }, { q: 0, r: 1 }, SPACING);
    expect(d).toBeGreaterThan(6); // comfortably exceeds the ~5-unit platform span
  });

  it('axialToWorld scales linearly with spacing', () => {
    const a = axialToWorld(1, 1, 1);
    const b = axialToWorld(1, 1, 3);
    expect(b.x).toBeCloseTo(a.x * 3);
    expect(b.y).toBeCloseTo(a.y * 3);
  });
});
