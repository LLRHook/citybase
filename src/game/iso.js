// iso.js — 2:1 isometric projection + extruded-block geometry. Pure.
//
// World space is a flat (x, y) plane (from hex.js) plus a height z that raises
// a point toward the camera. Screen space is classic 2:1 iso: moving +x goes
// down-right, +y goes down-left, +z goes straight up.

export const UNIT = 26; // screen px per world unit along an iso axis (half-tile width)

// Project a world point (wx, wy) at height z (in world units) to screen px.
export function project(wx, wy, z = 0) {
  return {
    x: (wx - wy) * UNIT,
    y: (wx + wy) * (UNIT / 2) - z * UNIT,
  };
}

// Flat diamond (ground tile / platform) of side `s` world-units anchored at its
// near corner (wx, wy). Returns an SVG points string.
export function tilePoints(wx, wy, s) {
  const a = project(wx, wy);
  const b = project(wx + s, wy);
  const c = project(wx + s, wy + s);
  const d = project(wx, wy + s);
  return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}

// Extruded square block: footprint side `s` (world units) rising from height
// `base` to `base + h` (world units). Returns three face point-strings (roof +
// two visible walls) plus the screen anchor of the roof's front corner for
// label placement. Faces paint back-to-front so drawing in order is depth-correct.
export function block(wx, wy, s, h, base = 0) {
  // Base corners: A back, B right, C front, D left (at height `base`).
  const B = project(wx + s, wy, base);
  const C = project(wx + s, wy + s, base);
  const D = project(wx, wy + s, base);
  // Roof corners (same xy, raised to base + h).
  const top = base + h;
  const Ar = project(wx, wy, top);
  const Br = project(wx + s, wy, top);
  const Cr = project(wx + s, wy + s, top);
  const Dr = project(wx, wy + s, top);
  return {
    roof: `${Ar.x},${Ar.y} ${Br.x},${Br.y} ${Cr.x},${Cr.y} ${Dr.x},${Dr.y}`,
    // Right wall faces down-right (B→C), brighter-shaded side.
    right: `${B.x},${B.y} ${C.x},${C.y} ${Cr.x},${Cr.y} ${Br.x},${Br.y}`,
    // Left wall faces down-left (D→C), darker side.
    left: `${D.x},${D.y} ${C.x},${C.y} ${Cr.x},${Cr.y} ${Dr.x},${Dr.y}`,
    front: C,      // ground front corner
    roofFront: Cr, // raised front corner (label anchor)
  };
}

// Depth key for painter's-algorithm y-sorting: larger = nearer the camera,
// drawn later (on top). Sum of world coords + a height nudge.
export function depthKey(wx, wy, z = 0) {
  return wx + wy + z * 0.01;
}
