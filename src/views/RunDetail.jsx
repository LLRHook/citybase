import React from 'react';
import { NEON, alpha } from '../game/palette.js';
import { Panel, Pill, Mono, Title, NButton } from '../game/theme.jsx';
import { STATUS_COLOR, formatStartedAt, shortRunId } from './runStatus.js';
import { useRunEvents } from '../app/useRunEvents.js';
import { groupDiffByDistrict, assessRisk } from '../app/reviewModel.js';

// RunDetail — main column when a run is selected from the sidebar.
//
// The review surface is visual-first (ROADMAP Phase 4 / v1 ship gate):
// while the agent works, a live activity stream is the centerpiece
// (FEAT-020); once the run is terminal the primary panels are Outcome
// (summary + risk) and Changed Districts (files grouped the way the
// city is). Raw diff hunks and the full agent log live in collapsed
// drawers for advanced troubleshooting only.
export function RunDetail({
  run,
  citybaseApi,
  onCancelRun,
  onCloseRun,
  workspaceBranch,
}) {
  const events = useRunEvents(run?.runId, { api: citybaseApi });
  const [fetchedEvents, setFetchedEvents] = React.useState(null);
  const [diff, setDiff] = React.useState(null);
  const [diffErr, setDiffErr] = React.useState(null);
  const [checks, setChecks] = React.useState(null);
  const [checksErr, setChecksErr] = React.useState(null);
  const [prInfo, setPrInfo] = React.useState(null);
  const [prErr, setPrErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const isTerminal = run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled');

  // Auto-load diff + checks once the run hits a terminal state. Both are
  // best-effort; we surface the error inline rather than crash the view.
  React.useEffect(() => {
    if (!run || !isTerminal) return undefined;
    let alive = true;
    // Backstop the live stream: a synchronous run can finish (and fan out its
    // events) before this view subscribes, so fetch the full trail on mount.
    if (typeof citybaseApi.agents.getEvents === 'function') {
      citybaseApi.agents.getEvents(run.runId).then(
        (evs) => { if (alive) setFetchedEvents(Array.isArray(evs) ? evs : []); },
        () => { if (alive) setFetchedEvents([]); },
      );
    }
    citybaseApi.agents.produceDiff(run.runId).then(
      (d) => { if (alive) setDiff(d); },
      (err) => { if (alive) setDiffErr(err?.message || String(err)); },
    );
    citybaseApi.agents.runChecks(run.runId).then(
      (c) => { if (alive) setChecks(c); },
      (err) => { if (alive) setChecksErr(err?.message || String(err)); },
    );
    return () => { alive = false; };
  }, [run, isTerminal, citybaseApi]);

  if (!run) return null;

  const color = STATUS_COLOR[run.status] || 'ink2';
  const allEvents = events.length ? events : (fetchedEvents || []);
  const submitPr = async () => {
    if (busy) return;
    setBusy(true);
    setPrErr(null);
    try {
      const out = await citybaseApi.agents.openPR(run.runId, {
        title: `agent run ${shortRunId(run.runId)}`,
        body: '',
        sourceBranch: run.branch || workspaceBranch || 'main',
        targetBranch: 'main',
      });
      setPrInfo(out);
    } catch (err) {
      setPrErr(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill color={color}>{run.status}</Pill>
            <Mono size={10} color="ink2">{run.provider || 'claude'}</Mono>
            {run.branch && <Mono size={10} color="ink3">· {run.branch}</Mono>}
            {run.startedAt && <Mono size={10} color="ink3">· {formatStartedAt(run.startedAt)}</Mono>}
          </div>
          <Title size={18} weight={700} style={{ marginTop: 4 }}>
            Run {shortRunId(run.runId)}
          </Title>
          <Mono size={10} color="ink3" style={{ display: 'block', marginTop: 2 }}>
            {run.questId || '(no quest)'}
            {run.adventurerId ? ` · ${run.adventurerId}` : ''}
          </Mono>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isTerminal && onCancelRun && (
            <NButton accent="amber" onClick={() => onCancelRun(run.runId)}>✕ Cancel</NButton>
          )}
          {isTerminal && (
            <NButton accent="cyan" onClick={submitPr} disabled={busy}>
              {busy ? 'Opening…' : '↗ Open PR (gh)'}
            </NButton>
          )}
          <NButton accent="ink3" ghost onClick={onCloseRun}>← Back</NButton>
        </div>
      </div>

      {prInfo && (
        <Panel title="Pull Request" accent="cyan" style={{ marginTop: 14 }}>
          <Mono size={11} color="ink2">PR #{prInfo.prNumber} · {prInfo.url}</Mono>
        </Panel>
      )}
      {prErr && (
        <Panel title="Pull Request error" accent="red" style={{ marginTop: 14 }}>
          <Mono size={11} color="red">{prErr}</Mono>
          <Mono size={10} color="ink3" style={{ display: 'block', marginTop: 6 }}>
            v1 deliberately doesn't auto-push. If gh complained about the head branch
            having no upstream, run <code>git push -u origin {run.branch || '<branch>'}</code> in
            your terminal first.
          </Mono>
        </Panel>
      )}

      {!isTerminal && (
        <Panel title="Live Activity" accent={color} style={{ marginTop: 14 }}>
          <LiveActivity events={allEvents} />
        </Panel>
      )}

      {isTerminal && (
        <>
          <Panel title="Outcome" accent={color} style={{ marginTop: 14 }}>
            <Outcome run={run} events={allEvents} diff={diff} checks={checks} />
          </Panel>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Panel title="Changed Districts" accent="green">
              <ChangedDistricts diff={diff} error={diffErr} />
            </Panel>
            <Panel title="CI Checks" accent="amber">
              <ChecksList checks={checks} error={checksErr} loading={false} />
            </Panel>
          </div>

          <Drawer label="Agent log" testid="drawer-agent-log">
            <EventLog events={allEvents} runStatus={run.status} />
          </Drawer>
          <Drawer label="Raw diff (advanced)" testid="drawer-raw-diff">
            <DiffView diff={diff} error={diffErr} loading={false} />
          </Drawer>
        </>
      )}
    </div>
  );
}

// Live streaming view while the run is in flight (FEAT-020): events append
// as they arrive, the container follows the tail, and a pulsing indicator
// makes "still working" unambiguous.
function LiveActivity({ events }) {
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  return (
    <div>
      <div ref={scrollRef} data-testid="live-activity" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <EventLog events={events} runStatus="running" />
      </div>
      <Mono
        size={10}
        color="cyan"
        role="status"
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}
      >
        <span
          className="cb-pulse"
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: NEON.cyan, boxShadow: `0 0 6px ${NEON.cyan}`,
            animation: 'cbPulse 1.2s ease-in-out infinite',
          }}
        />
        agent working — events stream in live
      </Mono>
      <style>{`
@keyframes cbPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .cb-pulse { animation: none !important; } }
`}</style>
    </div>
  );
}

// Outcome — the no-code summary: what the agent said it did, how big the
// blast radius is, and an explainable risk level.
function Outcome({ run, events, diff, checks }) {
  const summaryEvent = [...(events || [])].reverse().find((e) => e && e.kind !== 'error' && e.text);
  const errorEvent = [...(events || [])].reverse().find((e) => e && e.kind === 'error' && e.text);
  const files = diff?.files || [];
  const districts = groupDiffByDistrict(files);
  const additions = files.reduce((n, f) => n + (Number(f.additions) || 0), 0);
  const deletions = files.reduce((n, f) => n + (Number(f.deletions) || 0), 0);
  const risk = assessRisk({ files, checks });
  const riskColor = { low: 'green', medium: 'amber', high: 'red' }[risk.level];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {run.status === 'failed' && errorEvent ? (
        <Mono size={11} color="red" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {errorEvent.text}
        </Mono>
      ) : summaryEvent ? (
        <Mono size={11} color="ink" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>
          {summaryEvent.text}
        </Mono>
      ) : (
        <Mono size={10} color="ink3">no summary reported by the agent</Mono>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Pill color={riskColor}>risk · {risk.level}</Pill>
        <Mono size={10} color="ink2">
          {files.length} file{files.length === 1 ? '' : 's'} · +{additions} / -{deletions}
          {districts.length > 0 && ` · ${districts.length} district${districts.length === 1 ? '' : 's'}`}
        </Mono>
        <Mono size={9} color="ink3">{risk.reasons.join(' · ')}</Mono>
      </div>
    </div>
  );
}

// ChangedDistricts — affected areas in city terms: files grouped by
// top-level folder (root files → core), busiest district first. No hunks.
function ChangedDistricts({ diff, error }) {
  if (error) return <Mono size={10} color="red">{error}</Mono>;
  const districts = groupDiffByDistrict(diff?.files);
  if (districts.length === 0) {
    return <Mono size={10} color="ink3">no file changes</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {districts.map((d) => (
        <div key={d.district} style={{ border: `1px solid ${NEON.line}`, padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill color="cyan">◍ {d.district}</Pill>
            <Mono size={10} color="ink2">
              {d.files.length} file{d.files.length === 1 ? '' : 's'}
            </Mono>
            <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>
              +{d.additions} / -{d.deletions}
            </Mono>
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {d.files.map((f, i) => {
              const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[f.kind] || 'cyan';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pill color={kindColor}>{f.kind}</Pill>
                  <Mono size={10} color="ink" style={{ wordBreak: 'break-all' }}>{f.file}</Mono>
                  <Mono size={9} color="ink3" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    +{f.additions} / -{f.deletions}
                  </Mono>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Drawer — collapsed-by-default disclosure for advanced/debug surfaces.
function Drawer({ label, children, testid }) {
  return (
    <details data-testid={testid} style={{ marginTop: 12 }}>
      <summary
        style={{
          cursor: 'pointer', userSelect: 'none',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1,
          color: NEON.ink3, padding: '6px 2px',
        }}
      >
        ▸ {label}
      </summary>
      <div
        style={{
          marginTop: 6, padding: 10,
          border: `1px solid ${NEON.line}`,
          background: alpha(NEON.bg1, 0.6),
          borderRadius: 4,
        }}
      >
        {children}
      </div>
    </details>
  );
}

function EventLog({ events, runStatus }) {
  if (!Array.isArray(events) || events.length === 0) {
    if (runStatus === 'running') {
      return <Mono size={10} color="ink3">waiting for first event…</Mono>;
    }
    return <Mono size={10} color="ink3">no events</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: 6,
            background: alpha(NEON.bg0, 0.5),
            border: `1px solid ${NEON.line}`,
          }}
        >
          <Pill color={e.kind === 'error' ? 'red' : 'cyan'}>{e.kind}</Pill>
          <Mono size={9} color="ink3">{e.t}</Mono>
          <Mono size={11} color="ink" style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {e.text}
          </Mono>
        </div>
      ))}
    </div>
  );
}

function DiffView({ diff, error, loading }) {
  if (loading) return <Mono size={10} color="ink3">diff loads when the run completes…</Mono>;
  if (error) return <Mono size={10} color="red">{error}</Mono>;
  if (!diff || !Array.isArray(diff.files) || diff.files.length === 0) {
    return <Mono size={10} color="ink3">no file changes</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {diff.files.map((f, i) => {
        const kindColor = { add: 'green', modify: 'amber', delete: 'red' }[f.kind] || 'cyan';
        return (
          <div key={i} style={{ border: `1px solid ${NEON.line}`, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pill color={kindColor}>{f.kind}</Pill>
              <Mono size={11} color="ink">{f.file}</Mono>
              <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>
                +{f.additions} / -{f.deletions}
              </Mono>
            </div>
            {Array.isArray(f.hunks) && f.hunks.length > 0 && (
              <pre
                style={{
                  marginTop: 6, fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11, color: NEON.ink2,
                  background: NEON.bg0, padding: 8, overflowX: 'auto',
                  maxHeight: 240,
                }}
              >
                {f.hunks.slice(0, 60).map((h, j) => {
                  const c = h.type === 'add' ? NEON.green : h.type === 'del' ? NEON.red : NEON.ink3;
                  return (
                    <div key={j} style={{ color: c }}>
                      {h.type === 'add' ? '+ ' : h.type === 'del' ? '- ' : '  '}
                      {h.code}
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecksList({ checks, error, loading }) {
  if (loading) return <Mono size={10} color="ink3">checks run when the agent finishes…</Mono>;
  if (error) return <Mono size={10} color="red">{error}</Mono>;
  if (!Array.isArray(checks) || checks.length === 0) {
    return <Mono size={10} color="ink3">no checks declared in package.json</Mono>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {checks.map((c, i) => {
        const color = c.state === 'pass' ? 'green' : c.state === 'warn' ? 'amber' : 'red';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Pill color={color}>{c.state}</Pill>
            <Mono size={11} color="ink">{c.name}</Mono>
            <Mono size={9} color="ink3" style={{ marginLeft: 'auto' }}>{c.meta}</Mono>
          </div>
        );
      })}
    </div>
  );
}
