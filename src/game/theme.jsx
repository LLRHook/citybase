// theme.jsx — neon UI primitives (Panel, NeonBar, Pill, Mono, Title, NButton, Crest, IsoBuilding).
// Color tokens live in ./palette.js; hex-grid math lives in ./hex.js.

import { NEON, C, alpha } from './palette.js';
import { hexPath } from './hex.js';

// ── Iso conversion (for buildings drawn on hex tiles) ──
function IsoBox({ x, y, w = 22, d = 22, h = 26, fill, stroke, glow }) {
  const c = stroke || NEON.ink2;
  const f = fill || NEON.bg2;
  const top = `${x},${y - h} ${x + w},${y - h - w * 0.3} ${x + w + d},${y - h - w * 0.3 + d * 0.3} ${x + d},${y - h + d * 0.3}`;
  const left = `${x},${y - h} ${x},${y} ${x + d},${y + d * 0.3} ${x + d},${y - h + d * 0.3}`;
  const right = `${x + d},${y - h + d * 0.3} ${x + d},${y + d * 0.3} ${x + w + d},${y + d * 0.3 - w * 0.3} ${x + w + d},${y - h - w * 0.3 + d * 0.3}`;
  return (
    <g>
      <polygon points={left} fill={alpha(f, 0.85)} stroke={c} strokeWidth="0.8" />
      <polygon points={right} fill={alpha(f, 1)} stroke={c} strokeWidth="0.8" />
      <polygon points={top} fill={glow ? alpha(glow, 0.35) : alpha(f, 0.95)} stroke={c} strokeWidth="0.8" />
      {glow && <polygon points={top} fill="none" stroke={glow} strokeWidth="1" opacity="0.9" />}
    </g>
  );
}

// Detailed iso building — multi-block silhouette with windows, antenna for towers.
export function IsoBuilding({ x, y, kind = 'house', accent = NEON.cyan, focused, seed = 0 }) {
  const a = accent;
  const dim = NEON.bg2;
  const r = (n) => ((Math.sin(seed * 7.13 + n) + 1) / 2);

  const shadow = <ellipse cx={x} cy={y + 4} rx="14" ry="3" fill="#000" opacity="0.4" />;

  if (kind === 'tower') {
    const w = 14, d = 14, h = 28 + Math.floor(r(1) * 8);
    return (
      <g>
        {shadow}
        <IsoBox x={x - w / 2 - d / 2} y={y} w={w} d={d} h={h} fill={dim} stroke={a} glow={focused ? a : null} />
        <IsoBox x={x - w / 2 - d / 2 + 2} y={y - h} w={w - 4} d={d - 4} h={6} fill={NEON.bg1} stroke={a} />
        <line x1={x} y1={y - h - 6} x2={x} y2={y - h - 16} stroke={a} strokeWidth="0.8" />
        <circle cx={x} cy={y - h - 17} r="1.2" fill={a}>
          <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <g opacity="0.95">
          <rect x={x - w / 2 - d / 2 + 2} y={y - h + 4} width="1.5" height="2.5" fill={a} />
          <rect x={x - w / 2 - d / 2 + 5} y={y - h + 4} width="1.5" height="2.5" fill={a} />
          <rect x={x - w / 2 - d / 2 + 8} y={y - h + 4} width="1.5" height="2.5" fill={a} />
          <rect x={x - w / 2 - d / 2 + 2} y={y - h + 10} width="1.5" height="2.5" fill={(seed % 2) ? NEON.bg0 : a} />
          <rect x={x - w / 2 - d / 2 + 5} y={y - h + 10} width="1.5" height="2.5" fill={a} />
          <rect x={x - w / 2 - d / 2 + 8} y={y - h + 10} width="1.5" height="2.5" fill={(seed % 3) ? a : NEON.bg0} />
          <rect x={x - w / 2 - d / 2 + 2} y={y - h + 16} width="1.5" height="2.5" fill={a} />
          <rect x={x - w / 2 - d / 2 + 5} y={y - h + 16} width="1.5" height="2.5" fill={(seed % 2) ? a : NEON.bg0} />
          <rect x={x - w / 2 - d / 2 + 8} y={y - h + 16} width="1.5" height="2.5" fill={a} />
        </g>
      </g>
    );
  }

  if (kind === 'dome') {
    const sz = 14;
    return (
      <g>
        {shadow}
        <IsoBox x={x - sz} y={y} w={sz} d={sz} h={8} fill={dim} stroke={a} />
        <ellipse cx={x - sz / 2} cy={y - 8} rx={sz - 1} ry={sz / 2} fill={alpha(a, 0.4)} stroke={a} strokeWidth="1" />
        <ellipse cx={x - sz / 2 - 2} cy={y - 10} rx={sz / 3} ry={sz / 4} fill={alpha(a, 0.6)} stroke="none" />
        {focused && <ellipse cx={x - sz / 2} cy={y - 8} rx={sz + 2} ry={sz / 2 + 1} fill="none" stroke={a} strokeWidth="0.5" opacity="0.7" />}
      </g>
    );
  }

  // default 'house'
  const w = 12, d = 12, h = 12;
  const second = r(2) > 0.4;
  return (
    <g>
      {shadow}
      <IsoBox x={x - w / 2 - d / 2} y={y} w={w} d={d} h={h} fill={dim} stroke={a} glow={focused ? a : null} />
      {second && <IsoBox x={x - w / 2 - d / 2 + 6} y={y - 2} w={w - 4} d={d - 4} h={h - 3} fill={NEON.bg1} stroke={a} />}
      <rect x={x - 1} y={y - h - 1} width="2" height="1.5" fill={a}>
        <animate attributeName="opacity" values="1;0.4;1" dur={`${1.5 + r(3)}s`} repeatCount="indefinite" />
      </rect>
    </g>
  );
}

// Neon panel chrome
export function Panel({ title, accent, children, style, headerRight, dim }) {
  const a = accent ? C(accent) : NEON.cyan;
  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${alpha(a, 0.06)} 0%, ${NEON.bg1} 40%)`,
        border: `1px solid ${alpha(a, 0.4)}`,
        borderRadius: 4,
        boxShadow: `0 0 0 1px ${NEON.bg0}, inset 0 0 24px ${alpha(a, 0.05)}`,
        position: 'relative',
        opacity: dim ? 0.5 : 1,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px',
            borderBottom: `1px solid ${alpha(a, 0.2)}`,
            background: alpha(a, 0.07),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: a, fontSize: 9 }}>◆</span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                fontSize: 10, letterSpacing: 1.2, color: a, textTransform: 'uppercase', fontWeight: 600,
              }}
            >
              {title}
            </span>
          </div>
          {headerRight}
        </div>
      )}
      <div style={{ padding: 10 }}>{children}</div>
      {[[0, 0, 'tl'], [1, 0, 'tr'], [0, 1, 'bl'], [1, 1, 'br']].map(([x, y, id]) => (
        <div
          key={id}
          style={{
            position: 'absolute',
            [x ? 'right' : 'left']: -1,
            [y ? 'bottom' : 'top']: -1,
            width: 6, height: 6, borderColor: a,
            borderStyle: 'solid', borderWidth: 0,
            [`border${y ? 'Bottom' : 'Top'}Width`]: 1,
            [`border${x ? 'Right' : 'Left'}Width`]: 1,
          }}
        />
      ))}
    </div>
  );
}

export function NeonBar({ label, value, max = 100, color = 'cyan', sub, width }) {
  const a = C(color);
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: NEON.ink3, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: a, fontWeight: 600 }}>{sub || `${value}/${max}`}</span>
        </div>
      )}
      <div style={{ height: 5, background: NEON.bg0, border: `1px solid ${alpha(a, 0.3)}`, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: `linear-gradient(90deg, ${alpha(a, 0.5)}, ${a})`,
            boxShadow: `0 0 8px ${a}`,
          }}
        />
        <div
          style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 1,
            background: a, boxShadow: `0 0 6px ${a}`,
          }}
        />
      </div>
    </div>
  );
}

export function Pill({ children, color = 'ink2', style }) {
  const a = C(color);
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 8, letterSpacing: 0.8,
        textTransform: 'uppercase', color: a,
        border: `1px solid ${alpha(a, 0.5)}`,
        background: alpha(a, 0.08),
        padding: '2px 6px', borderRadius: 2,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Mono({ children, size = 10, color = 'ink2', weight = 400, style }) {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: size, color: C(color), fontWeight: weight, letterSpacing: 0.4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Title({ children, size = 14, color = 'ink', weight = 600, style }) {
  return (
    <div
      style={{
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: size, color: C(color), fontWeight: weight, letterSpacing: -0.2, lineHeight: 1.2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function NButton({ children, accent = 'cyan', onClick, disabled, ghost, kbd, style }) {
  const a = C(accent);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
        padding: '7px 12px', border: `1px solid ${alpha(a, ghost ? 0.4 : 0.7)}`,
        background: ghost ? 'transparent' : alpha(a, 0.15),
        color: a, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: ghost ? 'none' : `0 0 12px ${alpha(a, 0.3)}, inset 0 0 8px ${alpha(a, 0.1)}`,
        display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative',
        borderRadius: 2,
        transition: 'all .15s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = alpha(a, ghost ? 0.1 : 0.25); }}
      onMouseLeave={e => { e.currentTarget.style.background = ghost ? 'transparent' : alpha(a, 0.15); }}
    >
      {children}
      {kbd && <span style={{ marginLeft: 'auto', fontSize: 8, opacity: 0.6, padding: '1px 4px', border: `1px solid ${alpha(a, 0.5)}`, borderRadius: 2 }}>{kbd}</span>}
    </button>
  );
}

export function Crest({ letter, color = 'magenta', size = 36 }) {
  const a = C(color);
  return (
    <svg width={size} height={size} viewBox="-30 -30 60 60" style={{ display: 'block', flexShrink: 0 }}>
      <path d={hexPath(0, 0, 26)} fill={alpha(a, 0.15)} stroke={a} strokeWidth="1.5" />
      <path d={hexPath(0, 0, 22)} fill="none" stroke={a} strokeWidth="0.6" opacity="0.5" />
      <text x="0" y="2" textAnchor="middle" dominantBaseline="middle" fontFamily="Space Grotesk, sans-serif" fontSize="20" fontWeight="700" fill={a}>{letter}</text>
    </svg>
  );
}
