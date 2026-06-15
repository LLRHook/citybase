// hex.js — pointy-top axial hex math, pure (no React, no DOM).
// Districts are seated on a hex grid (axial q,r from cityModel). This converts
// those seats to flat 2D "world" coordinates that iso.js then projects to
// screen. Kept separate so the math is unit-testable and Fast-Refresh clean.

// Standard pointy-top axial → pixel, scaled by `spacing` (the world distance
// between adjacent district centers). Spacing must exceed a district's
// building-cluster footprint so neighbours never overlap (guards BUG-008).
export function axialToWorld(q, r, spacing = 1) {
  const x = spacing * Math.sqrt(3) * (q + r / 2);
  const y = spacing * 1.5 * r;
  return { x, y };
}

// Squared distance between two axial seats in world space — handy for tests
// that assert district separation.
export function worldDistance(a, b, spacing = 1) {
  const pa = axialToWorld(a.q, a.r, spacing);
  const pb = axialToWorld(b.q, b.r, spacing);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}
