// theme.jsx — neon-dark UI primitives for the IDE shell.
//
// This module used to ship a pile of game-themed primitives (IsoBuilding,
// NeonBar, Crest, hex-grid math). Those went away with the
// guild/adventurer/quest metaphor — we keep only the building blocks an
// honest desktop IDE needs: panel chrome, pills, mono / title text, and
// a primary neon button.
//
// Color tokens live in ./palette.js.
import { NEON, C, alpha } from './palette.js';

// Panel chrome: titled box with a neon accent border, used for
// sidebars, run details, and form sections.
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

export function NButton({ children, accent = 'cyan', onClick, disabled, ghost, kbd, style, type }) {
  const a = C(accent);
  return (
    <button
      type={type}
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
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = alpha(a, ghost ? 0.1 : 0.25); }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ghost ? 'transparent' : alpha(a, 0.15); }}
    >
      {children}
      {kbd && <span style={{ marginLeft: 'auto', fontSize: 8, opacity: 0.6, padding: '1px 4px', border: `1px solid ${alpha(a, 0.5)}`, borderRadius: 2 }}>{kbd}</span>}
    </button>
  );
}

// Common form controls: textarea + select. Kept here so the IDE shell
// has a coherent visual language without each consumer reinventing styles.
export function TextArea({ value, onChange, placeholder, rows = 6, ariaLabel, style }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 12, color: NEON.ink, lineHeight: 1.5,
        background: NEON.bg0, border: `1px solid ${NEON.line}`,
        padding: 10, borderRadius: 2, resize: 'vertical', outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = NEON.cyan; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = NEON.line; }}
    />
  );
}

export function NSelect({ value, onChange, options, ariaLabel, style }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      aria-label={ariaLabel}
      style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: NEON.ink, background: NEON.bg0, border: `1px solid ${NEON.line}`,
        padding: '5px 8px', borderRadius: 2, outline: 'none',
        ...style,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
