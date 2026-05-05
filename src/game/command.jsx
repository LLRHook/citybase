// command.jsx — RTS-style command surfaces matching the reference image.
// Worker Agents row, Action Bar (Actions/Production/Upgrades), Minimap,
// Objectives checklist, Alerts panel, Codebase Overview w/ sparklines, LIVE transport.
import { NEON, C, alpha } from './palette.js';
import { hexPath } from './hex.js';
import {
  Panel, Pill, Mono, Title,
} from './theme.jsx';
import { hpFromContext, fmtTokens } from './data.js';

export function ObjectivesPanel({ items }) {
  return (
    <Panel title="Objectives" accent="cyan">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(o => (
          <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{
              width: 14, height: 14, marginTop: 2, flexShrink: 0,
              border: `1px solid ${o.done ? NEON.green : alpha(NEON.cyan, 0.5)}`,
              background: o.done ? alpha(NEON.green, 0.2) : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: o.done ? `0 0 6px ${alpha(NEON.green, 0.5)}` : 'none',
            }}>
              {o.done && <span style={{ color: NEON.green, fontSize: 10, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 11, fontWeight: 600, color: o.done ? NEON.ink2 : NEON.ink, lineHeight: 1.25, overflowWrap: 'break-word' }}>
                  {o.label}
                </div>
                <span style={{
                  flexShrink: 0,
                  fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700,
                  color: o.done ? NEON.green : NEON.cyan,
                  marginTop: 1,
                }}>{o.meta}</span>
              </div>
              <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 1 }}>{o.sub}</Mono>
              <div style={{ marginTop: 4, height: 2, background: NEON.bg0, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  width: `${o.prog * 100}%`, height: '100%',
                  background: o.done ? NEON.green : NEON.cyan,
                  boxShadow: `0 0 4px ${o.done ? NEON.green : NEON.cyan}`,
                }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AlertsPanel({ items }) {
  return (
    <Panel title={`Alerts · ${items.length}`} accent="red">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(a => {
          const c = a.sev === 'high' ? NEON.red : NEON.amber;
          return (
            <div key={a.id} style={{
              padding: 6, paddingLeft: 8,
              background: alpha(c, 0.08),
              borderLeft: `2px solid ${c}`,
            }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ color: c, fontSize: 10 }}>▲</span>
                <Title size={10} weight={600} color="ink">{a.title}</Title>
              </div>
              <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 2 }}>{a.loc}</Mono>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// =================== WORKER AGENTS ROW ===================
function WorkerAgentCell({ adv, guild, selected, onClick }) {
  const a = C(guild.color);
  const hp = hpFromContext(adv);
  const mp = adv.mp ?? 100;
  const isActive = adv.status === 'active' || adv.status === 'questing';
  return (
    <button
      onClick={() => onClick(adv, guild)}
      style={{
        width: 56, height: 60, padding: 0,
        background: selected ? alpha(a, 0.25) : alpha(NEON.bg0, 0.6),
        border: `1px solid ${selected ? a : alpha(a, 0.3)}`,
        cursor: 'pointer', position: 'relative',
        boxShadow: selected ? `0 0 10px ${alpha(a, 0.6)}, inset 0 0 8px ${alpha(a, 0.2)}` : 'none',
        transition: 'all .15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = alpha(a, 0.7); }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = alpha(a, 0.3); }}
      title={`${adv.name} · ${adv.class} L${adv.level}\nContext: ${fmtTokens(adv.contextUsed)} / ${fmtTokens(adv.maxContext)} (${hp}% free)`}
    >
      <svg width="56" height="40" viewBox="0 0 56 40" style={{ display: 'block' }}>
        <path d={hexPath(28, 18, 12)} fill={alpha(a, 0.3)} stroke={a} strokeWidth="1" />
        <circle cx="28" cy="16" r="5" fill={a} opacity="0.9" />
        <rect x="23" y="14" width="10" height="2" fill={NEON.bg0} />
        <rect x="20" y="26" width="16" height="8" rx="1" fill={alpha(a, 0.5)} stroke={a} strokeWidth="0.8" />
        {isActive && (
          <circle cx="48" cy="6" r="3" fill={NEON.green}>
            <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
        {adv.status === 'idle' && <circle cx="48" cy="6" r="3" fill={NEON.ink3} opacity="0.5" />}
      </svg>
      <div style={{ position: 'absolute', bottom: 12, left: 4, right: 4, height: 3, background: NEON.bg0, border: `1px solid ${alpha(NEON.green, 0.3)}` }}>
        <div style={{
          width: `${hp}%`, height: '100%',
          background: hp > 60 ? NEON.green : hp > 30 ? NEON.amber : NEON.red,
        }} />
      </div>
      <div style={{ position: 'absolute', bottom: 6, left: 4, right: 4, height: 2, background: NEON.bg0 }}>
        <div style={{ width: `${mp}%`, height: '100%', background: alpha(NEON.cyan, 0.7) }} />
      </div>
      <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: a, letterSpacing: 0.5 }}>{adv.name}</span>
      </div>
    </button>
  );
}

export function WorkerAgentsRow({ guilds, selectedAdvId, onSelect }) {
  const all = guilds.flatMap(g => g.adventurers.map(a => ({ adv: a, guild: g })));
  const total = 24;
  const ghosts = Math.max(0, total - all.length);
  const active = all.filter(({ adv }) => adv.status === 'active' || adv.status === 'questing').length;
  return (
    <Panel
      title={`Worker Agents · ${all.length}/${total}`}
      accent="cyan"
      headerRight={
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Pill color="green">▶ {active} active</Pill>
          <Pill color="ink3">{all.length - active} idle</Pill>
        </div>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {all.map(({ adv, guild }) => (
          <WorkerAgentCell
            key={adv.id} adv={adv} guild={guild}
            selected={adv.id === selectedAdvId}
            onClick={onSelect}
          />
        ))}
        {Array.from({ length: ghosts }).map((_, i) => (
          <div
            key={`ghost-${i}`}
            style={{
              width: 56, height: 60,
              border: `1px dashed ${alpha(NEON.ink3, 0.3)}`,
              background: alpha(NEON.bg0, 0.3),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ color: NEON.ink3, fontFamily: 'JetBrains Mono', fontSize: 9, opacity: 0.4 }}>+</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// =================== SELECTED UNIT CARD ===================
export function SelectedUnitCard({ adv, guild, currentTask }) {
  if (!adv) {
    return (
      <Panel title="Unit" accent="ink3" dim>
        <Mono color="ink3" size={10}>· no unit selected ·</Mono>
      </Panel>
    );
  }
  const a = C(guild.color);
  const hp = hpFromContext(adv);
  const used = adv.contextUsed || 0;
  const max = adv.maxContext || 1;
  return (
    <Panel
      title={adv.name}
      accent={guild.color}
      headerRight={<Pill color={guild.color}>{guild.crest} · {guild.name}</Pill>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10 }}>
        <div style={{
          width: 64, height: 80,
          background: `radial-gradient(circle at 50% 30%, ${alpha(a, 0.4)}, ${NEON.bg0})`,
          border: `1px solid ${a}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <svg width="60" height="76" viewBox="0 0 60 76">
            <path d={hexPath(30, 30, 16)} fill={alpha(a, 0.3)} stroke={a} strokeWidth="1.5" />
            <circle cx="30" cy="28" r="8" fill={a} />
            <rect x="22" y="24" width="16" height="3" fill={NEON.bg0} />
            <rect x="18" y="48" width="24" height="20" rx="2" fill={alpha(a, 0.5)} stroke={a} strokeWidth="1.2" />
            <rect x="22" y="52" width="3" height="3" fill={NEON.bg0} />
            <rect x="35" y="52" width="3" height="3" fill={NEON.bg0} />
          </svg>
          <div style={{ position: 'absolute', top: 2, left: 2, fontSize: 8, fontFamily: 'JetBrains Mono', color: a, fontWeight: 700 }}>L{adv.level}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Title size={14} color={guild.color} weight={700}>{adv.name}</Title>
            <Mono size={9} color="ink3">· {adv.class}</Mono>
          </div>
          <div style={{ fontSize: 10, color: NEON.ink2, fontFamily: 'JetBrains Mono', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div><span style={{ color: NEON.ink3 }}>Role:</span> <span style={{ color: a }}>{adv.class}</span></div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: NEON.ink3 }}>Task:</span>{' '}
              <span style={{ color: NEON.ink }}>{currentTask?.title || (adv.status === 'idle' ? '— awaiting orders —' : 'patrolling')}</span>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: NEON.ink3 }}>File:</span>{' '}
              <span style={{ color: NEON.cyan, fontStyle: 'italic' }}>{currentTask?.file || '—'}</span>
            </div>
          </div>
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Mono size={8} color={hp > 60 ? 'green' : hp > 30 ? 'amber' : 'red'} weight={700}>HP</Mono>
              <div style={{ flex: 1, height: 6, background: NEON.bg0, border: `1px solid ${alpha(NEON.green, 0.4)}`, position: 'relative' }}>
                <div style={{ width: `${hp}%`, height: '100%', background: hp > 60 ? NEON.green : hp > 30 ? NEON.amber : NEON.red, boxShadow: `0 0 4px ${hp > 60 ? NEON.green : NEON.amber}` }} />
              </div>
              <Mono size={9} color={hp > 60 ? 'green' : 'amber'} weight={700}>{hp}%</Mono>
            </div>
            <div style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Mono size={8} color="ink3">CTX {fmtTokens(used)} / {fmtTokens(max)}</Mono>
              <Mono size={8} color="ink3">{fmtTokens(max - used)} free</Mono>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// =================== ACTION BAR ===================
const ACTION_TABS = [
  { id: 'actions',    label: 'ACTIONS',    color: 'cyan' },
  { id: 'production', label: 'PRODUCTION', color: 'magenta' },
  { id: 'upgrades',   label: 'UPGRADES',   color: 'amber' },
];

const ACTION_DEFS = {
  actions: [
    { id: 'lint',     label: 'RUN LINT',   key: 'L', color: 'cyan',    icon: '⚯', desc: 'Sweep for violations' },
    { id: 'tests',    label: 'RUN TESTS',  key: 'T', color: 'green',   icon: '✓', desc: 'Run golden harness' },
    { id: 'refactor', label: 'REFACTOR',   key: 'R', color: 'magenta', icon: '⟲', desc: 'Reduce complexity' },
    { id: 'review',   label: 'REVIEW RUN', key: 'P', color: 'amber',   icon: '◉', desc: 'Inspect open result' },
    { id: 'deploy',   label: 'DEPLOY',     key: 'D', color: 'amber',   icon: '▲', desc: 'Push to staging' },
    { id: 'observe',  label: 'OBSERVE',    key: 'O', color: 'cyan',    icon: '◎', desc: 'Tail telemetry' },
  ],
  production: [
    { id: 'spawn-agent',   label: 'SPAWN AGENT',   key: 'S', color: 'green',   icon: '★', desc: 'Cost: 200 XP' },
    { id: 'recruit-bug',   label: 'RECRUIT HUNTER', key: 'B', color: 'magenta', icon: '✕', desc: 'Cost: 350 XP' },
    { id: 'recruit-doc',   label: 'RECRUIT SCRIBE', key: 'C', color: 'cyan',    icon: '✎', desc: 'Cost: 250 XP' },
    { id: 'forge-quest',   label: 'FORGE QUEST',   key: 'F', color: 'amber',   icon: '⚔', desc: 'Open new ticket' },
    { id: 'commission-run', label: 'COMMISSION RUN', key: 'M', color: 'magenta', icon: '◆', desc: 'Prepare visual change set' },
    { id: 'rest',          label: 'REST CAMP',     key: 'Z', color: 'green',   icon: '✦', desc: 'Restore HP/MP' },
  ],
  upgrades: [
    { id: 'gpu',     label: 'GPU TIER II',   key: '1', color: 'magenta', icon: '◈', desc: '+15% velocity', cost: '500 XP' },
    { id: 'context', label: 'CONTEXT 200K',  key: '2', color: 'cyan',    icon: '◇', desc: '+context window', cost: '750 XP' },
    { id: 'turret',  label: 'CI TURRET',     key: '3', color: 'amber',   icon: '◆', desc: 'auto-block bad runs', cost: '1000 XP' },
    { id: 'shield',  label: 'TYPE SHIELD',   key: '4', color: 'green',   icon: '⛨', desc: '+strict-null', cost: '600 XP' },
    { id: 'eval',    label: 'EVAL HARNESS',  key: '5', color: 'cyan',    icon: '◎', desc: 'eval coverage', cost: '850 XP' },
    { id: 'forge',   label: 'AGENT FORGE',   key: '6', color: 'magenta', icon: '✦', desc: '+1 agent slot', cost: '1200 XP' },
  ],
};

function ActionButton({ action, onFire }) {
  const a = C(action.color);
  return (
    <button
      onClick={() => onFire(action)}
      style={{
        position: 'relative',
        width: 132, height: 64,
        background: `linear-gradient(180deg, ${alpha(a, 0.18)} 0%, ${alpha(a, 0.05)} 100%)`,
        border: `1px solid ${alpha(a, 0.5)}`,
        cursor: 'pointer',
        textAlign: 'left', padding: '6px 8px',
        boxShadow: `inset 0 0 12px ${alpha(a, 0.1)}`,
        transition: 'all .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `linear-gradient(180deg, ${alpha(a, 0.3)} 0%, ${alpha(a, 0.1)} 100%)`;
        e.currentTarget.style.boxShadow = `inset 0 0 12px ${alpha(a, 0.2)}, 0 0 8px ${alpha(a, 0.4)}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `linear-gradient(180deg, ${alpha(a, 0.18)} 0%, ${alpha(a, 0.05)} 100%)`;
        e.currentTarget.style.boxShadow = `inset 0 0 12px ${alpha(a, 0.1)}`;
      }}
    >
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => (
        <span
          key={`${x}-${y}`}
          style={{
            position: 'absolute',
            [x ? 'right' : 'left']: 2,
            [y ? 'bottom' : 'top']: 2,
            width: 5, height: 5,
            borderColor: a, borderStyle: 'solid', borderWidth: 0,
            [`border${y ? 'Bottom' : 'Top'}Width`]: 1,
            [`border${x ? 'Right' : 'Left'}Width`]: 1,
          }}
        />
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: a, fontSize: 16, lineHeight: 1 }}>{action.icon}</span>
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
          color: a, letterSpacing: 1.2,
        }}>{action.label}</span>
      </div>
      <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono', fontSize: 9, color: NEON.ink3 }}>
        {action.desc}{action.cost ? ` · ${action.cost}` : ''}
      </div>
      <div style={{
        position: 'absolute', right: 6, bottom: 6,
        width: 16, height: 16,
        border: `1px solid ${alpha(a, 0.6)}`,
        background: alpha(a, 0.15),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: a,
      }}>{action.key}</div>
    </button>
  );
}

export function ActionBar({ tab, onTabChange, onFire }) {
  const actions = ACTION_DEFS[tab] || [];
  return (
    <div style={{
      background: `linear-gradient(180deg, ${alpha(NEON.cyan, 0.04)}, ${NEON.bg1})`,
      border: `1px solid ${NEON.line}`,
      borderRadius: 4,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${NEON.line}` }}>
        {ACTION_TABS.map(t => {
          const sel = t.id === tab;
          const a = C(t.color);
          return (
            <button
              key={t.id} onClick={() => onTabChange(t.id)}
              style={{
                flex: 1, padding: '8px 12px',
                background: sel ? alpha(a, 0.15) : 'transparent',
                border: 'none', cursor: 'pointer',
                borderBottom: sel ? `2px solid ${a}` : `2px solid transparent`,
                fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
                letterSpacing: 1.5, color: sel ? a : NEON.ink3,
                transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 132px)', gap: 8 }}>
        {actions.map(a => <ActionButton key={a.id} action={a} onFire={onFire} />)}
      </div>
    </div>
  );
}

// =================== MINIMAP ===================
export function Minimap({ districts, focusedId, onSelect, pawnCount }) {
  const W = 200, H = 130;
  const proj = (q, r) => {
    const x = (q + r * 0.5) * 14 + W / 2;
    const y = r * 12 + H / 2;
    return { x, y };
  };
  return (
    <Panel
      title="Codebase Map"
      accent="cyan"
      headerRight={<Pill color="cyan">{districts.length} zones</Pill>}
    >
      <div style={{
        position: 'relative', width: '100%', height: H,
        background: `radial-gradient(circle at 50% 50%, ${alpha(NEON.cyan, 0.08)}, ${NEON.bg0})`,
        border: `1px solid ${NEON.line}`,
      }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {districts.filter(d => d.id !== 'core').map(d => {
            const p = proj(d.q, d.r);
            const c = proj(0, 0);
            return <line key={d.id} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
              stroke={alpha(C(d.color), 0.3)} strokeWidth="0.6" strokeDasharray="2 2" />;
          })}
          {districts.map(d => {
            const p = proj(d.q, d.r);
            const sel = d.id === focusedId;
            const a = C(d.color);
            return (
              <g key={d.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(d)}>
                <path d={hexPath(p.x, p.y, sel ? 7 : 5)}
                  fill={alpha(a, sel ? 0.6 : 0.3)} stroke={a} strokeWidth={sel ? 1.5 : 0.8} />
                {sel && (
                  <path d={hexPath(p.x, p.y, 11)} fill="none" stroke={a} strokeWidth="0.6" opacity="0.6">
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.6s" repeatCount="indefinite" />
                  </path>
                )}
              </g>
            );
          })}
          {Array.from({ length: pawnCount }).map((_, i) => {
            const x = (i * 31) % W;
            const y = (i * 17) % H;
            return <circle key={i} cx={x} cy={y} r="1" fill={NEON.green} opacity="0.6" />;
          })}
          <rect x={W / 2 - 30} y={H / 2 - 22} width="60" height="44" fill="none"
            stroke={alpha(NEON.cyan, 0.5)} strokeWidth="0.6" strokeDasharray="2 2" />
        </svg>
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['+', '−', '◎'].map(s => (
            <button key={s} style={{
              width: 18, height: 18,
              background: alpha(NEON.bg0, 0.8),
              border: `1px solid ${alpha(NEON.cyan, 0.4)}`,
              color: NEON.cyan, cursor: 'pointer',
              fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
            }}>{s}</button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// =================== CODEBASE OVERVIEW (SPARKLINES) ===================
function Sparkline({ data, color, width = 50, height = 12 }) {
  const a = C(color);
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={a} strokeWidth="1" />
      <polyline points={`0,${height} ${points} ${width},${height}`} fill={alpha(a, 0.2)} stroke="none" />
    </svg>
  );
}

const SYSTEM_STATS = [
  { id: 'linters',  label: 'Linters',     sub: 'Violations: 3',         value: 94, color: 'cyan',    spark: [88, 90, 89, 92, 91, 93, 94] },
  { id: 'tests',    label: 'Tests',       sub: 'Passing: 1,248 / 1,540', value: 81, color: 'green',   spark: [78, 82, 80, 79, 81, 80, 81] },
  { id: 'agents',   label: 'Agents',      sub: 'Active: 24 / 24',        value: 78, color: 'magenta', spark: [60, 65, 72, 75, 77, 78, 78] },
  { id: 'classes',  label: 'Classes / Modules', sub: 'Complexity: 312 / 410', value: 76, color: 'amber',  spark: [70, 72, 71, 74, 75, 76, 76] },
  { id: 'cicd',     label: 'CI / CD',     sub: 'Pipelines: 5',           value: 88, color: 'cyan',    spark: [82, 85, 84, 86, 88, 88, 88] },
  { id: 'observ',   label: 'Observability', sub: 'Events: 12.4K/min',    value: 83, color: 'cyan',    spark: [80, 82, 83, 82, 84, 83, 83] },
  { id: 'docs',     label: 'Docs',        sub: 'Coverage: 68%',          value: 72, color: 'cyan',    spark: [60, 62, 65, 68, 70, 71, 72] },
  { id: 'deploy',   label: 'Deploy',      sub: 'Environments: 3',        value: 70, color: 'amber',   spark: [65, 68, 70, 69, 71, 70, 70] },
];

export function CodebaseOverview() {
  return (
    <Panel
      title="Codebase Overview"
      accent="cyan"
      headerRight={
        <div style={{ display: 'flex', gap: 4 }}>
          {['All', '24h', '1w'].map((t, i) => (
            <span key={t} style={{
              fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 6px',
              border: `1px solid ${alpha(NEON.cyan, i === 0 ? 0.6 : 0.2)}`,
              background: i === 0 ? alpha(NEON.cyan, 0.1) : 'transparent',
              color: i === 0 ? NEON.cyan : NEON.ink3,
            }}>{t}</span>
          ))}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SYSTEM_STATS.map(s => {
          const a = C(s.color);
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 38px', gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 5, height: 5, background: a, borderRadius: '50%', boxShadow: `0 0 4px ${a}` }} />
                  <Title size={11} weight={600} color="ink">{s.label}</Title>
                </div>
                <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 1, paddingLeft: 11 }}>{s.sub}</Mono>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <Sparkline data={s.spark} color={s.color} />
              </div>
              <Mono size={11} color={s.color} weight={700} style={{ textAlign: 'right' }}>{s.value}%</Mono>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// =================== LIVE PULSE + TRANSPORT ===================
export function LivePulse() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'JetBrains Mono', fontSize: 9, color: NEON.green, fontWeight: 700, letterSpacing: 1.2 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: NEON.green,
        boxShadow: `0 0 6px ${NEON.green}`,
        animation: 'cc-pulse 1.4s ease-in-out infinite',
      }} />
      LIVE
    </span>
  );
}

export function Transport({ playing, onToggle, speed, onSpeed }) {
  const btn = (icon, on, sel) => (
    <button onClick={on} style={{
      width: 26, height: 22,
      background: sel ? alpha(NEON.cyan, 0.2) : alpha(NEON.bg0, 0.6),
      border: `1px solid ${alpha(NEON.cyan, sel ? 0.6 : 0.3)}`,
      color: sel ? NEON.cyan : NEON.ink2,
      cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</button>
  );
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {btn('◀◀', () => onSpeed(0.5), speed === 0.5)}
      {btn(playing ? '⏸' : '▶', onToggle, playing)}
      {btn('▶▶', () => onSpeed(2), speed === 2)}
    </div>
  );
}
