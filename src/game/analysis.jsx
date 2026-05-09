// analysis.jsx — Adventurer Analysis (no-code review screen).
//
// Phase 4 layout:
//   - Header: adventurer + intent (run title)
//   - Primary column: 'Changed Districts' rendered as district pills with
//     file counts and per-file kind chips. Reasoning trail underneath.
//   - Side column: CI Checks, Risk Assessment (level + score + factors),
//     a single conspicuous Next Action label.
//   - Bottom: collapsible 'Raw diff (debug)' drawer that contains the
//     prior DiffHunk rendering. Closed by default.
//
// The rendering is driven by projectRunReview so the screen consumes the
// same shape a real AgentRun produces. Seed-driven adventurers still
// work because seed pr.diffs has the same fields modulo the additions /
// deletions key naming, which we normalize on input.
import React from 'react';
import { NEON, C, alpha } from './palette.js';
import { hexPath } from './hex.js';
import {
  Panel, Pill, Mono, Title, NButton,
} from './theme.jsx';
import { projectRunReview } from '../app/runReview.js';

function CheckRow({ check }) {
  const map = { pass: 'green', fail: 'red', warn: 'amber', running: 'cyan' };
  const sigil = { pass: '✓', fail: '✕', warn: '⚠', running: '…' };
  const c = C(map[check.state] || 'ink3');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      background: alpha(c, 0.06),
      border: `1px solid ${alpha(c, 0.2)}`,
      borderLeft: `3px solid ${c}`,
    }}>
      <span style={{ color: c, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{sigil[check.state] || '·'}</span>
      <Mono size={10} color="ink" weight={600} style={{ flex: 1 }}>{check.name}</Mono>
      <Mono size={9} color="ink3">{check.meta}</Mono>
    </div>
  );
}

function DiffHunk({ diff }) {
  const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[diff.kind] || 'cyan';
  const additions = diff.additions != null ? diff.additions : diff.add;
  const deletions = diff.deletions != null ? diff.deletions : diff.del;
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
          <Mono size={9} color="green">+{additions}</Mono>
          <Mono size={9} color="red">−{deletions}</Mono>
        </span>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, lineHeight: 1.55 }}>
        {(diff.hunks || []).map((h, i) => {
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
    pr:   { color: 'cyan',    icon: '◉', label: 'RUN' },
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

const RISK_COLOR = { low: 'green', medium: 'amber', high: 'red' };

function RiskMeter({ level, score, factors }) {
  const c = C(RISK_COLOR[level] || 'ink3');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <Mono size={8} color="ink3">RISK</Mono>
        <Title size={16} color={RISK_COLOR[level] || 'ink3'} weight={700} style={{ textTransform: 'uppercase' }}>{level}</Title>
        <Mono size={9} color={RISK_COLOR[level] || 'ink3'}>· score {score}/100</Mono>
      </div>
      <div style={{ height: 4, background: NEON.bg0, border: `1px solid ${NEON.line}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: c, boxShadow: `0 0 8px ${c}` }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {(factors || []).map((f, i) => (
          <Mono key={i} size={9} color="ink2">· {f}</Mono>
        ))}
        {(!factors || factors.length === 0) && (
          <Mono size={9} color="ink3">· no risk signals raised</Mono>
        )}
      </div>
    </div>
  );
}

const NEXT_ACTION_COLOR = {
  approve: 'green',
  'request changes': 'amber',
  'request fixes': 'red',
  cancel: 'ink3',
};

function NextActionCard({ action }) {
  const color = NEXT_ACTION_COLOR[action] || 'cyan';
  const c = C(color);
  return (
    <div style={{
      padding: 10,
      border: `1px solid ${alpha(c, 0.5)}`,
      borderLeft: `3px solid ${c}`,
      background: alpha(c, 0.08),
    }}>
      <Mono size={8} color="ink3" style={{ letterSpacing: 1.4 }}>NEXT ACTION</Mono>
      <Title size={14} color={color} weight={700} style={{ marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {action}
      </Title>
    </div>
  );
}

function CommitResultCard({ dirtyCount, onCommit }) {
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const trimmed = message.trim();
  const disabled = submitting || trimmed.length === 0 || dirtyCount === 0;

  const submit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      const result = await onCommit(trimmed);
      if (result && result.ok) setMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  const a = C('green');
  return (
    <div style={{
      padding: 10,
      border: `1px solid ${alpha(a, 0.5)}`,
      borderLeft: `3px solid ${a}`,
      background: alpha(a, 0.06),
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Mono size={8} color="ink3" style={{ letterSpacing: 1.4 }}>COMMIT RESULT</Mono>
        <Mono size={9} color="green">{dirtyCount} dirty file{dirtyCount === 1 ? '' : 's'}</Mono>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="commit message (one line ideal; multiline OK)"
        aria-label="Commit message"
        rows={3}
        style={{
          width: '100%', resize: 'vertical', boxSizing: 'border-box',
          background: NEON.bg0, color: NEON.ink,
          border: `1px solid ${NEON.line}`, borderRadius: 2,
          padding: '6px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
          outline: 'none', minHeight: 56,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <NButton
          accent={disabled ? 'ink3' : 'green'}
          onClick={submit}
          disabled={disabled}
        >
          {submitting ? '⏳ Committing…' : '✓ Commit'}
        </NButton>
      </div>
    </div>
  );
}

function ChangedDistricts({ changedDistricts, files }) {
  if (!changedDistricts || changedDistricts.length === 0) {
    return <Mono color="ink3">no files changed</Mono>;
  }
  return (
    <div>
      <Mono size={9} color="ink3" style={{ display: 'block', marginBottom: 6, letterSpacing: 1 }}>
        {files} FILE{files === 1 ? '' : 'S'} ACROSS {changedDistricts.length} DISTRICT{changedDistricts.length === 1 ? '' : 'S'}
      </Mono>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {changedDistricts.map((d) => (
          <div key={d.districtId} style={{
            padding: 10,
            border: `1px solid ${NEON.line}`,
            background: alpha(NEON.bg1, 0.5),
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pill color={d.districtId === '__unmapped__' ? 'ink3' : 'cyan'}>
                {d.districtName}
              </Pill>
              <Mono size={9} color="ink3">{d.files.length} file{d.files.length === 1 ? '' : 's'}</Mono>
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {d.files.map((f, i) => {
                const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[f.kind] || 'cyan';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Pill color={kindColor}>{f.kind}</Pill>
                    <Mono size={10} color="ink2">{f.file}</Mono>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Adapt the seed 'pr' object into the inputs runReview expects.
function buildRunReviewInputs({ pr, adv, districts }) {
  const run = {
    runId: `seed-${pr.number}`,
    questId: pr.questId || `seed-quest-${pr.number}`,
    adventurerId: adv.id,
    status: pr.status === 'open' ? 'done' : 'done',
    contextUsed: 0,
    maxContext: adv.maxContext || 200_000,
    branch: pr.branch,
  };
  const diff = {
    files: (pr.diffs || []).map((d) => ({
      file: d.file,
      kind: d.kind,
      additions: d.additions != null ? d.additions : d.add,
      deletions: d.deletions != null ? d.deletions : d.del,
      hunks: d.hunks || [],
    })),
  };
  const checks = pr.checks || [];
  const intent = pr.title;
  return { run, diff, checks, districts: districts || [], intent };
}

export function AdventurerAnalysis({
  advId,
  guilds,
  advReports,
  districts,
  onPickAdv,
  workspaceDirty = 0,
  onCommit,
}) {
  const report = advReports[advId];
  const adv = guilds.flatMap(g => g.adventurers.map(a => ({ ...a, guild: g }))).find(x => x.id === advId);
  const allWithReports = Object.keys(advReports)
    .map(id => guilds.flatMap(g => g.adventurers.map(a => ({ ...a, guild: g }))).find(x => x.id === id))
    .filter(Boolean);

  const [rawDiffOpen, setRawDiffOpen] = React.useState(false);

  if (!report || !adv) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Mono color="ink3">no analysis available · select an adventurer with an open run</Mono>
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
  const review = projectRunReview(buildRunReviewInputs({ pr, adv, districts }));

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

      {/* Header card */}
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
            <span style={{ color: NEON.cyan }}>RUN #{pr.number}</span>
            <span style={{ color: NEON.ink3 }}> · </span>
            {review.intent || pr.title}
          </Mono>
          <Mono size={9} color="ink3" style={{ display: 'block', marginTop: 2 }}>
            {pr.branch} → {pr.base} · {pr.commits} commits
          </Mono>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <Pill color={pr.status === 'open' ? 'green' : 'amber'}>● {pr.status.toUpperCase()}</Pill>
          <NButton accent={guild.color}>Open run log</NButton>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel title="Changed Districts" accent="cyan">
            <ChangedDistricts changedDistricts={review.changedDistricts} files={review.changedDistricts.reduce((n, d) => n + d.files.length, 0)} />
          </Panel>
          <Panel title="Reasoning Trail · adventurer log" accent={guild.color}>
            <ReasoningTrail steps={pr.reasoning || []} />
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <NextActionCard action={review.nextAction} />
          <Panel title="CI Checks" accent="green">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {review.checks.map((c, i) => <CheckRow key={i} check={c} />)}
              {review.checks.length === 0 && (
                <Mono size={9} color="ink3">no checks reported</Mono>
              )}
            </div>
          </Panel>
          <Panel title="Risk Assessment" accent={RISK_COLOR[review.riskLevel] || 'amber'}>
            <RiskMeter level={review.riskLevel} score={review.riskScore} factors={review.riskFactors} />
          </Panel>
          {workspaceDirty > 0 && typeof onCommit === 'function' && (
            <CommitResultCard dirtyCount={workspaceDirty} onCommit={onCommit} />
          )}
          {(pr.reviewers && pr.reviewers.length > 0) && (
            <Panel title="Reviewers" accent="amber">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pr.reviewers.map((r, i) => <ReviewerCell key={i} r={r} />)}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {pr.comments && pr.comments.length > 0 && (
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

      {pr.diffs && pr.diffs.length > 0 && (
        <div style={{ border: `1px dashed ${NEON.line}`, padding: 10, background: alpha(NEON.bg0, 0.4) }}>
          <button
            type="button"
            onClick={() => setRawDiffOpen((v) => !v)}
            aria-expanded={rawDiffOpen}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              color: NEON.ink2, fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1,
            }}
          >
            <span style={{ color: NEON.ink3 }}>{rawDiffOpen ? '▾' : '▸'}</span>
            <span>RAW DIFF · DEBUG</span>
            <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>
              {pr.diffs.length} file{pr.diffs.length === 1 ? '' : 's'}
            </Mono>
          </button>
          {rawDiffOpen && (
            <div style={{ marginTop: 10 }}>
              {pr.diffs.map((d, i) => <DiffHunk key={i} diff={d} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
