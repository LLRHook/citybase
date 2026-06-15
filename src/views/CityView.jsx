import React from 'react';
import { NEON, C, alpha } from '../game/palette.js';
import { axialToWorld } from '../game/hex.js';
import { project, block, tilePoints, depthKey } from '../game/iso.js';
import { projectRepoTreeToCityModel, GRID_COLS } from '../app/cityModel.js';

// CityView — the isometric, real-data city. Districts are top-level folders
// raised on platforms; buildings are files extruded by importance; dirty files
// glow (staged green / unstaged amber). Pan with drag, zoom with the wheel,
// hover for a tooltip, click to select. Pure projection lives in cityModel.js
// + iso.js; this component only lays out and paints.

const DISTRICT_SPACING = 6.2; // world units between hex seats (> platform span)
const TILE = 1;               // world units per building cell
const SUB = 0.8;              // building footprint within its cell
const HEIGHT_SCALE = 0.9;     // world height per model height unit

function buildLayout(model) {
  const platforms = [];
  const blocks = [];
  const labels = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  };

  const byDistrict = new Map();
  for (const b of model.buildings) {
    if (!byDistrict.has(b.d)) byDistrict.set(b.d, []);
    byDistrict.get(b.d).push(b);
  }

  for (const d of model.districts) {
    const center = axialToWorld(d.q, d.r, DISTRICT_SPACING);
    const dBuildings = byDistrict.get(d.id) || [];
    const rows = Math.max(1, Math.ceil(dBuildings.length / GRID_COLS));
    const gridW = GRID_COLS * TILE;
    const gridH = rows * TILE;
    const platSide = Math.max(gridW, gridH) + 0.7;
    const platOX = center.x - platSide / 2;
    const platOY = center.y - platSide / 2;
    const gridOX = center.x - gridW / 2;
    const gridOY = center.y - gridH / 2;

    // Platform corners feed the bounds.
    [[platOX, platOY], [platOX + platSide, platOY], [platOX + platSide, platOY + platSide], [platOX, platOY + platSide]]
      .forEach(([x, y]) => grow(project(x, y)));

    const labelAnchor = project(platOX + platSide, platOY + platSide);
    platforms.push({
      id: d.id,
      color: d.color,
      points: tilePoints(platOX, platOY, platSide),
      depth: depthKey(platOX, platOY),
      health: d.health,
      dirty: d.dirty,
      files: d.files,
    });
    labels.push({
      x: labelAnchor.x,
      y: labelAnchor.y + 14,
      text: d.label,
      sub: `${d.files} file${d.files === 1 ? '' : 's'}${d.dirty ? ` · ${d.dirty} dirty` : ''}`,
      color: d.color,
    });

    for (const b of dBuildings) {
      const bx = gridOX + b.col * TILE + (TILE - SUB) / 2;
      const by = gridOY + b.row * TILE + (TILE - SUB) / 2;
      const h = b.h * HEIGHT_SCALE;
      const g = block(bx, by, SUB, h);
      grow(g.roofFront);
      grow({ x: g.front.x, y: g.front.y });
      blocks.push({
        key: b.path,
        d: b.d,
        color: d.color,
        name: b.name,
        path: b.path,
        type: b.type,
        dirty: b.dirty,
        staged: b.staged,
        status: b.status,
        roof: g.roof,
        left: g.left,
        right: g.right,
        anchor: g.roofFront,
        depth: depthKey(bx, by, h),
      });
    }
  }

  blocks.sort((a, b) => a.depth - b.depth);
  platforms.sort((a, b) => a.depth - b.depth);
  return { platforms, blocks, labels, bounds: { minX, minY, maxX, maxY } };
}

function dirtyColor(b) {
  if (!b.dirty) return null;
  return b.staged ? NEON.green : NEON.amber;
}

export function CityView({ snapshot, activePaths, activeRun, phase, onOpenRun }) {
  const repoTree = snapshot?.repoTree;
  const files = snapshot?.files;
  const model = React.useMemo(
    () => projectRepoTreeToCityModel(repoTree || [], files || []),
    [repoTree, files],
  );
  const layout = React.useMemo(() => buildLayout(model), [model]);

  const wrapRef = React.useRef(null);
  const [view, setView] = React.useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [grabbing, setGrabbing] = React.useState(false);
  const drag = React.useRef(null);
  const active = React.useMemo(() => new Set(activePaths || []), [activePaths]);

  // Fit the city to the viewport whenever the model changes.
  const fit = React.useCallback(() => {
    const el = wrapRef.current;
    const b = layout.bounds;
    if (!el || !isFinite(b.minX)) return;
    const w = el.clientWidth || 1000;
    const h = el.clientHeight || 700;
    const cw = b.maxX - b.minX || 1;
    const ch = b.maxY - b.minY || 1;
    const pad = 90;
    const k = Math.min((w - pad) / cw, (h - pad) / ch, 1.6);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setView({ k, x: w / 2 - cx * k, y: h / 2 - cy * k });
  }, [layout]);

  React.useEffect(() => { fit(); }, [fit]);

  const onWheel = (e) => {
    e.preventDefault();
    const el = wrapRef.current;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = Math.max(0.25, Math.min(4, v.k * factor));
      // keep the point under the cursor fixed
      const wx = (mx - v.x) / v.k;
      const wy = (my - v.y) / v.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  };

  const onDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    setGrabbing(true);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
    setView((v) => ({ ...v, x: drag.current.ox + dx, y: drag.current.oy + dy }));
  };
  const onUp = () => { drag.current = null; setGrabbing(false); };

  if (!repoTree || repoTree.length === 0) {
    return (
      <div style={emptyWrap}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, opacity: 0.5 }}>◍</div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, color: NEON.ink, marginTop: 10 }}>
            No city to render yet
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: NEON.ink3, marginTop: 6 }}>
            Open a Git workspace — districts are folders, buildings are files.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      onWheel={onWheel}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      style={{
        position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden',
        cursor: grabbing ? 'grabbing' : 'grab',
        background: `radial-gradient(ellipse 120% 90% at 50% 8%, ${alpha(NEON.cyan, 0.06)} 0%, ${NEON.bg0} 55%)`,
      }}
    >
      <style>{CITY_CSS}</style>
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <filter id="cityGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* platforms */}
          {layout.platforms.map((p) => {
            const a = C(p.color);
            return (
              <polygon
                key={`plat-${p.id}`}
                points={p.points}
                fill={alpha(a, 0.07)}
                stroke={alpha(a, 0.4)}
                strokeWidth={1 / view.k}
              />
            );
          })}
          {/* buildings, back-to-front */}
          {layout.blocks.map((b) => {
            const a = C(b.color);
            const dc = dirtyColor(b);
            const roofColor = dc || alpha(a, 0.92);
            const isActive = active.has(b.path);
            const sel = selected === b.path;
            const hov = hover && hover.path === b.path;
            const glow = isActive || b.dirty || b.type === 'tower';
            return (
              <g
                key={b.key}
                className={isActive ? 'city-active' : (b.dirty ? 'city-dirty' : undefined)}
                style={{ cursor: 'pointer' }}
                filter={glow ? 'url(#cityGlow)' : undefined}
                onMouseEnter={() => setHover(b)}
                onMouseLeave={() => setHover((h) => (h && h.path === b.path ? null : h))}
                onClick={() => { if (!drag.current?.moved) setSelected(b.path); }}
              >
                <polygon points={b.left} fill={alpha(dc || a, 0.28)} stroke={alpha(dc || a, 0.5)} strokeWidth={0.6 / view.k} />
                <polygon points={b.right} fill={alpha(dc || a, 0.5)} stroke={alpha(dc || a, 0.65)} strokeWidth={0.6 / view.k} />
                <polygon
                  points={b.roof}
                  fill={roofColor}
                  stroke={sel || hov ? NEON.ink : alpha(NEON.bg0, 0.6)}
                  strokeWidth={(sel || hov ? 1.6 : 0.6) / view.k}
                />
              </g>
            );
          })}
          {/* district labels */}
          {layout.labels.map((l, i) => {
            const a = C(l.color);
            return (
              <g key={`lab-${i}`} transform={`translate(${l.x},${l.y})`} style={{ pointerEvents: 'none' }}>
                <text textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={11 / view.k} fontWeight="600" fill={a} style={{ letterSpacing: 0.5 }}>
                  {l.text}
                </text>
                <text textAnchor="middle" y={11 / view.k} fontFamily="JetBrains Mono, monospace" fontSize={8 / view.k} fill={NEON.ink3}>
                  {l.sub}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* agent-at-work banner (FEAT-016) */}
      {activeRun && (
        <button
          onClick={() => onOpenRun?.(activeRun.runId)}
          style={runBanner}
          title="Open run detail"
        >
          <span className="city-active" style={{ width: 8, height: 8, borderRadius: '50%', background: NEON.green, boxShadow: `0 0 8px ${NEON.green}`, display: 'inline-block' }} />
          <span style={{ color: NEON.green, fontWeight: 600 }}>AGENT AT WORK</span>
          <span style={{ color: NEON.ink2 }}>{activeRun.provider || 'claude'}</span>
          <span style={{ color: NEON.ink3 }}>· {phase?.label || 'running'}</span>
          {activePaths && activePaths.length > 0 && (
            <span style={{ color: NEON.amber }}>· {activePaths.length} building{activePaths.length === 1 ? '' : 's'} lit</span>
          )}
        </button>
      )}

      {/* hover tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', left: 12, top: 12, pointerEvents: 'none',
          background: alpha(NEON.bg1, 0.92), border: `1px solid ${NEON.line}`, borderRadius: 3,
          padding: '6px 9px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: NEON.ink,
        }}>
          <span style={{ color: dirtyColor(hover) || C(hover.color) }}>{hover.type === 'tower' ? '▲ ' : '▪ '}</span>
          {hover.path}
          {hover.dirty && <span style={{ color: dirtyColor(hover), marginLeft: 6 }}>· {hover.staged ? 'staged' : hover.status}</span>}
        </div>
      )}

      {/* selection panel */}
      {selected && (() => {
        const b = layout.blocks.find((x) => x.path === selected);
        if (!b) return null;
        return (
          <div style={selPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: C(b.color), fontWeight: 600 }}>{b.name}</span>
              <button onClick={() => setSelected(null)} style={closeBtn}>✕</button>
            </div>
            <div style={{ color: NEON.ink3, marginTop: 4, wordBreak: 'break-all' }}>{b.path}</div>
            <div style={{ marginTop: 6, color: b.dirty ? dirtyColor(b) : NEON.ink2 }}>
              {b.type} · {b.dirty ? (b.staged ? 'staged change' : b.status) : 'clean'}
            </div>
          </div>
        );
      })()}

      {/* legend + controls */}
      <div style={legend}>
        <span><i style={{ background: NEON.green }} /> staged</span>
        <span><i style={{ background: NEON.amber }} /> unstaged</span>
        <span><i style={{ background: NEON.cyan }} /> clean</span>
        <button onClick={fit} style={fitBtn}>⊡ fit</button>
      </div>
    </div>
  );
}

const emptyWrap = {
  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: `radial-gradient(ellipse at 50% 30%, ${alpha(NEON.cyan, 0.05)} 0%, ${NEON.bg0} 60%)`,
};
const selPanel = {
  position: 'absolute', left: 12, bottom: 12, minWidth: 220, maxWidth: 360,
  background: alpha(NEON.bg1, 0.95), border: `1px solid ${NEON.lineHi}`, borderRadius: 3,
  padding: '9px 11px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: NEON.ink,
};
const closeBtn = {
  background: 'transparent', border: 'none', color: NEON.ink3, cursor: 'pointer', fontSize: 11,
};
const legend = {
  position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 12,
  background: alpha(NEON.bg1, 0.85), border: `1px solid ${NEON.line}`, borderRadius: 3,
  padding: '5px 9px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: NEON.ink2,
};
const fitBtn = {
  background: alpha(NEON.cyan, 0.12), border: `1px solid ${alpha(NEON.cyan, 0.5)}`, color: NEON.cyan,
  borderRadius: 2, padding: '3px 7px', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
};
const runBanner = {
  position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  background: alpha(NEON.bg1, 0.92), border: `1px solid ${alpha(NEON.green, 0.5)}`, borderRadius: 4,
  padding: '6px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: NEON.ink,
  boxShadow: `0 0 16px ${alpha(NEON.green, 0.25)}`,
};

// Injected city-specific motion (migrates to index.css in FEAT-017).
const CITY_CSS = `
@keyframes cityDirtyPulse { 0%,100% { opacity: .8 } 50% { opacity: 1 } }
@keyframes cityActivePulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
.city-dirty { animation: cityDirtyPulse 2.4s ease-in-out infinite; }
.city-active { animation: cityActivePulse 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .city-dirty, .city-active { animation: none; } }
`;

export default CityView;
