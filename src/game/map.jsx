// map.jsx — the iso city, hex tiles, districts, buildings, animated pawns.
import { NEON, C, alpha } from './palette.js';
import { HEX_SIZE, hexToPx, hexPath } from './hex.js';
import {
  IsoBuilding,
  Title, Mono, Pill,
} from './theme.jsx';
import { DISTRICTS, BUILDINGS } from './data.js';

function tilesForDistrict(d) {
  const offsets = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
    [2, -1], [-1, 2], [1, 1], [2, 0], [-2, 1],
  ].slice(0, Math.max(7, Math.min(12, d.files + 4)));
  return offsets.map(([dq, dr]) => ({ q: d.q + dq, r: d.r + dr }));
}

export function HexPawn({ from, to, progress, color, label }) {
  const a = C(color);
  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  const hop = Math.sin(progress * Math.PI * 6) * 3;
  return (
    <g transform={`translate(${x} ${y - 4 + hop})`}>
      <ellipse cx="0" cy="14" rx="8" ry="2.5" fill="#000" opacity="0.4" />
      <path d={hexPath(0, 0, 7)} fill={alpha(a, 0.4)} stroke={a} strokeWidth="1.2" />
      <path d={hexPath(0, 0, 4)} fill={a} />
      <circle cx="0" cy="-10" r="3" fill={a} opacity="0.9" />
      <circle cx="0" cy="-10" r="6" fill={a} opacity="0.2" />
      {label && <text x="0" y="-18" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="7" fill={a} fontWeight="700">{label}</text>}
    </g>
  );
}

function DistrictTiles({ district, focused, onClick }) {
  const a = C(district.color);
  const tiles = tilesForDistrict(district);
  const center = hexToPx(district.q, district.r);
  const buildings = BUILDINGS.filter(b => b.d === district.id).map((b, i) => {
    const t = tiles[(i + 1) % tiles.length];
    return { ...b, q: t.q, r: t.r };
  });

  return (
    <g
      onClick={() => onClick && onClick(district)}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'opacity .25s' }}
    >
      {tiles.map((t, i) => {
        const p = hexToPx(t.q, t.r);
        const isCenter = i === 0;
        return (
          <g key={i}>
            <path
              d={hexPath(p.x, p.y)}
              fill={isCenter ? alpha(a, 0.25) : alpha(a, 0.10)}
              stroke={alpha(a, focused ? 0.9 : 0.5)}
              strokeWidth={focused ? 1.2 : 0.7}
            />
            {isCenter && (
              <path
                d={hexPath(p.x, p.y, HEX_SIZE - 6)}
                fill="none" stroke={a} strokeWidth="0.5" opacity="0.6" strokeDasharray="2 2"
              />
            )}
          </g>
        );
      })}

      {buildings.map((b, i) => {
        const p = hexToPx(b.q, b.r);
        const kind = b.type === 'tower'
          ? 'tower'
          : (i % 5 === 0 ? 'dome' : 'house');
        return (
          <IsoBuilding
            key={i}
            x={p.x} y={p.y + 8}
            kind={kind}
            accent={a}
            focused={focused}
            seed={i + district.id.length}
          />
        );
      })}

      {district.id === 'core' ? (
        <g>
          <path d={hexPath(center.x, center.y - 14, 28)} fill="none" stroke={a} strokeWidth="0.6" opacity="0.5">
            <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2.4s" repeatCount="indefinite" />
          </path>
          <path d={hexPath(center.x, center.y - 14, 22)} fill={alpha(a, 0.18)} stroke={a} strokeWidth="1.5" />
          <path d={hexPath(center.x, center.y - 14, 16)} fill={alpha(a, 0.35)} stroke={a} strokeWidth="0.8" />
          <text x={center.x} y={center.y - 18} textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif" fontSize="9" fontWeight="700" fill={a} letterSpacing="0.8">
            CODEBASE
          </text>
          <text x={center.x} y={center.y - 8} textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif" fontSize="9" fontWeight="700" fill={a} letterSpacing="0.8">
            CORE
          </text>
          <text x={center.x} y={center.y + 38} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="13" fontWeight="700" fill={a}>
            {district.health}%
          </text>
        </g>
      ) : (
        <g>
          <path d={hexPath(center.x, center.y - 14, 14)} fill={NEON.bg1} stroke={a} strokeWidth="1.5" />
          <text x={center.x} y={center.y - 11} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill={a} fontWeight="700">{district.health}%</text>
          <text x={center.x} y={center.y - 16 + 6 + 14} textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif" fontSize="11" fontWeight="700" fill={a}>
            {district.label.toUpperCase()}
          </text>
          <text x={center.x} y={center.y + 32} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="7" fill={NEON.ink3} letterSpacing="0.6">
            {district.name} · {district.files} files
          </text>
        </g>
      )}
    </g>
  );
}

export function CityMap({ focusedDistrictId, onSelectDistrict, pawns, connected }) {
  const W = 820, H = 520;
  const cx = W / 2, cy = H / 2 + 20;

  return (
    <div
      style={{
        position: 'relative', width: '100%', height: H, overflow: 'hidden',
        background: `radial-gradient(ellipse at 50% 60%, ${NEON.bg1} 0%, ${NEON.bg0} 70%)`,
        borderRadius: 4,
        border: `1px solid ${NEON.line}`,
      }}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="city-glow" cx="50%" cy="55%" r="50%">
            <stop offset="0%" stopColor={NEON.cyan} stopOpacity="0.08" />
            <stop offset="100%" stopColor={NEON.cyan} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#city-glow)" />
        {Array.from({ length: 60 }).map((_, i) => {
          const x = (i * 137.5) % W;
          const y = (i * 79.3) % H;
          const r = (i % 7 === 0) ? 1.2 : 0.5;
          return <circle key={i} cx={x} cy={y} r={r} fill={NEON.ink} opacity={0.15 + (i % 5) * 0.08} />;
        })}
      </svg>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <g transform={`translate(${cx} ${cy})`}>
          <g opacity="0.15">
            {Array.from({ length: 11 }).map((_, i) => {
              const r = i - 5;
              return Array.from({ length: 11 }).map((_, j) => {
                const q = j - 5;
                const p = hexToPx(q, r);
                if (Math.abs(p.x) > 320 || Math.abs(p.y) > 220) return null;
                return (
                  <path key={`${i}-${j}`} d={hexPath(p.x, p.y, HEX_SIZE - 1)}
                    fill="none" stroke={NEON.lineHi} strokeWidth="0.4" />
                );
              });
            })}
          </g>

          {connected && DISTRICTS.filter(d => d.id !== 'core').map(d => {
            const pos = hexToPx(d.q, d.r);
            const col = C(d.color);
            return (
              <g key={d.id}>
                <path d={`M ${pos.x} ${pos.y} L 0 0`} stroke={alpha(col, 0.15)} strokeWidth="6" fill="none" strokeLinecap="round" />
                <path d={`M ${pos.x} ${pos.y} L 0 0`} stroke={alpha(col, 0.5)} strokeWidth="2.2" fill="none" strokeLinecap="round" />
                <path d={`M ${pos.x} ${pos.y} L 0 0`} stroke={col} strokeWidth="0.8" fill="none" strokeLinecap="round" />
                <circle r="1.6" fill={col}>
                  <animateMotion dur={`${3 + (d.q + d.r + 4) * 0.3}s`} repeatCount="indefinite" path={`M ${pos.x} ${pos.y} L 0 0`} />
                  <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}

          {connected && DISTRICTS.map(d => (
            <DistrictTiles
              key={d.id}
              district={d}
              focused={focusedDistrictId === d.id}
              onClick={onSelectDistrict}
            />
          ))}

          {connected && pawns && pawns.map((p, i) => <HexPawn key={i} {...p} />)}
        </g>
      </svg>

      {!connected && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: `repeating-linear-gradient(45deg, ${alpha(NEON.bg0, 0.7)} 0 8px, ${alpha(NEON.red, 0.05)} 8px 16px)`,
            backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Title size={22} color="red" weight={700} style={{ textTransform: 'uppercase', letterSpacing: 4 }}>NO WORKSPACE LINK</Title>
            <Mono color="ink2" size={11} style={{ display: 'block', marginTop: 8 }}>
              Open a local Git workspace to summon this city.
            </Mono>
          </div>
        </div>
      )}

      {connected && (
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <Pill color="cyan">⌘ HEX GRID · ZOOM 1.0×</Pill>
        </div>
      )}

      {connected && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 480 }}>
          {DISTRICTS.map(d => (
            <Pill key={d.id} color={d.color}>
              <span style={{ display: 'inline-block', width: 6, height: 6, background: C(d.color), borderRadius: '50%', boxShadow: `0 0 4px ${C(d.color)}` }} />
              {d.name}
            </Pill>
          ))}
        </div>
      )}
    </div>
  );
}
