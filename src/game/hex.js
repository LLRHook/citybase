// hex.js — pointy-top hex grid math. Pure, no React.
// Split out of theme.jsx so Vite Fast Refresh can HMR theme components cleanly.

export const HEX_SIZE = 28;
export const HEX_W = Math.sqrt(3) * HEX_SIZE;
export const HEX_H = 2 * HEX_SIZE;

export function hexToPx(q, r) {
  const x = HEX_W * (q + r / 2);
  const y = HEX_H * 0.75 * r;
  return { x, y };
}

export function hexCorners(cx, cy, size = HEX_SIZE) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
  });
}

export function hexPath(cx, cy, size = HEX_SIZE) {
  return hexCorners(cx, cy, size).map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ') + ' Z';
}
