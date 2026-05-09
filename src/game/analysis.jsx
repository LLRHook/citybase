// analysis.jsx — Adventurer Analysis (PR + Code Review screen).
// Frames the PR around the *adventurer*: their reasoning trail, diffs, checks, reviewers, risk.
import { NEON, C, alpha } from './palette.js';
import { hexPath } from './hex.js';
import {
  Panel, Pill, Mono, Title, NButton,
} from './theme.jsx';
import { GUILDS } from './data.js';
import { ADV_REPORTS } from './sagas.js';

function CheckRow({ check }) {
  const map = { pass: 'green', fail: 'red', warn: 'amber', running: 'cyan' };
  const sigil = { pass: '✓', fail: '✕', warn: '⚠', running: '…' };
  const c = C(map[check.state]);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: alpha(c, 0.06),
      border: `1px solid ${alpha(c, 0.2)}`,
      borderLeft: `3px solid ${c}`,
    }}>
      <span style={{ color: c, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{sigil[check.state]}</span>
      <Mono size={10} color="ink" weight={600} style={{ flex: 1 }}>{check.name}</Mono>
      <Mono size={9} color="ink3">{check.meta}</Mono>
    </div>
  );
}

function DiffHunk({ diff }) {
  const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[diff.kind] || 'cyan';
  return (
    <div style={{ marginBottom: 8, border: `1px solid ${NEON.line}`, background: NEON.bg0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        background: alpha(C(kindColor), 0.1),
        borderBottom: `1px solid ${alpha(C(kindColor), 0.3)}`,
      }}>
        <Pill color={kindColor}>{diff.kind}</Pill>
        <Mono size={10} color="ink" weight={600}>{diff.file}</Mono>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Mono size={9} color="green">+{diff.add}</Mono>
          <Mono size={9} color="red">−{diff.del}</Mono>
        </span>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, lineHeight: 1.55 }}>
        {diff.hunks.map((h, i) => {
          const c = h.type === 'add' ? NEON.green : h.type === 'del' ? NEON.red : NEON.ink2;
          const bg = h.type === 'add' ? alpha(NEON.green, 0.06) : h.type === 'del' ? alpha(NEON.red, 0.06) : 'transparent';
          const sigil = h.type === 'add' ? '+' : h.type === 'del' ? '−' : ' ';
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '40px 16px 1fr',
              background: bg, color: c,
            }}>
              <span style={{ textAlign: 'right', paddingRight: 8, color: NEON.ink3, opacity: 0.6 }}>{h.line}</span>
              <span style={{ textAlign: 'center' }}>{sigil}</span>
              <span style={{ paddingLeft: 4, whiteSpace: 'pre' }}>{h.code}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReasoningTrail({ steps }) {
  const map = {
    plan: { color: 'cyan',    icon: '◆', label: 'PLAN' },
    edit: { color: 'amber',   icon: '⟲', label: 'EDIT' },
    test: { color: 'green',   icon: '✓', label: 'TEST' },
    lint: { color: 'magenta', icon: '⚯', label: 'LINT' },
    pr:   { color: 'cyan',    icon: '◉', label: 'PR' },
  };
  return (
    <div style={{ position: 'relative', paddingLeft: 14 }}>
      <div style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: 1, background: NEON.line }} />
      {steps.map((s, i) => {
        const m = map[s.kind] || { color: 'cyan', icon: '·', label: s.kind };
        return (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, position: 'relative' }}>
            <span style={{
              position: 'absolute', left: -14, top: 4, width: 9, height: 9,
              background: NEON.bg0,
              border: `1px solid ${C(m.color)}`,
              boxShadow: `0 0 6px ${alpha(C(m.color), 0.6)}`,
              transform: 'rotate(45deg)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Mono size={9} color={m.color} weight={700}>{m.label}</Mono>
                <Mono size={8} color="ink3">{s.t}</Mono>
              </div>
              <Mono size={10} color="ink2" style={{ display: 'block', marginTop: 2, lineHeight: 1.5 }}>
                {s.text}
              </Mono>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewerCell({ r }) {
  const map = { 'approved': 'green', 'requested-changes': 'red', 'pending': 'amber' };
  const c = C(map[r.state] || 'ink3');
  const sigil = { 'approved': '✓', 'requested-changes': '✕', 'pending': '…' }[r.state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', border: `1px solid ${alpha(c, 0.4)}`, background: alpha(c, 0.06) }}>
      <span style={{ color: c }}>{sigil}</span>
      <Mono size={10} color="ink" weight={600}>{r.who}</Mono>
      <Mono size={8} color={map[r.state] || 'ink3'}>{r.state}</Mono>
    </div>
  );
}

function RiskMeter({ risk }) {
  const colorMap = { low: 'green', medium: 'amber', high: 'red' };
  const c = C(colorMap[risk.level]);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <Mono size={8} color="ink3">RISK</Mono>
        <Title size={16} color={colorMap[risk.level]} weight={700} style={{ textTransform: 'uppercase' }}>{risk.level}</Title>
        <Mono size={9} color={colorMap[risk.level]}>· score {risk.score}/100</Mono>
      </div>
      <div style={{ height: 4, background: NEON.bg0, border: `1px solid ${NEON.line}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${risk.score}%`, height: '100%', background: c, boxShadow: `0 0 8px ${c}` }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {risk.factors.map((f, i) => (
          <Mono key={i} size={9} color="ink2">· {f}</Mono>
        ))}
      </div>
    </div>
  );
}

export function AdventurerAnalysis({ advId, onPickAdv }) {
  const report = ADV_REPORTS[advId];
  const adv = GUILDS.flatMap(g => g.adventurers.map(a => ({ ...a, guild: g }))).find(x => x.id === advId);
  const allWithReports = Object.keys(ADV_REPORTS)
    .map(id => GUILDS.flatMap(g => g.adventurers.map(a => ({ ...a, guild: g }))).find(x => x.id === id))
    .filter(Boolean);

  if (!report || !adv) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono color="ink3">no analysis available · select an adventurer with an open PR</Mono>
        <div style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'center' }}>
          {allWithReports.map(a => (
            <NButton key={a.id} accent={a.guild.color} onClick={() => onPickAdv(a.id)}>{a.name}</NButton>
          ))}
        </div>
      </div>
    );
  }

  const pr = report.pr;
  const guild = adv.guild;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Mono size={10} color="ink3">ANALYSIS · ADVENTURER</Mono>
        {allWithReports.map(a => {
          const sel = a.id === advId;
          return (
            <button
              key={a.id} onClick={() => onPickAdv(a.id)}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: 10, padding: '4px 8px',
                border: `1px solid ${alpha(C(a.guild.color), sel ? 0.7 : 0.3)}`,
                background: sel ? alpha(C(a.guild.color), 0.15) : 'transparent',
                color: sel ? C(a.guild.color) : NEON.ink2, cursor: 'pointer', borderRadius: 2,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: C(a.guild.color), boxShadow: `0 0 4px ${C(a.guild.color)}` }} />
              {a.name} · {a.class}
            </button>
          );
        })}
      </div>

      <div style={{
        padding: 14,
        background: `linear-gradient(180deg, ${alpha(C(guild.color), 0.08)}, ${NEON.bg1})`,
        border: `1px solid ${alpha(C(guild.color), 0.4)}`,
        display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 14, alignItems: 'center',
      }}>
        <div style={{ width: 72, height: 96, position: 'relative' }}>
          <svg width="72" height="96" viewBox="0 0 72 96">
            <path d={hexPath(36, 30, 22)} fill={alpha(C(guild.color), 0.2)} stroke={C(guild.color)} strokeWidth="1.5" />
            <circle cx="36" cy="30" r="10" fill={C(guild.color)} />
            <rect x="22" y="48" width="28" height="36" rx="2" fill={alpha(C(guild.color), 0.4)} stroke={C(guild.color)} strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Mono size={9} color={guild.color}>{guild.name} · {adv.class} · L{adv.level}</Mono>
            <Pill color={guild.color}>{adv.status}</Pill>
          </div>
          <Title size={20} weight={700} color="ink" style={{ marginTop: 4 }}>{adv.name}</Title>
          <Mono size={10} color="ink2" style={{ display: 'block', marginTop: 4 }}>
            <span style={{ color: NEON.cyan }}>PR #{pr.number}</span>
            <span style={{ color: NEON.ink3 }}> · </span>
            {pr.title}
          </Mono>
          <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 2 }}>
            {pr.branch} → {pr.base} · {pr.commits} commits · <span style={{ color: NEON.green }}>+{pr.additions}</span> <span style={{ color: NEON.red }}>−{pr.deletions}</span> across {pr.files} files
          </Mono>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <Pill color={pr.status === 'open' ? 'green' : 'amber'}>● {pr.status.toUpperCase()}</Pill>
          <NButton accent={guild.color}>⎘ Open in Bitbucket</NButton>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 280px', gap: 10 }}>
        <Panel title="Reasoning Trail · adventurer log" accent={guild.color}>
          <ReasoningTrail steps={pr.reasoning} />
        </Panel>

        <Panel
          title={`Code Changes · ${pr.files} files`}
          accent="cyan"
          headerRight={<Pill color="cyan">{pr.additions + pr.deletions} lines</Pill>}
        >
          {pr.diffs.map((d, i) => <DiffHunk key={i} diff={d} />)}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel title="CI Checks" accent="green">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pr.checks.map((c, i) => <CheckRow key={i} check={c} />)}
            </div>
          </Panel>

          <Panel title="Reviewers" accent="amber">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pr.reviewers.map((r, i) => <ReviewerCell key={i} r={r} />)}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
              <NButton accent="green">✓ Approve</NButton>
              <NButton accent="red" ghost>✕ Request</NButton>
            </div>
          </Panel>

          <Panel title="Risk Assessment" accent="amber">
            <RiskMeter risk={pr.risk} />
          </Panel>
        </div>
      </div>

      {pr.comments.length > 0 && (
        <Panel title={`Comments · ${pr.comments.length}`} accent="magenta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pr.comments.map((c, i) => {
              const tone = c.kind === 'change' ? 'red' : c.kind === 'reply' ? 'cyan' : 'ink2';
              return (
                <div key={i} style={{
                  padding: 10,
                  background: NEON.bg0,
                  border: `1px solid ${alpha(C(tone), 0.3)}`,
                  borderLeft: `3px solid ${C(tone)}`,
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <Mono size={10} weight={700} color={tone}>{c.who}</Mono>
                    <Mono size={8} color="ink3">{c.t}</Mono>
                    <Pill color={tone}>{c.kind}</Pill>
                  </div>
                  <Mono size={11} color="ink2" style={{ display: 'block', marginTop: 4, lineHeight: 1.55 }}>
                    {c.body}
                  </Mono>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
