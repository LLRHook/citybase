// palette.js — neon color tokens and color helpers shared across all UI.
// Split out of theme.jsx so Vite Fast Refresh can HMR theme components cleanly.

export const NEON = {
  bg0: '#070914',
  bg1: '#0c1124',
  bg2: '#141a36',
  ink: '#e8ecff',
  ink2: '#9aa3d4',
  ink3: '#5a6296',
  line: '#1f2752',
  lineHi: '#2e3a7a',
  cyan:    '#5dd4ff',
  magenta: '#d96bff',
  amber:   '#ffb84a',
  green:   '#5fe39a',
  red:     '#ff6b8a',
  white:   '#e8ecff',
};

export const C = (k) => NEON[k] || k;

export function alpha(hex, a) {
  if (typeof hex === 'string' && hex.startsWith('#')) {
    const h = hex.length === 4 ? '#'+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3] : hex;
    const aa = Math.round(a * 255).toString(16).padStart(2, '0');
    return h + aa;
  }
  return hex;
}
