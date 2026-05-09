// hex.js — pointy-top hex grid math. Pure, no React.
// Split out of theme.jsx so Vite Fast Refresh can HMR theme components cleanly.

export const HEX_SIZE = 28;
export const HEX_W = Math.sqrt(3) * HEX_SIZE;
export const HEX_H = 2 * HEX_SIZE;

/**
 * Convert axial hex coordinates (q, r) to 2D pixel coordinates for a pointy-top layout.
 * @param {number} q - Axial q coordinate.
 * @param {number} r - Axial r coordinate.
 * @returns {{x: number, y: number}} Pixel coordinates: `x` is horizontal position, `y` is vertical position.
 */
export function hexToPx(q, r) {
  const x = HEX_W * (q + r / 2);
  const y = HEX_H * 0.75 * r;
  return { x, y };
}

/**
 * Compute the six corner coordinates of a pointy-top hexagon centered at (cx, cy).
 *
 * @param {number} cx - X coordinate of the hexagon center.
 * @param {number} cy - Y coordinate of the hexagon center.
 * @param {number} [size=HEX_SIZE] - Radius from center to a corner.
 * @returns {number[][]} An array of six [x, y] pairs representing corner coordinates in clockwise order.
 */
export function hexCorners(cx, cy, size = HEX_SIZE) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
  });
}

/**
 * Create an SVG path string for a pointy-top hexagon centered at the given coordinates.
 * @param {number} cx - X coordinate of the hexagon center.
 * @param {number} cy - Y coordinate of the hexagon center.
 * @param {number} [size=HEX_SIZE] - Distance from the center to each corner.
 * @returns {string} An SVG path string outlining the hexagon (closed path).
 */
export function hexPath(cx, cy, size = HEX_SIZE) {
  return hexCorners(cx, cy, size).map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ') + ' Z';
}
